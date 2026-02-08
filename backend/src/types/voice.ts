// Arabic dialect types
export type ArabicDialect = 'gulf' | 'egyptian' | 'levantine' | 'msa';

// Call session state
export interface CallSession {
  callId: string;
  twilioCallSid: string;
  orgId: string;
  conversationId: string;
  callerPhone: string;
  detectedDialect?: ArabicDialect;
  context: CallContext;
  audioBuffer: AudioChunk[];
  isProcessing: boolean;
  isSpeaking: boolean;
  lastActivityAt: Date;
}

export interface CallContext {
  patientId?: string;
  appointmentIntent?: 'book' | 'cancel' | 'reschedule' | 'inquiry';
  collectedInfo: Record<string, string>;
  currentStep: string;
}

export interface AudioChunk {
  data: Buffer;
  timestamp: number;
  sequenceNumber: number;
}

// STT types
export interface STTResult {
  text: string;
  confidence: number;
  dialect?: ArabicDialect;
  language: string;
  isFinal: boolean;
}

// TTS types
export interface TTSRequest {
  text: string;
  dialect?: ArabicDialect;
  voiceId?: string;
  speed?: number;
}

// Twilio webhook payload types
export interface TwilioVoiceWebhook {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer';
  ApiVersion: string;
  Direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  ForwardedFrom?: string;
  CallerName?: string;
  CallDuration?: string;
}

export interface TwilioStatusCallback extends TwilioVoiceWebhook {
  CallDuration?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
}

// Twilio Media Stream types
export interface TwilioMediaMessage {
  event: 'connected' | 'start' | 'media' | 'stop' | 'mark';
  sequenceNumber?: string;
  streamSid?: string;
  media?: {
    track: 'inbound' | 'outbound';
    chunk: string;
    timestamp: string;
    payload: string; // Base64 encoded mulaw audio
  };
  start?: {
    streamSid: string;
    callSid: string;
    accountSid: string;
    tracks: string[];
    customParameters: Record<string, string>;
    mediaFormat: {
      encoding: string;
      sampleRate: number;
      channels: number;
    };
  };
  mark?: {
    name: string;
  };
}

// Response types for sending audio back to Twilio
export interface TwilioMediaResponse {
  event: 'media' | 'mark' | 'clear';
  streamSid: string;
  media?: {
    payload: string; // Base64 encoded mulaw audio
  };
  mark?: {
    name: string;
  };
}

// Voice configuration
export interface VoiceConfig {
  defaultDialect: ArabicDialect;
  maxCallDurationSec: number;
  silenceTimeoutMs: number;
  interruptionThreshold: number;
  sttProvider: 'openai' | 'deepgram';
  ttsProvider: 'elevenlabs' | 'azure';
}

// Dialect markers for detection
export const DIALECT_MARKERS: Record<ArabicDialect, string[]> = {
  gulf: ['شلونك', 'وش', 'يعني', 'زين', 'حيل', 'ابي', 'ابغى', 'وين', 'ليش', 'شفيك'],
  egyptian: ['ازيك', 'عامل', 'كده', 'خلاص', 'ماشي', 'ازاي', 'فين', 'عايز', 'كويس', 'اوي'],
  levantine: ['كيفك', 'شو', 'هلق', 'منيح', 'كتير', 'هيك', 'شلون', 'بدي', 'وين', 'ليش'],
  msa: [], // Modern Standard Arabic - detected by absence of dialect markers
};
