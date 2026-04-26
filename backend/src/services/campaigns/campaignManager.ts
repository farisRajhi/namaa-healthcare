/**
 * Campaign Management Service
 *
 * Lifecycle: create → configure → launch (resolve targets) → monitor → complete.
 * Supports patient audience targeting via filters, A/B testing variants, and
 * results tracking. Outbound delivery is handled separately via Baileys WhatsApp
 * (`/api/baileys-whatsapp/send`); the campaign data model tracks targets,
 * channels, and outcomes but no longer dials/sends from this service.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { MarketingConsentService } from '../compliance/marketingConsent.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CampaignCreateInput {
  orgId: string;
  name: string;
  nameAr?: string;
  type: 'recall' | 'preventive' | 'follow_up' | 'satisfaction' | 'announcement' | 'promotional' | 'reminder';
  targetFilter: PatientFilter;
  channelSequence: string[];
  scriptEn?: string;
  scriptAr?: string;
  scriptVariants?: ScriptVariant[];
  maxCallsPerHour?: number;
  startDate?: Date;
  endDate?: Date;
  /** Only execute this campaign on salary days (25th-27th of month) */
  salaryDayOnly?: boolean;
  adImageId?: string;
}

export interface ScriptVariant {
  name: string;
  scriptEn?: string;
  scriptAr?: string;
  weight: number;
}

export interface PatientFilter {
  minAge?: number;
  maxAge?: number;
  sex?: string;
  lastVisitDaysAgo?: number;
  noAppointmentDays?: number;
  previousServiceIds?: string[];
  excludeWithUpcoming?: boolean;
  patientIds?: string[];
  tags?: string[];
  serviceInterests?: string[];
  minEngagementScore?: number;
  maxEngagementScore?: number;
  minReturnLikelihood?: number;
  maxReturnLikelihood?: number;
  channelPreference?: string;
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
  constructor(private prisma: PrismaClient) {}

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

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
        salaryDayOnly: input.salaryDayOnly ?? false,
        adImageId: input.adImageId,
      },
    });

    return campaign;
  }

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
        ...(data.adImageId !== undefined && { adImageId: data.adImageId }),
      },
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle: start / pause / complete
  // -----------------------------------------------------------------------

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

    let targetsCreated = 0;
    if (campaign.status === 'draft') {
      targetsCreated = await this.resolveTargets(campaignId, campaign.orgId, campaign.targetFilter as PatientFilter);
    }

    const updated = await this.prisma.campaign.update({
      where: { campaignId },
      data: {
        status: 'active',
        startDate: campaign.startDate || new Date(),
      },
    });

    return { campaign: updated, targetsCreated };
  }

  async pauseCampaign(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
    });
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'active') {
      throw new Error('Can only pause active campaigns');
    }

    return this.prisma.campaign.update({
      where: { campaignId },
      data: { status: 'paused' },
    });
  }

  async completeCampaign(campaignId: string) {
    return this.prisma.campaign.update({
      where: { campaignId },
      data: {
        status: 'completed',
        endDate: new Date(),
      },
    });
  }

  // -----------------------------------------------------------------------
  // Results & Analytics
  // -----------------------------------------------------------------------

  async getCampaignResults(campaignId: string): Promise<CampaignResults> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
    });
    if (!campaign) throw new Error('Campaign not found');

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

    const booked = byStatus['booked'] || 0;
    const conversionRate = totalTargets > 0 ? booked / totalTargets : 0;

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

  selectScriptVariant(variants: ScriptVariant[]): ScriptVariant | null {
    if (!variants || variants.length === 0) return null;

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
   * Public entry point used by callers that have already atomically claimed
   * the campaign (e.g. the salary-day cron flipping draft → active via
   * updateMany) and now need to perform audience enrollment without going
   * through startCampaign's status-flip path. Idempotent at the DB level
   * because resolveTargets uses skipDuplicates: true on createMany.
   */
  async enrollCampaignTargets(campaignId: string): Promise<number> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
    });
    if (!campaign) throw new Error('Campaign not found');
    return this.resolveTargets(campaignId, campaign.orgId, campaign.targetFilter as PatientFilter);
  }

  private async resolveTargets(
    campaignId: string,
    orgId: string,
    filter: PatientFilter,
  ): Promise<number> {
    let patients = await this.queryPatientsByFilter(orgId, filter);

    const campaign = await this.prisma.campaign.findUnique({ where: { campaignId } });
    if (campaign && campaign.type === 'promotional') {
      patients = await this.filterByMarketingConsent(patients, orgId, 'whatsapp');
    }

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

  async queryPatientsByFilter(
    orgId: string,
    filter: PatientFilter,
  ): Promise<Array<{ patientId: string }>> {
    if (filter.patientIds && filter.patientIds.length > 0) {
      return filter.patientIds.map((id) => ({ patientId: id }));
    }

    const where: Prisma.PatientWhereInput = { orgId };

    if (filter.sex) {
      where.sex = filter.sex;
    }

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
      patients = patients.filter((p) => !recentVisitIds.has(p.patientId));
    }

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

    if (filter.tags && filter.tags.length > 0) {
      const patientsWithTags = await this.prisma.patientTag.findMany({
        where: {
          patientId: { in: patients.map((p) => p.patientId) },
          tag: { in: filter.tags },
        },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      const tagPatientIds = new Set(patientsWithTags.map((p) => p.patientId));
      patients = patients.filter((p) => tagPatientIds.has(p.patientId));
    }

    if (filter.serviceInterests && filter.serviceInterests.length > 0) {
      const patientsWithInterests = await this.prisma.patientMemory.findMany({
        where: {
          patientId: { in: patients.map((p) => p.patientId) },
          memoryType: 'service_interest',
          memoryKey: { in: filter.serviceInterests },
          isActive: true,
        },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      const interestPatientIds = new Set(patientsWithInterests.map((p) => p.patientId));
      patients = patients.filter((p) => interestPatientIds.has(p.patientId));
    }

    if (filter.minEngagementScore !== undefined || filter.maxEngagementScore !== undefined) {
      const scoreWhere: any = {
        patientId: { in: patients.map((p) => p.patientId) },
      };
      if (filter.minEngagementScore !== undefined) {
        scoreWhere.engagementScore = { ...scoreWhere.engagementScore, gte: filter.minEngagementScore };
      }
      if (filter.maxEngagementScore !== undefined) {
        scoreWhere.engagementScore = { ...scoreWhere.engagementScore, lte: filter.maxEngagementScore };
      }
      const patientsWithScore = await this.prisma.patientInsight.findMany({
        where: scoreWhere,
        select: { patientId: true },
      });
      const scorePatientIds = new Set(patientsWithScore.map((p) => p.patientId));
      patients = patients.filter((p) => scorePatientIds.has(p.patientId));
    }

    if (filter.minReturnLikelihood !== undefined || filter.maxReturnLikelihood !== undefined) {
      const rlWhere: any = {
        patientId: { in: patients.map((p) => p.patientId) },
      };
      if (filter.minReturnLikelihood !== undefined) {
        rlWhere.returnLikelihood = { ...rlWhere.returnLikelihood, gte: filter.minReturnLikelihood };
      }
      if (filter.maxReturnLikelihood !== undefined) {
        rlWhere.returnLikelihood = { ...rlWhere.returnLikelihood, lte: filter.maxReturnLikelihood };
      }
      const patientsWithRL = await this.prisma.patientInsight.findMany({
        where: rlWhere,
        select: { patientId: true },
      });
      const rlPatientIds = new Set(patientsWithRL.map((p) => p.patientId));
      patients = patients.filter((p) => rlPatientIds.has(p.patientId));
    }

    if (filter.channelPreference) {
      const patientsWithChannel = await this.prisma.patientInsight.findMany({
        where: {
          patientId: { in: patients.map((p) => p.patientId) },
          channelPreference: filter.channelPreference,
        },
        select: { patientId: true },
      });
      const channelPatientIds = new Set(patientsWithChannel.map((p) => p.patientId));
      patients = patients.filter((p) => channelPatientIds.has(p.patientId));
    }

    return patients;
  }

  async filterByMarketingConsent(
    patients: Array<{ patientId: string }>,
    orgId: string,
    channel: 'sms' | 'whatsapp' | 'voice' | 'email' = 'whatsapp',
  ): Promise<Array<{ patientId: string }>> {
    if (patients.length === 0) return [];

    const consentService = new MarketingConsentService(this.prisma);
    const consented = await consentService.bulkCheckConsent(
      patients.map((p) => p.patientId),
      orgId,
      channel,
    );
    return patients.filter((p) => consented.has(p.patientId));
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: CampaignManager | null = null;

export function getCampaignManager(prisma: PrismaClient): CampaignManager {
  if (!_instance) {
    _instance = new CampaignManager(prisma);
  }
  return _instance;
}

export function resetCampaignManager(): void {
  _instance = null;
}
