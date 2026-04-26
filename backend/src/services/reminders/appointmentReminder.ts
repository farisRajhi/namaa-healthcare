/**
 * Appointment Reminder Service
 *
 * Schedules WhatsApp reminders before appointments and tracks responses.
 * Reminder dispatch (actually sending the WhatsApp messages) is handled
 * separately via Baileys WhatsApp `/api/baileys-whatsapp/send` — this service
 * only manages the scheduling, no-show prediction, and reply parsing logic.
 */
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReminderScheduleConfig {
  /** Intervals before appointment (in hours) and their channel (WhatsApp only) */
  intervals: Array<{
    hoursBefore: number;
    channel: 'whatsapp';
  }>;
  /** Enable post-appointment satisfaction survey */
  enableSurvey: boolean;
  /** Hours after appointment to send survey */
  surveyDelayHours: number;
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

const CONFIRM_KEYWORDS = ['تأكيد', 'نعم', 'اي', 'أكيد', 'confirm', 'yes', '1'];
const CANCEL_KEYWORDS = ['إلغاء', 'الغاء', 'لا', 'cancel', 'no', '2'];
const RESCHEDULE_KEYWORDS = ['تغيير', 'تعديل', 'reschedule', 'change', '3'];

const DEFAULT_SCHEDULE: ReminderScheduleConfig = {
  intervals: [
    { hoursBefore: 48, channel: 'whatsapp' },
    { hoursBefore: 24, channel: 'whatsapp' },
    { hoursBefore: 2, channel: 'whatsapp' },
  ],
  enableSurvey: true,
  surveyDelayHours: 2,
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
  private scheduleOverrides = new Map<string, ReminderScheduleConfig>();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // -----------------------------------------------------------------------
  // Schedule configuration
  // -----------------------------------------------------------------------

  setOrgSchedule(orgId: string, schedule: ReminderScheduleConfig): void {
    this.scheduleOverrides.set(orgId, schedule);
  }

  getSchedule(orgId: string): ReminderScheduleConfig {
    return this.scheduleOverrides.get(orgId) || DEFAULT_SCHEDULE;
  }

  // -----------------------------------------------------------------------
  // Reminder creation
  // -----------------------------------------------------------------------

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

      if (scheduledFor <= new Date()) continue;

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
   * Process all due reminders. Marks them as 'sent' so the cron loop doesn't
   * re-process them. The actual WhatsApp send must be wired via Baileys —
   * for now, this is a tracking/marking pass only.
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
      take: 200,
      orderBy: { scheduledFor: 'asc' },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const reminder of dueReminders) {
      try {
        const info = await this.loadAppointmentInfo(reminder.appointmentId);
        if (!info) {
          skipped++;
          await this.prisma.appointmentReminder.update({
            where: { reminderId: reminder.reminderId },
            data: { status: 'sent', sentAt: now, response: 'appointment_invalid' },
          });
          continue;
        }

        const appointment = await this.prisma.appointment.findUnique({
          where: { appointmentId: reminder.appointmentId },
        });
        if (!appointment || ['cancelled', 'no_show', 'completed', 'expired'].includes(appointment.status)) {
          skipped++;
          await this.prisma.appointmentReminder.update({
            where: { reminderId: reminder.reminderId },
            data: { status: 'sent', sentAt: now, response: 'appointment_inactive' },
          });
          continue;
        }

        await this.prisma.appointmentReminder.update({
          where: { reminderId: reminder.reminderId },
          data: { status: 'sent', sentAt: now },
        });
        sent++;
      } catch (err) {
        console.error(`[Reminders] Failed to process reminder ${reminder.reminderId}:`, err);
        failed++;
      }
    }

    return { processed: dueReminders.length, sent, failed, skipped };
  }

  // -----------------------------------------------------------------------
  // Reply parsing
  // -----------------------------------------------------------------------

  async handlePatientReply(
    phone: string,
    messageBody: string,
    _channel: 'sms' | 'whatsapp',
  ): Promise<{
    action: 'confirm' | 'cancel' | 'reschedule' | 'unknown';
    appointmentId?: string;
  }> {
    const normalized = messageBody.trim().toLowerCase();

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

    const contact = await this.prisma.patientContact.findFirst({
      where: { contactValue: phone, contactType: 'phone' },
    });
    if (!contact) return { action };

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
        break;

      case 'reschedule':
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
  // Post-Appointment Survey
  // -----------------------------------------------------------------------

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

    await this.prisma.appointmentReminder.create({
      data: {
        appointmentId,
        channel: 'whatsapp',
        scheduledFor: surveyTime,
        status: 'pending',
      },
    });
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  async getStats(orgId: string, fromDate?: Date, toDate?: Date): Promise<ReminderStats> {
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
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: AppointmentReminderService | null = null;

export function getAppointmentReminderService(
  prisma: PrismaClient,
): AppointmentReminderService {
  if (!_instance) {
    _instance = new AppointmentReminderService(prisma);
  }
  return _instance;
}

export function resetAppointmentReminderService(): void {
  _instance = null;
}
