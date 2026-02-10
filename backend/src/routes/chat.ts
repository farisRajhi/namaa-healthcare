import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getLLMService, ChatMessage } from '../services/llm.js';
import { buildSystemPrompt } from '../services/systemPrompt.js';
import { GuardrailsService, ValidationContext } from '../services/ai/guardrails.js';
import { getIdentityVerifier, VerificationLevel } from '../services/patient/identityVerifier.js';
import { redactPII } from '../services/security/piiRedactor.js';
import { getContextBuilder } from '../services/patient/contextBuilder.js';

const sendMessageSchema = z.object({
  conversationId: z.string().uuid().nullish(),
  message: z.string().min(1).max(2000),
});

export default async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

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

  // POST /api/chat/message - Send a message
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

    // Get or create MessagingUser for this admin
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
          currentStep: 'test_chat',
          context: { type: 'test_chat', userId },
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
      // If conversation has a linked patient, build context
      if (!resolvedPatientId) {
        // Try to resolve patient from messaging user link
        const patientLink = await app.prisma.messagingUserPatientLink.findFirst({
          where: { messagingUserId: messagingUser.messagingUserId, isDefault: true },
        });
        if (patientLink) {
          resolvedPatientId = patientLink.patientId;
          // Link patient to conversation for future messages
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

    // Fetch conversation history (last 20 messages)
    const historyMessages = await app.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    // Convert to LLM format
    const chatMessages: ChatMessage[] = historyMessages.map(m => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.bodyText || '',
    }));

    // Call LLM
    const llmService = getLLMService();
    let response = await llmService.chat(chatMessages, systemPrompt);

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

    // ── Identity Verification: check context for sensitive requests ──
    let verificationLevel = VerificationLevel.Anonymous;
    try {
      const identityVerifier = getIdentityVerifier(app.prisma);
      const convContext = (conversation.context as Record<string, unknown>) || {};

      // If the conversation has a caller phone, run verification
      const callerPhone = (convContext.callerPhone as string) || '';
      if (callerPhone) {
        const session = identityVerifier.getOrCreateSession(conversationId, callerPhone);
        verificationLevel = session.level;

        // Detect sensitive data requests (appointments, prescriptions, medical records)
        const sensitivePatterns = /\b(موعد|مواعيد|وصفة|دواء|سجل|ملف|appointment|prescription|record|medical)\b/i;
        if (sensitivePatterns.test(body.message) && session.level < VerificationLevel.PhoneMatched) {
          // Patient is requesting sensitive data without verification
          const isArabic = /[\u0600-\u06FF]/.test(body.message);
          response = isArabic
            ? 'للوصول إلى بياناتك، أحتاج للتحقق من هويتك أولاً. هل يمكنك تأكيد رقم هاتفك المسجل لدينا؟'
            : 'To access your data, I need to verify your identity first. Can you confirm the phone number we have on file?';
        }
      }
    } catch (err) {
      app.log.error({ err }, 'Identity verification check failed — continuing');
    }

    // ── PII Redaction: redact PII before saving to DB ──
    let redactedUserMessage = body.message;
    let redactedResponse = response;
    try {
      const userRedaction = redactPII(body.message);
      redactedUserMessage = userRedaction.redactedText;
      const responseRedaction = redactPII(response);
      redactedResponse = responseRedaction.redactedText;
    } catch (err) {
      app.log.error({ err }, 'PII redaction failed — saving original text');
      redactedUserMessage = body.message;
      redactedResponse = response;
    }

    // Save assistant response (with PII-redacted text in bodyText, original in payload)
    await app.prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: 'out',
        bodyText: redactedResponse,
        payload: {
          model: process.env.LLM_MODEL || 'gpt-4-turbo-preview',
          confidence: guardrailResult?.confidence ?? null,
          guardrailFlags: guardrailResult?.flags?.map(f => f.type) ?? [],
        },
      },
    });

    // Update conversation last activity
    await app.prisma.conversation.update({
      where: { conversationId },
      data: { lastActivityAt: new Date() },
    });

    // ── Memory Extraction: auto-save patient info from conversation ──
    if (resolvedPatientId) {
      // Run async — don't block response
      const contextBuilder = getContextBuilder(app.prisma);
      contextBuilder
        .extractMemories(
          resolvedPatientId,
          [{ direction: 'in', bodyText: body.message }],
          conversationId,
        )
        .catch((err) => {
          app.log.error({ err }, 'Failed to extract memories from chat');
        });
    }

    return {
      conversationId,
      response, // Send the original (or guardrail-replaced) response to user
      confidence: guardrailResult?.confidence ?? null,
      verificationLevel,
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

    // Create new conversation
    const conversation = await app.prisma.conversation.create({
      data: {
        orgId,
        messagingUserId: messagingUser.messagingUserId,
        channel: 'web',
        externalThreadId: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: 'active',
        currentStep: 'test_chat',
        context: { type: 'test_chat', userId },
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
