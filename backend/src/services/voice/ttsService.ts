import { ElevenLabs } from 'elevenlabs';
import { ArabicDialect } from '../../types/voice.js';

// Voice IDs for different Arabic dialects (configure in env)
const DEFAULT_VOICE_IDS: Record<ArabicDialect, string> = {
  gulf: 'pNInz6obpgDQGcFmaJgB', // Example - replace with actual Arabic voice IDs
  egyptian: 'pNInz6obpgDQGcFmaJgB',
  levantine: 'pNInz6obpgDQGcFmaJgB',
  msa: 'pNInz6obpgDQGcFmaJgB',
};

export class TTSService {
  private client: ElevenLabs;
  private voiceIds: Record<ArabicDialect, string>;
  private configured: boolean = false;

  constructor() {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      console.warn('ELEVENLABS_API_KEY not configured - TTS will be disabled');
      this.client = null as unknown as ElevenLabs;
      this.voiceIds = DEFAULT_VOICE_IDS;
      return;
    }

    this.client = new ElevenLabs({ apiKey });
    this.configured = true;

    // Allow override of voice IDs from environment
    this.voiceIds = {
      gulf: process.env.VOICE_ID_GULF || DEFAULT_VOICE_IDS.gulf,
      egyptian: process.env.VOICE_ID_EGYPTIAN || DEFAULT_VOICE_IDS.egyptian,
      levantine: process.env.VOICE_ID_LEVANTINE || DEFAULT_VOICE_IDS.levantine,
      msa: process.env.VOICE_ID_MSA || DEFAULT_VOICE_IDS.msa,
    };
  }

  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Synthesize text to speech audio
   * @param text - Arabic text to synthesize
   * @param dialect - Arabic dialect for voice selection
   * @returns Audio buffer in PCM format
   */
  async synthesize(text: string, dialect: ArabicDialect = 'msa'): Promise<Buffer> {
    if (!this.configured) {
      throw new Error('TTS service not configured - missing ELEVENLABS_API_KEY');
    }

    const voiceId = this.voiceIds[dialect];

    const audioStream = await this.client.textToSpeech.convert(voiceId, {
      text,
      model_id: 'eleven_multilingual_v2',
      output_format: 'pcm_16000', // 16kHz PCM for easier conversion
    });

    // Collect stream into buffer
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  /**
   * Synthesize text to speech with streaming output
   * Yields audio chunks as they become available for lower latency
   */
  async *synthesizeStream(text: string, dialect: ArabicDialect = 'msa'): AsyncGenerator<Buffer> {
    if (!this.configured) {
      throw new Error('TTS service not configured - missing ELEVENLABS_API_KEY');
    }

    const voiceId = this.voiceIds[dialect];

    const audioStream = await this.client.textToSpeech.convert(voiceId, {
      text,
      model_id: 'eleven_multilingual_v2',
      output_format: 'pcm_16000',
    });

    for await (const chunk of audioStream) {
      yield Buffer.from(chunk);
    }
  }

  /**
   * Get available voices for Arabic
   */
  async getArabicVoices(): Promise<{ voiceId: string; name: string }[]> {
    if (!this.configured) {
      return [];
    }

    const response = await this.client.voices.getAll();

    // Filter for voices that support Arabic
    // Note: You may need to adjust this based on ElevenLabs API response structure
    return response.voices
      .filter((voice) => {
        const labels = voice.labels || {};
        return labels.language === 'ar' || labels.language === 'arabic';
      })
      .map((voice) => ({
        voiceId: voice.voice_id,
        name: voice.name,
      }));
  }
}

// Singleton instance
let ttsService: TTSService | null = null;

export function getTTSService(): TTSService {
  if (!ttsService) {
    ttsService = new TTSService();
  }
  return ttsService;
}

/**
 * Convert PCM 16kHz to mulaw 8kHz (Twilio format)
 * Twilio expects mulaw 8kHz mono audio
 */
export function pcmToMulaw(pcmData: Buffer): Buffer {
  const MULAW_BIAS = 33;
  const MULAW_MAX = 0x1FFF;

  function linearToMulaw(sample: number): number {
    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;
    if (sample > MULAW_MAX) sample = MULAW_MAX;

    sample = sample + MULAW_BIAS;

    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}

    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    const mulawByte = ~(sign | (exponent << 4) | mantissa);

    return mulawByte & 0xFF;
  }

  // Downsample from 16kHz to 8kHz (skip every other sample)
  const outputLength = Math.floor(pcmData.length / 4); // 16-bit samples, halving rate
  const mulawData = Buffer.alloc(outputLength);

  for (let i = 0; i < outputLength; i++) {
    // Read 16-bit sample, skip every other sample for downsampling
    const sample = pcmData.readInt16LE(i * 4);
    mulawData[i] = linearToMulaw(sample);
  }

  return mulawData;
}
