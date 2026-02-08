import { ArabicDialect, DIALECT_MARKERS } from '../../types/voice.js';

/**
 * Detects Arabic dialect from transcribed text
 * Uses common dialect-specific markers and phrases
 */
export function detectDialect(text: string): ArabicDialect {
  const normalizedText = text.toLowerCase().trim();

  // Count matches for each dialect
  const scores: Record<ArabicDialect, number> = {
    gulf: 0,
    egyptian: 0,
    levantine: 0,
    msa: 0,
  };

  // Check for dialect markers
  for (const [dialect, markers] of Object.entries(DIALECT_MARKERS) as [ArabicDialect, string[]][]) {
    for (const marker of markers) {
      if (normalizedText.includes(marker)) {
        scores[dialect]++;
      }
    }
  }

  // Find the dialect with the highest score
  let maxScore = 0;
  let detectedDialect: ArabicDialect = 'msa'; // Default to MSA

  for (const [dialect, score] of Object.entries(scores) as [ArabicDialect, number][]) {
    if (score > maxScore) {
      maxScore = score;
      detectedDialect = dialect;
    }
  }

  // If no markers found, default to MSA (Modern Standard Arabic)
  if (maxScore === 0) {
    return 'msa';
  }

  return detectedDialect;
}

/**
 * Extended dialect markers with more comprehensive patterns
 */
export const EXTENDED_DIALECT_PATTERNS: Record<ArabicDialect, RegExp[]> = {
  gulf: [
    /شلون(ك|ج|كم)?/,  // How are you (Gulf)
    /وش\s/,           // What (Gulf/Najdi)
    /ابي|ابغى/,        // I want (Gulf)
    /حيل\s/,          // Very (Gulf)
    /زين\s/,          // Good/OK (Gulf)
  ],
  egyptian: [
    /ازي(ك|كو)?/,     // How are you (Egyptian)
    /عايز(ة)?/,       // I want (Egyptian)
    /كده\s/,          // Like this (Egyptian)
    /اوي\s/,          // Very (Egyptian)
    /فين\s/,          // Where (Egyptian)
  ],
  levantine: [
    /كيف(ك|ون)?/,     // How are you (Levantine)
    /شو\s/,           // What (Levantine)
    /هلق\s/,          // Now (Levantine)
    /منيح/,           // Good (Levantine)
    /بدي\s/,          // I want (Levantine)
  ],
  msa: [],
};

/**
 * Advanced dialect detection using regex patterns
 */
export function detectDialectAdvanced(text: string): { dialect: ArabicDialect; confidence: number } {
  const normalizedText = text.trim();

  const scores: Record<ArabicDialect, number> = {
    gulf: 0,
    egyptian: 0,
    levantine: 0,
    msa: 0,
  };

  let totalMatches = 0;

  for (const [dialect, patterns] of Object.entries(EXTENDED_DIALECT_PATTERNS) as [ArabicDialect, RegExp[]][]) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        scores[dialect]++;
        totalMatches++;
      }
    }
  }

  // Find winning dialect
  let maxScore = 0;
  let detectedDialect: ArabicDialect = 'msa';

  for (const [dialect, score] of Object.entries(scores) as [ArabicDialect, number][]) {
    if (score > maxScore) {
      maxScore = score;
      detectedDialect = dialect;
    }
  }

  // Calculate confidence
  const confidence = totalMatches > 0 ? maxScore / totalMatches : 0.5;

  return {
    dialect: detectedDialect,
    confidence: Math.min(confidence, 1.0),
  };
}
