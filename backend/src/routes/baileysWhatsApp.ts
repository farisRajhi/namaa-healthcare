import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getBaileysManager } from '../services/messaging/baileysManager.js';
import { WhatsAppHandler } from '../services/messaging/whatsappHandler.js';
import { transcribeWhatsAppVoice } from '../services/messaging/transcriptionService.js';
import { redactPII } from '../services/security/piiRedactor.js';

const VOICE_FALLBACK_AR =
  'عذراً، لم أتمكن من فهم الرسالة الصوتية. هل يمكنك كتابتها نصياً؟ 🙏';

// ─────────────────────────────────────────────────────────
// Baileys WhatsApp Routes
// QR code pairing, connection status, disconnect, and
// incoming message relay to the AI handler.
// ─────────────────────────────────────────────────────────

export default async function baileysWhatsAppRoutes(app: FastifyInstance) {
  const manager = getBaileysManager(app.prisma, app.log);

  const aiHandler = new WhatsAppHandler(app.prisma, app.log);

  // Wire incoming Baileys messages → AI handler → send response back
  manager.on('message', async (orgId: string, msg: {
    phone: string;
    text: string;
    messageId: string;
    jid: string;
    audioMessage?: any;
    rawMessage?: any;
  }) => {
    try {
      // Check if AI auto-reply is enabled for this org
      const org = await app.prisma.org.findUnique({
        where: { orgId },
        select: { aiAutoReply: true },
      });
      const aiAutoReply = org?.aiAutoReply !== false;

      if (!aiAutoReply) {
        app.log.info({ orgId, phone: msg.phone }, 'AI auto-reply disabled — storing message only');
      }

      // Resolve message text — for voice notes, transcribe via Whisper first.
      let messageText = msg.text;
      if (!messageText && msg.audioMessage && msg.rawMessage) {
        try {
          const sock = manager.getSocket(orgId);
          if (!sock) throw new Error('Baileys socket not connected');

          const audioBuffer = (await downloadMediaMessage(
            msg.rawMessage,
            'buffer',
            {},
            { logger: app.log as any, reuploadRequest: sock.updateMediaMessage },
          )) as Buffer;

          messageText = await transcribeWhatsAppVoice(app.openai, audioBuffer, {
            durationSec: msg.audioMessage.seconds ?? undefined,
            mimetype: msg.audioMessage.mimetype ?? undefined,
          });

          app.log.info(
            {
              orgId,
              phone: redactPII(msg.phone).redactedText,
              len: messageText.length,
              durationSec: msg.audioMessage.seconds,
            },
            'Transcribed WhatsApp voice note',
          );
        } catch (err) {
          app.log.warn({ err, orgId, phone: msg.phone }, 'Voice transcription failed');
          if (aiAutoReply) {
            await manager.sendMessage(orgId, msg.jid, VOICE_FALLBACK_AR).catch(() => {});
          }
          return;
        }
      }

      if (!messageText) return;

      // Show "typing..." while AI processes (only if AI is active)
      if (aiAutoReply) {
        await manager.sendTyping(orgId, msg.jid).catch(() => {});
      }

      const response = await aiHandler.handleIncoming(msg.phone, messageText, msg.messageId, orgId, true, aiAutoReply);

      // Always stop typing once the handler returns — even if the response is
      // empty (deduped/suppressed). Otherwise the typing indicator hangs forever.
      if (aiAutoReply) {
        await manager.stopTyping(orgId, msg.jid).catch(() => {});
      }

      if (aiAutoReply && response) {
        // Re-check auto-reply right before sending — the LLM call can take 10–20s,
        // and an admin may toggle AI off mid-flight from the dashboard.
        const fresh = await app.prisma.org.findUnique({
          where: { orgId },
          select: { aiAutoReply: true },
        });
        if (fresh?.aiAutoReply === false) {
          app.log.info({ orgId, phone: msg.phone }, 'AI auto-reply disabled mid-flight — suppressing send');
        } else {
          try {
            await manager.sendMessage(orgId, msg.jid, response);
          } catch (sendErr) {
            app.log.error(
              { sendErr, orgId },
              'Baileys send failed for AI response — message processed but not delivered',
            );
            throw sendErr;
          }
        }
      }
    } catch (err) {
      app.log.error({ err, orgId }, 'Failed to handle Baileys incoming message');
      await manager.stopTyping(orgId, msg.jid).catch(() => {});
      try {
        const userMsg = 'آسف، صار خطأ بسيط من ناحيتنا. جرب ترسل رسالتك مرة ثانية، وإذا استمرت المشكلة تواصل مع العيادة مباشرة 🙏';
        await manager.sendMessage(orgId, msg.jid, userMsg);
      } catch (_) {}
    }
  });

  // ──── POST /connect ────
  app.post('/connect', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.user as { orgId: string };
    try {
      const status = await manager.connect(orgId);
      return { success: true, ...status };
    } catch (err: any) {
      request.log.error({ err }, 'Baileys connect failed');
      return reply.code(500).send({
        success: false,
        error: 'Failed to start WhatsApp connection',
        message: err?.message || 'Unknown error',
      });
    }
  });

  // ──── GET /status ────
  app.get('/status', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.user as { orgId: string };
    try {
      const status = manager.getStatus(orgId);

      // If in-memory status is disconnected, check DB for a previously-connected session
      if (status.status === 'disconnected') {
        const dbSession = await app.prisma.whatsAppSession.findUnique({ where: { orgId } });
        if (dbSession?.connected) {
          // Auto-restore (e.g. after server restart)
          try {
            const restored = await manager.connect(orgId);
            return { success: true, ...restored };
          } catch {
            // Couldn't restore — mark as disconnected
            await app.prisma.whatsAppSession.update({
              where: { orgId },
              data: { connected: false },
            });
          }
        }
      }

      return { success: true, ...status };
    } catch (err: any) {
      request.log.error({ err }, 'Baileys status check failed');
      return reply.code(500).send({
        success: false,
        error: 'Failed to check WhatsApp status',
        status: 'disconnected',
      });
    }
  });

  // ──── POST /disconnect ────
  app.post('/disconnect', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.user as { orgId: string };
    try {
      await manager.disconnect(orgId);
      return { success: true, status: 'disconnected' };
    } catch (err: any) {
      request.log.error({ err }, 'Baileys disconnect failed');
      return reply.code(500).send({
        success: false,
        error: 'Failed to disconnect WhatsApp',
      });
    }
  });

  // ──── POST /send ────
  // Send text or image+caption to one or more phone numbers.
  // Gated: requires an active subscription (trial OK). Starter and up can send.
  app.post('/send', {
    preHandler: [app.authenticate, app.requireSubscription],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.user as { orgId: string };
    const body = request.body as {
      phones: string[];           // Array of phone numbers
      text?: string;              // Text-only message
      caption?: string;           // Caption for image
      image?: string;             // Base64-encoded image data
      imageMimetype?: string;     // e.g. 'image/jpeg', 'image/png'
    };

    if (!body.phones?.length) {
      return reply.code(400).send({ success: false, error: 'phones array is required' });
    }
    if (!body.text && !body.image) {
      return reply.code(400).send({ success: false, error: 'Either text or image is required' });
    }

    const status = manager.getStatus(orgId);
    if (status.status !== 'connected') {
      return reply.code(400).send({ success: false, error: 'WhatsApp is not connected' });
    }

    const results: { phone: string; sent: boolean; error?: string }[] = [];

    for (const phone of body.phones) {
      try {
        if (body.image) {
          // Strip data URI prefix if present (e.g. "data:image/jpeg;base64,...")
          const base64Data = body.image.includes(',') ? body.image.split(',')[1] : body.image;
          const imageBuffer = Buffer.from(base64Data, 'base64');
          const caption = body.caption || body.text || '';
          await manager.sendImageMessage(orgId, phone, imageBuffer, caption, body.imageMimetype);
        } else if (body.text) {
          await manager.sendMessage(orgId, phone, body.text);
        }
        results.push({ phone, sent: true });
      } catch (err: any) {
        request.log.error({ err, phone }, 'Failed to send WhatsApp message');
        results.push({ phone, sent: false, error: err?.message || 'Send failed' });
      }
    }

    const sentCount = results.filter((r) => r.sent).length;
    const failedCount = results.filter((r) => !r.sent).length;

    // Log to SmsLog for tracking
    try {
      for (const r of results.filter((rr) => rr.sent)) {
        await app.prisma.smsLog.create({
          data: {
            orgId,
            phone: r.phone,
            channel: 'whatsapp',
            body: body.caption || body.text || '[image]',
            status: 'sent',
            triggeredBy: 'manual',
          },
        });
      }
    } catch (logErr) {
      request.log.warn({ logErr }, 'Failed to log WhatsApp sends');
    }

    return {
      success: true,
      sent: sentCount,
      failed: failedCount,
      results,
    };
  });

  // ──── GET /qr ────
  app.get('/qr', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.user as { orgId: string };

    const status = manager.getStatus(orgId);

    if (status.status === 'connected') {
      return { success: true, connected: true, phone: status.phone, name: status.name };
    }

    return {
      success: true,
      connected: false,
      qr: status.qrDataUrl || null,
      status: status.status,
    };
  });

  // Restore sessions on startup (deferred) then start health check
  setTimeout(async () => {
    try {
      await manager.restoreSessions();
      app.log.info('Baileys session restoration complete');
    } catch (err) {
      app.log.error({ err }, 'Failed to restore Baileys sessions on startup');
    }
    // Start periodic health check regardless of restore outcome
    manager.startHealthCheck();
    app.log.info('Baileys health check started');
  }, 5000);
}
