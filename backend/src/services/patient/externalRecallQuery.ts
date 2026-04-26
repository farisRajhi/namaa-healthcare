/**
 * External Recall Query
 *
 * Reads ExternalPatient rows (CSV uploads via Patient Intelligence) and returns
 * recall-shaped DTOs compatible with the native ServiceCycleSuggestion response.
 *
 * Runs at query time (no writes). The unified list endpoint calls this alongside
 * the native query and merges both sources.
 */
import type { PrismaClient } from '@prisma/client';
import { getServiceCycle } from '../patientIntelligence/serviceCycleMap.js';

export interface ExternalRecallRow {
  source: 'external';
  id: string;
  patientName: string;
  phone: string;
  serviceName: string | null;
  serviceNameEn: string | null;
  lastCompletedAt: Date | null;
  dueAt: Date;
  overdueDays: number;
  score: number;
  reliability: {
    totalVisits: number;
    completionRate: number | null;
    noShowCount: number;
  };
  status: string;
}

const CLINIC_TYPE_DEFAULT_CYCLE_DAYS: Record<string, number> = {
  dental: 180,
  cosmetic: 90,
  dermatology: 90,
  general: 180,
  medical: 180,
};

const FALLBACK_CYCLE_DAYS = 180;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DUE_WINDOW_DAYS = 14;

export async function getExternalRecallRows(
  prisma: PrismaClient,
  orgId: string,
): Promise<ExternalRecallRow[]> {
  const patients = await prisma.externalPatient.findMany({
    where: {
      orgId,
      phone: { not: null },
      lastVisitDate: { not: null },
      matchedPatientId: null,
      OR: [{ recallStatus: null }, { recallStatus: 'pending' }],
    },
    include: {
      analysis: { select: { clinicType: true } },
    },
  });

  const now = new Date();
  const rows: ExternalRecallRow[] = [];

  for (const p of patients) {
    if (!p.phone || !p.lastVisitDate) continue;

    const primaryService = p.lastService ?? p.services[0] ?? null;
    let cycleDays: number | null = null;
    let serviceNameEn: string | null = null;

    if (primaryService) {
      const cycle = getServiceCycle(primaryService);
      if (cycle?.cycleDays) {
        cycleDays = cycle.cycleDays;
        serviceNameEn = cycle.nameEn;
      }
    }

    if (!cycleDays) {
      const clinicType = p.analysis?.clinicType?.toLowerCase() ?? '';
      cycleDays = CLINIC_TYPE_DEFAULT_CYCLE_DAYS[clinicType] ?? FALLBACK_CYCLE_DAYS;
    }

    const dueAt = new Date(p.lastVisitDate.getTime() + cycleDays * MS_PER_DAY);
    const overdueDays = Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / MS_PER_DAY));
    const daysUntilDue = Math.floor((dueAt.getTime() - now.getTime()) / MS_PER_DAY);

    if (daysUntilDue > DUE_WINDOW_DAYS) continue;

    rows.push({
      source: 'external',
      id: p.externalPatientId,
      patientName: p.nameAr ?? p.name ?? 'Unknown',
      phone: p.phone,
      serviceName: primaryService,
      serviceNameEn,
      lastCompletedAt: p.lastVisitDate,
      dueAt,
      overdueDays,
      score: p.aiScore ?? 50,
      reliability: {
        totalVisits: p.totalVisits,
        completionRate: null,
        noShowCount: 0,
      },
      status: p.recallStatus ?? 'pending',
    });
  }

  return rows;
}

export async function countExternalRecallRows(
  prisma: PrismaClient,
  orgId: string,
): Promise<number> {
  const rows = await getExternalRecallRows(prisma, orgId);
  return rows.length;
}
