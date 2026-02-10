import OpenAI from 'openai';
import { STTResult, ArabicDialect } from '../../types/voice.js';
import { detectDialect } from './dialectDetector.js';

export class STTService {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for STT');
    }
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Transcribe audio buffer to text using OpenAI Whisper
   * @param audioBuffer - Audio data in WAV format
   * @returns STT result with text, confidence, and detected dialect
   */
  async transcribe(audioBuffer: Buffer): Promise<STTResult> {
    // Create a File object from the buffer for the API
    const file = new File([new Uint8Array(audioBuffer)], 'audio.wav', { type: 'audio/wav' });

    const response = await this.client.audio.transcriptions.create({
      model: 'whisper-1',
      file: file,
      language: 'ar', // Arabic
      response_format: 'verbose_json',
    });

    const text = response.text || '';
    const dialect = detectDialect(text);

    return {
      text,
      confidence: 1.0, // Whisper doesn't return confidence scores
      dialect,
      language: 'ar',
      isFinal: true,
    };
  }

  /**
   * Transcribe with automatic language detection
   * Useful when caller might speak English or Arabic
   */
  async transcribeAutoDetect(audioBuffer: Buffer): Promise<STTResult> {
    const file = new File([new Uint8Array(audioBuffer)], 'audio.wav', { type: 'audio/wav' });

    const response = await this.client.audio.transcriptions.create({
      model: 'whisper-1',
      file: file,
      response_format: 'verbose_json',
    });

    const text = response.text || '';
    const detectedLanguage = (response as { language?: string }).language || 'ar';

    // Only detect dialect if the language is Arabic
    let dialect: ArabicDialect | undefined;
    if (detectedLanguage === 'ar' || detectedLanguage === 'arabic') {
      dialect = detectDialect(text);
    }

    return {
      text,
      confidence: 1.0,
      dialect,
      language: detectedLanguage,
      isFinal: true,
    };
  }
}

// Singleton instance
let sttService: STTService | null = null;

export function getSTTService(): STTService {
  if (!sttService) {
    sttService = new STTService();
  }
  return sttService;
}

/**
 * Convert mulaw 8kHz audio (Twilio format) to WAV format for Whisper
 * Twilio sends audio as mulaw 8kHz mono
 */
export function mulawToWav(mulawData: Buffer): Buffer {
  const MULAW_BIAS = 33;
  const MULAW_MAX = 32635;

  // Mulaw to linear PCM conversion table
  function mulawDecode(mulaw: number): number {
    mulaw = ~mulaw;
    const sign = mulaw & 0x80;
    const exponent = (mulaw >> 4) & 0x07;
    let mantissa = mulaw & 0x0f;
    let sample = (mantissa << (exponent + 3)) + MULAW_BIAS;
    sample = sample << (exponent);
    if (sign !== 0) sample = -sample;
    return sample;
  }

  // Convert mulaw to 16-bit PCM
  const pcmData = Buffer.alloc(mulawData.length * 2);
  for (let i = 0; i < mulawData.length; i++) {
    const sample = mulawDecode(mulawData[i]);
    pcmData.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }

  // Create WAV header
  const wavHeader = Buffer.alloc(44);
  const dataSize = pcmData.length;
  const fileSize = dataSize + 36;

  // RIFF header
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(fileSize, 4);
  wavHeader.write('WAVE', 8);

  // fmt chunk
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16); // chunk size
  wavHeader.writeUInt16LE(1, 20); // audio format (PCM)
  wavHeader.writeUInt16LE(1, 22); // num channels (mono)
  wavHeader.writeUInt32LE(8000, 24); // sample rate
  wavHeader.writeUInt32LE(16000, 28); // byte rate
  wavHeader.writeUInt16LE(2, 32); // block align
  wavHeader.writeUInt16LE(16, 34); // bits per sample

  // data chunk
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(dataSize, 40);

  return Buffer.concat([wavHeader, pcmData]);
}
