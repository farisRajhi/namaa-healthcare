import { CallSession, AudioChunk, ArabicDialect, CallContext } from '../../types/voice.js';
import { randomUUID } from 'crypto';

/**
 * Manages active voice call sessions in memory
 * Each call has its own session with audio buffer and state
 */
export class CallSessionManager {
  private sessions: Map<string, CallSession> = new Map();
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Create a new call session
   */
  createSession(twilioCallSid: string, orgId: string, callerPhone: string): CallSession {
    const session: CallSession = {
      callId: randomUUID(),
      twilioCallSid,
      orgId,
      conversationId: '', // Will be set after conversation is created
      callerPhone,
      context: {
        collectedInfo: {},
        currentStep: 'greeting',
      },
      audioBuffer: [],
      isProcessing: false,
      isSpeaking: false,
      lastActivityAt: new Date(),
    };

    this.sessions.set(twilioCallSid, session);
    return session;
  }

  /**
   * Get an existing session by Twilio Call SID
   */
  getSession(twilioCallSid: string): CallSession | undefined {
    return this.sessions.get(twilioCallSid);
  }

  /**
   * Update the conversation ID for a session
   */
  setConversationId(twilioCallSid: string, conversationId: string): void {
    const session = this.sessions.get(twilioCallSid);
    if (session) {
      session.conversationId = conversationId;
      session.lastActivityAt = new Date();
    }
  }

  /**
   * Update the detected dialect for a session
   */
  updateDialect(twilioCallSid: string, dialect: ArabicDialect): void {
    const session = this.sessions.get(twilioCallSid);
    if (session) {
      session.detectedDialect = dialect;
      session.lastActivityAt = new Date();
    }
  }

  /**
   * Update the call context
   */
  updateContext(twilioCallSid: string, context: Partial<CallContext>): void {
    const session = this.sessions.get(twilioCallSid);
    if (session) {
      session.context = { ...session.context, ...context };
      session.lastActivityAt = new Date();
    }
  }

  /**
   * Add an audio chunk to the session's buffer
   */
  addAudioChunk(twilioCallSid: string, chunk: AudioChunk): void {
    const session = this.sessions.get(twilioCallSid);
    if (session) {
      session.audioBuffer.push(chunk);
      session.lastActivityAt = new Date();
    }
  }

  /**
   * Get and clear the audio buffer
   */
  getAndClearAudioBuffer(twilioCallSid: string): AudioChunk[] {
    const session = this.sessions.get(twilioCallSid);
    if (!session) return [];

    const buffer = [...session.audioBuffer];
    session.audioBuffer = [];
    return buffer;
  }

  /**
   * Set the processing state
   */
  setProcessing(twilioCallSid: string, isProcessing: boolean): void {
    const session = this.sessions.get(twilioCallSid);
    if (session) {
      session.isProcessing = isProcessing;
    }
  }

  /**
   * Set the speaking state (AI is outputting audio)
   */
  setSpeaking(twilioCallSid: string, isSpeaking: boolean): void {
    const session = this.sessions.get(twilioCallSid);
    if (session) {
      session.isSpeaking = isSpeaking;
    }
  }

  /**
   * End and remove a session
   */
  endSession(twilioCallSid: string): CallSession | undefined {
    const session = this.sessions.get(twilioCallSid);
    this.sessions.delete(twilioCallSid);
    return session;
  }

  /**
   * Get all active sessions (for monitoring)
   */
  getActiveSessions(): CallSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get count of active sessions
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Cleanup stale sessions
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [sid, session] of this.sessions) {
      if (now - session.lastActivityAt.getTime() > this.SESSION_TIMEOUT_MS) {
        console.log(`Cleaning up stale session: ${sid}`);
        this.sessions.delete(sid);
      }
    }
  }

  /**
   * Shutdown the session manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
  }
}

// Singleton instance
export const callSessionManager = new CallSessionManager();
