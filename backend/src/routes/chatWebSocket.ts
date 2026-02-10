import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { getLLMService, ChatMessage } from '../services/llm.js';
import { buildSystemPrompt } from '../services/systemPrompt.js';
import { GuardrailsService, ValidationContext } from '../services/ai/guardrails.js';
import { redactPII } from '../services/security/piiRedactor.js';
import { getContextBuilder } from '../services/patient/contextBuilder.js';

// ── Connection tracking: conversationId → Set<WebSocket> ──
const connectionsByConversation = new Map<string, Set<WebSocket>>();

function addConnection(conversationId: string, ws: WebSocket) {
  let conns = connectionsByConversation.get(conversationId);
  if (!conns) {
    conns = new Set();
    connectionsByConversation.set(conversationId, conns);
  }
  conns.add(ws);
}

function removeConnection(conversationId: string, ws: WebSocket) {
  const conns = connectionsByConversation.get(conversationId);
  if (conns) {
    conns.delete(ws);
    if (conns.size === 0) {
      connectionsByConversation.delete(conversationId);
    }
  }
}

function broadcastToConversation(conversationId: string, message: string, excludeWs?: WebSocket) {
  const conns = connectionsByConversation.get(conversationId);
  if (!conns) return;
  for (const conn of conns) {
    if (conn !== excludeWs && conn.readyState === WebSocket.OPEN) {
      conn.send(message);
    }
  }
}

function safeSend(ws: WebSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ── Incoming client message shape ──
interface ClientMessage {
  type: 'message';
  content: string;
}

export default async function chatWebSocketRoutes(app: FastifyInstance) {

  app.get('/ws', { websocket: true }, async (connection, request: FastifyRequest) => {
    const ws = connection.socket as WebSocket;

    // ── 1. Parse query params ──
    const url = new URL(request.url, 'http://localhost');
    const conversationIdParam = url.searchParams.get('conversationId');
    const token = url.searchParams.get('token');

    // ── 2. Verify JWT ──
    let user: { userId: string; orgId: string; email: string } | null = null;

    if (token) {
      try {
        const decoded = app.jwt.verify<{ userId: string; orgId: string; email: string }>(token);
        user = decoded;
      } catch (e) {
        app.log.error({ err: e }, 'Chat WS: token verification failed');
      }
    }

    if (!user?.orgId) {
      safeSend(ws, { type: 'error', message: 'Authentication required' });
      ws.close();
      return;
    }

    const { orgId, userId, email } = user;
    app.log.info({ orgId, userId }, 'Chat WebSocket opened');

    // ── 3. Resolve messaging user & conversation ──
    let messagingUser = await app.prisma.messagingUser.findFirst({
      where: { orgId, channel: 'web', externalUserId: userId },
    });
    if (!messagingUser) {
      messagingUser = await app.prisma.messagingUser.create({
        data: { orgId, channel: 'web', externalUserId: userId, displayName: email },
      });
    }

    let conversationId: string;

    if (conversationIdParam) {
      const existing = await app.prisma.conversation.findFirst({
        where: { conversationId: conversationIdParam, orgId, messagingUserId: messagingUser.messagingUserId },
      });
      if (!existing) {
        safeSend(ws, { type: 'error', message: 'Conversation not found' });
        ws.close();
        return;
      }
      conversationId = existing.conversationId;
    } else {
      const conv = await app.prisma.conversation.create({
        data: {
          orgId,
          messagingUserId: messagingUser.messagingUserId,
          channel: 'web',
          externalThreadId: `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          status: 'active',
          currentStep: 'test_chat',
          context: { type: 'test_chat', userId },
        },
      });
      conversationId = conv.conversationId;
    }

    // Track connection
    addConnection(conversationId, ws);

    // ── 4. Send conversation history on connect ──
    const historyRows = await app.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    safeSend(ws, {
      type: 'history',
      conversationId,
      messages: historyRows.map((m) => ({
        id: m.messageId,
        content: m.bodyText || '',
        sender: m.direction === 'in' ? 'user' : 'ai',
        timestamp: m.createdAt.toISOString(),
      })),
    });

    // ── 5. Handle incoming messages ──
    ws.on('message', async (raw: Buffer) => {
      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        safeSend(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }

      if (parsed.type !== 'message' || !parsed.content?.trim()) {
        return;
      }

      const userText = parsed.content.trim();

      try {
        // ── 5a. PII-redact user message before saving ──
        let redactedUserText = userText;
        try { redactedUserText = redactPII(userText).redactedText; } catch { /* keep original */ }

        // Save user message
        const userMsg = await app.prisma.conversationMessage.create({
          data: {
            conversationId,
            direction: 'in',
            bodyText: redactedUserText,
            payload: { source: 'ws_chat', userId },
          },
        });

        // Echo user message back (with id) & broadcast
        const userPayload = JSON.stringify({
          type: 'message',
          id: userMsg.messageId,
          content: userText,
          sender: 'user',
          timestamp: userMsg.createdAt.toISOString(),
        });
        broadcastToConversation(conversationId, userPayload, ws);

        // ── 5b. Typing indicator ──
        const typingOn = JSON.stringify({ type: 'typing', isTyping: true });
        safeSend(ws, typingOn);
        broadcastToConversation(conversationId, typingOn, ws);

        // ── 5c. Build system prompt + patient context ──
        let systemPrompt = await buildSystemPrompt(app.prisma, orgId);

        const conversation = await app.prisma.conversation.findUnique({
          where: { conversationId },
          select: { patientId: true },
        });

        let resolvedPatientId: string | null = conversation?.patientId ?? null;
        if (!resolvedPatientId) {
          const patientLink = await app.prisma.messagingUserPatientLink.findFirst({
            where: { messagingUserId: messagingUser.messagingUserId, isDefault: true },
          });
          if (patientLink) {
            resolvedPatientId = patientLink.patientId;
            await app.prisma.conversation.update({
              where: { conversationId },
              data: { patientId: resolvedPatientId },
            });
          }
        }

        if (resolvedPatientId) {
          try {
            const contextBuilder = getContextBuilder(app.prisma);
            const patientContext = await contextBuilder.buildPatientContext(resolvedPatientId);
            if (patientContext) {
              systemPrompt += '\n' + patientContext;
            }
          } catch (ctxErr) {
            app.log.error({ err: ctxErr }, 'WS: Failed to build patient context');
          }
        }

        // ── 5d. Fetch conversation history for LLM ──
        const recentMessages = await app.prisma.conversationMessage.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'asc' },
          take: 20,
        });

        const chatMessages: ChatMessage[] = recentMessages.map((m) => ({
          role: m.direction === 'in' ? 'user' as const : 'assistant' as const,
          content: m.bodyText || '',
        }));

        // ── 5e. Call LLM ──
        const llmService = getLLMService();
        let response = await llmService.chat(chatMessages, systemPrompt);

        // ── 5f. Guardrails ──
        let guardrailResult = null;
        try {
          const guardrails = new GuardrailsService(app.prisma);
          const validationContext: ValidationContext = {
            orgId,
            conversationId,
            userMessage: userText,
            aiResponse: response,
          };
          guardrailResult = await guardrails.validateResponse(validationContext);
          if (!guardrailResult.approved && guardrailResult.sanitizedResponse) {
            app.log.warn({ flags: guardrailResult.flags }, 'WS guardrails blocked response');
            response = guardrailResult.sanitizedResponse;
          }
        } catch (err) {
          app.log.error({ err }, 'WS guardrails validation failed');
        }

        // ── 5g. PII-redact AI response for DB ──
        let redactedResponse = response;
        try { redactedResponse = redactPII(response).redactedText; } catch { /* keep original */ }

        // ── 5h. Save AI response ──
        const aiMsg = await app.prisma.conversationMessage.create({
          data: {
            conversationId,
            direction: 'out',
            bodyText: redactedResponse,
            payload: {
              model: process.env.LLM_MODEL || 'gpt-4-turbo-preview',
              confidence: guardrailResult?.confidence ?? null,
              guardrailFlags: guardrailResult?.flags?.map((f) => f.type) ?? [],
            },
          },
        });

        // Update last activity
        await app.prisma.conversation.update({
          where: { conversationId },
          data: { lastActivityAt: new Date() },
        });

        // ── 5i. Typing off + send AI response ──
        const typingOff = JSON.stringify({ type: 'typing', isTyping: false });
        safeSend(ws, typingOff);
        broadcastToConversation(conversationId, typingOff, ws);

        const aiPayload = JSON.stringify({
          type: 'message',
          id: aiMsg.messageId,
          content: response,
          sender: 'ai',
          timestamp: aiMsg.createdAt.toISOString(),
        });
        safeSend(ws, aiPayload);
        broadcastToConversation(conversationId, aiPayload, ws);

        // ── 5j. Memory extraction (async, non-blocking) ──
        if (resolvedPatientId) {
          const contextBuilder = getContextBuilder(app.prisma);
          contextBuilder
            .extractMemories(
              resolvedPatientId,
              [{ direction: 'in', bodyText: userText }],
              conversationId,
            )
            .catch((err) => {
              app.log.error({ err }, 'WS: memory extraction failed');
            });
        }
      } catch (err) {
        app.log.error({ err }, 'WS: Error processing chat message');

        const typingOff = JSON.stringify({ type: 'typing', isTyping: false });
        safeSend(ws, typingOff);
        safeSend(ws, { type: 'error', message: 'حدث خطأ في معالجة رسالتك. يرجى المحاولة مرة أخرى.' });
      }
    });

    // ── 6. Disconnect cleanup ──
    ws.on('close', () => {
      removeConnection(conversationId, ws);
      app.log.info({ conversationId }, 'Chat WebSocket closed');
    });

    ws.on('error', (error: Error) => {
      app.log.error({ err: error, conversationId }, 'Chat WebSocket error');
      removeConnection(conversationId, ws);
    });
  });
}
