import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { GoogleAuth } from 'google-auth-library';
import { ArabicDialect } from '../../types/voice.js';

const getVertexAIWebSocketURL = (location: string) =>
  `wss://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

// Voice and language configuration for Arabic dialects
// Using Charon for natural, normal-paced speech
const DIALECT_CONFIGS: Record<ArabicDialect, { voice: string; languageCode: string }> = {
  gulf: { voice: 'Charon', languageCode: 'ar-XA' },      // خليجي - Gulf Arabic (normal pace)
  egyptian: { voice: 'Charon', languageCode: 'ar-EG' },  // مصري - Egyptian Arabic
  levantine: { voice: 'Charon', languageCode: 'ar-XA' }, // شامي - Levantine Arabic
  msa: { voice: 'Charon', languageCode: 'ar-XA' },      // فصحى - Modern Standard Arabic (normal pace)
};

export interface GeminiLiveConfig {
  apiKey?: string;
  project?: string;
  location?: string;
  model?: string;
  systemPrompt: string;
  dialect?: ArabicDialect;
  voiceName?: string;
  tools?: Array<{ functionDeclarations: Array<Record<string, unknown>> }>;
}

export class GeminiLiveSession extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: GeminiLiveConfig;
  private isConnected: boolean = false;
  private setupComplete_: boolean = false;
  private auth: GoogleAuth;

  constructor(config: GeminiLiveConfig) {
    super();
    this.config = {
      model: 'gemini-2.0-flash-live-preview-04-09',
      dialect: 'msa',
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      ...config,
    };
    this.auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  }

  private async getAccessToken(): Promise<string> {
    const client = await this.auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new Error('Failed to get access token');
    return token.token;
  }

  async connect(): Promise<void> {
    const { project, location } = this.config;
    if (!project || !location) throw new Error('GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION required');
    
    console.log('[Gemini] Getting access token...');
    const accessToken = await this.getAccessToken();
    console.log('[Gemini] Got access token');

    return new Promise((resolve, reject) => {
      const url = getVertexAIWebSocketURL(location);
      console.log('[Gemini] Connecting to:', url);

      this.ws = new WebSocket(url, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
      
      this.ws.on('open', () => {
        console.log('[Gemini] Connected, sending setup...');
        this.isConnected = true;
        this.sendSetupMessage();
        this.emit('connected');
        resolve();
      });
      
      this.ws.on('message', (data: Buffer) => this.handleMessage(data));
      this.ws.on('error', (e) => { console.log('[Gemini] Error:', e.message); this.emit('error', e); reject(e); });
      this.ws.on('close', (code, reason) => {
        console.log('[Gemini] Closed:', code, reason?.toString());
        this.isConnected = false; this.setupComplete_ = false; this.emit('disconnected');
      });
      
      setTimeout(() => { if (!this.isConnected) reject(new Error('Timeout')); }, 15000);
    });
  }

  private sendSetupMessage(): void {
    if (!this.ws) return;
    const { project, location, model, systemPrompt, dialect, voiceName, tools } = this.config;
    const dialectConfig = DIALECT_CONFIGS[dialect || 'msa'];
    const voice = voiceName || dialectConfig.voice;
    const languageCode = dialectConfig.languageCode;
    const msg: Record<string, unknown> = {
      setup: {
        model: `projects/${project}/locations/${location}/publishers/google/models/${model}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            languageCode,
          },
        },
        systemInstruction: { parts: [{ text: systemPrompt }] },
      },
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
      (msg.setup as Record<string, unknown>).tools = tools;
    }

    console.log('[Gemini] Setup model:', (msg.setup as Record<string, unknown>).model);
    this.ws.send(JSON.stringify(msg));
  }

  private handleMessage(data: Buffer): void {
    try {
      const msg = JSON.parse(data.toString());
      console.log('[Gemini] Received:', JSON.stringify(msg).substring(0, 300));
      
      if (msg.setupComplete) { console.log('[Gemini] Setup complete!'); this.setupComplete_ = true; this.emit('setupComplete'); return; }
      
      if (msg.serverContent?.modelTurn) {
        for (const p of msg.serverContent.modelTurn.parts || []) {
          if (p.inlineData) this.emit('audio', Buffer.from(p.inlineData.data, 'base64'));
          if (p.text) this.emit('text', p.text);
          if (p.functionCall) this.emit('functionCall', p.functionCall.name, p.functionCall.args || {});
        }
      }
      if (msg.serverContent?.interrupted) this.emit('interrupted');
    } catch (e) { console.error('Parse error:', e); }
  }

  sendAudio(data: Buffer): void { if (this.ws && this.isConnected && this.setupComplete_) this.ws.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: data.toString('base64') }] } })); }
  sendText(text: string): void { if (this.ws && this.isConnected && this.setupComplete_) this.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } })); }
  sendFunctionResponse(name: string, res: Record<string, unknown>): void { if (this.ws && this.isConnected) this.ws.send(JSON.stringify({ toolResponse: { functionResponses: [{ name, response: res }] } })); }
  disconnect(): void { if (this.ws) { this.ws.close(); this.ws = null; } this.isConnected = false; this.setupComplete_ = false; }
  isReady(): boolean { return this.isConnected && this.setupComplete_; }
}

export function mulawToPcm16k(data: Buffer): Buffer {
  const decode = (m: number) => { m = ~m; const s = m & 0x80, e = (m >> 4) & 7, n = m & 0xf; let v = (n << (e + 3)) + 33; v = v << e; return s ? -v : v; };
  const out = Buffer.alloc(data.length * 4);
  for (let i = 0; i < data.length; i++) {
    const s = decode(data[i]), n = i < data.length - 1 ? decode(data[i + 1]) : s;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, s)), i * 4);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((s + n) / 2))), i * 4 + 2);
  }
  return out;
}

export function pcm16kToMulaw(data: Buffer): Buffer {
  const encode = (s: number) => { const sign = s < 0 ? 0x80 : 0; s = Math.abs(s); if (s > 0x1FFF) s = 0x1FFF; s += 33; let e = 7; for (let m = 0x4000; !(s & m) && e > 0; e--, m >>= 1); return (~(sign | (e << 4) | ((s >> (e + 3)) & 0xf))) & 0xff; };
  const out = Buffer.alloc(Math.floor(data.length / 4));
  for (let i = 0; i < out.length; i++) out[i] = encode(data.readInt16LE(i * 4));
  return out;
}

class GeminiLiveSessionManager {
  private sessions: Map<string, GeminiLiveSession> = new Map();
  createSession(id: string, cfg: GeminiLiveConfig): GeminiLiveSession { const s = new GeminiLiveSession(cfg); this.sessions.set(id, s); return s; }
  getSession(id: string): GeminiLiveSession | undefined { return this.sessions.get(id); }
  removeSession(id: string): void { const s = this.sessions.get(id); if (s) { s.disconnect(); this.sessions.delete(id); } }
  getActiveCount(): number { return this.sessions.size; }
}

export const geminiLiveSessionManager = new GeminiLiveSessionManager();
