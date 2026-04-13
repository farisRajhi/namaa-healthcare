/**
 * Feedback Collector
 *
 * Gathers campaign history and contact outcomes for matched patients.
 * This data is injected into the AI prompt so it doesn't re-recommend
 * patients who were recently contacted or who opted out.
 */
import { PrismaClient } from '@prisma/client';

export interface ContactHistorySummary {
  totalCampaigns: number;
  lastContactDate: Date | null;
  lastResult: string | null;
  totalAttempts: number;
  isDnc: boolean;
  offersRedeemed: number;
  daysSinceLastContact: number | null;
  recentlyContacted: boolean;
  repeatedNoAnswer: boolean;
}

/**
 * Collect campaign contact history for a batch of matched patient IDs.
 */
export async function collectContactHistory(
  prisma: PrismaClient,
  orgId: string,
  patientIds: string[],
): Promise<Map<string, ContactHistorySummary>> {
  const results = new Map<string, ContactHistorySummary>();

  if (patientIds.length === 0) return results;

  // 1. Query campaign targets grouped by patient
  const targets = await prisma.campaignTarget.findMany({
    where: {
      patientId: { in: patientIds },
      campaign: { orgId },
    },
    select: {
      patientId: true,
      status: true,
      attempts: true,
      updatedAt: true,
      offerRedeemed: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  // 2. Query marketing consent (DNC check)
  const consents = await prisma.marketingConsent.findMany({
    where: {
      patientId: { in: patientIds },
      orgId,
    },
    select: {
      patientId: true,
      whatsappMarketing: true,
      smsMarketing: true,
      voiceMarketing: true,
      revokedAt: true,
    },
  });

  const consentMap = new Map<string, boolean>();
  for (const c of consents) {
    // DNC if all channels revoked or explicit revocation
    const isDnc = c.revokedAt !== null || (!c.whatsappMarketing && !c.smsMarketing && !c.voiceMarketing);
    consentMap.set(c.patientId, isDnc);
  }

  // 3. Aggregate per patient
  const patientTargets = new Map<string, typeof targets>();
  for (const t of targets) {
    if (!t.patientId) continue;
    const existing = patientTargets.get(t.patientId) || [];
    existing.push(t);
    patientTargets.set(t.patientId, existing);
  }

  const now = new Date();

  for (const patientId of patientIds) {
    const patTargets = patientTargets.get(patientId) || [];
    const isDnc = consentMap.get(patientId) || false;

    const lastTarget = patTargets[0]; // ordered by updatedAt desc
    const lastContactDate = lastTarget?.updatedAt || null;
    const daysSinceLastContact = lastContactDate
      ? Math.floor((now.getTime() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const totalAttempts = patTargets.reduce((sum, t) => sum + t.attempts, 0);
    const allNoAnswer = patTargets.length >= 3 && patTargets.every((t) => t.status === 'no_answer');

    results.set(patientId, {
      totalCampaigns: patTargets.length,
      lastContactDate,
      lastResult: lastTarget?.status || null,
      totalAttempts,
      isDnc,
      offersRedeemed: patTargets.filter((t) => t.offerRedeemed).length,
      daysSinceLastContact,
      recentlyContacted: daysSinceLastContact !== null && daysSinceLastContact < 14,
      repeatedNoAnswer: allNoAnswer,
    });
  }

  return results;
}
