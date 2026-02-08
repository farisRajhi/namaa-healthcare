import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getLLMService, ChatMessage } from '../services/llm.js';
import { buildSystemPrompt } from '../services/systemPrompt.js';

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

    // Save user message
    await app.prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: 'in',
        bodyText: body.message,
        payload: { source: 'test_chat', userId },
      },
    });

    // Build system prompt with org context
    const systemPrompt = await buildSystemPrompt(app.prisma, orgId);

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
    const response = await llmService.chat(chatMessages, systemPrompt);

    // Save assistant response
    await app.prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: 'out',
        bodyText: response,
        payload: { model: process.env.LLM_MODEL || 'gpt-4-turbo-preview' },
      },
    });

    // Update conversation last activity
    await app.prisma.conversation.update({
      where: { conversationId },
      data: { lastActivityAt: new Date() },
    });

    return {
      conversationId,
      response,
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
