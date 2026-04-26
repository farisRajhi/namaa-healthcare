import OpenAI from 'openai';

export type AdImageSize = 'square' | 'portrait' | 'landscape';

export type AdBrandContext = {
  name: string;
  nameAr?: string | null;
  colors?: string[];
  voiceTone?: string | null;
};

export type GenerateAdImageInput = {
  instruction: string;
  brand: AdBrandContext;
  size?: AdImageSize;
};

export type GenerateAdImageResult = {
  buffer: Buffer;
  mimetype: string;
  promptUsed: string;
};

const SIZE_MAP: Record<AdImageSize, '1024x1024' | '1024x1536' | '1536x1024'> = {
  square: '1024x1024',
  portrait: '1024x1536',
  landscape: '1536x1024',
};

const BLOCKED_PHRASES = [
  'cure',
  'guaranteed cure',
  'guaranteed results',
  'before and after',
  'diagnosis',
  'علاج مضمون',
  'شفاء مضمون',
  'تشخيص',
  'قبل وبعد',
];

export function validateInstruction(instruction: string): { ok: true } | { ok: false; reason: string } {
  const text = instruction.trim();
  if (text.length < 8) return { ok: false, reason: 'instruction_too_short' };
  if (text.length > 800) return { ok: false, reason: 'instruction_too_long' };
  const lower = text.toLowerCase();
  for (const phrase of BLOCKED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      return { ok: false, reason: 'medical_claim_blocked' };
    }
  }
  return { ok: true };
}

function composePrompt(input: GenerateAdImageInput): string {
  const { instruction, brand } = input;
  const colorClause = brand.colors && brand.colors.length > 0
    ? `Use the brand color palette strictly: ${brand.colors.join(', ')}. Backgrounds, accents, and typography must echo these colors.`
    : '';
  const tone = brand.voiceTone?.trim()
    ? `Visual tone: ${brand.voiceTone.trim()}.`
    : 'Visual tone: clean, modern, trustworthy, professional medical brand.';
  const arabicLabel = brand.nameAr ? ` (Arabic: ${brand.nameAr})` : '';

  return [
    `Design a square WhatsApp marketing ad for the Saudi Arabian healthcare clinic "${brand.name}"${arabicLabel}.`,
    `Campaign brief: ${instruction.trim()}.`,
    colorClause,
    tone,
    'Composition: bold focal subject, generous negative space, premium feel, suitable for social and WhatsApp sharing.',
    'Typography: render any text crisply. If Arabic text is present, use accurate Arabic typography (right-to-left, proper diacritics).',
    'Strictly avoid: medical diagnosis claims, before/after photos, doctored faces, fake testimonials, watermarks, lorem ipsum.',
  ]
    .filter(Boolean)
    .join(' ');
}

export async function generateAdImage(
  client: OpenAI,
  input: GenerateAdImageInput,
): Promise<GenerateAdImageResult> {
  const promptUsed = composePrompt(input);
  const size = SIZE_MAP[input.size ?? 'square'];

  const response = await client.images.generate({
    model: 'gpt-image-1',
    prompt: promptUsed,
    size,
    n: 1,
  });

  const data = response.data?.[0];
  if (!data?.b64_json) {
    throw new Error('Image generation returned no payload');
  }

  return {
    buffer: Buffer.from(data.b64_json, 'base64'),
    mimetype: 'image/png',
    promptUsed,
  };
}
