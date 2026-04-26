/**
 * Patient Intelligence — 500 Patient Stress Test
 *
 * Runs the full AI pipeline on 500 patients and produces detailed analytics.
 * Saves output to ai-output-500-review.json for analysis.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
  }
}

import { parseCsvBuffer, getSample } from '@/services/patientIntelligence/csvParser.js';
import { analyzeDataStructure } from '@/services/patientIntelligence/dataUnderstanding.js';
import { analyzeBatch, type NormalizedPatient } from '@/services/patientIntelligence/patientAnalyzer.js';
import { generateCampaigns, type SegmentSummary } from '@/services/patientIntelligence/campaignGenerator.js';
import { loadSkillsForClinicType } from '@/services/patientIntelligence/skillLoader.js';
import { normalizePatientRow, daysSince, calculateAge } from '@/services/patientIntelligence/normalizers.js';
import { computeServiceGaps } from '@/services/patientIntelligence/serviceCycleMap.js';
import type { ContactHistorySummary } from '@/services/patientIntelligence/feedbackCollector.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const describeIf = GEMINI_API_KEY ? describe : describe.skip;

let allResults: any[] = [];
let campaigns: any[] = [];
const outputLog: Record<string, any> = {};

vi.setConfig({ testTimeout: 600000, hookTimeout: 600000 });

describeIf('500-Patient Stress Test', () => {
  it('should parse 500 patients and run full pipeline', async () => {
    const csvBuffer = readFileSync(join(FIXTURES_DIR, 'dental-clinic-500-patients.csv'));
    const parsedCsv = parseCsvBuffer(csvBuffer);
    expect(parsedCsv.totalRows).toBe(500);

    // Step 1: Data understanding
    const sample = getSample(parsedCsv, 5);
    const understanding = await analyzeDataStructure(parsedCsv.headers, sample);
    expect(understanding.clinicType).toBe('dental');
    outputLog.clinicType = understanding.clinicType;
    outputLog.columnMapping = understanding.columnMapping;
    outputLog.dataQuality = understanding.dataQuality;

    console.log('[Pipeline] Clinic type:', understanding.clinicType);
    console.log('[Pipeline] Mapped columns:', understanding.dataQuality.mappedColumns);

    // Step 2: Normalize patients
    const mapping = understanding.columnMapping;
    const allPatients: NormalizedPatient[] = parsedCsv.rows.map((row, index) => {
      const n = normalizePatientRow(row, mapping);
      const dob = n.dateOfBirth;
      const lastVisit = n.lastVisitDate;

      // Pre-compute hints
      const BASIC = new Set(['تنظيف الاسنان','فحص','فحص دوري','حشوة','أشعة','فلورايد','تلميع الاسنان','خلع الاسنان','كشف']);
      const HIGH_VAL = new Set(['فينير','تبييض الاسنان','زراعة الاسنان','تقويم الاسنان','جسر الاسنان','علاج لثة']);
      const allBasic = n.services.length > 0 && n.services.every(s => BASIC.has(s));
      const daysGone = daysSince(lastVisit);
      const upsellCandidate = allBasic && n.totalVisits >= 2 && daysGone !== null && daysGone < 180;
      const hasHighVal = n.services.some(s => HIGH_VAL.has(s));
      const lifetimeValue: 'high' | 'medium' | 'low' =
        (n.totalVisits >= 6 && hasHighVal) ? 'high' : n.totalVisits >= 4 ? 'medium' : 'low';

      return {
        index,
        name: n.name || n.nameAr || null,
        lastVisitDate: lastVisit ? lastVisit.toISOString().split('T')[0] : null,
        daysSinceLastVisit: daysGone,
        lastService: n.lastService || n.lastServiceAr || null,
        totalVisits: n.totalVisits,
        services: n.services,
        age: calculateAge(dob),
        sex: n.sex || null,
        upsellCandidate,
        lifetimeValue,
        serviceGaps: computeServiceGaps(n.services, daysGone),
      } as NormalizedPatient;
    });

    console.log('[Pipeline] Normalized', allPatients.length, 'patients');

    // Step 3: Load skills
    const skills = await loadSkillsForClinicType('dental');

    // Step 4: Batch analyze (25 per batch = 20 batches)
    // Build DNC contact history from notes in CSV
    const dncNotes = new Set<number>();
    parsedCsv.rows.forEach((row, i) => {
      const notes = row['ملاحظات'] || '';
      if (notes.includes('لا تتواصل')) dncNotes.add(i);
    });

    const contactHistory = new Map<number, ContactHistorySummary | null>();
    for (const idx of dncNotes) {
      contactHistory.set(idx, {
        totalCampaigns: 1,
        lastContactDate: new Date('2025-06-01'),
        lastResult: 'no_answer',
        totalAttempts: 2,
        isDnc: true,
        offersRedeemed: 0,
        daysSinceLastContact: 200,
        recentlyContacted: false,
        repeatedNoAnswer: false,
      });
    }

    allResults = [];
    const BATCH_SIZE = 25;
    const totalBatches = Math.ceil(allPatients.length / BATCH_SIZE);

    for (let b = 0; b < totalBatches; b++) {
      const batch = allPatients.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const batchHistory = new Map<number, ContactHistorySummary | null>();
      for (const p of batch) {
        if (contactHistory.has(p.index)) {
          batchHistory.set(p.index, contactHistory.get(p.index)!);
        }
      }

      const results = await analyzeBatch(batch, skills.content, batchHistory, 'dental');
      allResults.push(...results);
      console.log(`[Pipeline] Batch ${b + 1}/${totalBatches} analyzed (${allResults.length}/${allPatients.length})`);
    }

    expect(allResults.length).toBe(500);

    // Step 5: Build segment summaries
    const segmentMap = new Map<string, { patients: any[]; scores: number[]; services: string[]; reasonings: string[] }>();

    for (let i = 0; i < allPatients.length; i++) {
      const patient = allPatients[i];
      const result = allResults[i];
      const seg = result.segment;
      const existing = segmentMap.get(seg) || { patients: [], scores: [], services: [], reasonings: [] };
      existing.patients.push({ ...patient, ...result });
      existing.scores.push(result.score);
      if (patient.lastService) existing.services.push(patient.lastService);
      existing.services.push(...patient.services);
      existing.reasonings.push(result.reasoning);
      segmentMap.set(seg, existing);
    }

    const segments: SegmentSummary[] = Array.from(segmentMap.entries())
      .filter(([seg]) => seg !== 'do_not_contact')
      .map(([segment, data]) => {
        const serviceCounts = new Map<string, number>();
        for (const s of data.services) serviceCounts.set(s, (serviceCounts.get(s) || 0) + 1);
        const topServices = Array.from(serviceCounts.entries())
          .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
        const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        return { segment, patientCount: data.patients.length, avgScore, topServices, sampleReasonings: data.reasonings.slice(0, 5) };
      });

    console.log('[Pipeline] Segments:', segments.map(s => `${s.segment}(${s.patientCount})`).join(', '));

    // Step 6: Generate campaigns
    campaigns = await generateCampaigns(segments, skills.content, 'dental');
    console.log('[Pipeline] Generated', campaigns.length, 'campaigns');

    // ── Build detailed output ──
    // Segment stats
    const segStats: Record<string, any> = {};
    for (const [seg, data] of segmentMap.entries()) {
      const scores = data.scores;
      segStats[seg] = {
        count: data.patients.length,
        avgScore: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
        minScore: Math.min(...scores),
        maxScore: Math.max(...scores),
        topActions: (() => {
          const acts: Record<string, number> = {};
          data.patients.forEach((p: any) => { acts[p.suggestedAction] = (acts[p.suggestedAction] || 0) + 1; });
          return acts;
        })(),
      };
    }

    // Score distribution
    const scoreBuckets = { '0': 0, '1-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    for (const r of allResults) {
      if (r.score === 0) scoreBuckets['0']++;
      else if (r.score <= 20) scoreBuckets['1-20']++;
      else if (r.score <= 40) scoreBuckets['21-40']++;
      else if (r.score <= 60) scoreBuckets['41-60']++;
      else if (r.score <= 80) scoreBuckets['61-80']++;
      else scoreBuckets['81-100']++;
    }

    // Sample patients per segment (top 3 by score)
    const samplesBySegment: Record<string, any[]> = {};
    for (const [seg, data] of segmentMap.entries()) {
      samplesBySegment[seg] = data.patients
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 3)
        .map((p: any) => ({
          index: p.index, name: p.name, score: p.score,
          lastService: p.lastService, daysSinceLastVisit: p.daysSinceLastVisit,
          totalVisits: p.totalVisits, reasoning: p.reasoning,
        }));
    }

    outputLog.segmentStats = segStats;
    outputLog.scoreDistribution = scoreBuckets;
    outputLog.samplesBySegment = samplesBySegment;
    outputLog.campaigns = campaigns;
    outputLog.totalPatients = 500;
    outputLog.totalAnalyzed = allResults.length;
    outputLog.uniqueScores = new Set(allResults.map((r: any) => r.score)).size;

    // Save
    const outputPath = join(FIXTURES_DIR, 'ai-output-500-review.json');
    writeFileSync(outputPath, JSON.stringify(outputLog, null, 2), 'utf-8');
    console.log('[Pipeline] Output saved to', outputPath);
  });

  it('should have analyzed all 500 patients', () => {
    expect(allResults.length).toBe(500);
  });

  it('should score all DNC patients at 0', () => {
    const dnc = allResults.filter((r: any) => r.segment === 'do_not_contact');
    for (const r of dnc) {
      expect(r.score).toBe(0);
    }
  });

  it('should generate 3-7 campaigns', () => {
    expect(campaigns.length).toBeGreaterThanOrEqual(3);
    expect(campaigns.length).toBeLessThanOrEqual(7);
  });
});
