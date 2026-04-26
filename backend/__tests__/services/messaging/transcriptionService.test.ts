import { describe, it, expect, vi } from 'vitest';
import { transcribeWhatsAppVoice } from '../../../src/services/messaging/transcriptionService.js';

function makeOpenAIMock(result: unknown) {
  return {
    audio: {
      transcriptions: {
        create: vi.fn().mockResolvedValue(result),
      },
    },
  } as any;
}

describe('transcribeWhatsAppVoice', () => {
  const audio = Buffer.from('fake-ogg-audio-bytes');

  it('returns trimmed text when Whisper responds with a string (response_format=text)', async () => {
    const openai = makeOpenAIMock('  أبغى أحجز موعد بكرة الصبح  ');
    const text = await transcribeWhatsAppVoice(openai, audio, { durationSec: 4 });
    expect(text).toBe('أبغى أحجز موعد بكرة الصبح');
  });

  it('calls Whisper with whisper-1, language ar, and response_format text by default', async () => {
    const openai = makeOpenAIMock('hello');
    await transcribeWhatsAppVoice(openai, audio);
    const call = openai.audio.transcriptions.create.mock.calls[0][0];
    expect(call.model).toBe('whisper-1');
    expect(call.language).toBe('ar');
    expect(call.response_format).toBe('text');
    expect(call.file).toBeDefined();
  });

  it('honors a custom language override', async () => {
    const openai = makeOpenAIMock('book an appointment');
    await transcribeWhatsAppVoice(openai, audio, { language: 'en' });
    expect(openai.audio.transcriptions.create.mock.calls[0][0].language).toBe('en');
  });

  it('rejects an empty buffer without calling Whisper', async () => {
    const openai = makeOpenAIMock('should-not-be-used');
    await expect(transcribeWhatsAppVoice(openai, Buffer.alloc(0))).rejects.toThrow(/Empty audio/);
    expect(openai.audio.transcriptions.create).not.toHaveBeenCalled();
  });

  it('rejects audio whose declared duration exceeds the cap', async () => {
    const openai = makeOpenAIMock('too long');
    await expect(
      transcribeWhatsAppVoice(openai, audio, { durationSec: 600 }),
    ).rejects.toThrow(/too long/);
    expect(openai.audio.transcriptions.create).not.toHaveBeenCalled();
  });

  it('rejects audio whose buffer exceeds the byte cap', async () => {
    const openai = makeOpenAIMock('too big');
    const huge = Buffer.alloc(17 * 1024 * 1024);
    await expect(transcribeWhatsAppVoice(openai, huge)).rejects.toThrow(/too large/);
    expect(openai.audio.transcriptions.create).not.toHaveBeenCalled();
  });

  it('throws when Whisper returns an empty transcription', async () => {
    const openai = makeOpenAIMock('   ');
    await expect(transcribeWhatsAppVoice(openai, audio)).rejects.toThrow(/Empty transcription/);
  });

  it('extracts .text when Whisper returns an object response shape', async () => {
    const openai = makeOpenAIMock({ text: 'hello world' });
    const text = await transcribeWhatsAppVoice(openai, audio);
    expect(text).toBe('hello world');
  });
});
