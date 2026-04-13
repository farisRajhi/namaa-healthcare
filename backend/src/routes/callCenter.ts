import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getCallRouter } from '../services/voice/callRouter.js';
import { getSmartRouter } from '../services/routing/smartRouter.js';

// ─── Schemas ────────────────────────────────────────────────────────────────────

const transferSchema = z.object({
  twilioCallSid: z.string().min(1),
  reason: z.string().min(1),
  targetDepartment: z.string().optional(),
});

const handoffAcceptSchema = z.object({
  handoffId: z.string().uuid(),
  agentId: z.string().min(1),
});

const handoffCompleteSchema = z.object({
  handoffId: z.string().uuid(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

// ─── Routes ─────────────────────────────────────────────────────────────────────

export default async function callCenterRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  const callRouter = getCallRouter();

  // ════════════════════════════════════════════════════════════════════════
  // Org-scoped aliases: GET /api/call-center/:orgId/<endpoint>
  // ════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { orgId: string } }>('/:orgId/status', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const smartRouter = getSmartRouter(app.prisma);
    const queueSummary = callRouter.getQueueSummary(orgId);
    const isAfterHours = smartRouter.isAfterHours();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalCallsToday, completedCalls, handoffs, avgDuration] = await Promise.all([
      app.prisma.voiceCall.count({ where: { orgId, startedAt: { gte: startOfToday } } }),
      app.prisma.voiceCall.count({ where: { orgId, status: 'completed', startedAt: { gte: startOfToday } } }),
      app.prisma.handoff.count({
        where: {
          createdAt: { gte: startOfToday },
          conversationId: {
            in: (await app.prisma.conversation.findMany({ where: { orgId }, select: { conversationId: true } })).map((c) => c.conversationId),
          },
        },
      }),
      app.prisma.voiceCall.aggregate({
        where: { orgId, status: 'completed', startedAt: { gte: startOfToday } },
        _avg: { durationSec: true },
      }),
    ]);

    const aiResolutionRate = totalCallsToday > 0 ? Math.round(((totalCallsToday - handoffs) / totalCallsToday) * 100) : 0;

    return {
      realtime: {
        activeCalls: queueSummary.active,
        byState: queueSummary.byState,
        byIntent: queueSummary.byIntent,
        avgDurationSec: queueSummary.avgDurationSec,
        isAfterHours,
      },
      today: {
        totalCalls: totalCallsToday,
        completedCalls,
        handoffs,
        aiResolutionRate,
        avgCallDurationSec: Math.round(avgDuration._avg.durationSec ?? 0),
      },
    };
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/queue', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const query = querySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;
    const where: Record<string, unknown> = { orgId };
    if (query.status) where.status = query.status;

    const [calls, total] = await Promise.all([
      app.prisma.voiceCall.findMany({
        where, skip, take: query.limit, orderBy: { startedAt: 'desc' },
        select: { callId: true, twilioCallSid: true, callerPhone: true, direction: true, status: true, detectedDialect: true, durationSec: true, startedAt: true, endedAt: true },
      }),
      app.prisma.voiceCall.count({ where }),
    ]);

    const data = calls.map((call) => {
      const liveCall = callRouter.getCall(call.twilioCallSid);
      return { ...call, live: liveCall ? { state: liveCall.state, intent: liveCall.intent, intentConfidence: liveCall.intentConfidence, verificationLevel: liveCall.verificationLevel } : null };
    });

    return { data, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/active', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    const activeCalls = callRouter.getActiveCalls(orgId);
    return {
      data: activeCalls.map((call) => ({
        callId: call.callId, twilioCallSid: call.twilioCallSid, callerPhone: call.callerPhone,
        state: call.state, intent: call.intent, intentConfidence: call.intentConfidence,
        verificationLevel: call.verificationLevel,
        durationSec: Math.round((Date.now() - call.startedAt.getTime()) / 1000),
        startedAt: call.startedAt.toISOString(),
      })),
      total: activeCalls.length,
    };
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/handoffs', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const query = querySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;
    const orgConversations = await app.prisma.conversation.findMany({ where: { orgId }, select: { conversationId: true } });
    const conversationIds = orgConversations.map((c) => c.conversationId);
    const where: Record<string, unknown> = { conversationId: { in: conversationIds } };
    if (query.status) where.status = query.status;

    const [handoffs, total] = await Promise.all([
      app.prisma.handoff.findMany({ where, skip, take: query.limit, orderBy: { createdAt: 'desc' } }),
      app.prisma.handoff.count({ where }),
    ]);

    return { data: handoffs, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  });

  // ════════════════════════════════════════════════════════════════════════
  // Original routes (no orgId in path)
  // ════════════════════════════════════════════════════════════════════════

  // ─── Dashboard status ───────────────────────────────────────────────────

  /**
   * POST /api/call-center/status
   * Real-time call center dashboard data
   */
  app.post('/status', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const smartRouter = getSmartRouter(app.prisma);

    const queueSummary = callRouter.getQueueSummary(orgId);
    const isAfterHours = smartRouter.isAfterHours();

    // DB aggregates for the current day
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalCallsToday, completedCalls, handoffs, avgDuration] = await Promise.all([
      app.prisma.voiceCall.count({
        where: { orgId, startedAt: { gte: startOfToday } },
      }),
      app.prisma.voiceCall.count({
        where: { orgId, status: 'completed', startedAt: { gte: startOfToday } },
      }),
      app.prisma.handoff.count({
        where: {
          createdAt: { gte: startOfToday },
          conversationId: {
            in: (
              await app.prisma.conversation.findMany({
                where: { orgId },
                select: { conversationId: true },
              })
            ).map((c) => c.conversationId),
          },
        },
      }),
      app.prisma.voiceCall.aggregate({
        where: { orgId, status: 'completed', startedAt: { gte: startOfToday } },
        _avg: { durationSec: true },
      }),
    ]);

    const aiResolutionRate =
      totalCallsToday > 0
        ? Math.round(((totalCallsToday - handoffs) / totalCallsToday) * 100)
        : 0;

    return {
      realtime: {
        activeCalls: queueSummary.active,
        byState: queueSummary.byState,
        byIntent: queueSummary.byIntent,
        avgDurationSec: queueSummary.avgDurationSec,
        isAfterHours,
      },
      today: {
        totalCalls: totalCallsToday,
        completedCalls,
        handoffs,
        aiResolutionRate,
        avgCallDurationSec: Math.round(avgDuration._avg.durationSec ?? 0),
      },
    };
  });

  // ─── Active calls ─────────────────────────────────────────────────────────

  /**
   * GET /api/call-center/active-calls
   * List all active AI calls for the org
   */
  app.get('/active-calls', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const activeCalls = callRouter.getActiveCalls(orgId);

    return {
      data: activeCalls.map((call) => ({
        callId: call.callId,
        twilioCallSid: call.twilioCallSid,
        callerPhone: call.callerPhone,
        state: call.state,
        intent: call.intent,
        intentConfidence: call.intentConfidence,
        verificationLevel: call.verificationLevel,
        durationSec: Math.round((Date.now() - call.startedAt.getTime()) / 1000),
        startedAt: call.startedAt.toISOString(),
      })),
      total: activeCalls.length,
    };
  });

  // ─── Queue ────────────────────────────────────────────────────────────────

  /**
   * GET /api/call-center/queue
   * Show waiting / in-progress / completed calls from DB
   */
  app.get('/queue', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = querySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where: Record<string, unknown> = { orgId };
    if (query.status) {
      where.status = query.status;
    }

    const [calls, total] = await Promise.all([
      app.prisma.voiceCall.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { startedAt: 'desc' },
        select: {
          callId: true,
          twilioCallSid: true,
          callerPhone: true,
          direction: true,
          status: true,
          detectedDialect: true,
          durationSec: true,
          startedAt: true,
          endedAt: true,
        },
      }),
      app.prisma.voiceCall.count({ where }),
    ]);

    // Augment with live state for in-progress calls
    const data = calls.map((call) => {
      const liveCall = callRouter.getCall(call.twilioCallSid);
      return {
        ...call,
        live: liveCall
          ? {
              state: liveCall.state,
              intent: liveCall.intent,
              intentConfidence: liveCall.intentConfidence,
              verificationLevel: liveCall.verificationLevel,
            }
          : null,
      };
    });

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // ─── Transfer call to human ───────────────────────────────────────────────

  /**
   * POST /api/call-center/transfer
   * Initiate a warm handoff from AI to human agent
   */
  app.post('/transfer', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = transferSchema.parse(request.body);

    const call = callRouter.getCall(body.twilioCallSid);
    if (!call || call.orgId !== orgId) {
      return { error: 'Active call not found' };
    }

    const smartRouter = getSmartRouter(app.prisma);

    // Load conversation history if available
    let conversationHistory: Array<{ role: string; content: string }> = [];
    if (call.conversationId) {
      const messages = await app.prisma.conversationMessage.findMany({
        where: { conversationId: call.conversationId },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: { direction: true, bodyText: true },
      });
      conversationHistory = messages
        .filter((m) => m.bodyText)
        .map((m) => ({
          role: m.direction === 'in' ? 'patient' : 'ai',
          content: m.bodyText!,
        }));
    }

    const handoff = await smartRouter.warmHandoff({
      conversationId: call.conversationId ?? call.callId,
      reason: body.reason,
      callerPhone: call.callerPhone,
      patientId: call.patientId,
      intent: call.intent,
      verificationLevel: call.verificationLevel,
      conversationHistory,
    });

    // Update call state
    callRouter.transitionState(body.twilioCallSid, 'wrap_up');

    return {
      success: true,
      handoff,
    };
  });

  // ─── Handoff management ───────────────────────────────────────────────────

  /**
   * POST /api/call-center/handoff/accept
   * Agent accepts a pending handoff
   */
  app.post('/handoff/accept', async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const body = handoffAcceptSchema.parse(request.body);

    // Verify handoff belongs to user's org via conversation lookup
    const handoff = await app.prisma.handoff.findUnique({
      where: { handoffId: body.handoffId },
    });
    if (!handoff) {
      return reply.code(404).send({ error: 'Handoff not found' });
    }
    const conversation = await app.prisma.conversation.findFirst({
      where: { conversationId: handoff.conversationId, orgId },
    });
    if (!conversation) {
      return reply.code(404).send({ error: 'Handoff not found' });
    }

    const smartRouter = getSmartRouter(app.prisma);
    await smartRouter.acceptHandoff(body.handoffId, body.agentId);
    return { success: true };
  });

  /**
   * POST /api/call-center/handoff/complete
   * Agent marks handoff as completed
   */
  app.post('/handoff/complete', async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const body = handoffCompleteSchema.parse(request.body);

    // Verify handoff belongs to user's org via conversation lookup
    const handoff = await app.prisma.handoff.findUnique({
      where: { handoffId: body.handoffId },
    });
    if (!handoff) {
      return reply.code(404).send({ error: 'Handoff not found' });
    }
    const conversation = await app.prisma.conversation.findFirst({
      where: { conversationId: handoff.conversationId, orgId },
    });
    if (!conversation) {
      return reply.code(404).send({ error: 'Handoff not found' });
    }

    const smartRouter = getSmartRouter(app.prisma);
    await smartRouter.completeHandoff(body.handoffId);
    return { success: true };
  });

  // ─── Pending handoffs list ────────────────────────────────────────────────

  /**
   * GET /api/call-center/handoffs
   * List all handoffs with optional status filter
   */
  app.get('/handoffs', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = querySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    // Get conversation IDs for this org
    const orgConversations = await app.prisma.conversation.findMany({
      where: { orgId },
      select: { conversationId: true },
    });
    const conversationIds = orgConversations.map((c) => c.conversationId);

    const where: Record<string, unknown> = {
      conversationId: { in: conversationIds },
    };
    if (query.status) {
      where.status = query.status;
    }

    const [handoffs, total] = await Promise.all([
      app.prisma.handoff.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      app.prisma.handoff.count({ where }),
    ]);

    return {
      data: handoffs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // ─── Agent suggestions ────────────────────────────────────────────────────

  /**
   * POST /api/call-center/suggest
   * Get AI suggestions for an agent assisting a call
   */
  app.post('/suggest', async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const body = z
      .object({
        conversationId: z.string().uuid(),
        utterance: z.string().min(1),
      })
      .parse(request.body);

    // Verify conversation belongs to user's org
    const conversation = await app.prisma.conversation.findFirst({
      where: { conversationId: body.conversationId, orgId },
    });
    if (!conversation) {
      return reply.code(404).send({ error: 'Conversation not found' });
    }

    const smartRouter = getSmartRouter(app.prisma);
    const suggestions = await smartRouter.getAgentSuggestions(
      body.conversationId,
      body.utterance,
    );

    return { suggestions };
  });
}
