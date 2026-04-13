/**
 * Data Understanding — AI Step 1
 *
 * Sends a 5-row sample of imported CSV data to Gemini to:
 *   1. Map CSV columns → standard patient fields
 *   2. Detect clinic type from service names
 *   3. Assess data quality (missing critical fields, warnings)
 */
import { geminiJsonChat, type GeminiConfig } from './geminiClient.js';

// ── Types ────────────────────────────────────────────────────────────

export interface DataUnderstandingResult {
  columnMapping: Record<string, string>; // csvColumn → standardField
  clinicType: string;
  dataQuality: {
    totalColumns: number;
    mappedColumns: number;
    hasPhone: boolean;
    hasName: boolean;
    hasVisitDate: boolean;
    hasServices: boolean;
    warnings: string[];
  };
}

interface AIResponse {
  columnMapping: Record<string, string>;
  clinicType: string;
  warnings?: string[];
}

// ── Standard fields the AI can map to ────────────────────────────────

const STANDARD_FIELDS = [
  'name',
  'nameAr',
  'phone',
  'email',
  'dateOfBirth',
  'sex',
  'lastVisitDate',
  'lastService',
  'lastServiceAr',
  'totalVisits',
  'services',
  'externalId',
  'notes',
  'ignore',
] as const;

const VALID_CLINIC_TYPES = [
  'dental',
  'dermatology',
  'cosmetic',
  'ophthalmology',
  'pediatrics',
  'orthopedic',
  'general',
] as const;

// ── System prompt ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a data analyst for a Saudi healthcare CRM.

Your task is to analyze CSV column headers and sample data rows, then:
1. Map each CSV column to ONE of these standard fields:
   name, nameAr, phone, email, dateOfBirth, sex, lastVisitDate, lastService, lastServiceAr, totalVisits, services, externalId, notes
   If a column does not match any standard field, map it to "ignore".

2. Detect the clinic type from service/procedure names found in the data.
   Valid clinic types: dental, dermatology, cosmetic, ophthalmology, pediatrics, orthopedic, general
   If uncertain, default to "general".

3. Report any data quality warnings (e.g., missing phone numbers, no visit dates).

Rules:
- Handle Arabic column names. Common mappings:
  "اسم المريض" or "الاسم" = name or nameAr
  "رقم الجوال" or "رقم الهاتف" = phone
  "البريد الإلكتروني" = email
  "تاريخ الميلاد" = dateOfBirth
  "الجنس" = sex
  "آخر زيارة" or "تاريخ آخر زيارة" = lastVisitDate
  "آخر خدمة" = lastService or lastServiceAr
  "عدد الزيارات" = totalVisits
  "الخدمات" = services
  "ملاحظات" = notes
  "رقم المريض" or "المعرف" = externalId
- A column with Arabic patient names should map to "nameAr", English names to "name".
  If a column mixes both, prefer "name".
- "services" is a comma-separated list of all services; "lastService" is the single most recent.
- Each CSV column must appear exactly once in the mapping.

Respond ONLY with a JSON object in this exact format:
{
  "columnMapping": { "<csvColumnName>": "<standardField>", ... },
  "clinicType": "<clinicType>",
  "warnings": ["<warning1>", ...]
}`;

// ── Main function ────────────────────────────────────────────────────

/**
 * Analyze CSV structure by sending headers + sample rows to Gemini.
 *
 * @param geminiConfig - Gemini API configuration
 * @param headers      - CSV column header names
 * @param sampleRows   - Up to 5 rows as key-value objects
 * @returns Column mapping, clinic type, and data quality assessment
 */
export async function analyzeDataStructure(
  geminiConfig: GeminiConfig,
  headers: string[],
  sampleRows: Record<string, string>[],
): Promise<DataUnderstandingResult> {
  // Format the sample data for the AI prompt
  const headerLine = `Columns: ${headers.join(' | ')}`;
  const rowLines = sampleRows.map((row, i) => {
    const values = headers.map((h) => row[h] ?? '').join(' | ');
    return `Row ${i + 1}: ${values}`;
  });

  const userPrompt = `Analyze this CSV data and map each column to a standard patient field.\n\n${headerLine}\n${rowLines.join('\n')}`;

  try {
    const content = await geminiJsonChat(geminiConfig, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.1,
    });

    const parsed: AIResponse = JSON.parse(content);

    // Validate and sanitize the column mapping
    const columnMapping: Record<string, string> = {};
    for (const header of headers) {
      const mapped = parsed.columnMapping?.[header];
      if (mapped && (STANDARD_FIELDS as readonly string[]).includes(mapped)) {
        columnMapping[header] = mapped;
      } else {
        columnMapping[header] = 'ignore';
      }
    }

    // Validate clinic type
    const clinicType = (VALID_CLINIC_TYPES as readonly string[]).includes(parsed.clinicType)
      ? parsed.clinicType
      : 'general';

    // Derive data quality from the final mapping
    const mappedValues = Object.values(columnMapping);
    const mappedColumns = mappedValues.filter((v) => v !== 'ignore').length;

    const dataQuality = {
      totalColumns: headers.length,
      mappedColumns,
      hasPhone: mappedValues.includes('phone'),
      hasName: mappedValues.includes('name') || mappedValues.includes('nameAr'),
      hasVisitDate: mappedValues.includes('lastVisitDate'),
      hasServices: mappedValues.includes('services') || mappedValues.includes('lastService') || mappedValues.includes('lastServiceAr'),
      warnings: parsed.warnings || [],
    };

    // Add our own warnings for critical missing fields
    if (!dataQuality.hasPhone) {
      dataQuality.warnings.push('No phone number column detected — patients cannot be contacted');
    }
    if (!dataQuality.hasName) {
      dataQuality.warnings.push('No patient name column detected');
    }
    if (!dataQuality.hasVisitDate) {
      dataQuality.warnings.push('No visit date column detected — recency scoring will be limited');
    }

    return { columnMapping, clinicType, dataQuality };
  } catch (error) {
    console.error('[DataUnderstanding] Gemini analysis failed:', error);

    // Return a best-effort fallback: map nothing, flag everything
    const columnMapping: Record<string, string> = {};
    for (const header of headers) {
      columnMapping[header] = 'ignore';
    }

    return {
      columnMapping,
      clinicType: 'general',
      dataQuality: {
        totalColumns: headers.length,
        mappedColumns: 0,
        hasPhone: false,
        hasName: false,
        hasVisitDate: false,
        hasServices: false,
        warnings: ['AI analysis failed — manual column mapping required'],
      },
    };
  }
}
