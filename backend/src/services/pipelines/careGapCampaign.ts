/**
 * Care Gap → Campaign Pipeline
 *
 * Scans open care gaps, groups them by type (rule), and auto-creates
 * outreach campaigns for groups that meet the threshold (5+ patients).
 *
 * Runs daily at 6 AM AST — after the 2 AM care-gap scan has populated
 * fresh PatientCareGap records.
 */
import { PrismaClient } from '@prisma/client';
import { CampaignManager, getCampaignManager } from '../campaigns/campaignManager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CareGapCampaignResult {
  orgId: string;
  campaignsCreated: number;
  patientsEnrolled: number;
  gapsUpdated: number;
  details: Array<{
    ruleName: string;
    patientCount: number;
    campaignId: string;
  }>;
}

// Message templates by rule action type
const MESSAGE_TEMPLATES_AR: Record<string, string> = {
  whatsapp:
    '🏥 تذكير صحي\n\nمرحباً، نود تذكيركم بأهمية المتابعة الطبية الدورية.\n' +
    'يرجى حجز موعد في أقرب وقت.\n\nللحجز أرسل: حجز\nللاستفسار أرسل: استفسار',
  flag_only: 'تنبيه داخلي — لا يتم إرسال رسائل خارجية لهذه القاعدة.',
};

// All outreach is via WhatsApp (Baileys). Voice/SMS removed.
const CHANNEL_SEQUENCE: Record<string, string[]> = {
  whatsapp: ['whatsapp'],
  flag_only: ['whatsapp'],
};

const CAMPAIGN_TYPE_MAP: Record<string, string> = {
  whatsapp: 'preventive',
  flag_only: 'follow_up',
};

const MIN_GROUP_SIZE = 5;

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export class CareGapCampaignPipeline {
  constructor(private prisma: PrismaClient) {}

  async processAllOrgs(): Promise<CareGapCampaignResult[]> {
    const orgs = await this.prisma.org.findMany({ select: { orgId: true } });
    const results: CareGapCampaignResult[] = [];

    for (const org of orgs) {
      try {
        const result = await this.processCareGaps(org.orgId);
        results.push(result);
      } catch (err: any) {
        console.error(
          `[CareGapCampaign] Error processing org ${org.orgId}:`,
          err?.message || err,
        );
      }
    }

    return results;
  }

  async processCareGaps(orgId: string): Promise<CareGapCampaignResult> {
    const result: CareGapCampaignResult = {
      orgId,
      campaignsCreated: 0,
      patientsEnrolled: 0,
      gapsUpdated: 0,
      details: [],
    };

    const orgRules = await this.prisma.careGapRule.findMany({
      where: { orgId, isActive: true },
      select: { careGapRuleId: true, name: true, nameAr: true, action: true, messageAr: true, messageEn: true },
    });

    if (orgRules.length === 0) return result;

    const ruleIds = orgRules.map((r) => r.careGapRuleId);
    const ruleMap = new Map(orgRules.map((r) => [r.careGapRuleId, r]));

    // Note: PatientCareGap has no orgId column. Scoping is enforced transitively via
    // `ruleIds`, which were already filtered by orgId in the careGapRule.findMany above.
    // Rule UUIDs are globally unique so cross-tenant collision is not a real risk.
    const openGaps = await this.prisma.patientCareGap.findMany({
      where: {
        ruleId: { in: ruleIds },
        status: 'open',
      },
      select: { careGapId: true, patientId: true, ruleId: true },
    });

    if (openGaps.length === 0) return result;

    const gapsByRule = new Map<string, Array<{ careGapId: string; patientId: string }>>();
    for (const gap of openGaps) {
      const existing = gapsByRule.get(gap.ruleId) || [];
      existing.push({ careGapId: gap.careGapId, patientId: gap.patientId });
      gapsByRule.set(gap.ruleId, existing);
    }

    const campaignManager = getCampaignManager(this.prisma);
    const today = new Date();
    const dateLabel = today.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    for (const [ruleId, gaps] of gapsByRule) {
      if (gaps.length < MIN_GROUP_SIZE) continue;

      const rule = ruleMap.get(ruleId);
      if (!rule) continue;

      if (rule.action === 'flag_only') continue;

      const uniquePatientIds = [...new Set(gaps.map((g) => g.patientId))];

      const campaignName = `تنبيه: ${rule.nameAr || rule.name} - ${dateLabel}`;

      const channelSeq = CHANNEL_SEQUENCE[rule.action] || ['whatsapp'];
      const campaignType = (CAMPAIGN_TYPE_MAP[rule.action] || 'preventive') as
        'recall' | 'preventive' | 'follow_up' | 'satisfaction' | 'announcement';
      const scriptAr = rule.messageAr || MESSAGE_TEMPLATES_AR[rule.action] || MESSAGE_TEMPLATES_AR['whatsapp'];

      const startDate = this.getNextBusinessDayMorning();

      try {
        const campaign = await campaignManager.createCampaign({
          orgId,
          name: campaignName,
          nameAr: campaignName,
          type: campaignType,
          targetFilter: { patientIds: uniquePatientIds },
          channelSequence: channelSeq,
          scriptAr,
          scriptEn: rule.messageEn || undefined,
          startDate,
        });

        await campaignManager.startCampaign(campaign.campaignId);

        const gapIds = gaps.map((g) => g.careGapId);
        await this.prisma.patientCareGap.updateMany({
          where: { careGapId: { in: gapIds } },
          data: { status: 'contacted' },
        });

        result.campaignsCreated++;
        result.patientsEnrolled += uniquePatientIds.length;
        result.gapsUpdated += gapIds.length;
        result.details.push({
          ruleName: rule.nameAr || rule.name,
          patientCount: uniquePatientIds.length,
          campaignId: campaign.campaignId,
        });

        console.log(
          `[CareGapCampaign] Created campaign "${campaignName}" with ${uniquePatientIds.length} patients`,
        );
      } catch (err: any) {
        console.error(
          `[CareGapCampaign] Failed to create campaign for rule "${rule.name}":`,
          err?.message || err,
        );
      }
    }

    console.log(
      `[CareGapCampaign] Org ${orgId}: ${result.campaignsCreated} campaigns, ` +
        `${result.patientsEnrolled} patients enrolled, ${result.gapsUpdated} gaps updated`,
    );

    return result;
  }

  /**
   * Calculate the next business day (Sun-Thu in Saudi) at 9:00 AM AST.
   */
  private getNextBusinessDayMorning(): Date {
    const now = new Date();
    const riyadhNow = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }),
    );

    const date = new Date(riyadhNow);
    date.setHours(9, 0, 0, 0);
    date.setDate(date.getDate() + 1);

    const day = date.getDay();
    if (day === 5) {
      date.setDate(date.getDate() + 2);
    } else if (day === 6) {
      date.setDate(date.getDate() + 1);
    }

    return date;
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: CareGapCampaignPipeline | null = null;

export function getCareGapCampaignPipeline(
  prisma: PrismaClient,
): CareGapCampaignPipeline {
  if (!_instance) {
    _instance = new CareGapCampaignPipeline(prisma);
  }
  return _instance;
}

export function resetCareGapCampaignPipeline(): void {
  _instance = null;
}
