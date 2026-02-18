/**
 * Call Summaries & Transcripts API
 * GET /api/calls – list voice calls with AI summaries
 * GET /api/calls/:callId/transcript – full transcript for a call
 * GET /api/calls/:callId/summary – AI summary for a call
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export default async function callSummariesRoutes(app: FastifyInstance) {
  /**
   * GET /api/calls
   * List voice calls with their AI analysis (summary, intent, recording URL)
   */
  app.get('/', {
    preHandler: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      intent?: string;
      from?: string;
      to?: string;
      direction?: string;
    };

    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '20'), 100);
    const skip = (page - 1) * limit;

    const user = (request as any).user;
    if (!user?.orgId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const where: Record<string, unknown> = { orgId: user.orgId };

    if (query.direction) {
      where.direction = query.direction;
    }
    if (query.from || query.to) {
      where.startedAt = {};
      if (query.from) (where.startedAt as Record<string, unknown>).gte = new Date(query.from);
      if (query.to) (where.startedAt as Record<string, unknown>).lte = new Date(query.to);
    }

    // Filter by intent in context JSON
    // We'll filter post-query if intent filter is specified

    const [calls, total] = await Promise.all([
      app.prisma.voiceCall.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
        include: {
          utterances: {
            orderBy: { timestamp: 'asc' },
            take: 3, // preview only
          },
          conversation: {
            include: {
              summaries: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      }),
      app.prisma.voiceCall.count({ where }),
    ]);

    // Apply intent filter in memory (since intent is in JSON context)
    let filteredCalls = calls;
    if (query.intent) {
      filteredCalls = calls.filter(
        (c) => (c.context as Record<string, unknown>)?.detectedIntent === query.intent
      );
    }

    const formatted = filteredCalls.map((call) => {
      const ctx = call.context as Record<string, unknown>;
      return {
        callId: call.callId,
        twilioCallSid: call.twilioCallSid,
        callerPhone: call.callerPhone,
        direction: call.direction,
        status: call.status,
        durationSec: call.durationSec,
        recordingUrl: call.recordingUrl,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        // AI analysis
        detectedIntent: ctx?.detectedIntent || null,
        postCallSummary: ctx?.postCallSummary || null,
        sentiment: ctx?.sentiment || null,
        keyTopics: ctx?.keyTopics || [],
        actionItems: ctx?.actionItems || [],
        appointmentBooked: ctx?.appointmentBooked || false,
        escalationNeeded: ctx?.escalationNeeded || false,
        // Conversation summary
        conversationSummary: call.conversation?.summaries?.[0] || null,
        // Preview utterances
        utterancePreview: call.utterances.map((u) => ({
          speaker: u.speaker,
          text: u.text.slice(0, 100),
          timestamp: u.timestamp,
        })),
      };
    });

    return {
      data: formatted,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  });

  /**
   * GET /api/calls/:callId/transcript
   * Full transcript for a specific call
   */
  app.get('/:callId/transcript', {
    preHandler: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { callId } = request.params as { callId: string };
    const user = (request as any).user;

    const call = await app.prisma.voiceCall.findFirst({
      where: { callId, orgId: user?.orgId },
      include: {
        utterances: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!call) {
      return reply.code(404).send({ error: 'Call not found' });
    }

    const ctx = call.context as Record<string, unknown>;

    return {
      callId: call.callId,
      twilioCallSid: call.twilioCallSid,
      callerPhone: call.callerPhone,
      direction: call.direction,
      durationSec: call.durationSec,
      recordingUrl: call.recordingUrl,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      // AI analysis
      detectedIntent: ctx?.detectedIntent || null,
      postCallSummary: ctx?.postCallSummary || null,
      sentiment: ctx?.sentiment || null,
      keyTopics: ctx?.keyTopics || [],
      actionItems: ctx?.actionItems || [],
      // Full transcript
      transcript: call.utterances.map((u) => ({
        utteranceId: u.utteranceId,
        speaker: u.speaker,
        text: u.text,
        confidence: u.confidence,
        dialect: u.dialect,
        durationMs: u.durationMs,
        timestamp: u.timestamp,
      })),
    };
  });

  /**
   * GET /api/calls/:callId/summary
   * AI summary for a specific call
   */
  app.get('/:callId/summary', {
    preHandler: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { callId } = request.params as { callId: string };
    const user = (request as any).user;

    const call = await app.prisma.voiceCall.findFirst({
      where: { callId, orgId: user?.orgId },
      include: {
        conversation: {
          include: {
            summaries: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!call) {
      return reply.code(404).send({ error: 'Call not found' });
    }

    const ctx = call.context as Record<string, unknown>;

    return {
      callId: call.callId,
      twilioCallSid: call.twilioCallSid,
      // From VoiceCall.context (AI-generated)
      detectedIntent: ctx?.detectedIntent || null,
      postCallSummary: ctx?.postCallSummary || null,
      sentiment: ctx?.sentiment || null,
      keyTopics: ctx?.keyTopics || [],
      actionItems: ctx?.actionItems || [],
      appointmentBooked: ctx?.appointmentBooked || false,
      escalationNeeded: ctx?.escalationNeeded || false,
      transcriptMessageCount: ctx?.transcriptMessageCount || 0,
      recordingUrl: call.recordingUrl,
      // From ConversationSummary table
      conversationSummaries: call.conversation?.summaries || [],
    };
  });

  /**
   * GET /api/calls/stats
   * Aggregate stats for calls (intent distribution, sentiment, etc.)
   */
  app.get('/stats', {
    preHandler: [(app as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user?.orgId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const query = request.query as { days?: string };
    const days = parseInt(query.days || '30');
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const calls = await app.prisma.voiceCall.findMany({
      where: { orgId: user.orgId, startedAt: { gte: since } },
      select: { context: true, status: true, durationSec: true, direction: true },
    });

    // Aggregate intents
    const intentCounts: Record<string, number> = {};
    const sentimentCounts: Record<string, number> = {};
    let appointmentsBooked = 0;
    let escalations = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const call of calls) {
      const ctx = call.context as Record<string, unknown>;
      const intent = (ctx?.detectedIntent as string) || 'unknown';
      const sentiment = (ctx?.sentiment as string) || 'neutral';

      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
      sentimentCounts[sentiment] = (sentimentCounts[sentiment] || 0) + 1;
      if (ctx?.appointmentBooked) appointmentsBooked++;
      if (ctx?.escalationNeeded) escalations++;
      if (call.durationSec) {
        totalDuration += call.durationSec;
        durationCount++;
      }
    }

    return {
      period: `${days} days`,
      totalCalls: calls.length,
      inbound: calls.filter((c) => c.direction === 'inbound').length,
      outbound: calls.filter((c) => c.direction === 'outbound').length,
      appointmentsBooked,
      escalations,
      avgDurationSec: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
      intentDistribution: intentCounts,
      sentimentDistribution: sentimentCounts,
    };
  });
}
