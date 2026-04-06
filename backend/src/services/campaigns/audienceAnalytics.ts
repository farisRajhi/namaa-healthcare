/**
 * Audience Analytics Service
 *
 * Provides clinic-wide patient segmentation stats, behavioral pattern analytics,
 * and audience preview for campaign targeting.
 */
import { PrismaClient } from '@prisma/client';
import { CampaignManager, PatientFilter } from './campaignManager.js';
import { MarketingConsentService } from '../compliance/marketingConsent.js';
import { TARGETING_PRESETS } from './targetingPresets.js';
import type { Twilio } from 'twilio';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SegmentPatient {
  patientId: string;
  firstName: string;
  lastName: string;
  score: number;        // combined score (higher = more likely to convert)
  engagementScore: number;
  returnLikelihood: number;
}

export interface SegmentService {
  serviceId: string;
  name: string;
  patientCount: number; // how many patients in this segment prefer this service
}

export interface SegmentCount {
  key: string;
  labelAr: string;
  labelEn: string;
  description: string;
  descriptionAr: string;
  icon: string;
  color: string;
  count: number;
  rank: number;                   // 1 = highest priority segment
  avgScore: number;               // average combined score for the segment
  topServices: SegmentService[];  // top 5 services patients in this segment prefer
  topPatients: SegmentPatient[];  // top 5 patients ranked by score
}

export interface BehaviorPatterns {
  totalPatients: number;
  engagementDistribution: BucketCount[];
  returnLikelihoodDistribution: BucketCount[];
  dayOfWeekDistribution: { day: number; label: string; labelAr: string; count: number }[];
  timeSlotDistribution: { slot: string; labelAr: string; count: number }[];
  channelPreferenceDistribution: { channel: string; labelAr: string; count: number }[];
  averages: {
    engagementScore: number;
    returnLikelihood: number;
    lifetimeValue: number;
    visitIntervalDays: number;
  };
}

export interface BucketCount {
  bucket: string;
  min: number;
  max: number;
  count: number;
}

export interface AudiencePreview {
  totalMatching: number;
  withConsent: number;
  breakdown: {
    byEngagement: BucketCount[];
    bySex: { sex: string; count: number }[];
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AudienceAnalyticsService {
  constructor(
    private prisma: PrismaClient,
    private twilio: Twilio | null = null,
  ) {}

  /**
   * Get enriched data for each predefined targeting segment:
   * count, rank, average score, top services, and top patients.
   */
  async getSegmentOverview(orgId: string): Promise<SegmentCount[]> {
    const manager = new CampaignManager(this.prisma, this.twilio);

    // Pre-fetch all services for name resolution
    const allServices = await this.prisma.service.findMany({
      where: { orgId, active: true },
      select: { serviceId: true, name: true },
    });
    const serviceNameMap = new Map(allServices.map((s) => [s.serviceId, s.name]));

    const results = await Promise.all(
      TARGETING_PRESETS.map(async (preset) => {
        const patients = await manager.queryPatientsByFilter(orgId, preset.filter);
        const patientIds = patients.map((p) => p.patientId);

        let avgScore = 0;
        let topPatients: SegmentPatient[] = [];
        let topServices: SegmentService[] = [];

        if (patientIds.length > 0) {
          // Fetch insights for matched patients
          const insights = await this.prisma.patientInsight.findMany({
            where: { patientId: { in: patientIds } },
            select: {
              patientId: true,
              engagementScore: true,
              returnLikelihood: true,
              preferredServiceIds: true,
            },
          });

          // Compute combined score: weighted average (60% return likelihood, 40% engagement)
          const scores = insights.map((i) => ({
            patientId: i.patientId,
            engagementScore: i.engagementScore,
            returnLikelihood: i.returnLikelihood,
            score: Math.round(i.returnLikelihood * 0.6 + i.engagementScore * 0.4),
            serviceIds: i.preferredServiceIds as string[],
          }));

          // Average score
          if (scores.length > 0) {
            avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
          }

          // Top 5 patients by score (descending)
          const sortedScores = [...scores].sort((a, b) => b.score - a.score).slice(0, 5);
          const topPatientIds = sortedScores.map((s) => s.patientId);
          const patientRecords = await this.prisma.patient.findMany({
            where: { patientId: { in: topPatientIds } },
            select: { patientId: true, firstName: true, lastName: true },
          });
          const nameMap = new Map(patientRecords.map((p) => [p.patientId, p]));

          topPatients = sortedScores.map((s) => {
            const p = nameMap.get(s.patientId);
            return {
              patientId: s.patientId,
              firstName: p?.firstName || '',
              lastName: p?.lastName || '',
              score: s.score,
              engagementScore: s.engagementScore,
              returnLikelihood: s.returnLikelihood,
            };
          });

          // Aggregate top services across all patients in segment
          const serviceFreq = new Map<string, number>();
          for (const s of scores) {
            for (const sid of (s.serviceIds || [])) {
              serviceFreq.set(sid, (serviceFreq.get(sid) || 0) + 1);
            }
          }
          topServices = Array.from(serviceFreq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([serviceId, patientCount]) => ({
              serviceId,
              name: serviceNameMap.get(serviceId) || serviceId.substring(0, 8),
              patientCount,
            }));
        }

        return {
          key: preset.key,
          labelAr: preset.labelAr,
          labelEn: preset.labelEn,
          description: preset.description,
          descriptionAr: preset.descriptionAr,
          icon: preset.icon,
          color: preset.color,
          count: patientIds.length,
          rank: 0, // will be assigned after sorting
          avgScore,
          topServices,
          topPatients,
        };
      }),
    );

    // Assign rank: sort by a priority formula (higher count with higher avgScore = higher rank)
    // Segments with more actionable patients rank higher
    const sorted = [...results]
      .filter((r) => r.count > 0)
      .sort((a, b) => {
        // Priority: count * avgScore (weighted towards count)
        const scoreA = a.count * (a.avgScore / 100 + 0.5);
        const scoreB = b.count * (b.avgScore / 100 + 0.5);
        return scoreB - scoreA;
      });

    sorted.forEach((seg, idx) => {
      seg.rank = idx + 1;
    });

    // Segments with 0 patients get no rank
    for (const r of results) {
      if (r.count === 0) r.rank = 0;
    }

    return results;
  }

  /**
   * Aggregate clinic-wide behavioral patterns from PatientInsight records.
   */
  async getClinicBehaviorPatterns(orgId: string): Promise<BehaviorPatterns> {
    const insights = await this.prisma.patientInsight.findMany({
      where: { orgId },
      select: {
        engagementScore: true,
        returnLikelihood: true,
        preferredDayOfWeek: true,
        preferredTimeSlot: true,
        channelPreference: true,
        lifetimeValue: true,
        avgVisitIntervalDays: true,
      },
    });

    const totalPatients = insights.length;

    // Engagement score distribution
    const engagementDistribution = this.buildBuckets(
      insights.map((i) => i.engagementScore),
    );

    // Return likelihood distribution
    const returnLikelihoodDistribution = this.buildBuckets(
      insights.map((i) => i.returnLikelihood),
    );

    // Day of week distribution
    const dayNames = [
      { label: 'Sunday', labelAr: 'الأحد' },
      { label: 'Monday', labelAr: 'الاثنين' },
      { label: 'Tuesday', labelAr: 'الثلاثاء' },
      { label: 'Wednesday', labelAr: 'الأربعاء' },
      { label: 'Thursday', labelAr: 'الخميس' },
      { label: 'Friday', labelAr: 'الجمعة' },
      { label: 'Saturday', labelAr: 'السبت' },
    ];
    const dayCounts = new Map<number, number>();
    for (const i of insights) {
      if (i.preferredDayOfWeek !== null) {
        dayCounts.set(i.preferredDayOfWeek, (dayCounts.get(i.preferredDayOfWeek) || 0) + 1);
      }
    }
    const dayOfWeekDistribution = dayNames.map((d, idx) => ({
      day: idx,
      label: d.label,
      labelAr: d.labelAr,
      count: dayCounts.get(idx) || 0,
    }));

    // Time slot distribution
    const slotLabels: Record<string, string> = {
      morning: 'صباحي',
      afternoon: 'بعد الظهر',
      evening: 'مسائي',
    };
    const slotCounts = new Map<string, number>();
    for (const i of insights) {
      if (i.preferredTimeSlot) {
        slotCounts.set(i.preferredTimeSlot, (slotCounts.get(i.preferredTimeSlot) || 0) + 1);
      }
    }
    const timeSlotDistribution = ['morning', 'afternoon', 'evening'].map((slot) => ({
      slot,
      labelAr: slotLabels[slot] || slot,
      count: slotCounts.get(slot) || 0,
    }));

    // Channel preference distribution
    const channelLabels: Record<string, string> = {
      whatsapp: 'واتساب',
      sms: 'رسائل نصية',
      phone: 'هاتف',
      web: 'الموقع',
    };
    const channelCounts = new Map<string, number>();
    for (const i of insights) {
      if (i.channelPreference) {
        channelCounts.set(i.channelPreference, (channelCounts.get(i.channelPreference) || 0) + 1);
      }
    }
    const channelPreferenceDistribution = Array.from(channelCounts.entries()).map(([channel, count]) => ({
      channel,
      labelAr: channelLabels[channel] || channel,
      count,
    }));

    // Averages
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: number[]) => (arr.length > 0 ? sum(arr) / arr.length : 0);

    const averages = {
      engagementScore: Math.round(avg(insights.map((i) => i.engagementScore))),
      returnLikelihood: Math.round(avg(insights.map((i) => i.returnLikelihood))),
      lifetimeValue: Math.round(avg(insights.map((i) => i.lifetimeValue))),
      visitIntervalDays: Math.round(
        avg(insights.filter((i) => i.avgVisitIntervalDays !== null).map((i) => i.avgVisitIntervalDays!)),
      ),
    };

    return {
      totalPatients,
      engagementDistribution,
      returnLikelihoodDistribution,
      dayOfWeekDistribution,
      timeSlotDistribution,
      channelPreferenceDistribution,
      averages,
    };
  }

  /**
   * Preview audience size and breakdown for a given filter + channel.
   */
  async previewAudience(
    orgId: string,
    filter: PatientFilter,
    channel: 'whatsapp' | 'sms' = 'whatsapp',
  ): Promise<AudiencePreview> {
    const manager = new CampaignManager(this.prisma, this.twilio);
    const patients = await manager.queryPatientsByFilter(orgId, filter);
    const totalMatching = patients.length;

    // Check marketing consent
    const consentService = new MarketingConsentService(this.prisma);
    const consented = await consentService.bulkCheckConsent(
      patients.map((p) => p.patientId),
      orgId,
      channel,
    );
    const withConsent = consented.size;

    // Engagement breakdown for matched patients
    let byEngagement: BucketCount[] = [];
    let bySex: { sex: string; count: number }[] = [];

    if (totalMatching > 0) {
      const patientIds = patients.map((p) => p.patientId);

      // Engagement scores of matched patients
      const matchedInsights = await this.prisma.patientInsight.findMany({
        where: { patientId: { in: patientIds } },
        select: { engagementScore: true },
      });
      byEngagement = this.buildBuckets(matchedInsights.map((i) => i.engagementScore));

      // Sex breakdown
      const sexCounts = await this.prisma.patient.groupBy({
        by: ['sex'],
        where: { patientId: { in: patientIds } },
        _count: { sex: true },
      });
      bySex = sexCounts.map((s) => ({
        sex: s.sex || 'unknown',
        count: s._count.sex,
      }));
    }

    return {
      totalMatching,
      withConsent,
      breakdown: { byEngagement, bySex },
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private buildBuckets(scores: number[]): BucketCount[] {
    const buckets: BucketCount[] = [
      { bucket: '0-20', min: 0, max: 20, count: 0 },
      { bucket: '21-40', min: 21, max: 40, count: 0 },
      { bucket: '41-60', min: 41, max: 60, count: 0 },
      { bucket: '61-80', min: 61, max: 80, count: 0 },
      { bucket: '81-100', min: 81, max: 100, count: 0 },
    ];

    for (const score of scores) {
      for (const b of buckets) {
        if (score >= b.min && score <= b.max) {
          b.count++;
          break;
        }
      }
    }

    return buckets;
  }
}
