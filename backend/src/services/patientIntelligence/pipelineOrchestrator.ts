/**
 * Pipeline Orchestrator — Central Coordinator
 *
 * Runs the full 3-step Patient Intelligence AI pipeline asynchronously:
 *   1. Parse CSV → Data Understanding (column mapping + clinic type)
 *   2. Normalize patients → Match → Analyze in batches
 *   3. Generate campaigns from segment summaries
 *
 * Updates ExternalAnalysis progress at each step so the frontend can
 * show a real-time progress bar.
 */
import { PrismaClient } from '@prisma/client';
import { parseCsvBuffer, getSample, formatSampleForPrompt } from './csvParser.js';
import { analyzeDataStructure } from './dataUnderstanding.js';
import { analyzeBatch, type NormalizedPatient } from './patientAnalyzer.js';
import { generateCampaigns, type SegmentSummary } from './campaignGenerator.js';
import { checkLimit, recordUsage, resolveOrgPlan, AI_LIMIT_ERROR } from '../usage/aiUsageLimiter.js';
import { matchPatientsByPhone } from './patientMatcher.js';
import { collectContactHistory, type ContactHistorySummary } from './feedbackCollector.js';
import { loadSkillsForClinicType } from './skillLoader.js';
import { normalizePatientRow, daysSince, calculateAge } from './normalizers.js';
import { computeServiceGaps } from './serviceCycleMap.js';

// ── Batch size for patient analysis ──────────────────────────────────

const ANALYSIS_BATCH_SIZE = 25;

// ── Progress updater ────────────────────────────────────────────────

async function updateProgress(
  prisma: PrismaClient,
  analysisId: string,
  status: string,
  progress: number,
  currentStep: string,
): Promise<void> {
  await prisma.externalAnalysis.update({
    where: { analysisId },
    data: {
      status,
      progress: Math.round(progress),
      currentStep,
    },
  });
}

// ── Main pipeline ───────────────────────────────────────────────────

/**
 * Run the full Patient Intelligence pipeline.
 *
 * This function is designed to be called asynchronously (fire-and-forget)
 * after a CSV upload. It updates the ExternalAnalysis record's progress
 * at each step so the frontend can poll for status.
 *
 * LLM provider for each step is resolved via llmRouter (env-configurable).
 *
 * @param prisma       - Prisma client instance
 * @param analysisId   - The ExternalAnalysis record ID
 * @param csvBuffer    - Raw CSV file contents
 */
export async function runPipeline(
  prisma: PrismaClient,
  analysisId: string,
  csvBuffer: Buffer,
): Promise<void> {
  let tokensUsed = 0;
  let aiCalls = 0;

  try {
    // Fetch the analysis record to get orgId
    const analysis = await prisma.externalAnalysis.findUniqueOrThrow({
      where: { analysisId },
    });
    const { orgId } = analysis;

    // ── Subscription token budget guard ───────────────────────────
    // A full pipeline run can easily consume tens of thousands of tokens
    // across the 3 AI steps. If the org is already over budget for the
    // month, abort early with a clear error. resolveOrgPlan maps trialing
    // orgs to Professional so they get their promised 100M budget.
    const plan = await resolveOrgPlan(prisma, orgId);
    const budgetCheck = await checkLimit(prisma, orgId, plan);
    if (!budgetCheck.allowed) {
      await prisma.externalAnalysis.update({
        where: { analysisId },
        data: {
          status: 'failed',
          currentStep: AI_LIMIT_ERROR.en,
          progress: 0,
        },
      });
      return;
    }

    // ── Step 1: Parse CSV (0→5%) ──────────────────────────────────
    await updateProgress(prisma, analysisId, 'parsing', 0, 'Parsing CSV file');

    const parsed = parseCsvBuffer(csvBuffer);

    await prisma.externalAnalysis.update({
      where: { analysisId },
      data: { rowCount: parsed.totalRows },
    });

    await updateProgress(prisma, analysisId, 'analyzing', 5, 'CSV parsed — analyzing data structure');

    // ── Step 2: AI Data Understanding (5→15%) ─────────────────────
    const sample = getSample(parsed, 5);
    const understanding = await analyzeDataStructure(parsed.headers, sample);
    aiCalls++;
    tokensUsed += understanding.tokensUsed;
    if (understanding.tokensUsed > 0) {
      await recordUsage(prisma, orgId, {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: understanding.tokensUsed,
      });
    }

    await prisma.externalAnalysis.update({
      where: { analysisId },
      data: {
        columnMapping: understanding.columnMapping,
        clinicType: understanding.clinicType,
        dataQuality: understanding.dataQuality,
      },
    });

    await updateProgress(prisma, analysisId, 'analyzing', 15, `Detected ${understanding.clinicType} clinic — normalizing patients`);

    // ── Step 3: Normalize and save patients (15→25%) ──────────────
    const mapping = understanding.columnMapping;
    const normalizedRows = parsed.rows.map((row, index) => {
      const normalized = normalizePatientRow(row, mapping);
      return {
        analysisId,
        orgId,
        rowIndex: index,
        rawData: row,
        ...normalized,
      };
    });

    // Batch insert with createMany (Prisma handles chunking internally).
    // skipDuplicates lets the pipeline be safely re-run after a partial-failure crash —
    // already-inserted rows are ignored on retry instead of throwing P2002.
    await prisma.externalPatient.createMany({
      data: normalizedRows,
      skipDuplicates: true,
    });

    const totalPatients = normalizedRows.length;
    await prisma.externalAnalysis.update({
      where: { analysisId },
      data: { totalPatients },
    });

    await updateProgress(prisma, analysisId, 'analyzing', 25, `${totalPatients} patients normalized — matching to existing records`);

    // ── Step 4: Match patients by phone (25→30%) ──────────────────
    const externalPatients = await prisma.externalPatient.findMany({
      where: { analysisId },
      select: { externalPatientId: true, phone: true },
    });

    const matchInput = externalPatients.map((ep) => ({
      externalPatientId: ep.externalPatientId,
      phone: ep.phone,
    }));

    const matches = await matchPatientsByPhone(prisma, orgId, matchInput);

    // Update matched patients in a single transaction so a partial failure can't leave
    // some patients flagged as matched while others are dropped.
    const matchUpdates = Array.from(matches.entries()).map(([extId, match]) =>
      prisma.externalPatient.update({
        where: { externalPatientId: extId },
        data: {
          matchedPatientId: match.patientId,
          matchConfidence: match.confidence,
        },
      }),
    );
    if (matchUpdates.length > 0) {
      await prisma.$transaction(matchUpdates);
    }

    await updateProgress(prisma, analysisId, 'analyzing', 30, `${matches.size} patients matched — collecting contact history`);

    // ── Step 5: Collect feedback for matched patients (30→35%) ────
    const matchedPatientIds = Array.from(matches.values()).map((m) => m.patientId);
    const contactHistoryMap = await collectContactHistory(prisma, orgId, matchedPatientIds);

    // Update ExternalPatient records with contact history
    for (const [extId, match] of matches.entries()) {
      const history = contactHistoryMap.get(match.patientId);
      if (history) {
        await prisma.externalPatient.update({
          where: { externalPatientId: extId },
          data: {
            previousCampaigns: history.totalCampaigns,
            lastCampaignDate: history.lastContactDate,
            lastCampaignResult: history.lastResult,
          },
        });
      }
    }

    await updateProgress(prisma, analysisId, 'analyzing', 35, 'Loading domain knowledge skills');

    // ── Step 6: Load skills (35→40%) ──────────────────────────────
    const skills = await loadSkillsForClinicType(understanding.clinicType);

    await prisma.externalAnalysis.update({
      where: { analysisId },
      data: { skillsLoaded: skills.names },
    });

    await updateProgress(prisma, analysisId, 'analyzing', 40, 'AI analyzing patients in batches');

    // ── Step 7: AI Patient Analysis in batches (40→75%) ───────────
    const allExternalPatients = await prisma.externalPatient.findMany({
      where: { analysisId },
    });

    const totalBatches = Math.ceil(allExternalPatients.length / ANALYSIS_BATCH_SIZE);
    let patientsAnalyzed = 0;

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * ANALYSIS_BATCH_SIZE;
      const batchEnd = Math.min(batchStart + ANALYSIS_BATCH_SIZE, allExternalPatients.length);
      const batch = allExternalPatients.slice(batchStart, batchEnd);

      // Build NormalizedPatient objects for the analyzer, keyed by index
      // We use rowIndex as the patient index for the AI analyzer
      const indexToExternalId = new Map<number, string>();

      // Services that indicate basic-only patients (upsell candidates)
      const BASIC_SERVICES = new Set([
        'تنظيف الاسنان', 'فحص', 'فحص دوري', 'حشوة', 'أشعة',
        'فلورايد', 'تلميع الاسنان', 'خلع الاسنان', 'كشف',
      ]);
      // Services that indicate high-value patients
      const HIGH_VALUE_SERVICES = new Set([
        'فينير', 'تبييض الاسنان', 'زراعة الاسنان', 'تقويم الاسنان',
        'جسر الاسنان', 'علاج لثة',
      ]);

      const normalizedBatch: NormalizedPatient[] = batch.map((ep) => {
        const dob = ep.dateOfBirth ? new Date(ep.dateOfBirth) : null;
        const lastVisit = ep.lastVisitDate ? new Date(ep.lastVisitDate) : null;

        indexToExternalId.set(ep.rowIndex, ep.externalPatientId);

        // Pre-compute upsell hint: patient has ONLY basic services
        const allBasic = ep.services.length > 0 && ep.services.every((s) => BASIC_SERVICES.has(s));
        const upsellCandidate = allBasic && ep.totalVisits >= 2 && daysSince(lastVisit) !== null && daysSince(lastVisit)! < 180;

        // Pre-compute lifetime value
        const hasHighValueService = ep.services.some((s) => HIGH_VALUE_SERVICES.has(s));
        const lifetimeValue: 'high' | 'medium' | 'low' =
          (ep.totalVisits >= 6 && hasHighValueService) ? 'high' :
          (ep.totalVisits >= 4) ? 'medium' : 'low';

        return {
          index: ep.rowIndex,
          name: ep.name || ep.nameAr || null,
          lastVisitDate: ep.lastVisitDate ? ep.lastVisitDate.toISOString().split('T')[0] : null,
          daysSinceLastVisit: daysSince(lastVisit),
          lastService: ep.lastService || ep.lastServiceAr || null,
          totalVisits: ep.totalVisits,
          services: ep.services,
          age: calculateAge(dob),
          sex: ep.sex || null,
          upsellCandidate,
          lifetimeValue,
          serviceGaps: computeServiceGaps(ep.services, daysSince(lastVisit)),
        };
      });

      // Build contact history map keyed by patient index (rowIndex)
      const batchContactHistory = new Map<number, ContactHistorySummary | null>();
      for (const ep of batch) {
        if (ep.matchedPatientId) {
          const history = contactHistoryMap.get(ep.matchedPatientId) || null;
          batchContactHistory.set(ep.rowIndex, history);
        }
      }

      // Call the AI analyzer
      const { results: batchResults, tokensUsed: batchTokens } = await analyzeBatch(
        normalizedBatch,
        skills.content,
        batchContactHistory,
        understanding.clinicType,
      );
      aiCalls++;
      tokensUsed += batchTokens;
      if (batchTokens > 0) {
        await recordUsage(prisma, orgId, {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: batchTokens,
        });
      }

      // Update ExternalPatient records with AI results
      const batchUpdates = batchResults.map((result) => {
        const externalPatientId = indexToExternalId.get(result.patientIndex);
        if (!externalPatientId) return null;

        return prisma.externalPatient.update({
          where: { externalPatientId },
          data: {
            aiScore: result.score,
            aiReasoning: result.reasoning,
            aiSegment: result.segment,
            aiSuggestedAction: result.suggestedAction,
          },
        });
      }).filter((u): u is NonNullable<typeof u> => u !== null);

      await Promise.all(batchUpdates);

      patientsAnalyzed += batch.length;

      // Update progress proportionally: 40 + (batchIndex / totalBatches * 35)
      const batchProgress = 40 + ((batchIndex + 1) / totalBatches) * 35;
      await prisma.externalAnalysis.update({
        where: { analysisId },
        data: { patientsAnalyzed },
      });
      await updateProgress(
        prisma,
        analysisId,
        'analyzing',
        batchProgress,
        `Analyzed ${patientsAnalyzed}/${totalPatients} patients`,
      );
    }

    await updateProgress(prisma, analysisId, 'generating', 75, 'Building segment summaries for campaign generation');

    // ── Step 8: AI Campaign Generation (75→90%) ──────────────────
    // Build segment summaries from analyzed patients
    const analyzedPatients = await prisma.externalPatient.findMany({
      where: { analysisId, aiSegment: { not: null } },
    });

    const segmentMap = new Map<string, {
      patients: typeof analyzedPatients;
      scores: number[];
      services: string[];
      reasonings: string[];
    }>();

    for (const p of analyzedPatients) {
      const segment = p.aiSegment!;
      const existing = segmentMap.get(segment) || {
        patients: [],
        scores: [],
        services: [],
        reasonings: [],
      };
      existing.patients.push(p);
      if (p.aiScore !== null) existing.scores.push(p.aiScore);
      if (p.lastService) existing.services.push(p.lastService);
      if (p.lastServiceAr) existing.services.push(p.lastServiceAr);
      existing.services.push(...p.services);
      if (p.aiReasoning) existing.reasonings.push(p.aiReasoning);
      segmentMap.set(segment, existing);
    }

    const segments: SegmentSummary[] = Array.from(segmentMap.entries()).map(([segment, data]) => {
      // Count service frequencies and pick top 5
      const serviceCounts = new Map<string, number>();
      for (const s of data.services) {
        serviceCounts.set(s, (serviceCounts.get(s) || 0) + 1);
      }
      const topServices = Array.from(serviceCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);

      const avgScore = data.scores.length > 0
        ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
        : 0;

      return {
        segment,
        patientCount: data.patients.length,
        avgScore,
        topServices,
        sampleReasonings: data.reasonings.slice(0, 5),
      };
    });

    await updateProgress(prisma, analysisId, 'generating', 80, `Generating campaigns for ${segments.length} segments`);

    const { campaigns, tokensUsed: campaignTokens } = await generateCampaigns(segments, skills.content, understanding.clinicType);
    aiCalls++;
    tokensUsed += campaignTokens;
    if (campaignTokens > 0) {
      await recordUsage(prisma, orgId, {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: campaignTokens,
      });
    }

    await updateProgress(prisma, analysisId, 'saving', 90, 'Saving campaign suggestions');

    // ── Step 9: Save suggestions (90→95%) ────────────────────────
    for (const campaign of campaigns) {
      // Find patient IDs belonging to this campaign's segment
      const segmentData = segmentMap.get(campaign.segment);
      const patientIds = segmentData
        ? segmentData.patients.map((p) => p.externalPatientId)
        : [];

      await prisma.aICampaignSuggestion.create({
        data: {
          analysisId,
          orgId,
          name: campaign.name,
          nameAr: campaign.nameAr,
          type: campaign.type,
          segment: campaign.segment,
          segmentDescAr: campaign.segmentDescAr,
          segmentDescEn: campaign.segmentDescEn,
          scriptAr: campaign.scriptAr,
          scriptEn: campaign.scriptEn,
          patientCount: patientIds.length,
          patientIds,
          channelSequence: campaign.channelSequence,
          reasoning: campaign.reasoning,
          reasoningAr: campaign.reasoningAr,
          expectedOutcome: campaign.expectedOutcome,
          priority: campaign.priority,
          confidenceScore: campaign.confidenceScore,
          suggestedOfferType: campaign.suggestedOfferType,
          suggestedDiscount: campaign.suggestedDiscount,
        },
      });
    }

    await updateProgress(prisma, analysisId, 'completing', 95, 'Finalizing analysis');

    // ── Step 10: Complete (95→100%) ──────────────────────────────
    await prisma.externalAnalysis.update({
      where: { analysisId },
      data: {
        status: 'completed',
        progress: 100,
        currentStep: 'Analysis complete',
        suggestionsCount: campaigns.length,
        tokensUsed,
        aiCalls,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(`[PipelineOrchestrator] Pipeline failed for analysis ${analysisId}:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown pipeline error';

    try {
      await prisma.externalAnalysis.update({
        where: { analysisId },
        data: {
          status: 'failed',
          errorMessage,
          tokensUsed,
          aiCalls,
        },
      });
    } catch (updateError) {
      // If we can't even update the failure status, log it
      console.error('[PipelineOrchestrator] Failed to update error status:', updateError);
    }
  }
}
