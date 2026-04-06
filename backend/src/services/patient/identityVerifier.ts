import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export enum VerificationLevel {
  /** Can access public FAQ only */
  Anonymous = 0,
  /** Phone number matched — can view appointments */
  PhoneMatched = 1,
  /** DOB confirmed — can modify appointments */
  DOBConfirmed = 2,
  /** Full verification — can access medical records */
  FullVerified = 3,
}

export interface VerificationSession {
  sessionId: string;
  patientId: string | null;
  conversationId: string | null;
  callerPhone: string;
  level: VerificationLevel;
  attempts: number;
  verifiedAt: Date | null;
  expiresAt: Date;
  /** If the caller is acting on behalf of someone else */
  actingOnBehalfOf: string | null;
  relationship: string | null;
}

export interface VerificationResult {
  success: boolean;
  level: VerificationLevel;
  patientId: string | null;
  patientName: string | null;
  message: string;
  messageAr: string;
  shouldTransferToHuman: boolean;
  session: VerificationSession;
}

interface PatientMatch {
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  mrn: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;
const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour

// ─── Identity Verifier ──────────────────────────────────────────────────────────

export class IdentityVerifier {
  private sessions: Map<string, VerificationSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaClient) {
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 10 * 60 * 1000);
  }

  // ─── Session management ───────────────────────────────────────────────────

  /**
   * Get or create a verification session for a conversation.
   * If an active non-expired session exists it is returned (no re-verification).
   */
  getOrCreateSession(
    conversationId: string,
    callerPhone: string,
  ): VerificationSession {
    // Check by conversation id first
    for (const session of this.sessions.values()) {
      if (
        session.conversationId === conversationId &&
        session.expiresAt.getTime() > Date.now()
      ) {
        return session;
      }
    }

    const session: VerificationSession = {
      sessionId: randomUUID(),
      patientId: null,
      conversationId,
      callerPhone,
      level: VerificationLevel.Anonymous,
      attempts: 0,
      verifiedAt: null,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      actingOnBehalfOf: null,
      relationship: null,
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Retrieve an existing session by id
   */
  getSession(sessionId: string): VerificationSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session && session.expiresAt.getTime() < Date.now()) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return session;
  }

  // ─── Step 1: Phone number lookup ──────────────────────────────────────────

  /**
   * Look up the caller's phone number in PatientContact.
   * Returns matched patients (could be multiple for family phones).
   */
  async lookupByPhone(phone: string): Promise<PatientMatch[]> {
    // Normalise to E.164 (strip spaces/dashes, ensure +966 prefix)
    const normalised = this.normalisePhone(phone);

    const contacts = await this.prisma.patientContact.findMany({
      where: {
        contactType: 'phone',
        contactValue: normalised,
      },
      select: { patientId: true },
    });

    if (contacts.length === 0) return [];

    const patients = await this.prisma.patient.findMany({
      where: {
        patientId: { in: contacts.map((c) => c.patientId) },
      },
      select: {
        patientId: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        mrn: true,
      },
    });

    return patients;
  }

  /**
   * Run phone-level verification (Step 1).
   * If a single match is found the session is promoted to Level 1.
   */
  async verifyByPhone(sessionId: string): Promise<VerificationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) return this.errorResult('Session not found', 'الجلسة غير موجودة');

    const matches = await this.lookupByPhone(session.callerPhone);

    if (matches.length === 0) {
      return {
        success: false,
        level: VerificationLevel.Anonymous,
        patientId: null,
        patientName: null,
        message: 'No patient record found for this phone number.',
        messageAr: 'لم يتم العثور على سجل مريض لهذا الرقم.',
        shouldTransferToHuman: false,
        session,
      };
    }

    if (matches.length === 1) {
      session.patientId = matches[0].patientId;
      session.level = VerificationLevel.PhoneMatched;
      return {
        success: true,
        level: VerificationLevel.PhoneMatched,
        patientId: matches[0].patientId,
        patientName: `${matches[0].firstName} ${matches[0].lastName}`,
        message: `Phone matched to ${matches[0].firstName} ${matches[0].lastName}.`,
        messageAr: `تم مطابقة الرقم مع ${matches[0].firstName} ${matches[0].lastName}.`,
        shouldTransferToHuman: false,
        session,
      };
    }

    // Multiple patients linked to same phone — ask caller to identify
    const names = matches.map((m) => `${m.firstName} ${m.lastName}`);
    return {
      success: true,
      level: VerificationLevel.PhoneMatched,
      patientId: null,
      patientName: null,
      message: `Multiple records found: ${names.join(', ')}. Who are you calling about?`,
      messageAr: `تم العثور على عدة سجلات: ${names.join('، ')}. لمن تتصل؟`,
      shouldTransferToHuman: false,
      session,
    };
  }

  /**
   * Select a patient from multiple matches (when phone matched more than one).
   */
  selectPatient(sessionId: string, patientId: string): VerificationResult {
    const session = this.sessions.get(sessionId);
    if (!session) return this.errorResult('Session not found', 'الجلسة غير موجودة');

    session.patientId = patientId;
    session.level = VerificationLevel.PhoneMatched;

    return {
      success: true,
      level: session.level,
      patientId,
      patientName: null,
      message: 'Patient selected. Please confirm date of birth for further access.',
      messageAr: 'تم اختيار المريض. يرجى تأكيد تاريخ الميلاد.',
      shouldTransferToHuman: false,
      session,
    };
  }

  // ─── Step 2: DOB confirmation ─────────────────────────────────────────────

  /**
   * Verify the patient's date of birth to reach Level 2.
   */
  async verifyDOB(sessionId: string, providedDOB: string): Promise<VerificationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) return this.errorResult('Session not found', 'الجلسة غير موجودة');
    if (!session.patientId)
      return this.errorResult('No patient selected yet', 'لم يتم اختيار المريض بعد');

    session.attempts += 1;

    if (session.attempts > MAX_ATTEMPTS) {
      return this.transferToHumanResult(session);
    }

    const patient = await this.prisma.patient.findUnique({
      where: { patientId: session.patientId },
      select: { dateOfBirth: true, firstName: true, lastName: true },
    });

    if (!patient || !patient.dateOfBirth) {
      return this.transferToHumanResult(session);
    }

    const expectedDOB = this.formatDate(patient.dateOfBirth);
    const normalisedProvided = this.normaliseDate(providedDOB);

    if (expectedDOB === normalisedProvided) {
      session.level = VerificationLevel.DOBConfirmed;
      session.verifiedAt = new Date();

      // Persist to DB
      await this.persistVerification(session, 'dob');

      return {
        success: true,
        level: VerificationLevel.DOBConfirmed,
        patientId: session.patientId,
        patientName: `${patient.firstName} ${patient.lastName}`,
        message: 'Date of birth confirmed. You now have access to modify appointments.',
        messageAr: 'تم تأكيد تاريخ الميلاد. يمكنك الآن تعديل المواعيد.',
        shouldTransferToHuman: false,
        session,
      };
    }

    const remaining = MAX_ATTEMPTS - session.attempts;
    return {
      success: false,
      level: session.level,
      patientId: session.patientId,
      patientName: null,
      message: `Incorrect date of birth. ${remaining} attempt(s) remaining.`,
      messageAr: `تاريخ الميلاد غير صحيح. متبقي ${remaining} محاولة.`,
      shouldTransferToHuman: remaining === 0,
      session,
    };
  }

  // ─── Step 3: Full verification (MRN / National ID) ────────────────────────

  /**
   * Verify MRN or National ID to reach Level 3.
   */
  async verifyMRNOrNationalId(
    sessionId: string,
    identifier: string,
  ): Promise<VerificationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) return this.errorResult('Session not found', 'الجلسة غير موجودة');
    if (!session.patientId)
      return this.errorResult('No patient selected yet', 'لم يتم اختيار المريض بعد');

    session.attempts += 1;

    if (session.attempts > MAX_ATTEMPTS) {
      return this.transferToHumanResult(session);
    }

    const patient = await this.prisma.patient.findUnique({
      where: { patientId: session.patientId },
      select: { mrn: true, firstName: true, lastName: true },
    });

    if (!patient) {
      return this.transferToHumanResult(session);
    }

    const normalisedId = identifier.trim().replace(/\s+/g, '');

    // Check against MRN
    const mrnMatch = patient.mrn && patient.mrn.trim() === normalisedId;

    // Check against national ID stored in patient contacts
    let nationalIdMatch = false;
    if (!mrnMatch) {
      const nationalIdContact = await this.prisma.patientContact.findFirst({
        where: {
          patientId: session.patientId,
          contactType: 'national_id',
          contactValue: normalisedId,
        },
      });
      nationalIdMatch = !!nationalIdContact;
    }

    if (mrnMatch || nationalIdMatch) {
      session.level = VerificationLevel.FullVerified;
      session.verifiedAt = new Date();

      await this.persistVerification(session, mrnMatch ? 'mrn' : 'national_id');

      return {
        success: true,
        level: VerificationLevel.FullVerified,
        patientId: session.patientId,
        patientName: `${patient.firstName} ${patient.lastName}`,
        message: 'Identity fully verified. You have full access.',
        messageAr: 'تم التحقق من الهوية بالكامل. لديك صلاحية كاملة.',
        shouldTransferToHuman: false,
        session,
      };
    }

    const remaining = MAX_ATTEMPTS - session.attempts;
    return {
      success: false,
      level: session.level,
      patientId: session.patientId,
      patientName: null,
      message: `Identifier does not match. ${remaining} attempt(s) remaining.`,
      messageAr: `المعرف غير مطابق. متبقي ${remaining} محاولة.`,
      shouldTransferToHuman: remaining === 0,
      session,
    };
  }

  // ─── Family / guardian access ─────────────────────────────────────────────

  /**
   * Check whether the caller (via their MessagingUser) has guardian/family
   * access to a given patient.
   */
  async checkFamilyAccess(
    sessionId: string,
    messagingUserId: string,
    targetPatientId: string,
  ): Promise<VerificationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) return this.errorResult('Session not found', 'الجلسة غير موجودة');

    const link = await this.prisma.messagingUserPatientLink.findUnique({
      where: {
        messagingUserId_patientId: {
          messagingUserId,
          patientId: targetPatientId,
        },
      },
    });

    if (!link) {
      return {
        success: false,
        level: session.level,
        patientId: null,
        patientName: null,
        message: 'You do not have authorised access to this patient.',
        messageAr: 'ليس لديك صلاحية للوصول لسجل هذا المريض.',
        shouldTransferToHuman: false,
        session,
      };
    }

    // Grant access based on relationship
    const allowedRelationships = ['self', 'parent', 'guardian', 'spouse', 'caregiver'];
    if (!allowedRelationships.includes(link.relationship)) {
      return {
        success: false,
        level: session.level,
        patientId: null,
        patientName: null,
        message: `Your relationship (${link.relationship}) does not grant management access.`,
        messageAr: `علاقتك (${link.relationship}) لا تمنحك صلاحية الإدارة.`,
        shouldTransferToHuman: false,
        session,
      };
    }

    // Promote to at least PhoneMatched (family verified)
    session.actingOnBehalfOf = targetPatientId;
    session.relationship = link.relationship;
    session.patientId = targetPatientId;
    if (session.level < VerificationLevel.PhoneMatched) {
      session.level = VerificationLevel.PhoneMatched;
    }

    return {
      success: true,
      level: session.level,
      patientId: targetPatientId,
      patientName: null,
      message: `Access granted as ${link.relationship}.`,
      messageAr: `تم منح الصلاحية بصفة ${link.relationship}.`,
      shouldTransferToHuman: false,
      session,
    };
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private async persistVerification(
    session: VerificationSession,
    method: string,
  ): Promise<void> {
    try {
      await this.prisma.patientVerification.create({
        data: {
          patientId: session.patientId!,
          conversationId: session.conversationId,
          method,
          level: session.level,
          verified: true,
          attempts: session.attempts,
          verifiedAt: session.verifiedAt,
          expiresAt: session.expiresAt,
        },
      });
    } catch (err) {
      console.error('[IdentityVerifier] Failed to persist verification:', err);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private normalisePhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-()]/g, '');
    // Saudi number without country code
    if (cleaned.startsWith('05') && cleaned.length === 10) {
      cleaned = '+966' + cleaned.slice(1);
    }
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Accept common date formats and normalise to YYYY-MM-DD
   */
  private normaliseDate(input: string): string {
    const cleaned = input.trim();

    // Try YYYY-MM-DD
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleaned)) {
      const [y, m, d] = cleaned.split('-');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Saudi standard: DD/MM/YYYY or DD-MM-YYYY (day first)
    // This is the canonical format — we do NOT attempt MM/DD/YYYY to avoid ambiguity
    const dmyMatch = cleaned.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }

    // Try parsing with Date constructor as last resort
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      return this.formatDate(parsed);
    }

    return cleaned;
  }

  private errorResult(message: string, messageAr: string): VerificationResult {
    return {
      success: false,
      level: VerificationLevel.Anonymous,
      patientId: null,
      patientName: null,
      message,
      messageAr,
      shouldTransferToHuman: false,
      session: {
        sessionId: '',
        patientId: null,
        conversationId: null,
        callerPhone: '',
        level: VerificationLevel.Anonymous,
        attempts: 0,
        verifiedAt: null,
        expiresAt: new Date(),
        actingOnBehalfOf: null,
        relationship: null,
      },
    };
  }

  private transferToHumanResult(session: VerificationSession): VerificationResult {
    return {
      success: false,
      level: session.level,
      patientId: session.patientId,
      patientName: null,
      message: 'Maximum verification attempts reached. Transferring to a human agent.',
      messageAr: 'تم تجاوز الحد الأقصى للمحاولات. سيتم تحويلك لموظف.',
      shouldTransferToHuman: true,
      session,
    };
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt.getTime() < now) {
        this.sessions.delete(id);
      }
    }
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────────

let instance: IdentityVerifier | null = null;

export function getIdentityVerifier(prisma: PrismaClient): IdentityVerifier {
  if (!instance) {
    instance = new IdentityVerifier(prisma);
  }
  return instance;
}
