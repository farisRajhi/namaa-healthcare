/**
 * Patient Intelligence Pipeline — Integration Test
 *
 * Tests the full AI pipeline with REAL Gemini API calls.
 * Requires GEMINI_API_KEY environment variable.
 * Skipped in CI — run manually with:
 *   npx vitest run __tests__/services/patientIntelligence/pipeline.integration.test.ts
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env manually (no dotenv dependency)
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}
import { parseCsvBuffer, getSample } from '@/services/patientIntelligence/csvParser.js';
import { analyzeDataStructure } from '@/services/patientIntelligence/dataUnderstanding.js';
import { analyzeBatch, type NormalizedPatient } from '@/services/patientIntelligence/patientAnalyzer.js';
import { generateCampaigns, type SegmentSummary } from '@/services/patientIntelligence/campaignGenerator.js';
import { loadSkillsForClinicType } from '@/services/patientIntelligence/skillLoader.js';
import { normalizePatientRow, daysSince, calculateAge, parseDate } from '@/services/patientIntelligence/normalizers.js';
import type { ContactHistorySummary } from '@/services/patientIntelligence/feedbackCollector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');

// Skip if no API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const describeIf = GEMINI_API_KEY ? describe : describe.skip;

// Shared state across tests (populated sequentially)
let csvBuffer: Buffer;
let parsedCsv: ReturnType<typeof parseCsvBuffer>;
let understanding: Awaited<ReturnType<typeof analyzeDataStructure>>;
let skillContent: string;
let analysisResults: Array<{ patient: NormalizedPatient; result: any }>;
let campaigns: Awaited<ReturnType<typeof generateCampaigns>>;

// Output collector for review
const outputLog: Record<string, any> = {};

describeIf('Patient Intelligence Pipeline — Integration', () => {
  beforeAll(() => {
    vi.setConfig({ testTimeout: 300000 });
    csvBuffer = readFileSync(join(FIXTURES_DIR, 'dental-clinic-patients.csv'));
  });

  // ── Step 1-2: CSV Parsing + Data Understanding ──────────────────

  describe('CSV Parsing', () => {
    it('should parse the test CSV with correct row count', () => {
      parsedCsv = parseCsvBuffer(csvBuffer);
      expect(parsedCsv.totalRows).toBe(40);
      expect(parsedCsv.headers.length).toBeGreaterThan(0);
      outputLog.csvParsing = {
        totalRows: parsedCsv.totalRows,
        headers: parsedCsv.headers,
        encoding: parsedCsv.encoding,
      };
    });

    it('should have Arabic column headers', () => {
      expect(parsedCsv.headers).toContain('اسم المريض');
      expect(parsedCsv.headers).toContain('رقم الجوال');
      expect(parsedCsv.headers).toContain('تاريخ آخر زيارة');
      expect(parsedCsv.headers).toContain('آخر خدمة');
    });
  });

  describe('AI Data Understanding', () => {
    it('should detect clinic type as dental', async () => {
      const sample = getSample(parsedCsv, 5);
      understanding = await analyzeDataStructure(parsedCsv.headers, sample);

      expect(understanding.clinicType).toBe('dental');
      outputLog.dataUnderstanding = understanding;
    });

    it('should correctly map Arabic headers to standard fields', () => {
      const mapping = understanding.columnMapping;
      // Name column should map to nameAr or name
      const nameMapping = mapping['اسم المريض'];
      expect(['name', 'nameAr']).toContain(nameMapping);

      // Phone column
      expect(mapping['رقم الجوال']).toBe('phone');

      // Last visit date
      expect(mapping['تاريخ آخر زيارة']).toBe('lastVisitDate');

      // Services
      const serviceMapping = mapping['آخر خدمة'];
      expect(['lastService', 'lastServiceAr']).toContain(serviceMapping);
    });

    it('should report data quality', () => {
      expect(understanding.dataQuality.hasPhone).toBe(true);
      expect(understanding.dataQuality.hasName).toBe(true);
      expect(understanding.dataQuality.hasVisitDate).toBe(true);
    });
  });

  // ── Step 7: Patient Analysis with GPT-4o ────────────────────────

  describe('AI Patient Analysis', () => {
    let allPatients: NormalizedPatient[];
    let allResults: any[];

    it('should analyze all 40 patients in batches', async () => {
      const skills = await loadSkillsForClinicType('dental');
      skillContent = skills.content;

      // Normalize all patients
      const mapping = understanding.columnMapping;
      allPatients = parsedCsv.rows.map((row, index) => {
        const normalized = normalizePatientRow(row, mapping);
        const dob = normalized.dateOfBirth;
        const lastVisit = normalized.lastVisitDate;

        // Pre-compute hints
        const BASIC = new Set(['تنظيف الاسنان','فحص','فحص دوري','حشوة','أشعة','فلورايد','تلميع الاسنان','خلع الاسنان','كشف']);
        const HIGH_VAL = new Set(['فينير','تبييض الاسنان','زراعة الاسنان','تقويم الاسنان','جسر الاسنان','علاج لثة']);
        const allBasic = normalized.services.length > 0 && normalized.services.every(s => BASIC.has(s));
        const daysGone = daysSince(lastVisit);
        const upsellCandidate = allBasic && normalized.totalVisits >= 2 && daysGone !== null && daysGone < 180;
        const hasHighVal = normalized.services.some(s => HIGH_VAL.has(s));
        const lifetimeValue: 'high' | 'medium' | 'low' =
          (normalized.totalVisits >= 6 && hasHighVal) ? 'high' : normalized.totalVisits >= 4 ? 'medium' : 'low';

        return {
          index,
          name: normalized.name || normalized.nameAr || null,
          lastVisitDate: lastVisit ? lastVisit.toISOString().split('T')[0] : null,
          daysSinceLastVisit: daysGone,
          lastService: normalized.lastService || normalized.lastServiceAr || null,
          totalVisits: normalized.totalVisits,
          services: normalized.services,
          age: calculateAge(dob),
          sex: normalized.sex || null,
          upsellCandidate,
          lifetimeValue,
        } as NormalizedPatient;
      });

      // Create DNC contact history for patients with DNC notes (indices 35-39)
      const contactHistory = new Map<number, ContactHistorySummary | null>();
      // Patients 35-39 are DNC in our CSV
      for (let i = 35; i < 40; i++) {
        contactHistory.set(i, {
          totalCampaigns: 2,
          lastContactDate: new Date('2025-12-01'),
          lastResult: 'no_answer',
          totalAttempts: 3,
          isDnc: true,
          offersRedeemed: 0,
          daysSinceLastContact: 100,
          recentlyContacted: false,
          repeatedNoAnswer: false,
        });
      }

      // Analyze in batches of 25
      allResults = [];
      const BATCH_SIZE = 25;
      for (let i = 0; i < allPatients.length; i += BATCH_SIZE) {
        const batch = allPatients.slice(i, i + BATCH_SIZE);
        const batchHistory = new Map<number, ContactHistorySummary | null>();
        for (const p of batch) {
          if (contactHistory.has(p.index)) {
            batchHistory.set(p.index, contactHistory.get(p.index)!);
          }
        }

        const results = await analyzeBatch(batch, skillContent, batchHistory, 'dental');
        allResults.push(...results);
      }

      expect(allResults.length).toBe(40);
      analysisResults = allPatients.map((patient, i) => ({
        patient,
        result: allResults[i],
      }));

      outputLog.patientAnalysis = analysisResults.map((r) => ({
        index: r.patient.index,
        name: r.patient.name,
        lastService: r.patient.lastService,
        daysSinceLastVisit: r.patient.daysSinceLastVisit,
        totalVisits: r.patient.totalVisits,
        aiScore: r.result.score,
        aiSegment: r.result.segment,
        aiAction: r.result.suggestedAction,
        aiReasoning: r.result.reasoning,
      }));
    });

    it('should score DNC patients at exactly 0', () => {
      // Patients 35-39 are DNC
      for (let i = 35; i < 40; i++) {
        const result = allResults[i];
        expect(result.score, `Patient ${i} (DNC) should score 0`).toBe(0);
        expect(result.segment).toBe('do_not_contact');
        expect(result.suggestedAction).toBe('do_not_contact');
      }
    });

    it('should score needs_followup (root canal) patients >= 70', () => {
      // Patients 11-15 had root canal recently
      for (let i = 11; i <= 15; i++) {
        const result = allResults[i];
        expect(
          result.score,
          `Patient ${i} (root canal) score ${result.score} should be >= 70`
        ).toBeGreaterThanOrEqual(70);
      }
    });

    it('should score overdue_routine patients between 40-90', () => {
      // Patients 0-4 are cleaning overdue 5-7 months
      for (let i = 0; i <= 4; i++) {
        const result = allResults[i];
        expect(
          result.score,
          `Patient ${i} (overdue routine) score ${result.score} should be 40-90`
        ).toBeGreaterThanOrEqual(40);
        expect(result.score).toBeLessThanOrEqual(90);
      }
    });

    it('should assign valid segments to all patients', () => {
      const validSegments = [
        'overdue_routine', 'lapsed_long', 'needs_followup',
        'high_value_inactive', 'new_patient_dropout',
        'seasonal_candidate', 'upsell_candidate', 'do_not_contact',
      ];

      for (const result of allResults) {
        expect(validSegments, `Invalid segment: ${result.segment}`).toContain(result.segment);
      }
    });

    it('should assign valid actions to all patients', () => {
      const validActions = ['recall', 'offer', 'reminder', 'upsell', 'do_not_contact'];
      for (const result of allResults) {
        expect(validActions, `Invalid action: ${result.suggestedAction}`).toContain(result.suggestedAction);
      }
    });

    it('should provide Arabic reasoning for every patient', () => {
      for (const result of allResults) {
        expect(result.reasoning).toBeTruthy();
        expect(result.reasoning.length).toBeGreaterThan(5);
      }
    });
  });

  // ── Step 8-9: Campaign Generation ───────────────────────────────

  describe('AI Campaign Generation', () => {
    it('should generate 3-7 campaigns from segment summaries', async () => {
      // Build segment summaries from analysis results
      const segmentMap = new Map<string, {
        patients: any[];
        scores: number[];
        services: string[];
        reasonings: string[];
      }>();

      for (const { patient, result } of analysisResults) {
        const seg = result.segment;
        const existing = segmentMap.get(seg) || {
          patients: [], scores: [], services: [], reasonings: [],
        };
        existing.patients.push(patient);
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
          for (const s of data.services) {
            serviceCounts.set(s, (serviceCounts.get(s) || 0) + 1);
          }
          const topServices = Array.from(serviceCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name);

          const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;

          return {
            segment,
            patientCount: data.patients.length,
            avgScore,
            topServices,
            sampleReasonings: data.reasonings.slice(0, 3),
          };
        });

      campaigns = await generateCampaigns(segments, skillContent, 'dental');

      expect(campaigns.length).toBeGreaterThanOrEqual(3);
      expect(campaigns.length).toBeLessThanOrEqual(7);

      outputLog.campaigns = campaigns.map((c) => ({
        name: c.name,
        nameAr: c.nameAr,
        type: c.type,
        segment: c.segment,
        segmentDescAr: c.segmentDescAr,
        scriptAr: c.scriptAr,
        scriptEn: c.scriptEn,
        channelSequence: c.channelSequence,
        suggestedOfferType: c.suggestedOfferType,
        suggestedDiscount: c.suggestedDiscount,
        priority: c.priority,
        confidenceScore: c.confidenceScore,
        reasoning: c.reasoning,
        reasoningAr: c.reasoningAr,
      }));
    });

    it('should NOT generate a campaign for do_not_contact segment', () => {
      const dncCampaigns = campaigns.filter((c) => c.segment === 'do_not_contact');
      expect(dncCampaigns.length).toBe(0);
    });

    it('should include {patient_name} in all Arabic scripts', () => {
      for (const c of campaigns) {
        expect(
          c.scriptAr,
          `Campaign "${c.name}" missing {patient_name} in Arabic script`
        ).toContain('{patient_name}');
      }
    });

    it('should include a CTA in all Arabic scripts', () => {
      const ctaPatterns = ['للحجز', 'أرسل', 'اضغط', 'احجز', 'تواصل', 'اتصل', 'حجز', 'رابط'];
      for (const c of campaigns) {
        const hasCta = ctaPatterns.some((pattern) => c.scriptAr.includes(pattern));
        expect(hasCta, `Campaign "${c.name}" missing CTA in Arabic script: ${c.scriptAr}`).toBe(true);
      }
    });

    it('should use WhatsApp as primary channel', () => {
      for (const c of campaigns) {
        expect(c.channelSequence[0]).toBe('whatsapp');
      }
    });

    it('should have bilingual scripts', () => {
      for (const c of campaigns) {
        expect(c.scriptAr.length, `Campaign "${c.name}" missing Arabic script`).toBeGreaterThan(10);
        expect(c.scriptEn.length, `Campaign "${c.name}" missing English script`).toBeGreaterThan(10);
      }
    });

    it('should have valid priority and confidence ranges', () => {
      for (const c of campaigns) {
        expect(c.priority).toBeGreaterThanOrEqual(1);
        expect(c.priority).toBeLessThanOrEqual(100);
        expect(c.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(c.confidenceScore).toBeLessThanOrEqual(1);
      }
    });

    it('should have valid campaign types', () => {
      const validTypes = ['recall', 'preventive', 'follow_up', 'promotional', 're_engagement'];
      for (const c of campaigns) {
        expect(validTypes, `Invalid type: ${c.type}`).toContain(c.type);
      }
    });

    it('should sort campaigns by priority descending', () => {
      for (let i = 1; i < campaigns.length; i++) {
        expect(campaigns[i - 1].priority).toBeGreaterThanOrEqual(campaigns[i].priority);
      }
    });
  });

  // ── Save output for review ──────────────────────────────────────

  describe('Output Logging', () => {
    it('should save AI output to JSON for manual review', () => {
      try {
        mkdirSync(FIXTURES_DIR, { recursive: true });
      } catch {}
      const outputPath = join(FIXTURES_DIR, 'ai-output-review.json');
      writeFileSync(outputPath, JSON.stringify(outputLog, null, 2), 'utf-8');
      expect(true).toBe(true); // Always passes — just saves the file
    });
  });
});
