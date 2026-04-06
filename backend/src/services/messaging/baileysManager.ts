import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  initAuthCreds,
  BufferJSON,
  type AuthenticationCreds,
  type AuthenticationState,
  type WASocket,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { PrismaClient, Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';
import { EventEmitter } from 'events';
import pino from 'pino';

// ─────────────────────────────────────────────────────────
// BaileysManager — per-org WhatsApp Web session management
// Stores auth state in Postgres via Prisma, emits events
// for QR codes and connection status changes.
// ─────────────────────────────────────────────────────────

const logger = pino({ level: 'silent' });

type SessionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

export interface SessionInfo {
  status: SessionStatus;
  phone: string | null;
  name: string | null;
  qrDataUrl: string | null;
}

/**
 * Build a Baileys-compatible AuthenticationState backed by Prisma.
 */
async function usePrismaAuthState(
  prisma: PrismaClient,
  orgId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  let session = await prisma.whatsAppSession.findUnique({ where: { orgId } });
  if (!session) {
    session = await prisma.whatsAppSession.create({ data: { orgId } });
  }

  const creds: AuthenticationCreds = session.creds
    ? JSON.parse(JSON.stringify(session.creds), BufferJSON.reviver)
    : initAuthCreds();

  const saveCreds = async () => {
    try {
      const serialized = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
      await prisma.whatsAppSession.upsert({
        where: { orgId },
        create: { orgId, creds: serialized },
        update: { creds: serialized },
      });
    } catch (err) {
      console.error('[Baileys] Failed to save creds:', err);
    }
  };

  const readData = async (key: string): Promise<any> => {
    try {
      const row = await prisma.whatsAppSessionKey.findUnique({
        where: { orgId_key: { orgId, key } },
      });
      if (!row) return null;
      return JSON.parse(JSON.stringify(row.value), BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const writeData = async (key: string, value: any): Promise<void> => {
    try {
      const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
      await prisma.whatsAppSessionKey.upsert({
        where: { orgId_key: { orgId, key } },
        create: { orgId, key, value: serialized },
        update: { value: serialized },
      });
    } catch (err) {
      console.error(`[Baileys] Failed to write key ${key}:`, err);
    }
  };

  const removeData = async (key: string): Promise<void> => {
    try {
      await prisma.whatsAppSessionKey.deleteMany({ where: { orgId, key } });
    } catch {}
  };

  return {
    state: {
      creds,
      keys: makeCacheableSignalKeyStore({
        get: async (type: string, ids: string[]) => {
          const result: Record<string, any> = {};
          for (const id of ids) {
            const val = await readData(`${type}-${id}`);
            if (val) result[id] = val;
          }
          return result;
        },
        set: async (data: Record<string, Record<string, any>>) => {
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries || {})) {
              if (value) {
                await writeData(`${type}-${id}`, value);
              } else {
                await removeData(`${type}-${id}`);
              }
            }
          }
        },
      } as any, logger),
    },
    saveCreds,
  };
}

/**
 * Manages one WhatsApp Web (Baileys) session per org.
 * Emits: 'qr', 'connected', 'disconnected', 'message'
 */
export class BaileysManager extends EventEmitter {
  private sessions = new Map<string, WASocket>();
  private statuses = new Map<string, SessionInfo>();
  private connecting = new Set<string>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private reconnectAttempts = new Map<string, number>();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private manuallyDisconnected = new Set<string>();
  private prisma: PrismaClient;
  private appLog?: { info: Function; warn: Function; error: Function };

  private static readonly MAX_RECONNECT_ATTEMPTS = 10;
  private static readonly BASE_RECONNECT_DELAY_MS = 5000;
  private static readonly MAX_RECONNECT_DELAY_MS = 120_000;
  private static readonly JITTER_MAX_MS = 5000;
  private static readonly HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;

  constructor(prisma: PrismaClient, log?: any) {
    super();
    this.prisma = prisma;
    this.appLog = log;
  }

  getStatus(orgId: string): SessionInfo {
    return this.statuses.get(orgId) ?? {
      status: 'disconnected',
      phone: null,
      name: null,
      qrDataUrl: null,
    };
  }

  isConnected(orgId: string): boolean {
    return this.statuses.get(orgId)?.status === 'connected';
  }

  /** Calculate exponential backoff delay with jitter */
  private getReconnectDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      BaileysManager.BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt),
      BaileysManager.MAX_RECONNECT_DELAY_MS,
    );
    const jitter = Math.floor(Math.random() * BaileysManager.JITTER_MAX_MS);
    return exponentialDelay + jitter;
  }

  /** Check if a disconnect reason is non-recoverable (no point retrying) */
  private isNonRecoverable(statusCode: number | undefined): boolean {
    if (!statusCode) return false;
    return [
      DisconnectReason.loggedOut,
      DisconnectReason.badSession,
      DisconnectReason.forbidden,
    ].includes(statusCode);
  }

  /** Schedule a reconnect attempt with exponential backoff */
  private scheduleReconnect(orgId: string): void {
    if (this.manuallyDisconnected.has(orgId)) return;

    const attempt = this.reconnectAttempts.get(orgId) ?? 0;

    if (attempt >= BaileysManager.MAX_RECONNECT_ATTEMPTS) {
      this.appLog?.error(
        { orgId, attempts: attempt },
        'Baileys reconnect exhausted all attempts',
      );
      this.reconnectAttempts.delete(orgId);
      this.updateStatus(orgId, { status: 'disconnected', qrDataUrl: null });
      this.prisma.whatsAppSession.update({
        where: { orgId },
        data: { connected: false },
      }).catch((err) => {
        this.appLog?.error({ orgId, err }, 'Failed to update DB after reconnect exhaustion');
      });
      this.emit('disconnected', orgId, 'reconnect_exhausted');
      return;
    }

    const delay = this.getReconnectDelay(attempt);
    this.reconnectAttempts.set(orgId, attempt + 1);

    this.appLog?.info(
      { orgId, attempt: attempt + 1, maxAttempts: BaileysManager.MAX_RECONNECT_ATTEMPTS, delayMs: delay },
      'Baileys scheduling reconnect',
    );

    const t = setTimeout(() => {
      this.reconnectTimers.delete(orgId);
      this.connect(orgId).catch((err) => {
        this.appLog?.error({ orgId, err, attempt: attempt + 1 }, 'Baileys reconnect attempt failed');
        this.scheduleReconnect(orgId);
      });
    }, delay);
    this.reconnectTimers.set(orgId, t);
  }

  async connect(orgId: string): Promise<SessionInfo> {
    // Already connected
    if (this.isConnected(orgId)) {
      return this.getStatus(orgId);
    }

    // Already in the process of connecting — don't double-connect
    if (this.connecting.has(orgId)) {
      return this.getStatus(orgId);
    }

    // Clear manual-disconnect flag (explicit connect overrides it)
    this.manuallyDisconnected.delete(orgId);
    this.connecting.add(orgId);

    // Cancel any pending reconnect timer
    const timer = this.reconnectTimers.get(orgId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(orgId);
    }

    // Close any existing socket
    const existing = this.sessions.get(orgId);
    if (existing) {
      try { existing.end(undefined); } catch (_) {}
      this.sessions.delete(orgId);
    }

    this.updateStatus(orgId, { status: 'connecting', qrDataUrl: null });

    try {
      const { state, saveCreds } = await usePrismaAuthState(this.prisma, orgId);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        logger,
        generateHighQualityLinkPreview: false,
        browser: ['Tawafud', 'Chrome', '120.0.0'],
      });

      this.sessions.set(orgId, sock);
      this.connecting.delete(orgId);

      // ── Connection updates ──
      sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        try {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
            this.updateStatus(orgId, { status: 'qr', qrDataUrl });
            this.emit('qr', orgId, qrDataUrl);
            this.appLog?.info({ orgId }, 'Baileys QR code generated');
          }

          if (connection === 'close') {
            this.sessions.delete(orgId);
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

            this.appLog?.warn(
              { orgId, statusCode, error: lastDisconnect?.error?.message },
              'Baileys connection closed',
            );

            if (this.isNonRecoverable(statusCode)) {
              // Non-recoverable: clear session, stop retrying
              await this.clearSession(orgId);
              this.reconnectAttempts.delete(orgId);
              this.updateStatus(orgId, { status: 'disconnected', phone: null, name: null, qrDataUrl: null });
              this.emit('disconnected', orgId, statusCode === DisconnectReason.loggedOut ? 'logged_out' : 'non_recoverable');
            } else {
              // Recoverable: schedule reconnect with exponential backoff
              this.updateStatus(orgId, { status: 'connecting', qrDataUrl: null });
              this.scheduleReconnect(orgId);
            }
          }

          if (connection === 'open') {
            // Reset reconnect tracking on successful connection
            this.reconnectAttempts.delete(orgId);
            this.manuallyDisconnected.delete(orgId);

            const me = sock.user;
            const phone = me?.id?.split(':')[0]?.replace('@s.whatsapp.net', '') || null;
            const name = me?.name || null;

            this.updateStatus(orgId, {
              status: 'connected',
              phone: phone ? `+${phone}` : null,
              name,
              qrDataUrl: null,
            });

            await this.prisma.whatsAppSession.upsert({
              where: { orgId },
              create: { orgId, connected: true, phone: phone ? `+${phone}` : null, name },
              update: { connected: true, phone: phone ? `+${phone}` : null, name },
            });

            this.appLog?.info({ orgId, phone, name }, 'Baileys WhatsApp connected');
            this.emit('connected', orgId, { phone, name });
          }
        } catch (err) {
          this.appLog?.error({ orgId, err }, 'Error in Baileys connection.update handler');
        }
      });

      sock.ev.on('creds.update', saveCreds);

      // ── Incoming messages ──
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
          try {
            if (msg.key.remoteJid === 'status@broadcast') continue;
            if (msg.key.fromMe) continue;

            const jid = msg.key.remoteJid;
            if (!jid) continue;

            const text =
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption ||
              '';

            if (!text) continue;

            const phone = '+' + jid.split('@')[0];
            const messageId = msg.key.id || `baileys-${Date.now()}`;

            this.appLog?.info({ orgId, phone, messageId }, 'Baileys incoming message');
            this.emit('message', orgId, { phone, text, messageId, jid });
          } catch (err) {
            this.appLog?.error({ orgId, err }, 'Error processing Baileys message');
          }
        }
      });

      return this.getStatus(orgId);
    } catch (err) {
      this.connecting.delete(orgId);
      this.appLog?.error({ orgId, err }, 'Baileys connect() failed');
      this.updateStatus(orgId, { status: 'disconnected', qrDataUrl: null });
      throw err;
    }
  }

  /** Send a text message to a JID or phone number */
  async sendMessage(orgId: string, phoneOrJid: string, text: string): Promise<boolean> {
    const sock = this.sessions.get(orgId);
    if (!sock || !this.isConnected(orgId)) {
      this.appLog?.warn({ orgId }, 'Cannot send — Baileys not connected');
      return false;
    }

    const jid = this.resolveJid(phoneOrJid);
    await sock.sendMessage(jid, { text });
    return true;
  }

  /** Send an image with optional caption to a JID or phone number */
  async sendImageMessage(
    orgId: string,
    phoneOrJid: string,
    imageBuffer: Buffer,
    caption?: string,
    mimetype?: string,
  ): Promise<boolean> {
    const sock = this.sessions.get(orgId);
    if (!sock || !this.isConnected(orgId)) {
      this.appLog?.warn({ orgId }, 'Cannot send image — Baileys not connected');
      return false;
    }

    const jid = this.resolveJid(phoneOrJid);
    await sock.sendMessage(jid, {
      image: imageBuffer,
      caption: caption || undefined,
      mimetype: (mimetype || 'image/jpeg') as any,
    });
    return true;
  }

  /** Show "typing..." indicator to the recipient */
  async sendTyping(orgId: string, phoneOrJid: string): Promise<void> {
    const sock = this.sessions.get(orgId);
    if (!sock || !this.isConnected(orgId)) return;

    const jid = this.resolveJid(phoneOrJid);
    await sock.presenceSubscribe(jid);
    await sock.sendPresenceUpdate('composing', jid);
  }

  /** Stop "typing..." indicator */
  async stopTyping(orgId: string, phoneOrJid: string): Promise<void> {
    const sock = this.sessions.get(orgId);
    if (!sock || !this.isConnected(orgId)) return;

    const jid = this.resolveJid(phoneOrJid);
    await sock.sendPresenceUpdate('paused', jid);
  }

  /** Resolve a phone number or JID to a valid WhatsApp JID */
  private resolveJid(phoneOrJid: string): string {
    if (phoneOrJid.includes('@')) return phoneOrJid;
    const cleaned = phoneOrJid.replace(/[^0-9]/g, '');
    return `${cleaned}@s.whatsapp.net`;
  }

  async disconnect(orgId: string): Promise<void> {
    // Track as manual disconnect so health check doesn't resurrect it
    this.manuallyDisconnected.add(orgId);
    this.reconnectAttempts.delete(orgId);

    // Cancel any reconnect timer
    const timer = this.reconnectTimers.get(orgId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(orgId);
    }

    this.connecting.delete(orgId);

    const sock = this.sessions.get(orgId);
    if (sock) {
      try { await sock.logout(); } catch (_) {}
      try { sock.end(undefined); } catch (_) {}
      this.sessions.delete(orgId);
    }

    await this.clearSession(orgId);
    this.updateStatus(orgId, { status: 'disconnected', phone: null, name: null, qrDataUrl: null });
    this.emit('disconnected', orgId, 'manual');
  }

  async restoreSessions(): Promise<void> {
    const sessions = await this.prisma.whatsAppSession.findMany({
      where: { connected: true },
    });

    this.appLog?.info({ count: sessions.length }, 'Restoring Baileys sessions');

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      // Stagger restores by 2 seconds each to avoid overwhelming WhatsApp servers
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      this.appLog?.info({ orgId: session.orgId }, 'Restoring Baileys session');
      try {
        await this.connect(session.orgId);
      } catch (err) {
        this.appLog?.error(
          { orgId: session.orgId, err },
          'Failed to restore Baileys session — health check will retry',
        );
      }
    }
  }

  /** Start periodic health check that reconnects dead sessions */
  startHealthCheck(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      try {
        const dbSessions = await this.prisma.whatsAppSession.findMany({
          where: { connected: true },
        });

        for (const session of dbSessions) {
          const orgId = session.orgId;

          // Skip if manually disconnected, already connected, connecting, or has pending retry
          if (this.manuallyDisconnected.has(orgId)) continue;
          if (this.isConnected(orgId)) continue;
          if (this.connecting.has(orgId)) continue;
          if (this.reconnectTimers.has(orgId)) continue;

          this.appLog?.info({ orgId }, 'Health check: restoring dead session');
          this.reconnectAttempts.delete(orgId);

          try {
            await this.connect(orgId);
          } catch (err) {
            this.appLog?.error({ orgId, err }, 'Health check: failed to restore session');
            this.scheduleReconnect(orgId);
          }
        }
      } catch (err) {
        this.appLog?.error({ err }, 'Baileys health check error');
      }
    }, BaileysManager.HEALTH_CHECK_INTERVAL_MS);
  }

  /** Graceful shutdown: stop health check, clear all timers, close sockets */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    for (const [, timer] of this.reconnectTimers) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();
    this.manuallyDisconnected.clear();

    for (const [, sock] of this.sessions) {
      try { sock.end(undefined); } catch (_) {}
    }
    this.sessions.clear();
    this.connecting.clear();
    this.statuses.clear();
  }

  private updateStatus(orgId: string, partial: Partial<SessionInfo>) {
    const current = this.getStatus(orgId);
    this.statuses.set(orgId, { ...current, ...partial });
  }

  private async clearSession(orgId: string) {
    try {
      await this.prisma.whatsAppSessionKey.deleteMany({ where: { orgId } });
      await this.prisma.whatsAppSession.upsert({
        where: { orgId },
        create: { orgId, connected: false, phone: null, name: null },
        update: { connected: false, creds: Prisma.JsonNull, phone: null, name: null },
      });
    } catch (err) {
      this.appLog?.error({ orgId, err }, 'Failed to clear Baileys session');
    }
  }
}

// ── Singleton ──
let instance: BaileysManager | null = null;

export function getBaileysManager(prisma?: PrismaClient, log?: any): BaileysManager {
  if (!instance) {
    if (!prisma) throw new Error('BaileysManager not initialized — prisma is required');
    instance = new BaileysManager(prisma, log);
  }
  return instance;
}
