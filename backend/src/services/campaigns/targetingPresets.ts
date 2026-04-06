/**
 * Shared Targeting Presets
 *
 * Predefined patient segments used by both Campaigns and Offers.
 * Each preset maps to a PatientFilter that can be resolved by CampaignManager.
 */
import type { PatientFilter } from './campaignManager.js';

export interface TargetPresetInfo {
  key: string;
  labelAr: string;
  labelEn: string;
  description: string;
  descriptionAr: string;
  icon: string;
  color: string;
  filter: PatientFilter;
}

export const TARGETING_PRESETS: TargetPresetInfo[] = [
  {
    key: 'high_value',
    labelAr: 'مرضى عالي القيمة',
    labelEn: 'High Value',
    description: 'Patients with engagement score 70+',
    descriptionAr: 'مرضى بمعدل تفاعل عالي (70+)',
    icon: 'Crown',
    color: 'amber',
    filter: { minEngagementScore: 70 },
  },
  {
    key: 'at_risk',
    labelAr: 'مرضى معرضون للانقطاع',
    labelEn: 'At Risk',
    description: 'Declining engagement (20-50) with no visit in 60+ days',
    descriptionAr: 'تفاعل متراجع (20-50) ولم يزور منذ 60+ يوم',
    icon: 'AlertTriangle',
    color: 'orange',
    filter: { minEngagementScore: 20, maxEngagementScore: 50, lastVisitDaysAgo: 60 },
  },
  {
    key: 'lapsed_90',
    labelAr: 'غائبون +90 يوم',
    labelEn: 'Lapsed 90+ Days',
    description: 'No visit in 90+ days with no upcoming appointments',
    descriptionAr: 'لم يزور منذ 90+ يوم وبدون مواعيد قادمة',
    icon: 'Clock',
    color: 'red',
    filter: { lastVisitDaysAgo: 90, excludeWithUpcoming: true },
  },
  {
    key: 'lapsed_180',
    labelAr: 'غائبون +180 يوم',
    labelEn: 'Lapsed 180+ Days',
    description: 'No visit in 180+ days',
    descriptionAr: 'لم يزور منذ 180+ يوم',
    icon: 'CalendarX',
    color: 'red',
    filter: { lastVisitDaysAgo: 180, excludeWithUpcoming: true },
  },
  {
    key: 'new_patient',
    labelAr: 'مرضى جدد',
    labelEn: 'New Patients',
    description: 'Low engagement score (≤30) — new or inactive',
    descriptionAr: 'معدل تفاعل منخفض (≤30) — جدد أو غير نشطين',
    icon: 'UserPlus',
    color: 'blue',
    filter: { maxEngagementScore: 30 },
  },
  {
    key: 'likely_to_return',
    labelAr: 'سيعودون غالباً',
    labelEn: 'Likely to Return',
    description: 'High return likelihood (80+) — a reminder is enough',
    descriptionAr: 'احتمال عودة عالي (80+) — تذكير بسيط يكفي',
    icon: 'TrendingUp',
    color: 'green',
    filter: { minReturnLikelihood: 80 },
  },
  {
    key: 'needs_nudge',
    labelAr: 'يحتاجون تحفيز',
    labelEn: 'Needs a Nudge',
    description: 'Return likelihood 50-79 — small offer might help',
    descriptionAr: 'احتمال عودة متوسط (50-79) — عرض بسيط قد يساعد',
    icon: 'Sparkles',
    color: 'cyan',
    filter: { minReturnLikelihood: 50, maxReturnLikelihood: 79 },
  },
  {
    key: 'at_risk_churn',
    labelAr: 'معرضون للخسارة',
    labelEn: 'Churn Risk',
    description: 'Return likelihood 20-49 — strong offer needed',
    descriptionAr: 'احتمال عودة منخفض (20-49) — يحتاج عرض قوي',
    icon: 'ShieldAlert',
    color: 'rose',
    filter: { minReturnLikelihood: 20, maxReturnLikelihood: 49 },
  },
];
