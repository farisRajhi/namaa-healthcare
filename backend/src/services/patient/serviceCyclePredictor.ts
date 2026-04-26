/**
 * Service Cycle Predictor
 *
 * Predicts when patients are due for repeating services based on their
 * appointment history and each service's repeat cycle.
 *
 * Generates ServiceCycleSuggestion records with:
 *   - Score (0-100): likelihood the patient will come if contacted
 *   - Type: 'reminder' (just needs a nudge) or 'offer' (needs incentive)
 *   - Pre-generated bilingual message
 *
 * Runs daily via scheduler after InsightBuilder.
 */
import { PrismaClient } from '@prisma/client';
import { getSeasonalBoost } from '../../utils/saudiSeasonalCalendar.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuggestionGenerationResult {
  orgId: string;
  suggestionsCreated: number;
  suggestionsUpdated: number;
  patientsProcessed: number;
}

interface ServiceInfo {
  serviceId: string;
  name: string;
  nameEn: string | null;
  category: string | null;
  repeatCycleDays: number;
}

interface PatientScoreData {
  completionRate: number;
  noShowCount: number;
  campaignBookings: number;
  offerRedemptions: number;
  avgVisitIntervalDays: number | null;
}

// ---------------------------------------------------------------------------
// Score constants
// ---------------------------------------------------------------------------

const SCORE_COMPLETION_RATE = 25;
const SCORE_OVERDUE_WINDOW = 25;
const SCORE_CAMPAIGN_RESPONSE = 20;
const SCORE_VISIT_CONSISTENCY = 15;
const PENALTY_NOSHOW_MAX = 15;

// Overdue window scoring
const OVERDUE_PRIME_DAYS = 30;
const OVERDUE_MODERATE_DAYS = 90;
const OVERDUE_LATE_DAYS = 180;

// ---------------------------------------------------------------------------
// Service Cycle Predictor
// ---------------------------------------------------------------------------

export class ServiceCyclePredictor {
  constructor(private prisma: PrismaClient) {}

  /**
   * Generate suggestions for all patients in an org.
   */
  async generateSuggestions(orgId: string): Promise<SuggestionGenerationResult> {
    const result: SuggestionGenerationResult = {
      orgId,
      suggestionsCreated: 0,
      suggestionsUpdated: 0,
      patientsProcessed: 0,
    };

    // 1. Load repeating services
    const services = await this.prisma.service.findMany({
      where: { orgId, active: true, isRepeating: true, repeatCycleDays: { not: null } },
      select: { serviceId: true, name: true, nameEn: true, category: true, repeatCycleDays: true },
    });

    if (services.length === 0) return result;

    const serviceMap = new Map(
      services.map(s => [s.serviceId, s as ServiceInfo]),
    );

    // 2. Load all patients
    const patients = await this.prisma.patient.findMany({
      where: { orgId },
      select: { patientId: true, firstName: true, lastName: true },
    });

    // 3. Process each patient
    for (const patient of patients) {
      try {
        const created = await this.processPatient(orgId, patient, serviceMap);
        result.suggestionsCreated += created;
        result.patientsProcessed++;
      } catch (err) {
        console.error(`[ServiceCyclePredictor] Error processing patient ${patient.patientId}:`, err);
      }
    }

    return result;
  }

  /**
   * Process a single patient: find services they're due for and create suggestions.
   */
  private async processPatient(
    orgId: string,
    patient: { patientId: string; firstName: string; lastName: string },
    serviceMap: Map<string, ServiceInfo>,
  ): Promise<number> {
    // Get patient's completed appointments for repeating services
    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientId: patient.patientId,
        orgId,
        status: 'completed',
        serviceId: { in: [...serviceMap.keys()] },
      },
      select: { serviceId: true, startTs: true },
      orderBy: { startTs: 'desc' },
    });

    if (appointments.length === 0) return 0;

    // Group by service — get last completed date per service
    const lastCompletedByService = new Map<string, Date>();
    for (const appt of appointments) {
      if (!lastCompletedByService.has(appt.serviceId)) {
        lastCompletedByService.set(appt.serviceId, appt.startTs);
      }
    }

    // Check for future appointments (to exclude patients who already booked)
    const futureAppointments = await this.prisma.appointment.findMany({
      where: {
        patientId: patient.patientId,
        orgId,
        status: { in: ['booked', 'confirmed'] },
        startTs: { gt: new Date() },
        serviceId: { in: [...serviceMap.keys()] },
      },
      select: { serviceId: true },
    });
    const bookedServiceIds = new Set(futureAppointments.map(a => a.serviceId));

    // Get patient score data
    const scoreData = await this.getPatientScoreData(patient.patientId);

    const now = new Date();
    let created = 0;

    for (const [serviceId, lastCompleted] of lastCompletedByService) {
      const service = serviceMap.get(serviceId);
      if (!service) continue;

      // Skip if patient already has a future appointment for this service
      if (bookedServiceIds.has(serviceId)) continue;

      // Calculate due date using patient's own visit rhythm when sane (2-24 months),
      // else fall back to the service's default repeat cycle.
      const patientInterval = scoreData.avgVisitIntervalDays;
      const cycleDaysForPatient =
        patientInterval && patientInterval >= 60 && patientInterval <= 720
          ? patientInterval
          : service.repeatCycleDays;
      const dueAt = new Date(lastCompleted.getTime() + cycleDaysForPatient * 24 * 60 * 60 * 1000);
      const overdueDays = Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / (1000 * 60 * 60 * 24)));

      // Only suggest if due within 14 days or overdue
      const daysUntilDue = Math.floor((dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue > 14) continue;

      // Calculate score and type
      const score = this.calculateScore(scoreData, overdueDays, service, daysUntilDue);
      const suggestionType = this.determineSuggestionType(scoreData, overdueDays);

      // Generate message
      const messageAr = this.generateMessageAr(patient.firstName, service.name, overdueDays, suggestionType);
      const messageEn = this.generateMessageEn(patient.firstName, service.nameEn || service.name, overdueDays, suggestionType);

      // Upsert suggestion (skip if already sent or booked)
      try {
        const existing = await this.prisma.serviceCycleSuggestion.findFirst({
          where: {
            patientId: patient.patientId,
            serviceId,
            status: { in: ['sent', 'booked'] },
          },
        });

        if (existing) continue;

        await this.prisma.serviceCycleSuggestion.upsert({
          where: {
            patientId_serviceId_status: {
              patientId: patient.patientId,
              serviceId,
              status: 'pending',
            },
          },
          update: {
            score,
            suggestionType,
            overdueDays,
            dueAt,
            messageAr,
            messageEn,
            lastCompletedAt: lastCompleted,
          },
          create: {
            orgId,
            patientId: patient.patientId,
            serviceId,
            score,
            suggestionType,
            lastCompletedAt: lastCompleted,
            dueAt,
            overdueDays,
            messageAr,
            messageEn,
            status: 'pending',
          },
        });

        created++;
      } catch {
        // Unique constraint conflict — skip
      }
    }

    return created;
  }

  /**
   * Score (0-100): How likely is this patient to come if contacted?
   */
  private calculateScore(
    data: PatientScoreData,
    overdueDays: number,
    service: ServiceInfo,
    daysUntilDue: number,
  ): number {
    let score = 0;

    // Factor 1: Completion rate (0-25 pts)
    score += Math.round(data.completionRate * SCORE_COMPLETION_RATE);

    // Factor 2: Overdue window (0-25 pts)
    // Prime window (due soon or slightly overdue) scores highest
    if (daysUntilDue > 0) {
      // Not yet overdue — approaching due date
      score += 20;
    } else if (overdueDays <= OVERDUE_PRIME_DAYS) {
      score += SCORE_OVERDUE_WINDOW; // Prime window
    } else if (overdueDays <= OVERDUE_MODERATE_DAYS) {
      score += 15;
    } else if (overdueDays <= OVERDUE_LATE_DAYS) {
      score += 10;
    } else {
      score += 5; // Very lapsed
    }

    // Factor 3: Campaign responsiveness (0-20 pts)
    const responsiveness = Math.min(SCORE_CAMPAIGN_RESPONSE,
      (data.campaignBookings > 0 ? 12 : 0) + Math.min(8, data.offerRedemptions * 4),
    );
    score += responsiveness;

    // Factor 4: Visit consistency (0-15 pts)
    if (data.avgVisitIntervalDays && service.repeatCycleDays > 0) {
      const ratio = data.avgVisitIntervalDays / service.repeatCycleDays;
      // Closer to 1.0 = more consistent
      if (ratio >= 0.7 && ratio <= 1.3) {
        score += SCORE_VISIT_CONSISTENCY; // Very consistent
      } else if (ratio >= 0.5 && ratio <= 2.0) {
        score += 10; // Somewhat consistent
      } else {
        score += 5; // Inconsistent
      }
    } else {
      score += 5; // No data
    }

    // Factor 5: No-show penalty (only abandoned no-shows)
    const penalty = Math.min(PENALTY_NOSHOW_MAX, data.noShowCount * 5);
    score -= penalty;

    // Factor 6: Seasonal boost
    const boost = getSeasonalBoost(service.nameEn, service.category);
    score = Math.round(score * boost);

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine whether patient needs just a reminder or an incentive offer.
   */
  private determineSuggestionType(data: PatientScoreData, overdueDays: number): 'reminder' | 'offer' {
    // Reliable patient, slightly overdue → reminder
    if (overdueDays <= 30 && data.completionRate >= 0.7) return 'reminder';

    // Responded to campaigns before, moderately overdue → reminder
    if (overdueDays <= 60 && data.campaignBookings > 0) return 'reminder';

    // Significantly overdue or unreliable → needs offer
    if (overdueDays > 60 || data.completionRate < 0.5) return 'offer';

    return 'reminder';
  }

  /**
   * Get scoring data for a patient from PatientInsight + campaign history.
   */
  private async getPatientScoreData(patientId: string): Promise<PatientScoreData> {
    const [insight, campaignBookings, offerRedemptions] = await Promise.all([
      this.prisma.patientInsight.findUnique({
        where: { patientId },
        select: { completionRate: true, noShowCount: true, avgVisitIntervalDays: true },
      }),
      this.prisma.campaignTarget.count({
        where: { patientId, status: 'booked' },
      }),
      this.prisma.offerRedemption.count({
        where: { patientId, status: { in: ['confirmed', 'completed'] } },
      }),
    ]);

    return {
      completionRate: insight?.completionRate ?? 0.5,
      noShowCount: insight?.noShowCount ?? 0,
      campaignBookings,
      offerRedemptions,
      avgVisitIntervalDays: insight?.avgVisitIntervalDays ?? null,
    };
  }

  // -----------------------------------------------------------------------
  // Message generation
  // -----------------------------------------------------------------------

  private generateMessageAr(
    firstName: string,
    serviceName: string,
    overdueDays: number,
    type: 'reminder' | 'offer',
  ): string {
    if (type === 'offer') {
      if (overdueDays > 90) {
        return `مرحباً ${firstName}، نفتقدك! 🎉\nعرض خاص لك على ${serviceName}\nاحجز الآن واستفد من العرض\nللحجز أرسل: حجز`;
      }
      return `مرحباً ${firstName}، عرض خاص لك! 🎉\n${serviceName} بخصم خاص\nللحجز أرسل: حجز`;
    }

    // Reminder
    if (overdueDays <= 0) {
      return `مرحباً ${firstName}، موعد ${serviceName} يقترب 🦷\nاحجز موعدك الآن\nللحجز أرسل: حجز`;
    }
    if (overdueDays <= 30) {
      return `مرحباً ${firstName}، حان موعد ${serviceName} 🦷\nاحجز موعدك الآن\nللحجز أرسل: حجز`;
    }
    return `مرحباً ${firstName}، ${serviceName} متأخر منذ ${overdueDays} يوم\nاحجز موعدك اليوم\nللحجز أرسل: حجز`;
  }

  private generateMessageEn(
    firstName: string,
    serviceName: string,
    overdueDays: number,
    type: 'reminder' | 'offer',
  ): string {
    if (type === 'offer') {
      if (overdueDays > 90) {
        return `Hi ${firstName}, we miss you! 🎉\nSpecial offer on ${serviceName}\nBook now and enjoy the discount\nReply "book" to schedule`;
      }
      return `Hi ${firstName}, special offer! 🎉\n${serviceName} at a special discount\nReply "book" to schedule`;
    }

    if (overdueDays <= 0) {
      return `Hi ${firstName}, your ${serviceName} is coming up soon 🦷\nBook your appointment now\nReply "book" to schedule`;
    }
    if (overdueDays <= 30) {
      return `Hi ${firstName}, time for your ${serviceName} 🦷\nBook your appointment now\nReply "book" to schedule`;
    }
    return `Hi ${firstName}, your ${serviceName} is ${overdueDays} days overdue\nBook your appointment today\nReply "book" to schedule`;
  }

  // -----------------------------------------------------------------------
  // Maintenance
  // -----------------------------------------------------------------------

  /**
   * Dismiss suggestions where the patient has since completed the service.
   */
  async dismissCompleted(orgId: string): Promise<number> {
    const pendingSuggestions = await this.prisma.serviceCycleSuggestion.findMany({
      where: { orgId, status: 'pending' },
      select: { suggestionId: true, patientId: true, serviceId: true, dueAt: true },
    });

    let dismissed = 0;
    for (const suggestion of pendingSuggestions) {
      // Check if patient completed this service after the due date
      const completedAfter = await this.prisma.appointment.findFirst({
        where: {
          patientId: suggestion.patientId,
          serviceId: suggestion.serviceId,
          status: 'completed',
          startTs: { gte: suggestion.dueAt },
        },
      });

      if (completedAfter) {
        await this.prisma.serviceCycleSuggestion.update({
          where: { suggestionId: suggestion.suggestionId },
          data: { status: 'booked' },
        });
        dismissed++;
      }
    }

    return dismissed;
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: ServiceCyclePredictor | null = null;

export function getServiceCyclePredictor(prisma: PrismaClient): ServiceCyclePredictor {
  if (!_instance) {
    _instance = new ServiceCyclePredictor(prisma);
  }
  return _instance;
}
