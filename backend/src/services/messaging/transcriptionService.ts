import OpenAI, { toFile } from 'openai';

const MAX_DURATION_SEC = 120;
const MAX_BYTES = 16 * 1024 * 1024;

export interface TranscribeOptions {
  durationSec?: number;
  mimetype?: string;
  language?: string;
}

export async function transcribeWhatsAppVoice(
  openai: OpenAI,
  audioBuffer: Buffer,
  opts: TranscribeOptions = {},
): Promise<string> {
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    throw new Error('Empty audio buffer');
  }
  if (audioBuffer.byteLength > MAX_BYTES) {
    throw new Error(`Audio too large: ${audioBuffer.byteLength} bytes (max ${MAX_BYTES})`);
  }
  if (opts.durationSec !== undefined && opts.durationSec > MAX_DURATION_SEC) {
    throw new Error(`Audio too long: ${opts.durationSec}s (max ${MAX_DURATION_SEC}s)`);
  }

  const ext = (opts.mimetype || 'audio/ogg').includes('mp4') ? 'm4a' : 'ogg';
  const file = await toFile(audioBuffer, `voice.${ext}`);

  const result = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: opts.language ?? 'ar',
    response_format: 'text',
  });

  const text = (typeof result === 'string' ? result : (result as { text?: string }).text || '').trim();
  if (!text) throw new Error('Empty transcription');
  return text;
}
