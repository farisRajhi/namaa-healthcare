/**
 * Service Cycle Map — Per-service timing data for Patient Intelligence
 *
 * Based on seedPatientHabits.ts and care gap rules.
 * Maps Arabic service names (as they appear in clinic CSV exports) to
 * their repeat cycles, reminder windows, and urgency thresholds.
 *
 * Used by the pipeline to compute per-service overdue status for each patient.
 */

export interface ServiceCycle {
  /** Arabic name (canonical form from seedPatientHabits) */
  nameAr: string;
  /** English name for AI prompts */
  nameEn: string;
  /** Recommended repeat interval in days (null = one-time service) */
  cycleDays: number | null;
  /** Days after last service when first reminder should fire */
  reminderDays: number | null;
  /** Days after last service when considered overdue */
  overdueDays: number | null;
  /** Days after last service when urgent / critical */
  urgentDays: number | null;
  /** Is this a repeating service? */
  isRepeating: boolean;
  /** Category */
  category: 'dental' | 'cosmetic';
  /** If one-time, what follow-up service is expected? */
  followUpService?: string;
}

/**
 * Master service cycle table.
 * Keys are normalized Arabic names (trimmed, no extra spaces).
 */
const SERVICE_CYCLES: ServiceCycle[] = [
  // ── Dental (repeating) ──
  { nameAr: 'تنظيف أسنان',     nameEn: 'Dental Cleaning',     cycleDays: 180, reminderDays: 150, overdueDays: 210, urgentDays: 300, isRepeating: true,  category: 'dental' },
  { nameAr: 'تبييض أسنان',     nameEn: 'Teeth Whitening',     cycleDays: 180, reminderDays: 150, overdueDays: 240, urgentDays: null, isRepeating: true,  category: 'dental' },
  { nameAr: 'فينير',           nameEn: 'Veneers',             cycleDays: 365, reminderDays: 150, overdueDays: 330, urgentDays: null, isRepeating: true,  category: 'dental' },
  { nameAr: 'زراعة أسنان',     nameEn: 'Dental Implants',     cycleDays: 365, reminderDays: 330, overdueDays: 400, urgentDays: null, isRepeating: true,  category: 'dental' },
  { nameAr: 'علاج لثة',        nameEn: 'Gum Treatment',       cycleDays: 90,  reminderDays: 75,  overdueDays: 120, urgentDays: null, isRepeating: true,  category: 'dental' },
  { nameAr: 'أسنان أطفال',     nameEn: 'Kids Dentistry',      cycleDays: 180, reminderDays: 150, overdueDays: 210, urgentDays: null, isRepeating: true,  category: 'dental' },
  { nameAr: 'تيجان وجسور',     nameEn: 'Crowns & Bridges',    cycleDays: 365, reminderDays: 330, overdueDays: 400, urgentDays: null, isRepeating: true,  category: 'dental' },
  { nameAr: 'واقي أسنان ليلي', nameEn: 'Night Guard',         cycleDays: 365, reminderDays: 330, overdueDays: 400, urgentDays: null, isRepeating: true,  category: 'dental' },
  { nameAr: 'فلورايد',         nameEn: 'Fluoride Treatment',  cycleDays: 180, reminderDays: 150, overdueDays: 210, urgentDays: null, isRepeating: true,  category: 'dental' },

  // ── Dental (one-time with follow-up) ──
  { nameAr: 'علاج عصب',        nameEn: 'Root Canal',          cycleDays: null, reminderDays: 14,  overdueDays: 30,  urgentDays: 45,  isRepeating: false, category: 'dental', followUpService: 'تيجان وجسور' },
  { nameAr: 'خلع أسنان',       nameEn: 'Tooth Extraction',    cycleDays: null, reminderDays: 5,   overdueDays: 90,  urgentDays: null, isRepeating: false, category: 'dental', followUpService: 'زراعة أسنان' },
  { nameAr: 'حشوات أسنان',     nameEn: 'Dental Fillings',     cycleDays: null, reminderDays: 150, overdueDays: null, urgentDays: null, isRepeating: false, category: 'dental' },
  { nameAr: 'تقويم أسنان',     nameEn: 'Orthodontics',        cycleDays: null, reminderDays: 25,  overdueDays: 35,  urgentDays: 50,  isRepeating: false, category: 'dental' },
  { nameAr: 'تقويم شفاف',      nameEn: 'Clear Aligners',      cycleDays: null, reminderDays: 25,  overdueDays: 35,  urgentDays: 50,  isRepeating: false, category: 'dental' },

  // ── Cosmetic (repeating) ──
  { nameAr: 'بوتوكس',          nameEn: 'Botox',               cycleDays: 90,  reminderDays: 75,  overdueDays: 120, urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'فيلر شفايف',      nameEn: 'Lip Filler',          cycleDays: 180, reminderDays: 150, overdueDays: 210, urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'فيلر خدود',       nameEn: 'Cheek Filler',        cycleDays: 365, reminderDays: 300, overdueDays: 400, urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'فيلر فك',         nameEn: 'Jawline Filler',      cycleDays: 365, reminderDays: 300, overdueDays: 400, urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'إزالة شعر بالليزر', nameEn: 'Laser Hair Removal', cycleDays: 42,  reminderDays: 42,  overdueDays: 60,  urgentDays: 300, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'تقشير كيميائي',   nameEn: 'Chemical Peel',       cycleDays: 30,  reminderDays: 28,  overdueDays: 45,  urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'هايدرا فيشل',     nameEn: 'HydraFacial',         cycleDays: 30,  reminderDays: 28,  overdueDays: 45,  urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'مايكرونيدلنج',    nameEn: 'Microneedling',       cycleDays: 35,  reminderDays: 35,  overdueDays: 50,  urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'بلازما وجه',      nameEn: 'PRP Face',            cycleDays: 90,  reminderDays: 75,  overdueDays: 120, urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'بلازما شعر',      nameEn: 'PRP Hair',            cycleDays: 90,  reminderDays: 75,  overdueDays: 180, urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'نحت جسم',         nameEn: 'Body Contouring',     cycleDays: 42,  reminderDays: 42,  overdueDays: 60,  urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'شد بشرة',         nameEn: 'Skin Tightening',     cycleDays: 365, reminderDays: 300, overdueDays: 400, urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'خيوط شد',         nameEn: 'Thread Lift',         cycleDays: 365, reminderDays: 300, overdueDays: 400, urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'علاج وريدي',      nameEn: 'IV Therapy',          cycleDays: 21,  reminderDays: 21,  overdueDays: 30,  urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'ميزوثيرابي',      nameEn: 'Mesotherapy',         cycleDays: 30,  reminderDays: 28,  overdueDays: 45,  urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'علاج حب شباب',    nameEn: 'Acne Treatment',      cycleDays: 35,  reminderDays: 35,  overdueDays: 50,  urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'علاج ندبات',      nameEn: 'Scar Treatment',      cycleDays: 60,  reminderDays: 50,  overdueDays: 75,  urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'علاج تصبغات',     nameEn: 'Pigmentation Tx',     cycleDays: 30,  reminderDays: 28,  overdueDays: 45,  urgentDays: null, isRepeating: true,  category: 'cosmetic' },
  { nameAr: 'علاج تساقط شعر',  nameEn: 'Hair Restoration',    cycleDays: 180, reminderDays: 150, overdueDays: 180, urgentDays: null, isRepeating: true,  category: 'cosmetic' },
];

// ── Lookup map ──────────────────────────────────────────────────────

/** Normalized name → ServiceCycle. Handles common CSV name variations. */
const cycleMap = new Map<string, ServiceCycle>();

// Common CSV name variations → canonical name
const ALIASES: Record<string, string> = {
  'تنظيف الاسنان': 'تنظيف أسنان',
  'تنظيف اسنان': 'تنظيف أسنان',
  'تبييض الاسنان': 'تبييض أسنان',
  'تبييض اسنان': 'تبييض أسنان',
  'زراعة الاسنان': 'زراعة أسنان',
  'زراعة اسنان': 'زراعة أسنان',
  'تقويم الاسنان': 'تقويم أسنان',
  'تقويم اسنان': 'تقويم أسنان',
  'خلع الاسنان': 'خلع أسنان',
  'خلع اسنان': 'خلع أسنان',
  'اسنان الاطفال': 'أسنان أطفال',
  'أسنان الأطفال': 'أسنان أطفال',
  'حشوة': 'حشوات أسنان',
  'حشوات': 'حشوات أسنان',
  'تاج الاسنان': 'تيجان وجسور',
  'تاج': 'تيجان وجسور',
  'جسر الاسنان': 'تيجان وجسور',
  'جسر': 'تيجان وجسور',
  'فحص': 'فحص',
  'فحص دوري': 'فحص',
  'كشف': 'فحص',
  'أشعة': 'أشعة',
  'تلميع الاسنان': 'تنظيف أسنان',
  'تلميع': 'تنظيف أسنان',
};

// Build the lookup map
for (const cycle of SERVICE_CYCLES) {
  cycleMap.set(cycle.nameAr, cycle);
}
for (const [alias, canonical] of Object.entries(ALIASES)) {
  const cycle = cycleMap.get(canonical);
  if (cycle) cycleMap.set(alias, cycle);
}

// ── Public API ──────────────────────────────────────────────────────

export interface ServiceGap {
  /** Service name (Arabic) */
  serviceAr: string;
  /** Service name (English) */
  serviceEn: string;
  /** Days since this service was last performed */
  daysSinceService: number;
  /** Recommended cycle in days (null = one-time) */
  cycleDays: number | null;
  /** How many days overdue (negative = not yet due) */
  overdueDays: number;
  /** Status based on care gap rules */
  status: 'not_due' | 'approaching' | 'due' | 'overdue' | 'urgent' | 'critical';
  /** Priority score 0-100 for this specific service gap */
  serviceScore: number;
  /** If one-time service, what follow-up is needed? */
  followUpNeeded?: string;
  /** Is this a repeating service? */
  isRepeating: boolean;
}

/**
 * Look up the cycle for a service by Arabic name.
 */
export function getServiceCycle(serviceNameAr: string): ServiceCycle | null {
  return cycleMap.get(serviceNameAr.trim()) || null;
}

/**
 * Compute service gaps for a patient based on their service history.
 *
 * For each service the patient has received, calculates:
 * - How many days since they had it
 * - Whether they're due, overdue, or urgent
 * - A per-service score (0-100)
 *
 * @param services - List of service names the patient has had
 * @param lastVisitDate - When the patient last visited (used as proxy for service date)
 * @param daysSinceLastVisit - Days since last visit
 */
export function computeServiceGaps(
  services: string[],
  daysSinceLastVisit: number | null,
): ServiceGap[] {
  if (!daysSinceLastVisit || services.length === 0) return [];

  const gaps: ServiceGap[] = [];
  const seen = new Set<string>();

  for (const rawService of services) {
    const service = rawService.trim();
    const cycle = getServiceCycle(service);
    if (!cycle) continue;

    // Deduplicate by canonical name
    if (seen.has(cycle.nameAr)) continue;
    seen.add(cycle.nameAr);

    // Skip non-diagnostic, non-repeating services without follow-up
    if (!cycle.isRepeating && !cycle.followUpService) continue;

    const daysSince = daysSinceLastVisit; // Best approximation from CSV data

    let overdueDays: number;
    let status: ServiceGap['status'];
    let serviceScore: number;

    if (cycle.isRepeating && cycle.cycleDays) {
      // Repeating service: score based on cycle
      overdueDays = daysSince - cycle.cycleDays;

      if (cycle.urgentDays && daysSince >= cycle.urgentDays) {
        status = 'urgent';
        serviceScore = 90 + Math.min(10, Math.floor((daysSince - cycle.urgentDays) / 30));
      } else if (cycle.overdueDays && daysSince >= cycle.overdueDays) {
        status = 'overdue';
        serviceScore = 70 + Math.min(20, Math.floor((daysSince - cycle.overdueDays) / 30) * 5);
      } else if (cycle.reminderDays && daysSince >= cycle.reminderDays) {
        status = 'due';
        serviceScore = 50 + Math.min(20, Math.floor((daysSince - cycle.reminderDays) / 15) * 5);
      } else if (cycle.cycleDays && daysSince >= cycle.cycleDays * 0.8) {
        status = 'approaching';
        serviceScore = 30 + Math.min(20, Math.floor(daysSince / cycle.cycleDays * 20));
      } else {
        status = 'not_due';
        serviceScore = Math.floor(daysSince / cycle.cycleDays * 25);
      }
    } else if (cycle.followUpService) {
      // One-time service needing follow-up (e.g., root canal → crown)
      overdueDays = daysSince - (cycle.reminderDays || 14);

      if (cycle.urgentDays && daysSince >= cycle.urgentDays) {
        status = 'critical';
        serviceScore = 95;
      } else if (cycle.overdueDays && daysSince >= cycle.overdueDays) {
        status = 'overdue';
        serviceScore = 85;
      } else if (cycle.reminderDays && daysSince >= cycle.reminderDays) {
        status = 'due';
        serviceScore = 75;
      } else {
        status = 'not_due';
        serviceScore = 20;
      }
    } else {
      continue;
    }

    serviceScore = Math.max(0, Math.min(100, serviceScore));

    gaps.push({
      serviceAr: cycle.nameAr,
      serviceEn: cycle.nameEn,
      daysSinceService: daysSince,
      cycleDays: cycle.cycleDays,
      overdueDays,
      status,
      serviceScore,
      followUpNeeded: cycle.followUpService,
      isRepeating: cycle.isRepeating,
    });
  }

  // Sort by score descending — most urgent gap first
  gaps.sort((a, b) => b.serviceScore - a.serviceScore);

  return gaps;
}

/**
 * Get all available service cycles (for reference/export).
 */
export function getAllServiceCycles(): ServiceCycle[] {
  return [...SERVICE_CYCLES];
}
