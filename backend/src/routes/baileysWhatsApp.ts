import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getBaileysManager } from '../services/messaging/baileysManager.js';
import { WhatsAppHandler } from '../services/messaging/whatsappHandler.js';

// ─────────────────────────────────────────────────────────
// Baileys WhatsApp Routes
// QR code pairing, connection status, disconnect, and
// incoming message relay to the AI handler.
// ─────────────────────────────────────────────────────────

export default async function baileysWhatsAppRoutes(app: FastifyInstance) {
  const manager = getBaileysManager(app.prisma, app.log);

  const aiHandler = new WhatsAppHandler(
    app.prisma,
    app.twilio ?? null,
    process.env.TWILIO_PHONE_NUMBER,
    app.log,
  );

  // Wire incoming Baileys messages → AI handler → send response back
  manager.on('message', async (orgId: string, msg: { phone: string; text: string; messageId: string; jid: string }) => {
    try {
      app.log.info({ orgId, phone: msg.phone, jid: msg.jid }, 'Routing Baileys message to AI handler');

      // Show "typing..." while AI processes the message
      await manager.sendTyping(orgId, msg.jid).catch(() => {});

      const response = await aiHandler.handleIncoming(msg.phone, msg.text, msg.messageId, orgId, true);

      // Stop typing and send the response
      await manager.stopTyping(orgId, msg.jid).catch(() => {});
      await manager.sendMessage(orgId, msg.jid, response);
    } catch (err) {
      app.log.error({ err, orgId }, 'Failed to handle Baileys incoming message');
      await manager.stopTyping(orgId, msg.jid).catch(() => {});
      try {
        await manager.sendMessage(
          orgId,
          msg.jid,
          'عذراً، حدث خطأ في معالجة رسالتك. يرجى المحاولة مرة أخرى أو الاتصال بالعيادة مباشرة. 🏥',
        );
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
  // Send text or image+caption to one or more phone numbers
  app.post('/send', {
    preHandler: [app.authenticate],
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
