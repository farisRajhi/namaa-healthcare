/**
 * Appointment Reminder Service
 *
 * Automated multi-channel reminders at configurable intervals:
 *   48h before → SMS
 *   24h before → WhatsApp
 *   2h  before → SMS
 *
 * Handles confirm/cancel/reschedule replies, no-show prediction,
 * waitlist auto-fill on cancellation, and post-appointment survey triggers.
 */
import { PrismaClient } from '@prisma/client';
import type { Twilio } from 'twilio';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReminderScheduleConfig {
  /** Intervals before appointment (in hours) and their channels */
  intervals: Array<{
    hoursBefore: number;
    channel: 'sms' | 'whatsapp' | 'voice';
  }>;
  /** Enable post-appointment satisfaction survey */
  enableSurvey: boolean;
  /** Hours after appointment to send survey */
  surveyDelayHours: number;
}

export interface ReminderServiceConfig {
  smsFromNumber: string;
  whatsappFromNumber: string;
  baseUrl: string;
  defaultTimezone: string;
}

export interface ReminderStats {
  totalSent: number;
  confirmed: number;
  cancelled: number;
  rescheduled: number;
  noResponse: number;
  confirmRate: number;
}

interface PatientAppointmentInfo {
  appointmentId: string;
  patientId: string;
  patientName: string;
  providerName: string;
  facilityName: string | null;
  startTs: Date;
  phone: string;
  orgId: string;
}

// ---------------------------------------------------------------------------
// Arabic reply keywords for confirm / cancel / reschedule
// ---------------------------------------------------------------------------

const CONFIRM_KEYWORDS = ['تأكيد', 'نعم', 'اي', 'أكيد', 'confirm', 'yes', '1'];
const CANCEL_KEYWORDS = ['إلغاء', 'الغاء', 'لا', 'cancel', 'no', '2'];
const RESCHEDULE_KEYWORDS = ['تغيير', 'تعديل', 'reschedule', 'change', '3'];

// ---------------------------------------------------------------------------
// Default schedule
// ---------------------------------------------------------------------------

const DEFAULT_SCHEDULE: ReminderScheduleConfig = {
  intervals: [
    { hoursBefore: 48, channel: 'sms' },
    { hoursBefore: 24, channel: 'whatsapp' },
    { hoursBefore: 2, channel: 'sms' },
  ],
  enableSurvey: true,
  surveyDelayHours: 2,
};

const DEFAULT_CONFIG: ReminderServiceConfig = {
  smsFromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  whatsappFromNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
  baseUrl: process.env.BASE_URL || 'https://api.namaa.ai',
  defaultTimezone: 'Asia/Riyadh',
};

// ---------------------------------------------------------------------------
// No-Show Prediction
// ---------------------------------------------------------------------------

export interface NoShowRisk {
  patientId: string;
  riskLevel: 'low' | 'medium' | 'high';
  noShowCount: number;
  totalAppointments: number;
  noShowRate: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AppointmentReminderService {
  private prisma: PrismaClient;
  private twilio: Twilio | null;
  private config: ReminderServiceConfig;

  /** Per-org schedule overrides. Key = orgId */
  private scheduleOverrides = new Map<string, ReminderScheduleConfig>();

  constructor(
    prisma: PrismaClient,
    twilio: Twilio | null,
    config?: Partial<ReminderServiceConfig>,
  ) {
    this.prisma = prisma;
    this.twilio = twilio;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Schedule configuration
  // -----------------------------------------------------------------------

  /**
   * Set a custom reminder schedule for an org.
   */
  setOrgSchedule(orgId: string, schedule: ReminderScheduleConfig): void {
    this.scheduleOverrides.set(orgId, schedule);
  }

  /**
   * Get the effective schedule for an org.
   */
  getSchedule(orgId: string): ReminderScheduleConfig {
    return this.scheduleOverrides.get(orgId) || DEFAULT_SCHEDULE;
  }

  // -----------------------------------------------------------------------
  // Reminder creation
  // -----------------------------------------------------------------------

  /**
   * Generate reminder records for a newly booked appointment.
   * Call this whenever an appointment is created/confirmed.
   */
  async createRemindersForAppointment(appointmentId: string): Promise<number> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { appointmentId },
    });

    if (!appointment || !appointment.patientId) return 0;

    const schedule = this.getSchedule(appointment.orgId);
    let created = 0;

    for (const interval of schedule.intervals) {
      const scheduledFor = new Date(
        appointment.startTs.getTime() - interval.hoursBefore * 3600_000,
      );

      // Don't create reminders in the past
      if (scheduledFor <= new Date()) continue;

      // Check for duplicate
      const existing = await this.prisma.appointmentReminder.findFirst({
        where: {
          appointmentId,
          channel: interval.channel,
          scheduledFor,
        },
      });
      if (existing) continue;

      await this.prisma.appointmentReminder.create({
        data: {
          appointmentId,
          channel: interval.channel,
          scheduledFor,
          status: 'pending',
        },
      });
      created++;
    }

    return created;
  }

  // -----------------------------------------------------------------------
  // Reminder processing (cron entry point)
  // -----------------------------------------------------------------------

  /**
   * Process all due reminders. Called by a cron job / scheduled task.
   * Finds reminders whose scheduledFor <= now and status = 'pending',
   * then sends them.
   */
  async processDueReminders(): Promise<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
  }> {
    const now = new Date();

    const dueReminders = await this.prisma.appointmentReminder.findMany({
      where: {
        status: 'pending',
        scheduledFor: { lte: now },
      },
      take: 200, // batch size
      orderBy: { scheduledFor: 'asc' },
    });

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const reminder of dueReminders) {
      try {
        // Load appointment + patient + provider info
        const info = await this.loadAppointmentInfo(reminder.appointmentId);
        if (!info) {
          skipped++;
          await this.prisma.appointmentReminder.update({
            where: { reminderId: reminder.reminderId },
            data: { status: 'sent', sentAt: now, response: 'appointment_invalid' },
          });
          continue;
        }

        // Check if appointment is still active
        const appointment = await this.prisma.appointment.findUnique({
          where: { appointmentId: reminder.appointmentId },
        });
        if (!appointment || ['cancelled', 'no_show', 'completed'].includes(appointment.status)) {
          skipped++;
          await this.prisma.appointmentReminder.update({
            where: { reminderId: reminder.reminderId },
            data: { status: 'sent', sentAt: now, response: 'appointment_inactive' },
          });
          continue;
        }

        // No-show risk check — add extra urgency for high-risk
        const noShowRisk = await this.assessNoShowRisk(info.patientId);
        const isHighRisk = noShowRisk.riskLevel === 'high';

        // Send reminder via channel
        const body = this.buildReminderMessage(info, reminder.channel, isHighRisk);

        if (reminder.channel === 'sms') {
          await this.sendSms(info.phone, body, info.orgId, info.patientId);
        } else if (reminder.channel === 'whatsapp') {
          await this.sendWhatsApp(info.phone, body, info.orgId, info.patientId);
        }
        // voice reminders would initiate a call (deferred to OutboundCaller)

        await this.prisma.appointmentReminder.update({
          where: { reminderId: reminder.reminderId },
          data: { status: 'sent', sentAt: now },
        });

        sent++;
      } catch (error) {
        failed++;
        await this.prisma.appointmentReminder.update({
          where: { reminderId: reminder.reminderId },
          data: {
            status: 'sent',
            sentAt: now,
            response: `error: ${error instanceof Error ? error.message : 'unknown'}`,
          },
        });
      }
    }

    return { processed: dueReminders.length, sent, failed, skipped };
  }

  // -----------------------------------------------------------------------
  // Reply parsing
  // -----------------------------------------------------------------------

  /**
   * Parse an incoming SMS/WhatsApp reply from a patient.
   * Returns the detected intent and processes accordingly.
   */
  async handlePatientReply(
    phone: string,
    messageBody: string,
    channel: 'sms' | 'whatsapp',
  ): Promise<{
    action: 'confirm' | 'cancel' | 'reschedule' | 'unknown';
    appointmentId?: string;
  }> {
    const normalized = messageBody.trim().toLowerCase();

    // Detect intent
    let action: 'confirm' | 'cancel' | 'reschedule' | 'unknown' = 'unknown';
    if (CONFIRM_KEYWORDS.some((kw) => normalized.includes(kw))) {
      action = 'confirm';
    } else if (CANCEL_KEYWORDS.some((kw) => normalized.includes(kw))) {
      action = 'cancel';
    } else if (RESCHEDULE_KEYWORDS.some((kw) => normalized.includes(kw))) {
      action = 'reschedule';
    }

    if (action === 'unknown') {
      return { action };
    }

    // Find the most recent pending/sent reminder for this phone
    const contact = await this.prisma.patientContact.findFirst({
      where: { contactValue: phone, contactType: 'phone' },
    });
    if (!contact) return { action };

    // Find upcoming appointment for this patient
    const upcomingAppointment = await this.prisma.appointment.findFirst({
      where: {
        patientId: contact.patientId,
        status: { in: ['booked', 'confirmed'] },
        startTs: { gt: new Date() },
      },
      orderBy: { startTs: 'asc' },
    });

    if (!upcomingAppointment) return { action };

    switch (action) {
      case 'confirm':
        await this.confirmAppointment(upcomingAppointment.appointmentId);
        break;

      case 'cancel':
        await this.cancelAppointment(upcomingAppointment.appointmentId);
        // Trigger waitlist auto-fill
        await this.autoFillFromWaitlist(upcomingAppointment);
        break;

      case 'reschedule':
        // Mark as rescheduled — actual rebooking happens in conversation flow
        await this.prisma.appointmentReminder.updateMany({
          where: {
            appointmentId: upcomingAppointment.appointmentId,
            status: 'sent',
          },
          data: { status: 'rescheduled', response: messageBody },
        });
        break;
    }

    return { action, appointmentId: upcomingAppointment.appointmentId };
  }

  // -----------------------------------------------------------------------
  // No-Show Prediction
  // -----------------------------------------------------------------------

  /**
   * Assess no-show risk for a patient based on historical data.
   */
  async assessNoShowRisk(patientId: string): Promise<NoShowRisk> {
    const [totalAppointments, noShowCount] = await Promise.all([
      this.prisma.appointment.count({
        where: { patientId, status: { in: ['completed', 'no_show', 'cancelled'] } },
      }),
      this.prisma.appointment.count({
        where: { patientId, status: 'no_show' },
      }),
    ]);

    const noShowRate = totalAppointments > 0 ? noShowCount / totalAppointments : 0;

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (noShowRate >= 0.3 || noShowCount >= 3) {
      riskLevel = 'high';
    } else if (noShowRate >= 0.15 || noShowCount >= 2) {
      riskLevel = 'medium';
    }

    return {
      patientId,
      riskLevel,
      noShowCount,
      totalAppointments,
      noShowRate,
    };
  }

  /**
   * Get all patients flagged as high no-show risk for an org.
   */
  async getHighRiskPatients(orgId: string): Promise<NoShowRisk[]> {
    const patients = await this.prisma.patient.findMany({
      where: { orgId },
      select: { patientId: true },
    });

    const risks: NoShowRisk[] = [];
    for (const patient of patients) {
      const risk = await this.assessNoShowRisk(patient.patientId);
      if (risk.riskLevel === 'high') {
        risks.push(risk);
      }
    }

    return risks;
  }

  // -----------------------------------------------------------------------
  // Waitlist Auto-Fill
  // -----------------------------------------------------------------------

  /**
   * When an appointment is cancelled, find waitlisted patients
   * for the same provider/service/timeframe and notify them.
   */
  private async autoFillFromWaitlist(appointment: {
    appointmentId: string;
    orgId: string;
    providerId: string;
    serviceId: string;
    startTs: Date;
    facilityId: string | null;
  }): Promise<void> {
    // Find matching waitlist entries
    const waitlistEntries = await this.prisma.waitlist.findMany({
      where: {
        orgId: appointment.orgId,
        status: 'waiting',
        OR: [
          { providerId: appointment.providerId },
          { serviceId: appointment.serviceId },
          { facilityId: appointment.facilityId },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 3, // Notify top 3 candidates
    });

    for (const entry of waitlistEntries) {
      // Get patient phone
      const contact = await this.prisma.patientContact.findFirst({
        where: { patientId: entry.patientId, contactType: 'phone', isPrimary: true },
      });
      if (!contact) continue;

      // Send notification
      const provider = await this.prisma.provider.findUnique({
        where: { providerId: appointment.providerId },
      });

      const dateStr = appointment.startTs.toLocaleDateString('ar-SA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const timeStr = appointment.startTs.toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const body =
        `🔔 أصبح موعد متاح مع ${provider?.displayName || 'الطبيب'} ` +
        `يوم ${dateStr} الساعة ${timeStr}. ` +
        `للحجز أرسل "تأكيد"، أو اتصل بنا.`;

      await this.sendSms(contact.contactValue, body, appointment.orgId, entry.patientId);

      // Update waitlist status
      await this.prisma.waitlist.update({
        where: { waitlistId: entry.waitlistId },
        data: { status: 'notified', notifiedAt: new Date() },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Post-Appointment Survey
  // -----------------------------------------------------------------------

  /**
   * Schedule satisfaction survey for completed appointments.
   * Call this from an appointment-status-change hook.
   */
  async scheduleSurvey(appointmentId: string, orgId: string): Promise<void> {
    const schedule = this.getSchedule(orgId);
    if (!schedule.enableSurvey) return;

    const appointment = await this.prisma.appointment.findUnique({
      where: { appointmentId },
    });
    if (!appointment || appointment.status !== 'completed') return;

    const surveyTime = new Date(
      appointment.endTs.getTime() + schedule.surveyDelayHours * 3600_000,
    );

    // Create a reminder entry for the survey
    await this.prisma.appointmentReminder.create({
      data: {
        appointmentId,
        channel: 'whatsapp', // WhatsApp for richer survey experience
        scheduledFor: surveyTime,
        status: 'pending',
      },
    });
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  /**
   * Get reminder effectiveness stats for an org.
   */
  async getStats(orgId: string, fromDate?: Date, toDate?: Date): Promise<ReminderStats> {
    const where: any = {};

    // We need to join through appointments to filter by org
    const orgAppointments = await this.prisma.appointment.findMany({
      where: {
        orgId,
        ...(fromDate && { startTs: { gte: fromDate } }),
        ...(toDate && { startTs: { lte: toDate } }),
      },
      select: { appointmentId: true },
    });

    const appointmentIds = orgAppointments.map((a) => a.appointmentId);

    if (appointmentIds.length === 0) {
      return {
        totalSent: 0,
        confirmed: 0,
        cancelled: 0,
        rescheduled: 0,
        noResponse: 0,
        confirmRate: 0,
      };
    }

    const [totalSent, confirmed, cancelled, rescheduled] = await Promise.all([
      this.prisma.appointmentReminder.count({
        where: { appointmentId: { in: appointmentIds }, status: { not: 'pending' } },
      }),
      this.prisma.appointmentReminder.count({
        where: { appointmentId: { in: appointmentIds }, status: 'confirmed' },
      }),
      this.prisma.appointmentReminder.count({
        where: { appointmentId: { in: appointmentIds }, status: 'cancelled' },
      }),
      this.prisma.appointmentReminder.count({
        where: { appointmentId: { in: appointmentIds }, status: 'rescheduled' },
      }),
    ]);

    const noResponse = totalSent - confirmed - cancelled - rescheduled;

    return {
      totalSent,
      confirmed,
      cancelled,
      rescheduled,
      noResponse: Math.max(0, noResponse),
      confirmRate: totalSent > 0 ? confirmed / totalSent : 0,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async loadAppointmentInfo(
    appointmentId: string,
  ): Promise<PatientAppointmentInfo | null> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { appointmentId },
      include: {
        facility: true,
      },
    });

    if (!appointment || !appointment.patientId) return null;

    const [patient, provider, contact] = await Promise.all([
      this.prisma.patient.findUnique({
        where: { patientId: appointment.patientId },
      }),
      this.prisma.provider.findUnique({
        where: { providerId: appointment.providerId },
      }),
      this.prisma.patientContact.findFirst({
        where: {
          patientId: appointment.patientId,
          contactType: 'phone',
          isPrimary: true,
        },
      }),
    ]);

    if (!patient || !provider || !contact) return null;

    return {
      appointmentId,
      patientId: patient.patientId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      providerName: provider.displayName,
      facilityName: appointment.facility?.name || null,
      startTs: appointment.startTs,
      phone: contact.contactValue,
      orgId: appointment.orgId,
    };
  }

  /**
   * Build the reminder message based on channel and risk level.
   */
  private buildReminderMessage(
    info: PatientAppointmentInfo,
    channel: string,
    isHighRisk: boolean,
  ): string {
    const dateStr = info.startTs.toLocaleDateString('ar-SA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = info.startTs.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const facilityLine = info.facilityName ? ` في ${info.facilityName}` : '';
    const urgencyLine = isHighRisk
      ? '\n⚠️ نرجو الالتزام بالموعد حيث يصعب إعادة الحجز لاحقاً.'
      : '';

    const base =
      `مرحباً ${info.patientName}،\n` +
      `تذكير بموعدكم مع ${info.providerName}${facilityLine}\n` +
      `📅 ${dateStr}\n` +
      `🕐 ${timeStr}${urgencyLine}\n\n`;

    if (channel === 'whatsapp') {
      return (
        base +
        'للتأكيد أرسل: تأكيد\n' +
        'للإلغاء أرسل: إلغاء\n' +
        'للتغيير أرسل: تغيير'
      );
    }

    // SMS — shorter
    return (
      base +
      'رد 1 للتأكيد | 2 للإلغاء | 3 للتغيير'
    );
  }

  /**
   * Build a satisfaction survey message.
   */
  buildSurveyMessage(patientName: string): string {
    return (
      `مرحباً ${patientName}،\n` +
      'نأمل أن زيارتكم كانت مريحة.\n' +
      'كيف تقيم تجربتك؟\n' +
      '⭐ 1 - ضعيف\n' +
      '⭐⭐ 2 - مقبول\n' +
      '⭐⭐⭐ 3 - جيد\n' +
      '⭐⭐⭐⭐ 4 - جيد جداً\n' +
      '⭐⭐⭐⭐⭐ 5 - ممتاز\n\n' +
      'أرسل الرقم فقط. شكراً لكم! 🙏'
    );
  }

  private async confirmAppointment(appointmentId: string): Promise<void> {
    await this.prisma.appointment.update({
      where: { appointmentId },
      data: { status: 'confirmed' },
    });
    await this.prisma.appointmentReminder.updateMany({
      where: { appointmentId, status: 'sent' },
      data: { status: 'confirmed', response: 'patient_confirmed' },
    });
  }

  private async cancelAppointment(appointmentId: string): Promise<void> {
    await this.prisma.appointment.update({
      where: { appointmentId },
      data: { status: 'cancelled' },
    });
    await this.prisma.appointmentReminder.updateMany({
      where: { appointmentId, status: { in: ['pending', 'sent'] } },
      data: { status: 'cancelled', response: 'patient_cancelled' },
    });
  }

  private async sendSms(
    phone: string,
    body: string,
    orgId: string,
    patientId: string,
  ): Promise<void> {
    if (!this.twilio) throw new Error('Twilio not configured');

    const message = await this.twilio.messages.create({
      to: phone,
      from: this.config.smsFromNumber,
      body,
    });

    await this.prisma.smsLog.create({
      data: {
        orgId,
        patientId,
        phone,
        channel: 'sms',
        body,
        status: 'sent',
        twilioSid: message.sid,
        triggeredBy: 'scheduled',
      },
    });
  }

  private async sendWhatsApp(
    phone: string,
    body: string,
    orgId: string,
    patientId: string,
  ): Promise<void> {
    if (!this.twilio) throw new Error('Twilio not configured');

    const toWa = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
    const message = await this.twilio.messages.create({
      to: toWa,
      from: this.config.whatsappFromNumber,
      body,
    });

    await this.prisma.smsLog.create({
      data: {
        orgId,
        patientId,
        phone,
        channel: 'whatsapp',
        body,
        status: 'sent',
        twilioSid: message.sid,
        triggeredBy: 'scheduled',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: AppointmentReminderService | null = null;

export function getAppointmentReminderService(
  prisma: PrismaClient,
  twilio: Twilio | null,
  config?: Partial<ReminderServiceConfig>,
): AppointmentReminderService {
  if (!_instance) {
    _instance = new AppointmentReminderService(prisma, twilio, config);
  }
  return _instance;
}

export function resetAppointmentReminderService(): void {
  _instance = null;
}
