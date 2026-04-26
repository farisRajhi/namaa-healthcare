/**
 * Clinic schedule & departments summary — shared between the greeting prompt
 * and the availability tool. Produces a compact patient-facing view like:
 *   "من الأحد إلى الخميس من 15:00 إلى 00:00"
 * instead of repeating every day's hours individually.
 */

import type { PrismaClient } from '@prisma/client';

const DAY_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export interface ClinicSchedule {
  departments: string[];
  /** Arabic, WhatsApp-friendly single-line working hours, or empty if no rules. */
  workingHoursAr: string;
}

/**
 * Query providers' availability rules and collapse them into a patient-facing
 * summary. Contiguous days with the same window are compressed into a range
 * (e.g. Sun–Thu 15:00–00:00). Days with different hours stay split.
 */
export async function getClinicSchedule(
  prisma: PrismaClient,
  orgId: string,
): Promise<ClinicSchedule> {
  const [departments, rules] = await Promise.all([
    prisma.department.findMany({ where: { orgId }, orderBy: { name: 'asc' }, select: { name: true } }),
    prisma.providerAvailabilityRule.findMany({
      where: { provider: { orgId, active: true } },
      select: { dayOfWeek: true, startLocal: true, endLocal: true },
    }),
  ]);

  // For each day-of-week, take the widest window across all providers.
  const perDay = new Map<number, { startMin: number; endMin: number }>();
  for (const r of rules) {
    const startMin = r.startLocal.getUTCHours() * 60 + r.startLocal.getUTCMinutes();
    const endMin = r.endLocal.getUTCHours() * 60 + r.endLocal.getUTCMinutes();
    const cur = perDay.get(r.dayOfWeek);
    if (!cur) perDay.set(r.dayOfWeek, { startMin, endMin });
    else {
      cur.startMin = Math.min(cur.startMin, startMin);
      cur.endMin = Math.max(cur.endMin, endMin);
    }
  }

  const workingHoursAr = formatWorkingHours(perDay);

  return {
    departments: departments.map(d => d.name),
    workingHoursAr,
  };
}

function fmt(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * Collapse a per-day hours map into human-readable Arabic ranges.
 * - Same window across contiguous days → "من الأحد إلى الخميس من 15:00 إلى 00:00"
 * - Mixed → comma-separated per-range list
 */
function formatWorkingHours(perDay: Map<number, { startMin: number; endMin: number }>): string {
  if (perDay.size === 0) return '';

  const days = Array.from(perDay.keys()).sort((a, b) => a - b);
  const segments: Array<{ from: number; to: number; startMin: number; endMin: number }> = [];

  let segStart = days[0];
  let prev = days[0];
  let prevWindow = perDay.get(prev)!;

  for (let i = 1; i < days.length; i++) {
    const d = days[i];
    const w = perDay.get(d)!;
    const contiguous = d === prev + 1;
    const sameWindow = w.startMin === prevWindow.startMin && w.endMin === prevWindow.endMin;
    if (!contiguous || !sameWindow) {
      segments.push({ from: segStart, to: prev, startMin: prevWindow.startMin, endMin: prevWindow.endMin });
      segStart = d;
      prevWindow = w;
    }
    prev = d;
  }
  segments.push({ from: segStart, to: prev, startMin: prevWindow.startMin, endMin: prevWindow.endMin });

  return segments
    .map(seg => {
      const dayPart = seg.from === seg.to
        ? DAY_AR[seg.from]
        : `من ${DAY_AR[seg.from]} إلى ${DAY_AR[seg.to]}`;
      return `${dayPart} من ${fmt(seg.startMin)} إلى ${fmt(seg.endMin)}`;
    })
    .join('، ');
}
