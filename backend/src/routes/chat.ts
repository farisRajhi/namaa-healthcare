import { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { getLLMService, ChatMessage } from '../services/llm.js';
import { buildSystemPrompt } from '../services/systemPrompt.js';
import { GuardrailsService, ValidationContext } from '../services/ai/guardrails.js';
import { ToolRegistry } from '../services/ai/toolRegistry.js';
import { ConversationFlowManager } from '../services/ai/conversationFlow.js';
import { SessionCompactor } from '../services/ai/sessionCompactor.js';
import { getIdentityVerifier, VerificationLevel } from '../services/patient/identityVerifier.js';
import { redactPII } from '../services/security/piiRedactor.js';
import { getContextBuilder } from '../services/patient/contextBuilder.js';
import { checkAndIncrement, AI_LIMIT_ERROR } from '../services/usage/aiUsageLimiter.js';

const sendMessageSchema = z.object({
  conversationId: z.string().uuid().nullish(),
  message: z.string().min(1).max(2000),
});

export default async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Phase 4.1: Rate limiting — 30 messages per user per 5 minutes
  await app.register(rateLimit, {
    max: 30,
    timeWindow: '5 minutes',
    keyGenerator: (request: FastifyRequest) => {
      return (request.user as any)?.userId ?? request.ip;
    },
    errorResponseBuilder: () => ({
      error: 'تم تجاوز الحد الأقصى للرسائل. يرجى المحاولة بعد قليل. Rate limit exceeded. Please try again shortly.',
    }),
  });

  const flowManager = new ConversationFlowManager(app.prisma);
  const compactor = new SessionCompactor();

  // GET /api/chat/readiness - Check if org is ready for test chat
  app.get('/readiness', async (request: FastifyRequest) => {
    const { orgId } = request.user;

    const [departmentCount, facilityCount, providerWithAvailability] = await Promise.all([
      app.prisma.department.count({ where: { orgId } }),
      app.prisma.facility.count({ where: { orgId } }),
      app.prisma.provider.findFirst({
        where: {
          orgId,
          active: true,
          availabilityRules: { some: {} },
        },
      }),
    ]);

    const hasDepartment = departmentCount >= 1;
    const hasFacility = facilityCount >= 1;
    const hasProviderWithAvailability = !!providerWithAvailability;
    const isReady = hasDepartment && hasFacility && hasProviderWithAvailability;

    return {
      isReady,
      requirements: {
        hasDepartment,
        hasFacility,
        hasProviderWithAvailability,
      },
      counts: {
        departments: departmentCount,
        facilities: facilityCount,
      },
    };
  });

  // POST /api/chat/message - Send a message (with tool calling + flow control)
  app.post('/message', async (request: FastifyRequest) => {
    const { orgId, userId, email } = request.user;
    const body = sendMessageSchema.parse(request.body);

    // Check readiness
    const [departmentCount, facilityCount, providerWithAvailability] = await Promise.all([
      app.prisma.department.count({ where: { orgId } }),
      app.prisma.facility.count({ where: { orgId } }),
      app.prisma.provider.findFirst({
        where: { orgId, active: true, availabilityRules: { some: {} } },
      }),
    ]);

    if (departmentCount === 0 || facilityCount === 0 || !providerWithAvailability) {
      return { error: 'Organization is not ready for test chat. Please add departments, facilities, and providers with availability.' };
    }

    // Get or create MessagingUser
    let messagingUser = await app.prisma.messagingUser.findFirst({
      where: { orgId, channel: 'web', externalUserId: userId },
    });

    if (!messagingUser) {
      messagingUser = await app.prisma.messagingUser.create({
        data: {
          orgId,
          channel: 'web',
          externalUserId: userId,
          displayName: email,
        },
      });
    }

    // Get or create conversation
    let conversationId = body.conversationId;
    let conversation;

    if (conversationId) {
      conversation = await app.prisma.conversation.findFirst({
        where: { conversationId, orgId, messagingUserId: messagingUser.messagingUserId },
      });
      if (!conversation) {
        return { error: 'Conversation not found' };
      }
    } else {
      conversation = await app.prisma.conversation.create({
        data: {
          orgId,
          messagingUserId: messagingUser.messagingUserId,
          channel: 'web',
          externalThreadId: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
      conversationId = conversation.conversationId;
    }

    // Save user message (PII redacted for logging)
    let userMessageRedacted = body.message;
    try {
      userMessageRedacted = redactPII(body.message).redactedText;
    } catch (_) { /* keep original if redaction fails */ }
    await app.prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: 'in',
        bodyText: userMessageRedacted,
        payload: { source: 'test_chat', userId },
      },
    });

    // Build system prompt with org context
    let systemPrompt = await buildSystemPrompt(app.prisma, orgId);

    // ── Patient Context: enrich system prompt with patient memory ──
    let resolvedPatientId: string | null = conversation.patientId ?? null;
    try {
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
        const contextBuilder = getContextBuilder(app.prisma);
        const patientContext = await contextBuilder.buildPatientContext(resolvedPatientId);
        if (patientContext) {
          systemPrompt += '\n' + patientContext;
        }
      }
    } catch (ctxErr) {
      app.log.error({ err: ctxErr }, 'Failed to build patient context — continuing without it');
    }

    // ── Load conversation flow context ──
    let flowCtx = await flowManager.loadContext(conversationId);
    if (!flowCtx) flowCtx = flowManager.initContext(undefined, !!resolvedPatientId);
    flowCtx.patientIdentified = !!resolvedPatientId;

    // Add flow state instructions to system prompt
    systemPrompt += flowManager.getStatePrompt(flowCtx);

    // ── Session Compaction ──
    const allMessages = await app.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    let chatMessages: ChatMessage[] = allMessages.map(m => ({
      role: m.direction === 'in' ? 'user' as const : 'assistant' as const,
      content: m.bodyText || '',
    }));

    const existingSummary = await app.prisma.conversationSummary.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      select: { summary: true },
    });

    const compactionResult = await compactor.compact(chatMessages, existingSummary?.summary);
    if (compactionResult.compacted) {
      chatMessages = compactionResult.messages;
      if (compactionResult.summary) {
        compactor.saveSummary(
          app.prisma, conversationId, compactionResult.summary, compactionResult.originalCount,
        ).catch(err => app.log.error({ err }, 'Failed to save compaction summary'));
      }
    }

    // ── Tool Registry ──
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
      const lang = request.headers['accept-language']?.startsWith('en') ? 'en' : 'ar';
      const err: any = new Error(AI_LIMIT_ERROR[lang]);
      err.statusCode = 429;
      err.code = 'AI_LIMIT_EXCEEDED';
      err.usage = { current: usageCheck.current, limit: usageCheck.limit, remaining: 0 };
      throw err;
    }

    // ── Call LLM with tools ──
    const llmService = getLLMService();
    const llmResult = await llmService.chatWithTools(
      chatMessages,
      systemPrompt,
      tools,
      (name, args) => toolRegistry.executeTool(name, args),
      { maxIterations: 6 },
    );

    let response = llmResult.response;

    // ── Update conversation flow ──
    const toolCallNames = llmResult.toolCalls.map(tc => tc.toolName);
    const prevState = flowCtx.state;

    flowCtx = flowManager.detectIntentAndTransition(
      flowCtx.state, body.message, toolCallNames, flowCtx,
    );
    flowCtx = flowManager.updateBookingProgress(
      flowCtx, toolCallNames, llmResult.toolCalls.map(tc => tc.result),
      llmResult.toolCalls.map(tc => ({ [tc.toolName]: tc.args })),
    );

    // ── AI Guardrails: validate response before sending ──
    let guardrailResult = null;
    try {
      const guardrails = new GuardrailsService(app.prisma);
      const validationContext: ValidationContext = {
        orgId,
        conversationId,
        userMessage: body.message,
        aiResponse: response,
      };
      guardrailResult = await guardrails.validateResponse(validationContext);

      if (!guardrailResult.approved && guardrailResult.sanitizedResponse) {
        app.log.warn(
          { flags: guardrailResult.flags },
          'Guardrails blocked AI response — using safe replacement',
        );
        response = guardrailResult.sanitizedResponse;
      }
    } catch (err) {
      app.log.error({ err }, 'Guardrails validation failed — using original response');
    }

    // ── Identity Verification ──
    let verificationLevel = VerificationLevel.Anonymous;
    try {
      const identityVerifier = getIdentityVerifier(app.prisma);
      const convContext = (conversation.context as Record<string, unknown>) || {};
      const callerPhone = (convContext.callerPhone as string) || '';
      if (callerPhone) {
        const session = identityVerifier.getOrCreateSession(conversationId, callerPhone);
        verificationLevel = session.level;

        const sensitivePatterns = /\b(موعد|مواعيد|سجل|ملف|appointment|record|medical)\b/i;
        if (sensitivePatterns.test(body.message) && session.level < VerificationLevel.PhoneMatched) {
          const isArabic = /[\u0600-\u06FF]/.test(body.message);
          response = isArabic
            ? 'للوصول إلى بياناتك، أحتاج للتحقق من هويتك أولاً. هل يمكنك تأكيد رقم هاتفك المسجل لدينا؟'
            : 'To access your data, I need to verify your identity first. Can you confirm the phone number we have on file?';
        }
      }
    } catch (err) {
      app.log.error({ err }, 'Identity verification check failed — continuing');
    }

    // ── PII Redaction ──
    let redactedResponse = response;
    try {
      const responseRedaction = redactPII(response);
      redactedResponse = responseRedaction.redactedText;
    } catch (err) {
      app.log.error({ err }, 'PII redaction failed — saving original text');
      redactedResponse = response;
    }

    // Save assistant response
    await app.prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: 'out',
        bodyText: redactedResponse,
        payload: {
          model: process.env.LLM_MODEL || 'gpt-4-turbo-preview',
          confidence: guardrailResult?.confidence ?? null,
          guardrailFlags: guardrailResult?.flags?.map(f => f.type) ?? [],
          toolCalls: llmResult.toolCalls.map(tc => ({
            tool: tc.toolName,
            durationMs: tc.durationMs,
          })),
          iterations: llmResult.totalIterations,
          conversationState: flowCtx.state,
        } as unknown as Record<string, string>,
      },
    });

    // Update conversation last activity + save flow context
    await app.prisma.conversation.update({
      where: { conversationId },
      data: { lastActivityAt: new Date() },
    });
    await flowManager.saveContext(conversationId, flowCtx);

    // ── Memory Extraction (async) ──
    if (resolvedPatientId) {
      const contextBuilder = getContextBuilder(app.prisma);
      const { redactedText: redactedMessage } = redactPII(body.message);
      contextBuilder
        .extractMemories(
          resolvedPatientId,
          [{ direction: 'in', bodyText: redactedMessage }],
          conversationId,
        )
        .catch((err) => {
          app.log.error({ err }, 'Failed to extract memories from chat');
        });
    }

    return {
      conversationId,
      response,
      confidence: guardrailResult?.confidence ?? null,
      verificationLevel,
      // New enriched response data
      toolCalls: llmResult.toolCalls.map(tc => ({
        tool: tc.toolName,
        durationMs: tc.durationMs,
      })),
      conversationState: flowCtx.state,
      stateTransition: prevState !== flowCtx.state
        ? { from: prevState, to: flowCtx.state }
        : null,
      turnCount: flowCtx.turnCount,
      compacted: compactionResult.compacted,
    };
  });

  // GET /api/chat/conversations - List test conversations for this user
  app.get('/conversations', async (request: FastifyRequest) => {
    const { orgId, userId } = request.user;

    const messagingUser = await app.prisma.messagingUser.findFirst({
      where: { orgId, channel: 'web', externalUserId: userId },
    });

    if (!messagingUser) {
      return { data: [] };
    }

    const conversations = await app.prisma.conversation.findMany({
      where: {
        orgId,
        messagingUserId: messagingUser.messagingUserId,
        channel: 'web',
      },
      orderBy: { lastActivityAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return { data: conversations };
  });

  // POST /api/chat/new - Start a new conversation
  app.post('/new', async (request: FastifyRequest) => {
    const { orgId, userId, email } = request.user;

    let messagingUser = await app.prisma.messagingUser.findFirst({
      where: { orgId, channel: 'web', externalUserId: userId },
    });

    if (!messagingUser) {
      messagingUser = await app.prisma.messagingUser.create({
        data: {
          orgId,
          channel: 'web',
          externalUserId: userId,
          displayName: email,
        },
      });
    }

    const conversation = await app.prisma.conversation.create({
      data: {
        orgId,
        messagingUserId: messagingUser.messagingUserId,
        channel: 'web',
        externalThreadId: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

    return conversation;
  });

  // GET /api/chat/conversation/:id - Get conversation with messages
  app.get<{ Params: { id: string } }>('/conversation/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const conversation = await app.prisma.conversation.findFirst({
      where: { conversationId: id, orgId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      return { error: 'Conversation not found' };
    }

    return conversation;
  });
}
