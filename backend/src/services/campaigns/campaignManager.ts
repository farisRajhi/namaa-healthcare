/**
 * Campaign Management Service
 *
 * Full lifecycle campaign management: create → configure → launch → monitor → complete.
 * Supports multi-wave outreach (voice → SMS → WhatsApp), audience targeting via
 * patient filters, batch execution, A/B testing with multiple scripts, and
 * detailed results tracking.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { OutboundCaller, getOutboundCaller } from '../outbound/outboundCaller.js';
import type { Twilio } from 'twilio';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CampaignCreateInput {
  orgId: string;
  name: string;
  nameAr?: string;
  type: 'recall' | 'preventive' | 'follow_up' | 'satisfaction' | 'announcement';
  targetFilter: PatientFilter;
  channelSequence: string[];
  scriptEn?: string;
  scriptAr?: string;
  /** For A/B testing — variant scripts */
  scriptVariants?: ScriptVariant[];
  maxCallsPerHour?: number;
  startDate?: Date;
  endDate?: Date;
}

export interface ScriptVariant {
  name: string;
  scriptEn?: string;
  scriptAr?: string;
  weight: number; // 0-100, sum of all variants should be 100
}

export interface PatientFilter {
  /** Age range */
  minAge?: number;
  maxAge?: number;
  /** Sex filter */
  sex?: string;
  /** Patient has specific condition (memory type = 'condition') */
  conditions?: string[];
  /** Days since last visit */
  lastVisitDaysAgo?: number;
  /** Days since last appointment (any status) */
  noAppointmentDays?: number;
  /** Specific service IDs patient has had */
  previousServiceIds?: string[];
  /** Exclude patients with upcoming appointments */
  excludeWithUpcoming?: boolean;
  /** Specific patient IDs (manual override) */
  patientIds?: string[];
}

export interface CampaignResults {
  campaignId: string;
  name: string;
  status: string;
  type: string;
  totalTargets: number;
  byStatus: Record<string, number>;
  conversionRate: number;
  channelBreakdown: Record<string, number>;
  waveProgress: WaveProgress[];
}

export interface WaveProgress {
  channel: string;
  total: number;
  completed: number;
  pending: number;
}

// ---------------------------------------------------------------------------
// Campaign Manager
// ---------------------------------------------------------------------------

export class CampaignManager {
  private prisma: PrismaClient;
  private twilio: Twilio | null;
  private outboundCaller: OutboundCaller;

  constructor(prisma: PrismaClient, twilio: Twilio | null) {
    this.prisma = prisma;
    this.twilio = twilio;
    this.outboundCaller = getOutboundCaller(prisma, twilio);
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  /**
   * Create a new campaign in draft status.
   */
  async createCampaign(input: CampaignCreateInput) {
    const campaign = await this.prisma.campaign.create({
      data: {
        orgId: input.orgId,
        name: input.name,
        nameAr: input.nameAr,
        type: input.type,
        status: 'draft',
        targetFilter: input.targetFilter as any,
        channelSequence: input.channelSequence,
        scriptEn: input.scriptEn,
        scriptAr: input.scriptAr,
        maxCallsPerHour: input.maxCallsPerHour ?? 50,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    });

    return campaign;
  }

  /**
   * Get campaign by ID.
   */
  async getCampaign(campaignId: string) {
    return this.prisma.campaign.findUnique({
      where: { campaignId },
      include: {
        targets: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { targets: true } },
      },
    });
  }

  /**
   * List campaigns for an org.
   */
  async listCampaigns(
    orgId: string,
    options?: { status?: string; page?: number; limit?: number },
  ) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CampaignWhereInput = {
      orgId,
      ...(options?.status && { status: options.status }),
    };

    const [campaigns, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { targets: true } },
        },
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return {
      data: campaigns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update a draft campaign.
   */
  async updateCampaign(
    campaignId: string,
    data: Partial<Omit<CampaignCreateInput, 'orgId'>>,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
    });
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'draft') {
      throw new Error('Can only update campaigns in draft status');
    }

    return this.prisma.campaign.update({
      where: { campaignId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.nameAr !== undefined && { nameAr: data.nameAr }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.targetFilter !== undefined && {
          targetFilter: data.targetFilter as any,
        }),
        ...(data.channelSequence !== undefined && {
          channelSequence: data.channelSequence,
        }),
        ...(data.scriptEn !== undefined && { scriptEn: data.scriptEn }),
        ...(data.scriptAr !== undefined && { scriptAr: data.scriptAr }),
        ...(data.maxCallsPerHour !== undefined && {
          maxCallsPerHour: data.maxCallsPerHour,
        }),
        ...(data.startDate !== undefined && { startDate: data.startDate }),
        ...(data.endDate !== undefined && { endDate: data.endDate }),
      },
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle: start / pause / complete
  // -----------------------------------------------------------------------

  /**
   * Start (activate) a campaign.
   * 1. Resolve target audience based on filter
   * 2. Create CampaignTarget records
   * 3. Set status = 'active'
   */
  async startCampaign(campaignId: string): Promise<{
    campaign: any;
    targetsCreated: number;
  }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
    });
    if (!campaign) throw new Error('Campaign not found');
    if (!['draft', 'paused'].includes(campaign.status)) {
      throw new Error(`Cannot start campaign in ${campaign.status} status`);
    }

    // If draft → resolve targets. If paused → resume with existing targets.
    let targetsCreated = 0;
    if (campaign.status === 'draft') {
      targetsCreated = await this.resolveTargets(campaignId, campaign.orgId, campaign.targetFilter as PatientFilter);
    }

    // Activate
    const updated = await this.prisma.campaign.update({
      where: { campaignId },
      data: {
        status: 'active',
        startDate: campaign.startDate || new Date(),
      },
    });

    return { campaign: updated, targetsCreated };
  }

  /**
   * Pause an active campaign. Removes queued calls.
   */
  async pauseCampaign(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
    });
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'active') {
      throw new Error('Can only pause active campaigns');
    }

    // Clear outbound call queue for this campaign
    this.outboundCaller.clearCampaignQueue(campaignId);

    return this.prisma.campaign.update({
      where: { campaignId },
      data: { status: 'paused' },
    });
  }

  /**
   * Mark a campaign as completed.
   */
  async completeCampaign(campaignId: string) {
    this.outboundCaller.clearCampaignQueue(campaignId);

    return this.prisma.campaign.update({
      where: { campaignId },
      data: {
        status: 'completed',
        endDate: new Date(),
      },
    });
  }

  // -----------------------------------------------------------------------
  // Execution engine
  // -----------------------------------------------------------------------

  /**
   * Process an active campaign — enqueue pending targets to the outbound caller
   * and start processing. Call this from a cron job or manually.
   */
  async executeCampaign(campaignId: string): Promise<{
    enqueued: number;
    processed: number;
  }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
    });
    if (!campaign || campaign.status !== 'active') {
      return { enqueued: 0, processed: 0 };
    }

    // Check if campaign has ended
    if (campaign.endDate && new Date() > campaign.endDate) {
      await this.completeCampaign(campaignId);
      return { enqueued: 0, processed: 0 };
    }

    // Enqueue targets
    const enqueued = await this.outboundCaller.enqueueCampaignTargets(campaignId);

    // Process queue
    const outcomes = await this.outboundCaller.processQueue();

    // Check if all targets are done
    const pendingCount = await this.prisma.campaignTarget.count({
      where: {
        campaignId,
        status: { in: ['pending', 'calling', 'no_answer'] },
      },
    });
    if (pendingCount === 0) {
      await this.completeCampaign(campaignId);
    }

    return { enqueued, processed: outcomes.length };
  }

  /**
   * Execute all active campaigns. Main cron entry point.
   */
  async executeAllActiveCampaigns(): Promise<
    Array<{ campaignId: string; enqueued: number; processed: number }>
  > {
    const activeCampaigns = await this.prisma.campaign.findMany({
      where: { status: 'active' },
    });

    const results = [];
    for (const campaign of activeCampaigns) {
      const result = await this.executeCampaign(campaign.campaignId);
      results.push({ campaignId: campaign.campaignId, ...result });
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Results & Analytics
  // -----------------------------------------------------------------------

  /**
   * Get campaign results/analytics.
   */
  async getCampaignResults(campaignId: string): Promise<CampaignResults> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
    });
    if (!campaign) throw new Error('Campaign not found');

    // Count targets by status
    const statusCounts = await this.prisma.campaignTarget.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { status: true },
    });

    const byStatus: Record<string, number> = {};
    let totalTargets = 0;
    for (const sc of statusCounts) {
      byStatus[sc.status] = sc._count.status;
      totalTargets += sc._count.status;
    }

    // Channel breakdown (last channel used)
    const channelCounts = await this.prisma.campaignTarget.groupBy({
      by: ['lastChannel'],
      where: { campaignId, lastChannel: { not: null } },
      _count: { lastChannel: true },
    });

    const channelBreakdown: Record<string, number> = {};
    for (const cc of channelCounts) {
      if (cc.lastChannel) {
        channelBreakdown[cc.lastChannel] = cc._count.lastChannel;
      }
    }

    // Conversion rate = booked / total
    const booked = byStatus['booked'] || 0;
    const conversionRate = totalTargets > 0 ? booked / totalTargets : 0;

    // Wave progress — for each channel in sequence, how many targets used it
    const channelSeq = campaign.channelSequence as string[];
    const waveProgress: WaveProgress[] = channelSeq.map((channel) => ({
      channel,
      total: totalTargets,
      completed: channelBreakdown[channel] || 0,
      pending: totalTargets - (channelBreakdown[channel] || 0),
    }));

    return {
      campaignId,
      name: campaign.name,
      status: campaign.status,
      type: campaign.type,
      totalTargets,
      byStatus,
      conversionRate,
      channelBreakdown,
      waveProgress,
    };
  }

  /**
   * List targets for a campaign with pagination and optional status filter.
   */
  async listTargets(
    campaignId: string,
    options?: { status?: string; page?: number; limit?: number },
  ) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.CampaignTargetWhereInput = {
      campaignId,
      ...(options?.status && { status: options.status }),
    };

    const [targets, total] = await Promise.all([
      this.prisma.campaignTarget.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.campaignTarget.count({ where }),
    ]);

    // Enrich with patient info
    const enriched = await Promise.all(
      targets.map(async (target) => {
        const patient = await this.prisma.patient.findUnique({
          where: { patientId: target.patientId },
          select: {
            patientId: true,
            firstName: true,
            lastName: true,
            mrn: true,
          },
        });
        return { ...target, patient };
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

  // -----------------------------------------------------------------------
  // A/B Testing
  // -----------------------------------------------------------------------

  /**
   * Select a script variant for a target based on weights.
   * Used during call/message to personalize the script.
   */
  selectScriptVariant(variants: ScriptVariant[]): ScriptVariant | null {
    if (!variants || variants.length === 0) return null;

    // Weighted random selection
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;

    for (const variant of variants) {
      random -= variant.weight;
      if (random <= 0) return variant;
    }

    return variants[0];
  }

  // -----------------------------------------------------------------------
  // Target resolution
  // -----------------------------------------------------------------------

  /**
   * Resolve patients matching the target filter and create CampaignTarget records.
   */
  private async resolveTargets(
    campaignId: string,
    orgId: string,
    filter: PatientFilter,
  ): Promise<number> {
    // Build the patient query
    const patients = await this.queryPatientsByFilter(orgId, filter);

    // Batch create targets
    let created = 0;
    const batchSize = 100;
    for (let i = 0; i < patients.length; i += batchSize) {
      const batch = patients.slice(i, i + batchSize);

      await this.prisma.campaignTarget.createMany({
        data: batch.map((p) => ({
          campaignId,
          patientId: p.patientId,
          status: 'pending',
          attempts: 0,
        })),
        skipDuplicates: true,
      });

      created += batch.length;
    }

    return created;
  }

  /**
   * Query patients matching the given filter criteria.
   */
  async queryPatientsByFilter(
    orgId: string,
    filter: PatientFilter,
  ): Promise<Array<{ patientId: string }>> {
    // If explicit patient IDs given, use them directly
    if (filter.patientIds && filter.patientIds.length > 0) {
      return filter.patientIds.map((id) => ({ patientId: id }));
    }

    const where: Prisma.PatientWhereInput = { orgId };

    // Sex filter
    if (filter.sex) {
      where.sex = filter.sex;
    }

    // Age filter (based on dateOfBirth)
    if (filter.minAge !== undefined || filter.maxAge !== undefined) {
      const now = new Date();
      if (filter.maxAge !== undefined) {
        const minDob = new Date(
          now.getFullYear() - filter.maxAge - 1,
          now.getMonth(),
          now.getDate(),
        );
        where.dateOfBirth = { ...(where.dateOfBirth as any), gte: minDob };
      }
      if (filter.minAge !== undefined) {
        const maxDob = new Date(
          now.getFullYear() - filter.minAge,
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

    // Filter by conditions (PatientMemory)
    if (filter.conditions && filter.conditions.length > 0) {
      const patientsWithConditions = await this.prisma.patientMemory.findMany({
        where: {
          patientId: { in: patients.map((p) => p.patientId) },
          memoryType: 'condition',
          memoryKey: { in: filter.conditions },
          isActive: true,
        },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      const conditionPatientIds = new Set(
        patientsWithConditions.map((p) => p.patientId),
      );
      patients = patients.filter((p) => conditionPatientIds.has(p.patientId));
    }

    // Filter by last visit (no completed appointment in N days)
    if (filter.lastVisitDaysAgo !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filter.lastVisitDaysAgo);

      const patientsWithRecentVisit = await this.prisma.appointment.findMany({
        where: {
          patientId: { in: patients.map((p) => p.patientId) },
          status: 'completed',
          startTs: { gte: cutoff },
        },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      const recentVisitIds = new Set(
        patientsWithRecentVisit.map((p) => p.patientId!),
      );
      // Keep patients who have NOT visited recently
      patients = patients.filter((p) => !recentVisitIds.has(p.patientId));
    }

    // Filter by no appointment in N days
    if (filter.noAppointmentDays !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filter.noAppointmentDays);

      const patientsWithAppt = await this.prisma.appointment.findMany({
        where: {
          patientId: { in: patients.map((p) => p.patientId) },
          startTs: { gte: cutoff },
        },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      const apptIds = new Set(patientsWithAppt.map((p) => p.patientId!));
      patients = patients.filter((p) => !apptIds.has(p.patientId));
    }

    // Exclude patients with upcoming appointments
    if (filter.excludeWithUpcoming) {
      const patientsWithUpcoming = await this.prisma.appointment.findMany({
        where: {
          patientId: { in: patients.map((p) => p.patientId) },
          startTs: { gt: new Date() },
          status: { in: ['booked', 'confirmed'] },
        },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      const upcomingIds = new Set(
        patientsWithUpcoming.map((p) => p.patientId!),
      );
      patients = patients.filter((p) => !upcomingIds.has(p.patientId));
    }

    // Filter by previous services
    if (filter.previousServiceIds && filter.previousServiceIds.length > 0) {
      const patientsWithServices = await this.prisma.appointment.findMany({
        where: {
          patientId: { in: patients.map((p) => p.patientId) },
          serviceId: { in: filter.previousServiceIds },
          status: 'completed',
        },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      const servicePatientIds = new Set(
        patientsWithServices.map((p) => p.patientId!),
      );
      patients = patients.filter((p) => servicePatientIds.has(p.patientId));
    }

    return patients;
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: CampaignManager | null = null;

export function getCampaignManager(
  prisma: PrismaClient,
  twilio: Twilio | null,
): CampaignManager {
  if (!_instance) {
    _instance = new CampaignManager(prisma, twilio);
  }
  return _instance;
}

export function resetCampaignManager(): void {
  _instance = null;
}
