import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { getLLMService, ChatMessage } from '../services/llm.js';
import { buildSystemPrompt } from '../services/systemPrompt.js';
import { GuardrailsService, ValidationContext } from '../services/ai/guardrails.js';
import { ToolRegistry } from '../services/ai/toolRegistry.js';
import { ConversationFlowManager, FlowContext } from '../services/ai/conversationFlow.js';
import { SessionCompactor } from '../services/ai/sessionCompactor.js';
import { redactPII } from '../services/security/piiRedactor.js';
import { getContextBuilder } from '../services/patient/contextBuilder.js';
import { checkAndIncrement, AI_LIMIT_ERROR } from '../services/usage/aiUsageLimiter.js';

// ─────────────────────────────────────────────────────────
// Chat WebSocket with Typed Stream Events
// Inspired by claw-code's structured streaming events:
// tool_invoked, tool_result, state_change, budget_warning
// ─────────────────────────────────────────────────────────

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

/** Broadcast a typed event to the WebSocket and all connected clients */
function emitEvent(ws: WebSocket, conversationId: string, event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  safeSend(ws, event);
  broadcastToConversation(conversationId, payload, ws);
}

// ── Typed Stream Event definitions ──
// These events let the frontend show what the AI is doing
// in real-time: "Checking availability...", "Booking appointment...", etc.

type StreamEventType =
  | 'history'
  | 'message'
  | 'typing'
  | 'error'
  | 'tool_invoked'    // AI is calling a tool
  | 'tool_result'     // Tool execution completed
  | 'state_change'    // Conversation state transition
  | 'budget_warning'  // Approaching turn budget limit
  | 'compaction'      // Session was compacted
  | 'conversation_info'; // Conversation metadata on connect

// Human-readable tool descriptions for the frontend
const TOOL_DESCRIPTIONS: Record<string, { ar: string; en: string }> = {
  check_availability: { ar: 'جاري البحث عن المواعيد المتاحة...', en: 'Checking available slots...' },
  book_appointment: { ar: 'جاري حجز الموعد...', en: 'Booking appointment...' },
  list_patient_appointments: { ar: 'جاري استعراض المواعيد...', en: 'Loading appointments...' },
  cancel_appointment: { ar: 'جاري إلغاء الموعد...', en: 'Cancelling appointment...' },
  search_providers: { ar: 'جاري البحث عن الأطباء...', en: 'Searching providers...' },
  list_services: { ar: 'جاري عرض الخدمات...', en: 'Loading services...' },
  get_facility_info: { ar: 'جاري تحميل معلومات المنشأة...', en: 'Loading facility info...' },
  transfer_to_human: { ar: 'جاري التحويل لموظف...', en: 'Transferring to agent...' },
};

// ── Incoming client message shape ──
interface ClientMessage {
  type: 'message';
  content: string;
}

export default async function chatWebSocketRoutes(app: FastifyInstance) {
  const flowManager = new ConversationFlowManager(app.prisma);
  const compactor = new SessionCompactor();

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
          currentStep: 'start',
          context: {
            type: 'test_chat',
            userId,
            flow: {
              state: 'start',
              turnCount: 0,
              maxTurns: 50,
              lastToolCalls: [],
              patientIdentified: false,
            },
          },
        },
      });
      conversationId = conv.conversationId;
    }

    // Track connection
    addConnection(conversationId, ws);

    // ── 4. Send conversation history + info on connect ──
    const historyRows = await app.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    // Load flow context
    let flowCtx = await flowManager.loadContext(conversationId);
    if (!flowCtx) flowCtx = flowManager.initContext();

    // Send conversation info (state, turn count, etc.)
    safeSend(ws, {
      type: 'conversation_info',
      conversationId,
      state: flowCtx.state,
      turnCount: flowCtx.turnCount,
      maxTurns: flowCtx.maxTurns,
      patientIdentified: flowCtx.patientIdentified,
    });

    safeSend(ws, {
      type: 'history',
      conversationId,
      messages: historyRows.map((m) => ({
        id: m.messageId,
        content: m.bodyText || '',
        sender: m.direction === 'in' ? 'user' : 'ai',
        timestamp: m.createdAt.toISOString(),
        metadata: m.payload as Record<string, unknown> | null,
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

        // Echo user message & broadcast
        const userPayload = JSON.stringify({
          type: 'message',
          id: userMsg.messageId,
          content: userText,
          sender: 'user',
          timestamp: userMsg.createdAt.toISOString(),
        });
        broadcastToConversation(conversationId, userPayload, ws);

        // ── 5b. Load and check flow context ──
        flowCtx = await flowManager.loadContext(conversationId) ?? flowManager.initContext();

        // Budget check
        if (flowManager.isBudgetExceeded(flowCtx)) {
          emitEvent(ws, conversationId, {
            type: 'budget_warning',
            message: 'Turn budget exceeded',
            turnCount: flowCtx.turnCount,
            maxTurns: flowCtx.maxTurns,
          });
        }

        if (flowManager.shouldWarnBudget(flowCtx)) {
          emitEvent(ws, conversationId, {
            type: 'budget_warning',
            message: 'Approaching turn limit',
            turnCount: flowCtx.turnCount,
            maxTurns: flowCtx.maxTurns,
          });
        }

        // ── 5c. Typing indicator ──
        emitEvent(ws, conversationId, { type: 'typing', isTyping: true });

        // ── 5d. Build system prompt + patient context + flow state ──
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

        flowCtx.patientIdentified = !!resolvedPatientId;

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

        // Add conversation flow state instructions
        systemPrompt += flowManager.getStatePrompt(flowCtx);

        // ── 5e. Fetch conversation history + compaction ──
        const allMessages = await app.prisma.conversationMessage.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'asc' },
        });

        let chatMessages: ChatMessage[] = allMessages.map((m) => ({
          role: m.direction === 'in' ? 'user' as const : 'assistant' as const,
          content: m.bodyText || '',
        }));

        // Session compaction
        const existingSummary = await app.prisma.conversationSummary.findFirst({
          where: { conversationId },
          orderBy: { createdAt: 'desc' },
          select: { summary: true },
        });

        const compactionResult = await compactor.compact(chatMessages, existingSummary?.summary);
        if (compactionResult.compacted) {
          chatMessages = compactionResult.messages;

          emitEvent(ws, conversationId, {
            type: 'compaction',
            originalCount: compactionResult.originalCount,
            compactedCount: compactionResult.compactedCount,
          });

          if (compactionResult.summary) {
            compactor.saveSummary(
              app.prisma, conversationId, compactionResult.summary, compactionResult.originalCount,
            ).catch(err => app.log.error({ err }, 'Failed to save compaction summary'));
          }
        }

        // ── 5f. Initialize tool registry ──
        const permissionLevel = resolvedPatientId ? 'identified' : 'anonymous';
        const toolRegistry = new ToolRegistry(
          app.prisma, orgId, resolvedPatientId, conversationId,
        );
        toolRegistry.setPermissionLevel(permissionLevel);
        toolRegistry.setChannel('web');
        const tools = toolRegistry.getToolDefinitions(permissionLevel);

        // ── AI usage limit check ──
        const usageCheck = await checkAndIncrement(app.prisma, orgId);
        if (!usageCheck.allowed) {
          ws.send(JSON.stringify({
            type: 'error',
            code: 'AI_LIMIT_EXCEEDED',
            message: AI_LIMIT_ERROR,
            usage: { current: usageCheck.current, limit: usageCheck.limit, remaining: 0 },
          }));
          return;
        }

        // ── 5g. Call LLM with tools ──
        const llmService = getLLMService();
        const llmResult = await llmService.chatWithTools(
          chatMessages,
          systemPrompt,
          tools,
          (name, args) => toolRegistry.executeTool(name, args),
          {
            maxIterations: 6,
            onToolCall: (toolName, args) => {
              const desc = TOOL_DESCRIPTIONS[toolName];
              emitEvent(ws, conversationId, {
                type: 'tool_invoked',
                tool: toolName,
                description: desc ?? { ar: toolName, en: toolName },
                args,
              });
            },
            onToolResult: (toolName, result) => {
              emitEvent(ws, conversationId, {
                type: 'tool_result',
                tool: toolName,
                success: !result.startsWith('Error'),
                preview: result.slice(0, 200),
              });
            },
          },
        );

        let response = llmResult.response;

        // ── 5h. Update conversation flow ──
        const toolCallNames = llmResult.toolCalls.map(tc => tc.toolName);
        const prevState = flowCtx.state;

        flowCtx = flowManager.detectIntentAndTransition(
          flowCtx.state, userText, toolCallNames, flowCtx,
        );
        flowCtx = flowManager.updateBookingProgress(
          flowCtx, toolCallNames, llmResult.toolCalls.map(tc => tc.result),
          llmResult.toolCalls.map(tc => ({ [tc.toolName]: tc.args })),
        );

        if (prevState !== flowCtx.state) {
          emitEvent(ws, conversationId, {
            type: 'state_change',
            from: prevState,
            to: flowCtx.state,
            booking: flowCtx.booking ?? null,
          });
        }

        // ── 5i. Guardrails ──
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

        // ── 5j. PII-redact AI response for DB ──
        let redactedResponse = response;
        try { redactedResponse = redactPII(response).redactedText; } catch { /* keep original */ }

        // ── 5k. Save AI response ──
        const aiMsg = await app.prisma.conversationMessage.create({
          data: {
            conversationId,
            direction: 'out',
            bodyText: redactedResponse,
            payload: {
              model: process.env.LLM_MODEL || 'gpt-4-turbo-preview',
              confidence: guardrailResult?.confidence ?? null,
              guardrailFlags: guardrailResult?.flags?.map((f) => f.type) ?? [],
              toolCalls: llmResult.toolCalls.map(tc => ({
                tool: tc.toolName,
                durationMs: tc.durationMs,
              })),
              iterations: llmResult.totalIterations,
              conversationState: flowCtx.state,
            },
          },
        });

        // Update last activity & save flow context
        await app.prisma.conversation.update({
          where: { conversationId },
          data: { lastActivityAt: new Date() },
        });
        await flowManager.saveContext(conversationId, flowCtx);

        // ── 5l. Typing off + send AI response ──
        emitEvent(ws, conversationId, { type: 'typing', isTyping: false });

        const aiPayload = {
          type: 'message',
          id: aiMsg.messageId,
          content: response,
          sender: 'ai',
          timestamp: aiMsg.createdAt.toISOString(),
          metadata: {
            confidence: guardrailResult?.confidence ?? null,
            toolsUsed: llmResult.toolCalls.map(tc => tc.toolName),
            state: flowCtx.state,
          },
        };
        safeSend(ws, aiPayload);
        broadcastToConversation(conversationId, JSON.stringify(aiPayload), ws);

        // ── 5m. Memory extraction (async, non-blocking) ──
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

        emitEvent(ws, conversationId, { type: 'typing', isTyping: false });
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
