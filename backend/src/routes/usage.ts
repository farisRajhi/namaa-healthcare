import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  getUsage,
  resetAllConversationTokens,
  resetConversationTokens,
  resetMonthlyUsage,
  resolveOrgPlan,
} from '../services/usage/aiUsageLimiter.js';

export default async function usageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireActivated);

  // GET /api/usage — current month's AI token usage for the org.
  // Resolve the plan via resolveOrgPlan so trialing orgs (no subscription row
  // yet) see their promised Professional budget instead of falling through to
  // the Starter cap.
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const plan = await resolveOrgPlan(app.prisma, orgId);
    return getUsage(app.prisma, orgId, plan);
  });

  // POST /api/usage/reset — clear the org's monthly token counter and every
  // conversation's running total. Unblocks sessions hit by CONVERSATION_CAP_ERROR
  // or AI_LIMIT_ERROR without waiting for the next month.
  app.post('/reset', async (request: FastifyRequest<{
    Body?: { scope?: 'conversation' | 'org'; conversationId?: string }
  }>, reply: FastifyReply) => {
    const { orgId } = request.user;
    const scope = request.body?.scope ?? 'org';

    if (scope === 'conversation') {
      const conversationId = request.body?.conversationId;
      if (!conversationId) {
        return reply.code(400).send({ error: 'conversationId required when scope=conversation' });
      }
      try {
        const result = await resetConversationTokens(app.prisma, orgId, conversationId);
        return { ok: true, ...result };
      } catch (err: any) {
        if (err?.statusCode === 404) {
          return reply.code(404).send({ error: 'Conversation not found' });
        }
        throw err;
      }
    }

    const conversations = await resetAllConversationTokens(app.prisma, orgId);
    const monthly = await resetMonthlyUsage(app.prisma, orgId);
    return { ok: true, ...conversations, monthly };
  });
}
