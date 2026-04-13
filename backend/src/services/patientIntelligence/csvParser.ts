/**
 * CSV Parser for Patient Intelligence
 *
 * Parses CSV files from any clinic system (Arabic or English headers),
 * detects encoding, normalizes data, and returns structured rows.
 */
import Papa from 'papaparse';
import iconv from 'iconv-lite';

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  encoding: string;
}

/**
 * Detect if buffer uses Windows-1256 (common Arabic encoding) or UTF-8.
 */
function detectEncoding(buffer: Buffer): string {
  // Check for UTF-8 BOM
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf-8';
  }

  // Try UTF-8 decode — if it produces replacement characters, likely Windows-1256
  const utf8Text = buffer.toString('utf-8');
  const replacementCount = (utf8Text.match(/\uFFFD/g) || []).length;

  if (replacementCount > utf8Text.length * 0.01) {
    return 'windows-1256';
  }

  return 'utf-8';
}

/**
 * Parse a CSV buffer into structured data.
 * Handles Arabic/English headers, BOM, and various encodings.
 */
export function parseCsvBuffer(buffer: Buffer): ParsedCsv {
  const encoding = detectEncoding(buffer);

  let text: string;
  if (encoding === 'windows-1256') {
    text = iconv.decode(buffer, 'windows-1256');
  } else {
    text = buffer.toString('utf-8');
    // Strip BOM if present
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
  }

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
    transform: (value: string) => value.trim(),
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(`CSV parsing failed: ${result.errors[0].message}`);
  }

  const headers = result.meta.fields || [];
  const rows = result.data.filter((row) =>
    // Filter out completely empty rows
    Object.values(row).some((v) => v !== ''),
  );

  return {
    headers,
    rows,
    totalRows: rows.length,
    encoding,
  };
}

/**
 * Get a sample of rows for AI data understanding (first 5 non-empty rows).
 */
export function getSample(parsed: ParsedCsv, count = 5): Record<string, string>[] {
  return parsed.rows.slice(0, count);
}

/**
 * Format headers + sample rows as a readable table string for the AI prompt.
 */
export function formatSampleForPrompt(headers: string[], sample: Record<string, string>[]): string {
  const lines: string[] = [];
  lines.push(`Headers: ${headers.join(' | ')}`);
  lines.push('---');
  for (const [i, row] of sample.entries()) {
    const values = headers.map((h) => row[h] || '(empty)');
    lines.push(`Row ${i + 1}: ${values.join(' | ')}`);
  }
  return lines.join('\n');
}
