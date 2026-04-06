import { FastifyInstance, FastifyRequest } from 'fastify';
import { getUsage } from '../services/usage/aiUsageLimiter.js';

export default async function usageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /api/usage — current month's AI response usage for the org
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    return getUsage(app.prisma, orgId);
  });
}
