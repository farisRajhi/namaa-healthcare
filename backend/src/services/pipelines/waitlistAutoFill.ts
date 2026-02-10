/**
 * Waitlist Auto-Fill Pipeline
 *
 * When an appointment is cancelled, automatically finds matching
 * waitlist entries and notifies patients of availability.
 *
 * Flow:
 *   1. Appointment cancelled → onAppointmentCancelled()
 *   2. Match waitlist entries by service/provider/date
 *   3. Notify the top candidate via SMS/WhatsApp
 *   4. Set 2-hour expiry — if no response, move to next
 *   5. Patient responds → handleResponse()
 */
import { PrismaClient } from '@prisma/client';
import type { Twilio } from 'twilio';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WaitlistNotifyResult {
  appointmentId: string;
  waitlistId: string | null;
  patientId: string | null;
  action: 'notified' | 'no_match' | 'error';
  message?: string;
}

export interface WaitlistResponseResult {
  waitlistId: string;
  accepted: boolean;
  appointmentId?: string;
  nextNotified?: string; // Next waitlist ID that was notified
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NOTIFICATION_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours

const DEFAULT_CONFIG = {
  smsFromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  whatsappFromNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WaitlistAutoFill {
  private prisma: PrismaClient;
  private twilio: Twilio | null;

  constructor(prisma: PrismaClient, twilio: Twilio | null = null) {
    this.prisma = prisma;
    this.twilio = twilio;
  }

  /**
   * Called when an appointment is cancelled.
   * Finds matching waitlist entries and notifies the top candidate.
   */
  async onAppointmentCancelled(appointmentId: string): Promise<WaitlistNotifyResult> {
    // 1. Get cancelled appointment details
    const appointment = await this.prisma.appointment.findUnique({
      where: { appointmentId },
      include: {
        provider: { select: { providerId: true, displayName: true } },
        service: { select: { serviceId: true, name: true } },
      },
    });

    if (!appointment) {
      return { appointmentId, waitlistId: null, patientId: null, action: 'error', message: 'Appointment not found' };
    }

    // 2. Find matching waitlist entries
    const waitlistEntries = await this.prisma.waitlist.findMany({
      where: {
        orgId: appointment.orgId,
        status: 'waiting',
        OR: [
          { serviceId: appointment.serviceId },
          { providerId: appointment.providerId },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    if (waitlistEntries.length === 0) {
      return { appointmentId, waitlistId: null, patientId: null, action: 'no_match', message: 'No matching waitlist entries' };
    }

    // 3. Filter by preferred date compatibility
    const appointmentDate = appointment.startTs;
    const matchingEntries = waitlistEntries.filter((entry) => {
      // If no preferred date, patient is flexible → always match
      if (!entry.preferredDate) return true;

      // Check if preferred date matches the appointment date
      const prefDate = new Date(entry.preferredDate);
      return (
        prefDate.getFullYear() === appointmentDate.getFullYear() &&
        prefDate.getMonth() === appointmentDate.getMonth() &&
        prefDate.getDate() === appointmentDate.getDate()
      );
    });

    // Also include flexible entries (no preferred date) even if not in filtered list
    const candidateEntries = matchingEntries.length > 0 ? matchingEntries : waitlistEntries;

    // 4. Notify the top candidate
    const topCandidate = candidateEntries[0];

    return this.notifyWaitlistPatient(topCandidate.waitlistId, appointment);
  }

  /**
   * Notify a specific waitlist patient about an available slot.
   */
  private async notifyWaitlistPatient(
    waitlistId: string,
    appointment: {
      appointmentId: string;
      orgId: string;
      providerId: string;
      serviceId: string;
      startTs: Date;
      endTs: Date;
      provider: { providerId: string; displayName: string } | null;
      service: { serviceId: string; name: string } | null;
    },
  ): Promise<WaitlistNotifyResult> {
    const entry = await this.prisma.waitlist.findUnique({
      where: { waitlistId },
    });

    if (!entry) {
      return {
        appointmentId: appointment.appointmentId,
        waitlistId,
        patientId: null,
        action: 'error',
        message: 'Waitlist entry not found',
      };
    }

    // Get patient phone
    const contact = await this.prisma.patientContact.findFirst({
      where: {
        patientId: entry.patientId,
        contactType: 'phone',
        isPrimary: true,
      },
    });

    if (!contact) {
      return {
        appointmentId: appointment.appointmentId,
        waitlistId,
        patientId: entry.patientId,
        action: 'error',
        message: 'No phone contact found for patient',
      };
    }

    // Format date and time in Arabic
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

    const providerName = appointment.provider?.displayName || 'الطبيب';
    const message =
      `يوجد موعد متاح يوم ${dateStr} الساعة ${timeStr} مع ${providerName}. ` +
      `هل ترغب بالحجز؟ رد بـ 'نعم' للتأكيد أو 'لا' للرفض.`;

    // Send notification via SMS
    try {
      if (this.twilio) {
        const smsResult = await this.twilio.messages.create({
          to: contact.contactValue,
          from: DEFAULT_CONFIG.smsFromNumber,
          body: message,
        });

        // Log SMS
        await this.prisma.smsLog.create({
          data: {
            orgId: appointment.orgId,
            patientId: entry.patientId,
            phone: contact.contactValue,
            channel: 'sms',
            body: message,
            status: 'sent',
            twilioSid: smsResult.sid,
            triggeredBy: 'waitlist_autofill',
          },
        });
      }

      // Update waitlist status to 'notified'
      await this.prisma.waitlist.update({
        where: { waitlistId },
        data: {
          status: 'notified',
          notifiedAt: new Date(),
        },
      });

      console.log(
        `[WaitlistAutoFill] Notified patient ${entry.patientId} for appointment ${appointment.appointmentId}`,
      );

      return {
        appointmentId: appointment.appointmentId,
        waitlistId,
        patientId: entry.patientId,
        action: 'notified',
      };
    } catch (err: any) {
      console.error(
        `[WaitlistAutoFill] Failed to notify patient ${entry.patientId}:`,
        err?.message || err,
      );
      return {
        appointmentId: appointment.appointmentId,
        waitlistId,
        patientId: entry.patientId,
        action: 'error',
        message: err?.message || 'Send failed',
      };
    }
  }

  /**
   * Handle a patient's response to a waitlist notification.
   */
  async handleResponse(waitlistId: string, accepted: boolean): Promise<WaitlistResponseResult> {
    const entry = await this.prisma.waitlist.findUnique({
      where: { waitlistId },
    });

    if (!entry || entry.status !== 'notified') {
      return { waitlistId, accepted, nextNotified: undefined };
    }

    if (accepted) {
      // Find the original cancelled appointment slot details
      // We'll look for the most recent cancelled appointment matching service/provider
      const slot = await this.prisma.appointment.findFirst({
        where: {
          orgId: entry.orgId,
          status: 'cancelled',
          ...(entry.serviceId && { serviceId: entry.serviceId }),
          ...(entry.providerId && { providerId: entry.providerId }),
          startTs: { gt: new Date() },
        },
        orderBy: { startTs: 'asc' },
      });

      if (slot) {
        // Create new appointment for this patient
        const newAppointment = await this.prisma.appointment.create({
          data: {
            orgId: entry.orgId,
            providerId: slot.providerId,
            patientId: entry.patientId,
            serviceId: slot.serviceId,
            facilityId: slot.facilityId,
            departmentId: slot.departmentId,
            startTs: slot.startTs,
            endTs: slot.endTs,
            status: 'booked',
            reason: 'حجز من قائمة الانتظار',
            statusHistory: {
              create: {
                newStatus: 'booked',
                changedBy: 'system:waitlist_autofill',
              },
            },
          },
        });

        // Update waitlist to 'booked'
        await this.prisma.waitlist.update({
          where: { waitlistId },
          data: { status: 'booked' },
        });

        console.log(
          `[WaitlistAutoFill] Patient ${entry.patientId} booked from waitlist → appointment ${newAppointment.appointmentId}`,
        );

        return {
          waitlistId,
          accepted: true,
          appointmentId: newAppointment.appointmentId,
        };
      }

      // Slot no longer available — reset to waiting
      await this.prisma.waitlist.update({
        where: { waitlistId },
        data: { status: 'waiting', notifiedAt: null },
      });

      return { waitlistId, accepted: true };
    } else {
      // Patient declined — reset to expired, notify next in queue
      await this.prisma.waitlist.update({
        where: { waitlistId },
        data: { status: 'expired' },
      });

      // Find next candidate for the same service/provider
      const nextResult = await this.notifyNextInQueue(entry.orgId, entry.serviceId, entry.providerId);

      return {
        waitlistId,
        accepted: false,
        nextNotified: nextResult?.waitlistId || undefined,
      };
    }
  }

  /**
   * Expire notifications that have been pending for over 2 hours
   * and move to the next candidate in the queue.
   *
   * Called by the scheduler every 30 minutes.
   */
  async processExpiredNotifications(): Promise<number> {
    const expiryThreshold = new Date(Date.now() - NOTIFICATION_EXPIRY_MS);

    // Find all notified entries that are past the expiry window
    const expired = await this.prisma.waitlist.findMany({
      where: {
        status: 'notified',
        notifiedAt: { lt: expiryThreshold },
      },
    });

    let renotified = 0;

    for (const entry of expired) {
      // Reset to waiting (so they can be re-queued later if needed)
      await this.prisma.waitlist.update({
        where: { waitlistId: entry.waitlistId },
        data: { status: 'expired' },
      });

      // Notify next in queue
      const next = await this.notifyNextInQueue(entry.orgId, entry.serviceId, entry.providerId);
      if (next) renotified++;
    }

    if (expired.length > 0) {
      console.log(
        `[WaitlistAutoFill] Expired ${expired.length} notifications, re-notified ${renotified} next candidates`,
      );
    }

    return expired.length;
  }

  /**
   * Find and notify the next waiting patient for a given service/provider.
   */
  private async notifyNextInQueue(
    orgId: string,
    serviceId: string | null,
    providerId: string | null,
  ): Promise<WaitlistNotifyResult | null> {
    const orConditions: Array<Record<string, string>> = [];
    if (serviceId) orConditions.push({ serviceId });
    if (providerId) orConditions.push({ providerId });

    if (orConditions.length === 0) return null;

    const nextEntry = await this.prisma.waitlist.findFirst({
      where: {
        orgId,
        status: 'waiting',
        OR: orConditions,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    if (!nextEntry) return null;

    // Find a matching future cancelled appointment
    const slot = await this.prisma.appointment.findFirst({
      where: {
        orgId,
        status: 'cancelled',
        ...(serviceId && { serviceId }),
        ...(providerId && { providerId }),
        startTs: { gt: new Date() },
      },
      include: {
        provider: { select: { providerId: true, displayName: true } },
        service: { select: { serviceId: true, name: true } },
      },
      orderBy: { startTs: 'asc' },
    });

    if (!slot) return null;

    return this.notifyWaitlistPatient(nextEntry.waitlistId, slot);
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: WaitlistAutoFill | null = null;

export function getWaitlistAutoFill(
  prisma: PrismaClient,
  twilio: Twilio | null = null,
): WaitlistAutoFill {
  if (!_instance) {
    _instance = new WaitlistAutoFill(prisma, twilio);
  }
  return _instance;
}

export function resetWaitlistAutoFill(): void {
  _instance = null;
}
