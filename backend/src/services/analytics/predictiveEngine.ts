/**
 * Predictive Analytics Engine (CENTARI-like)
 *
 * Detects care gaps, scores patient risk, generates prioritized
 * outreach queues, and auto-creates PatientCareGap records.
 *
 * Configurable rules per org — orgs can define their own care gap
 * criteria (e.g. "annual physical overdue", "mammogram screening due").
 */
import { PrismaClient, Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CareGapRuleInput {
  orgId: string;
  name: string;
  nameAr?: string;
  condition: CareGapCondition;
  priority: 'low' | 'medium' | 'high' | 'critical';
  action: 'outbound_call' | 'sms' | 'whatsapp' | 'flag_only';
  messageEn?: string;
  messageAr?: string;
}

/**
 * Condition definition for a care gap rule.
 * Each field is optional — combined with AND logic.
 */
export interface CareGapCondition {
  /** Patient hasn't visited in N days */
  lastVisitDaysAgo?: number;
  /** Patient's age range */
  minAge?: number;
  maxAge?: number;
  /** Patient sex (for gender-specific screenings) */
  sex?: string;
  /** Patient has had specific services (by name or ID) */
  previousServices?: string[];
  /** Service not received in N days */
  serviceNotReceivedDays?: number;
  /** Missed appointment count threshold */
  missedAppointmentsMin?: number;
  /** No appointment of any kind in N days */
  noAppointmentDays?: number;
}

export interface RiskScoreResult {
  patientId: string;
  score: number; // 0-100
  factors: RiskFactor[];
}

export interface RiskFactor {
  factor: string;
  weight: number;
  value: number | string;
  contribution: number; // Points contributed to total score
}

export interface CareGapScanResult {
  orgId: string;
  rulesEvaluated: number;
  gapsDetected: number;
  gapsByRule: Array<{ ruleId: string; ruleName: string; count: number }>;
  patientsAffected: number;
}

// ---------------------------------------------------------------------------
// Predictive Engine
// ---------------------------------------------------------------------------

export class PredictiveEngine {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // -----------------------------------------------------------------------
  // Care Gap Rules CRUD
  // -----------------------------------------------------------------------

  async createRule(input: CareGapRuleInput) {
    return this.prisma.careGapRule.create({
      data: {
        orgId: input.orgId,
        name: input.name,
        nameAr: input.nameAr,
        condition: input.condition as any,
        priority: input.priority,
        action: input.action,
        messageEn: input.messageEn,
        messageAr: input.messageAr,
        isActive: true,
      },
    });
  }

  async listRules(orgId: string) {
    return this.prisma.careGapRule.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRule(ruleId: string) {
    return this.prisma.careGapRule.findUnique({
      where: { careGapRuleId: ruleId },
    });
  }

  async updateRule(ruleId: string, data: Partial<CareGapRuleInput>) {
    return this.prisma.careGapRule.update({
      where: { careGapRuleId: ruleId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.nameAr !== undefined && { nameAr: data.nameAr }),
        ...(data.condition !== undefined && { condition: data.condition as any }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.action !== undefined && { action: data.action }),
        ...(data.messageEn !== undefined && { messageEn: data.messageEn }),
        ...(data.messageAr !== undefined && { messageAr: data.messageAr }),
      },
    });
  }

  async toggleRule(ruleId: string, isActive: boolean) {
    return this.prisma.careGapRule.update({
      where: { careGapRuleId: ruleId },
      data: { isActive },
    });
  }

  // -----------------------------------------------------------------------
  // Risk Scoring
  // -----------------------------------------------------------------------

  /**
   * Calculate a risk score (0-100) for a single patient.
   * Factors:
   *   - Missed appointments (no-show history)       → up to 25 pts
   *   - Time since last visit                        → up to 25 pts
   *   - Known chronic conditions                     → up to 20 pts
   *   - Age-based risk                               → up to 15 pts
   *   - Medication non-adherence                     → up to 15 pts
   */
  async calculateRiskScore(patientId: string): Promise<RiskScoreResult> {
    const factors: RiskFactor[] = [];
    let totalScore = 0;

    const patient = await this.prisma.patient.findUnique({
      where: { patientId },
    });
    if (!patient) {
      return { patientId, score: 0, factors: [] };
    }

    // --- Factor 1: Missed appointments (no-shows) ---
    const [noShowCount, totalAppointments] = await Promise.all([
      this.prisma.appointment.count({
        where: { patientId, status: 'no_show' },
      }),
      this.prisma.appointment.count({
        where: {
          patientId,
          status: { in: ['completed', 'no_show', 'cancelled'] },
        },
      }),
    ]);

    const noShowRate = totalAppointments > 0 ? noShowCount / totalAppointments : 0;
    const noShowPoints = Math.min(25, Math.round(noShowRate * 100 * 0.25));
    factors.push({
      factor: 'missed_appointments',
      weight: 25,
      value: noShowCount,
      contribution: noShowPoints,
    });
    totalScore += noShowPoints;

    // --- Factor 2: Time since last visit ---
    const lastVisit = await this.prisma.appointment.findFirst({
      where: { patientId, status: 'completed' },
      orderBy: { startTs: 'desc' },
      select: { startTs: true },
    });

    let daysSinceVisit = 999;
    if (lastVisit) {
      daysSinceVisit = Math.floor(
        (Date.now() - lastVisit.startTs.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    // Score: 0 days = 0 pts, 365+ days = 25 pts
    const visitPoints = Math.min(25, Math.round((daysSinceVisit / 365) * 25));
    factors.push({
      factor: 'time_since_last_visit',
      weight: 25,
      value: daysSinceVisit,
      contribution: visitPoints,
    });
    totalScore += visitPoints;

    // --- Factor 4: Age-based risk ---
    let agePoints = 0;
    if (patient.dateOfBirth) {
      const age = Math.floor(
        (Date.now() - patient.dateOfBirth.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
      );
      // Higher age = higher risk, capped at 15
      if (age >= 65) agePoints = 15;
      else if (age >= 50) agePoints = 10;
      else if (age >= 40) agePoints = 5;
      else agePoints = 2;

      factors.push({
        factor: 'age_risk',
        weight: 15,
        value: age,
        contribution: agePoints,
      });
    }
    totalScore += agePoints;

    return {
      patientId,
      score: Math.min(100, totalScore),
      factors,
    };
  }

  // -----------------------------------------------------------------------
  // Care Gap Scanning
  // -----------------------------------------------------------------------

  /**
   * Scan all patients in an org against active care gap rules.
   * Creates PatientCareGap records for detected gaps.
   */
  async scanForCareGaps(orgId: string): Promise<CareGapScanResult> {
    const rules = await this.prisma.careGapRule.findMany({
      where: { orgId, isActive: true },
    });

    const result: CareGapScanResult = {
      orgId,
      rulesEvaluated: rules.length,
      gapsDetected: 0,
      gapsByRule: [],
      patientsAffected: 0,
    };

    if (rules.length === 0) return result;

    const affectedPatients = new Set<string>();

    for (const rule of rules) {
      const condition = rule.condition as CareGapCondition;
      const matchingPatients = await this.evaluateRule(orgId, condition);

      let ruleGapCount = 0;

      for (const patient of matchingPatients) {
        // Check if an open gap already exists for this patient + rule
        const existingGap = await this.prisma.patientCareGap.findFirst({
          where: {
            patientId: patient.patientId,
            ruleId: rule.careGapRuleId,
            status: { in: ['open', 'contacted'] },
          },
        });

        if (existingGap) continue; // Don't duplicate

        // Calculate risk score
        const riskResult = await this.calculateRiskScore(patient.patientId);

        // Create care gap record
        await this.prisma.patientCareGap.create({
          data: {
            patientId: patient.patientId,
            ruleId: rule.careGapRuleId,
            riskScore: riskResult.score,
            status: 'open',
          },
        });

        ruleGapCount++;
        affectedPatients.add(patient.patientId);
      }

      result.gapsByRule.push({
        ruleId: rule.careGapRuleId,
        ruleName: rule.name,
        count: ruleGapCount,
      });
      result.gapsDetected += ruleGapCount;
    }

    result.patientsAffected = affectedPatients.size;
    return result;
  }

  // -----------------------------------------------------------------------
  // Care Gap Management
  // -----------------------------------------------------------------------

  /**
   * List detected care gaps for an org with pagination.
   */
  async listCareGaps(
    orgId: string,
    options?: {
      status?: string;
      priority?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 50;
    const skip = (page - 1) * limit;

    // We need to join through rules to filter by org
    const rules = await this.prisma.careGapRule.findMany({
      where: {
        orgId,
        ...(options?.priority && { priority: options.priority }),
      },
      select: { careGapRuleId: true },
    });
    const ruleIds = rules.map((r) => r.careGapRuleId);

    const where: Prisma.PatientCareGapWhereInput = {
      ruleId: { in: ruleIds },
      ...(options?.status && { status: options.status }),
    };

    const [gaps, total] = await Promise.all([
      this.prisma.patientCareGap.findMany({
        where,
        skip,
        take: limit,
        orderBy: { riskScore: 'desc' },
      }),
      this.prisma.patientCareGap.count({ where }),
    ]);

    // Enrich with patient + rule info
    const enriched = await Promise.all(
      gaps.map(async (gap) => {
        const [patient, rule] = await Promise.all([
          this.prisma.patient.findUnique({
            where: { patientId: gap.patientId },
            select: {
              patientId: true,
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              mrn: true,
            },
          }),
          this.prisma.careGapRule.findUnique({
            where: { careGapRuleId: gap.ruleId },
            select: {
              careGapRuleId: true,
              name: true,
              nameAr: true,
              priority: true,
              action: true,
            },
          }),
        ]);
        return { ...gap, patient, rule };
      }),
    );

    return {
      data: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update a care gap's status (resolve, dismiss, etc.).
   */
  async updateCareGapStatus(
    careGapId: string,
    status: 'open' | 'contacted' | 'scheduled' | 'resolved' | 'dismissed',
  ) {
    return this.prisma.patientCareGap.update({
      where: { careGapId },
      data: {
        status,
        ...(status === 'resolved' || status === 'dismissed'
          ? { resolvedAt: new Date() }
          : {}),
      },
    });
  }

  /**
   * Get a priority-sorted outreach queue for an org.
   * Returns open care gaps sorted by risk score descending.
   */
  async getOutreachQueue(
    orgId: string,
    limit: number = 50,
  ): Promise<
    Array<{
      careGapId: string;
      patientId: string;
      patientName: string;
      riskScore: number;
      ruleName: string;
      priority: string;
      action: string;
    }>
  > {
    const rules = await this.prisma.careGapRule.findMany({
      where: { orgId, isActive: true },
      select: { careGapRuleId: true, name: true, priority: true, action: true },
    });
    const ruleMap = new Map(rules.map((r) => [r.careGapRuleId, r]));
    const ruleIds = rules.map((r) => r.careGapRuleId);

    const gaps = await this.prisma.patientCareGap.findMany({
      where: {
        ruleId: { in: ruleIds },
        status: 'open',
      },
      orderBy: { riskScore: 'desc' },
      take: limit,
    });

    const queue = await Promise.all(
      gaps.map(async (gap) => {
        const patient = await this.prisma.patient.findUnique({
          where: { patientId: gap.patientId },
          select: { firstName: true, lastName: true },
        });
        const rule = ruleMap.get(gap.ruleId);
        return {
          careGapId: gap.careGapId,
          patientId: gap.patientId,
          patientName: patient
            ? `${patient.firstName} ${patient.lastName}`
            : 'Unknown',
          riskScore: gap.riskScore,
          ruleName: rule?.name || 'Unknown',
          priority: rule?.priority || 'medium',
          action: rule?.action || 'flag_only',
        };
      }),
    );

    // Secondary sort: priority weight
    const priorityWeight: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    queue.sort(
      (a, b) =>
        (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0) ||
        b.riskScore - a.riskScore,
    );

    return queue;
  }

  // -----------------------------------------------------------------------
  // Rule evaluation internals
  // -----------------------------------------------------------------------

  /**
   * Evaluate a single care gap condition against all patients in an org.
   * Returns matching patient IDs.
   */
  private async evaluateRule(
    orgId: string,
    condition: CareGapCondition,
  ): Promise<Array<{ patientId: string }>> {
    const where: Prisma.PatientWhereInput = { orgId };

    // Sex filter
    if (condition.sex) {
      where.sex = condition.sex;
    }

    // Age filter
    if (condition.minAge !== undefined || condition.maxAge !== undefined) {
      const now = new Date();
      if (condition.maxAge !== undefined) {
        const minDob = new Date(
          now.getFullYear() - condition.maxAge - 1,
          now.getMonth(),
          now.getDate(),
        );
        where.dateOfBirth = { ...(where.dateOfBirth as any), gte: minDob };
      }
      if (condition.minAge !== undefined) {
        const maxDob = new Date(
          now.getFullYear() - condition.minAge,
          now.getMonth(),
          now.getDate(),
        );
        where.dateOfBirth = { ...(where.dateOfBirth as any), lte: maxDob };
      }
    }

    let patients = await this.prisma.patient.findMany({
      where,
      select: { patientId: true },
    });

    if (patients.length === 0) return [];

    // Condition: last visit > N days ago
    if (condition.lastVisitDaysAgo !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - condition.lastVisitDaysAgo);

      const recentVisitors = await this.prisma.appointment.findMany({
        where: {
          patientId: { in: patients.map((p) => p.patientId) },
          status: 'completed',
          startTs: { gte: cutoff },
        },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      const recentIds = new Set(recentVisitors.map((p) => p.patientId!));
      patients = patients.filter((p) => !recentIds.has(p.patientId));
    }

    // Condition: no appointment in N days
    if (condition.noAppointmentDays !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - condition.noAppointmentDays);

      const withAppt = await this.prisma.appointment.findMany({
        where: {
          patientId: { in: patients.map((p) => p.patientId) },
          startTs: { gte: cutoff },
        },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      const apptIds = new Set(withAppt.map((p) => p.patientId!));
      patients = patients.filter((p) => !apptIds.has(p.patientId));
    }

    // Condition: missed appointments >= N
    if (condition.missedAppointmentsMin !== undefined) {
      const patientIds = patients.map((p) => p.patientId);
      const noShowCounts = await this.prisma.appointment.groupBy({
        by: ['patientId'],
        where: {
          patientId: { in: patientIds },
          status: 'no_show',
        },
        _count: { patientId: true },
      });

      const qualifyingIds = new Set(
        noShowCounts
          .filter((c) => c._count.patientId >= condition.missedAppointmentsMin!)
          .map((c) => c.patientId!),
      );
      patients = patients.filter((p) => qualifyingIds.has(p.patientId));
    }

    // Condition: specific service not received in N days
    if (
      condition.previousServices &&
      condition.previousServices.length > 0 &&
      condition.serviceNotReceivedDays !== undefined
    ) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - condition.serviceNotReceivedDays);

      // Resolve service IDs from names
      const matchingServices = await this.prisma.service.findMany({
        where: {
          orgId,
          name: { in: condition.previousServices },
        },
        select: { serviceId: true },
      });
      const serviceIds = matchingServices.map((s) => s.serviceId);

      // Find patients who HAVE received the service recently
      const recentServicePatients = await this.prisma.appointment.findMany({
        where: {
          patientId: { in: patients.map((p) => p.patientId) },
          status: 'completed',
          startTs: { gte: cutoff },
          serviceId: { in: serviceIds },
        },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      const recentServiceIds = new Set(
        recentServicePatients.map((p) => p.patientId!),
      );
      // Keep patients who have NOT received the service recently
      patients = patients.filter((p) => !recentServiceIds.has(p.patientId));
    }

    return patients;
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: PredictiveEngine | null = null;

export function getPredictiveEngine(prisma: PrismaClient): PredictiveEngine {
  if (!_instance) {
    _instance = new PredictiveEngine(prisma);
  }
  return _instance;
}

export function resetPredictiveEngine(): void {
  _instance = null;
}
