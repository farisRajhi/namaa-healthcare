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
import type { Twilio } from 'twilio';

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

// ---------------------------------------------------------------------------
// Arabic type labels (user-facing campaign names)
// ---------------------------------------------------------------------------

const GAP_TYPE_LABELS_AR: Record<string, string> = {
  outbound_call: 'اتصال متابعة',
  sms: 'رسالة متابعة',
  whatsapp: 'رسالة واتساب',
  flag_only: 'تنبيه داخلي',
};

// Message templates by rule action type
const MESSAGE_TEMPLATES_AR: Record<string, string> = {
  outbound_call:
    'السلام عليكم، نتواصل معكم من عيادتكم لتذكيركم بأهمية إجراء الفحوصات الدورية. ' +
    'يرجى التواصل معنا لحجز موعد في أقرب وقت. صحتكم تهمنا.',
  sms:
    'تذكير صحي: حان موعد مراجعتكم الطبية. يرجى حجز موعد عبر الاتصال بنا أو الرد على هذه الرسالة. شكراً لكم.',
  whatsapp:
    '🏥 تذكير صحي\n\nمرحباً، نود تذكيركم بأهمية المتابعة الطبية الدورية.\n' +
    'يرجى حجز موعد في أقرب وقت.\n\nللحجز أرسل: حجز\nللاستفسار أرسل: استفسار',
};

// Channel sequence based on action type
const CHANNEL_SEQUENCE: Record<string, string[]> = {
  outbound_call: ['voice', 'sms', 'whatsapp'],
  sms: ['sms', 'whatsapp'],
  whatsapp: ['whatsapp', 'sms'],
  flag_only: ['sms'],
};

// Campaign type mapping from rule action
const CAMPAIGN_TYPE_MAP: Record<string, string> = {
  outbound_call: 'recall',
  sms: 'preventive',
  whatsapp: 'preventive',
  flag_only: 'follow_up',
};

// Minimum number of patients in a group to create a campaign
const MIN_GROUP_SIZE = 5;

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export class CareGapCampaignPipeline {
  private prisma: PrismaClient;
  private twilio: Twilio | null;

  constructor(prisma: PrismaClient, twilio: Twilio | null = null) {
    this.prisma = prisma;
    this.twilio = twilio;
  }

  /**
   * Main entry point — scans all orgs for open care gaps and creates campaigns.
   */
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

  /**
   * Scan for open care gaps in an org, group by rule, and auto-create campaigns.
   */
  async processCareGaps(orgId: string): Promise<CareGapCampaignResult> {
    const result: CareGapCampaignResult = {
      orgId,
      campaignsCreated: 0,
      patientsEnrolled: 0,
      gapsUpdated: 0,
      details: [],
    };

    // 1. Get all open care gaps for this org (via rules that belong to the org)
    const orgRules = await this.prisma.careGapRule.findMany({
      where: { orgId, isActive: true },
      select: { careGapRuleId: true, name: true, nameAr: true, action: true, messageAr: true, messageEn: true },
    });

    if (orgRules.length === 0) return result;

    const ruleIds = orgRules.map((r) => r.careGapRuleId);
    const ruleMap = new Map(orgRules.map((r) => [r.careGapRuleId, r]));

    // 2. Get open care gaps grouped by rule
    const openGaps = await this.prisma.patientCareGap.findMany({
      where: {
        ruleId: { in: ruleIds },
        status: 'open',
      },
      select: { careGapId: true, patientId: true, ruleId: true },
    });

    if (openGaps.length === 0) return result;

    // Group by rule ID
    const gapsByRule = new Map<string, Array<{ careGapId: string; patientId: string }>>();
    for (const gap of openGaps) {
      const existing = gapsByRule.get(gap.ruleId) || [];
      existing.push({ careGapId: gap.careGapId, patientId: gap.patientId });
      gapsByRule.set(gap.ruleId, existing);
    }

    // 3. For each group with enough patients, create a campaign
    const campaignManager = getCampaignManager(this.prisma, this.twilio);
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

      // Skip flag_only rules — they don't generate outbound campaigns
      if (rule.action === 'flag_only') continue;

      // Deduplicate patients (a patient may have multiple gaps for the same rule — unlikely but safe)
      const uniquePatientIds = [...new Set(gaps.map((g) => g.patientId))];

      // Build campaign name
      const campaignName = `تنبيه: ${rule.nameAr || rule.name} - ${dateLabel}`;

      // Determine channel sequence and message
      const channelSeq = CHANNEL_SEQUENCE[rule.action] || ['sms'];
      const campaignType = (CAMPAIGN_TYPE_MAP[rule.action] || 'preventive') as
        'recall' | 'preventive' | 'follow_up' | 'satisfaction' | 'announcement';
      const scriptAr = rule.messageAr || MESSAGE_TEMPLATES_AR[rule.action] || MESSAGE_TEMPLATES_AR['sms'];

      // Schedule for next business day morning (9 AM)
      const startDate = this.getNextBusinessDayMorning();

      try {
        // Create the campaign
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

        // Auto-start the campaign (resolves targets and activates)
        await campaignManager.startCampaign(campaign.campaignId);

        // 4. Update care gap status to 'contacted' (outreach scheduled)
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
    // Convert to Riyadh time to figure out day-of-week
    const riyadhNow = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }),
    );

    const date = new Date(riyadhNow);
    date.setHours(9, 0, 0, 0);

    // Move to the next day first
    date.setDate(date.getDate() + 1);

    // Saudi business days: Sun(0) – Thu(4). Fri(5) and Sat(6) are weekend.
    const day = date.getDay();
    if (day === 5) {
      // Friday → move to Sunday
      date.setDate(date.getDate() + 2);
    } else if (day === 6) {
      // Saturday → move to Sunday
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
  twilio: Twilio | null = null,
): CareGapCampaignPipeline {
  if (!_instance) {
    _instance = new CareGapCampaignPipeline(prisma, twilio);
  }
  return _instance;
}

export function resetCareGapCampaignPipeline(): void {
  _instance = null;
}
