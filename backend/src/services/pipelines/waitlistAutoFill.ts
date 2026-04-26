/**
 * Waitlist Auto-Fill Pipeline
 *
 * When an appointment is cancelled, finds matching waitlist entries and
 * marks the top candidate as "notified". The actual WhatsApp message dispatch
 * is the caller's responsibility (via Baileys WhatsApp `/api/baileys-whatsapp/send`).
 */
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WaitlistNotifyResult {
  appointmentId: string;
  waitlistId: string | null;
  patientId: string | null;
  action: 'notified' | 'no_match' | 'error';
  message?: string;
  /** Phone number (E.164) of the notified patient — caller dispatches the actual message. */
  phone?: string;
  /** Pre-built message body the caller can send via Baileys. */
  messageBody?: string;
}

export interface WaitlistResponseResult {
  waitlistId: string;
  accepted: boolean;
  appointmentId?: string;
  nextNotified?: string;
}

const NOTIFICATION_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WaitlistAutoFill {
  constructor(private prisma: PrismaClient) {}

  async onAppointmentCancelled(appointmentId: string): Promise<WaitlistNotifyResult> {
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

    const appointmentDate = appointment.startTs;
    const matchingEntries = waitlistEntries.filter((entry) => {
      if (!entry.preferredDate) return true;
      const prefDate = new Date(entry.preferredDate);
      return (
        prefDate.getFullYear() === appointmentDate.getFullYear() &&
        prefDate.getMonth() === appointmentDate.getMonth() &&
        prefDate.getDate() === appointmentDate.getDate()
      );
    });

    const candidateEntries = matchingEntries.length > 0 ? matchingEntries : waitlistEntries;

    const topCandidate = candidateEntries[0];

    return this.notifyWaitlistPatient(topCandidate.waitlistId, appointment);
  }

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
      phone: contact.contactValue,
      messageBody: message,
    };
  }

  async handleResponse(waitlistId: string, accepted: boolean): Promise<WaitlistResponseResult> {
    const entry = await this.prisma.waitlist.findUnique({
      where: { waitlistId },
    });

    if (!entry || entry.status !== 'notified') {
      return { waitlistId, accepted, nextNotified: undefined };
    }

    if (accepted) {
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

      await this.prisma.waitlist.update({
        where: { waitlistId },
        data: { status: 'waiting', notifiedAt: null },
      });

      return { waitlistId, accepted: true };
    } else {
      await this.prisma.waitlist.update({
        where: { waitlistId },
        data: { status: 'expired' },
      });

      const nextResult = await this.notifyNextInQueue(entry.orgId, entry.serviceId, entry.providerId);

      return {
        waitlistId,
        accepted: false,
        nextNotified: nextResult?.waitlistId || undefined,
      };
    }
  }

  async processExpiredNotifications(): Promise<number> {
    const expiryThreshold = new Date(Date.now() - NOTIFICATION_EXPIRY_MS);

    const expired = await this.prisma.waitlist.findMany({
      where: {
        status: 'notified',
        notifiedAt: { lt: expiryThreshold },
      },
    });

    let renotified = 0;

    for (const entry of expired) {
      await this.prisma.waitlist.update({
        where: { waitlistId: entry.waitlistId },
        data: { status: 'expired' },
      });

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

export function getWaitlistAutoFill(prisma: PrismaClient): WaitlistAutoFill {
  if (!_instance) {
    _instance = new WaitlistAutoFill(prisma);
  }
  return _instance;
}

export function resetWaitlistAutoFill(): void {
  _instance = null;
}
