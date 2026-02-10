import { PrismaClient } from '@prisma/client';

// ─────────────────────────────────────────────────────────
// Prescription Management Service (rxManager)
// Handles: refill requests, medication reminders,
//          drug interaction flagging, status tracking
// ─────────────────────────────────────────────────────────

/** Known interaction pairs — intentionally minimal; expand from a real DB later */
const KNOWN_INTERACTIONS: Array<{ drugA: string; drugB: string; severity: 'low' | 'moderate' | 'high'; note: string; noteAr: string }> = [
  { drugA: 'warfarin',   drugB: 'aspirin',      severity: 'high',     note: 'Increased bleeding risk',                    noteAr: 'زيادة خطر النزيف' },
  { drugA: 'metformin',  drugB: 'alcohol',       severity: 'high',     note: 'Risk of lactic acidosis',                    noteAr: 'خطر الحماض اللاكتيكي' },
  { drugA: 'lisinopril', drugB: 'potassium',     severity: 'moderate', note: 'Risk of hyperkalemia',                       noteAr: 'خطر ارتفاع البوتاسيوم' },
  { drugA: 'simvastatin', drugB: 'amiodarone',   severity: 'high',     note: 'Increased risk of rhabdomyolysis',           noteAr: 'زيادة خطر انحلال الربيدات' },
  { drugA: 'ciprofloxacin', drugB: 'theophylline', severity: 'moderate', note: 'Theophylline toxicity risk',              noteAr: 'خطر سمية الثيوفيلين' },
  { drugA: 'omeprazole', drugB: 'clopidogrel',   severity: 'moderate', note: 'Reduced clopidogrel effectiveness',          noteAr: 'انخفاض فعالية كلوبيدوقرل' },
  { drugA: 'fluoxetine', drugB: 'tramadol',      severity: 'high',     note: 'Serotonin syndrome risk',                    noteAr: 'خطر متلازمة السيروتونين' },
  { drugA: 'methotrexate', drugB: 'ibuprofen',   severity: 'high',     note: 'Increased methotrexate toxicity',            noteAr: 'زيادة سمية الميثوتريكسات' },
];

export interface RefillResult {
  success: boolean;
  refillId?: string;
  message: string;
  messageAr: string;
}

export interface InteractionFlag {
  drugA: string;
  drugB: string;
  severity: 'low' | 'moderate' | 'high';
  note: string;
  noteAr: string;
}

export interface ReminderSchedule {
  reminderId: string;
  prescriptionId: string;
  channel: string;
  scheduleTime: string;
  isActive: boolean;
}

// ─────────────────────────────────────────────────────────
// Core service class
// ─────────────────────────────────────────────────────────
export class RxManager {
  constructor(private prisma: PrismaClient) {}

  // ───── List active prescriptions for a patient ─────
  async listActiveByPatient(patientId: string, orgId: string) {
    return this.prisma.prescription.findMany({
      where: { patientId, orgId, status: 'active' },
      include: { refills: { orderBy: { requestedAt: 'desc' }, take: 3 }, reminders: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ───── Get a single prescription with history ─────
  async getById(prescriptionId: string, orgId: string) {
    return this.prisma.prescription.findFirst({
      where: { prescriptionId, orgId },
      include: {
        refills: { orderBy: { requestedAt: 'desc' } },
        reminders: true,
      },
    });
  }

  // ───── Create prescription ─────
  async create(data: {
    orgId: string;
    patientId: string;
    providerId: string;
    medicationName: string;
    medicationNameAr?: string;
    dosage: string;
    frequency: string;
    refillsTotal: number;
    startDate: string;
    endDate?: string;
    pharmacyName?: string;
    pharmacyPhone?: string;
    notes?: string;
  }) {
    const rx = await this.prisma.prescription.create({
      data: {
        orgId: data.orgId,
        patientId: data.patientId,
        providerId: data.providerId,
        medicationName: data.medicationName,
        medicationNameAr: data.medicationNameAr ?? null,
        dosage: data.dosage,
        frequency: data.frequency,
        refillsTotal: data.refillsTotal,
        refillsRemaining: data.refillsTotal,
        status: 'active',
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        pharmacyName: data.pharmacyName ?? null,
        pharmacyPhone: data.pharmacyPhone ?? null,
        notes: data.notes ?? null,
      },
      include: { refills: true, reminders: true },
    });

    // Flag interactions with existing active meds
    const interactions = await this.checkInteractions(data.patientId, data.orgId, data.medicationName);

    return { prescription: rx, interactions };
  }

  // ───── Update prescription (partial) ─────
  async update(prescriptionId: string, orgId: string, data: {
    status?: string;
    dosage?: string;
    frequency?: string;
    refillsRemaining?: number;
    endDate?: string;
    pharmacyName?: string;
    pharmacyPhone?: string;
    notes?: string;
  }) {
    // Verify ownership
    const existing = await this.prisma.prescription.findFirst({
      where: { prescriptionId, orgId },
    });
    if (!existing) return null;

    return this.prisma.prescription.update({
      where: { prescriptionId },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.dosage !== undefined && { dosage: data.dosage }),
        ...(data.frequency !== undefined && { frequency: data.frequency }),
        ...(data.refillsRemaining !== undefined && { refillsRemaining: data.refillsRemaining }),
        ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
        ...(data.pharmacyName !== undefined && { pharmacyName: data.pharmacyName }),
        ...(data.pharmacyPhone !== undefined && { pharmacyPhone: data.pharmacyPhone }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: { refills: true, reminders: true },
    });
  }

  // ───── Refill request flow ─────
  async requestRefill(prescriptionId: string, orgId: string, opts: {
    requestedVia: string;
    conversationId?: string;
    notes?: string;
  }): Promise<RefillResult> {
    const rx = await this.prisma.prescription.findFirst({
      where: { prescriptionId, orgId },
    });

    if (!rx) {
      return { success: false, message: 'Prescription not found', messageAr: 'الوصفة غير موجودة' };
    }

    if (rx.status !== 'active') {
      return { success: false, message: `Prescription is ${rx.status}`, messageAr: `الوصفة ${rx.status === 'expired' ? 'منتهية' : rx.status === 'cancelled' ? 'ملغاة' : 'مكتملة'}` };
    }

    if (rx.refillsRemaining <= 0) {
      return {
        success: false,
        message: 'No refills remaining. Please schedule an appointment with your doctor.',
        messageAr: 'لا توجد إعادات تعبئة متبقية. يرجى حجز موعد مع طبيبك.',
      };
    }

    // Check for existing pending refill to prevent duplicates
    const pendingRefill = await this.prisma.prescriptionRefill.findFirst({
      where: { prescriptionId, status: 'pending' },
    });

    if (pendingRefill) {
      return {
        success: false,
        refillId: pendingRefill.refillId,
        message: 'A refill request is already pending for this prescription.',
        messageAr: 'يوجد طلب إعادة تعبئة معلق بالفعل لهذه الوصفة.',
      };
    }

    // Create refill and decrement remaining in a transaction
    const [refill] = await this.prisma.$transaction([
      this.prisma.prescriptionRefill.create({
        data: {
          prescriptionId,
          requestedVia: opts.requestedVia,
          conversationId: opts.conversationId ?? null,
          status: 'pending',
          notes: opts.notes ?? null,
        },
      }),
      this.prisma.prescription.update({
        where: { prescriptionId },
        data: { refillsRemaining: { decrement: 1 } },
      }),
    ]);

    return {
      success: true,
      refillId: refill.refillId,
      message: `Refill request submitted. ${rx.refillsRemaining - 1} refills remaining.`,
      messageAr: `تم تقديم طلب إعادة التعبئة. المتبقي ${rx.refillsRemaining - 1} إعادة تعبئة.`,
    };
  }

  // ───── Get refill status ─────
  async getRefillStatus(prescriptionId: string, orgId: string) {
    // Verify ownership
    const rx = await this.prisma.prescription.findFirst({
      where: { prescriptionId, orgId },
      select: { prescriptionId: true, medicationName: true, medicationNameAr: true, refillsRemaining: true, refillsTotal: true, status: true },
    });
    if (!rx) return null;

    const latestRefill = await this.prisma.prescriptionRefill.findFirst({
      where: { prescriptionId },
      orderBy: { requestedAt: 'desc' },
    });

    return {
      prescription: rx,
      latestRefill,
    };
  }

  // ───── Process refill (approve / deny / dispense) ─────
  async processRefill(refillId: string, action: 'approved' | 'dispensed' | 'denied', processedBy: string, notes?: string) {
    const refill = await this.prisma.prescriptionRefill.findUnique({ where: { refillId } });
    if (!refill) return null;

    // If denying, restore the refill count
    if (action === 'denied') {
      await this.prisma.prescription.update({
        where: { prescriptionId: refill.prescriptionId },
        data: { refillsRemaining: { increment: 1 } },
      });
    }

    return this.prisma.prescriptionRefill.update({
      where: { refillId },
      data: {
        status: action,
        processedAt: new Date(),
        processedBy,
        notes: notes ?? null,
      },
    });
  }

  // ───── Drug interaction checker ─────
  async checkInteractions(patientId: string, orgId: string, newMedication: string): Promise<InteractionFlag[]> {
    const activeMeds = await this.prisma.prescription.findMany({
      where: { patientId, orgId, status: 'active' },
      select: { medicationName: true },
    });

    const flags: InteractionFlag[] = [];
    const newMedLower = newMedication.toLowerCase();

    for (const med of activeMeds) {
      const medLower = med.medicationName.toLowerCase();
      if (medLower === newMedLower) continue; // skip self

      for (const pair of KNOWN_INTERACTIONS) {
        const matchForward = newMedLower.includes(pair.drugA) && medLower.includes(pair.drugB);
        const matchReverse = newMedLower.includes(pair.drugB) && medLower.includes(pair.drugA);
        if (matchForward || matchReverse) {
          flags.push({
            drugA: newMedication,
            drugB: med.medicationName,
            severity: pair.severity,
            note: pair.note,
            noteAr: pair.noteAr,
          });
        }
      }
    }

    return flags;
  }

  // ───── Medication reminder management ─────
  async createReminder(data: {
    patientId: string;
    prescriptionId: string;
    channel: string;
    scheduleTime: string;
  }): Promise<ReminderSchedule> {
    const reminder = await this.prisma.medicationReminder.create({
      data: {
        patientId: data.patientId,
        prescriptionId: data.prescriptionId,
        channel: data.channel,
        scheduleTime: data.scheduleTime,
        isActive: true,
      },
    });

    return {
      reminderId: reminder.reminderId,
      prescriptionId: reminder.prescriptionId,
      channel: reminder.channel,
      scheduleTime: reminder.scheduleTime,
      isActive: reminder.isActive,
    };
  }

  async listReminders(patientId: string, activeOnly = true) {
    return this.prisma.medicationReminder.findMany({
      where: { patientId, ...(activeOnly && { isActive: true }) },
      include: { prescription: { select: { medicationName: true, medicationNameAr: true, dosage: true, frequency: true } } },
      orderBy: { scheduleTime: 'asc' },
    });
  }

  async toggleReminder(reminderId: string, isActive: boolean) {
    return this.prisma.medicationReminder.update({
      where: { reminderId },
      data: { isActive },
    });
  }

  async deactivateReminder(reminderId: string) {
    return this.toggleReminder(reminderId, false);
  }

  /** Mark a reminder as sent (called by the cron/scheduler) */
  async markReminderSent(reminderId: string) {
    return this.prisma.medicationReminder.update({
      where: { reminderId },
      data: { lastSentAt: new Date() },
    });
  }

  /**
   * Get all reminders due now (for scheduler).
   * Finds active reminders whose scheduleTime matches the current HH:MM
   * and haven't been sent today.
   */
  async getDueReminders(currentTime: string /* "HH:MM" */) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return this.prisma.medicationReminder.findMany({
      where: {
        isActive: true,
        scheduleTime: currentTime,
        OR: [
          { lastSentAt: null },
          { lastSentAt: { lt: todayStart } },
        ],
      },
      include: {
        prescription: {
          select: {
            medicationName: true,
            medicationNameAr: true,
            dosage: true,
            frequency: true,
            status: true,
            patientId: true,
          },
        },
      },
    });
  }
}
