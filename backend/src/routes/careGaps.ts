/**
 * Care Gap API Routes
 *
 * GET    /api/care-gaps/:orgId            — List detected care gaps
 * GET    /api/care-gaps/queue/:orgId      — Get priority outreach queue
 * PATCH  /api/care-gaps/:id               — Update gap status
 * POST   /api/care-gap-rules              — Create care gap rule
 * GET    /api/care-gap-rules/:orgId       — List rules for org
 * PATCH  /api/care-gap-rules/:id          — Update rule
 * POST   /api/care-gaps/scan/:orgId       — Trigger care gap scan
 * GET    /api/care-gaps/risk/:patientId   — Get patient risk score
 */
import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getPredictiveEngine } from '../services/analytics/predictiveEngine.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createRuleSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1),
  nameAr: z.string().optional(),
  condition: z.object({
    lastVisitDaysAgo: z.number().optional(),
    minAge: z.number().optional(),
    maxAge: z.number().optional(),
    sex: z.string().optional(),
    previousServices: z.array(z.string()).optional(),
    serviceNotReceivedDays: z.number().optional(),
    missedAppointmentsMin: z.number().optional(),
    noAppointmentDays: z.number().optional(),
  }),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  action: z.enum(['outbound_call', 'sms', 'whatsapp', 'flag_only']),
  messageEn: z.string().optional(),
  messageAr: z.string().optional(),
});

const updateRuleSchema = createRuleSchema.partial().omit({ orgId: true });

const listGapsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.string().optional(),
  priority: z.string().optional(),
});

const updateGapStatusSchema = z.object({
  status: z.enum(['open', 'contacted', 'scheduled', 'resolved', 'dismissed']),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export default async function careGapsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireActivated);

  const getEngine = () => getPredictiveEngine(app.prisma);

  // -----------------------------------------------------------------------
  // GET /care-gaps/:orgId — List detected care gaps
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/:orgId',
    async (request) => {
      const { orgId } = request.params;
      const query = listGapsQuerySchema.parse(request.query);

      if (request.user.orgId !== orgId) {
        return { error: 'Unauthorized' };
      }

      const engine = getEngine();
      return engine.listCareGaps(orgId, {
        status: query.status,
        priority: query.priority,
        page: query.page,
        limit: query.limit,
      });
    },
  );

  // -----------------------------------------------------------------------
  // POST /:orgId/scan — Trigger care gap scan (org-scoped alias)
  // -----------------------------------------------------------------------
  app.post<{ Params: { orgId: string } }>(
    '/:orgId/scan',
    async (request) => {
      const { orgId } = request.params;
      if (request.user.orgId !== orgId) return { error: 'Unauthorized' };
      const engine = getEngine();
      const result = await engine.scanForCareGaps(orgId);
      return { success: true, ...result };
    },
  );

  // -----------------------------------------------------------------------
  // GET /:orgId/risk — Org-level risk summary
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/:orgId/risk',
    async (request) => {
      const { orgId } = request.params;
      if (request.user.orgId !== orgId) return { error: 'Unauthorized' };
      const engine = getEngine();

      // Get all open care gaps to derive risk summary
      const gaps = await engine.listCareGaps(orgId, { status: 'open', page: 1, limit: 1000 });
      const data = gaps.data || [];
      const riskSummary = {
        totalOpenGaps: data.length,
        byPriority: {
          critical: data.filter((g: any) => g.priority === 'critical').length,
          high: data.filter((g: any) => g.priority === 'high').length,
          medium: data.filter((g: any) => g.priority === 'medium').length,
          low: data.filter((g: any) => g.priority === 'low').length,
        },
      };
      return riskSummary;
    },
  );

  // -----------------------------------------------------------------------
  // GET /:orgId/rules — List rules (org-scoped alias)
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/:orgId/rules',
    async (request) => {
      const { orgId } = request.params;
      if (request.user.orgId !== orgId) return { error: 'Unauthorized' };
      const engine = getEngine();
      const rules = await engine.listRules(orgId);
      return { data: rules };
    },
  );

  // -----------------------------------------------------------------------
  // POST /:orgId/rules — Create rule (org-scoped alias)
  // -----------------------------------------------------------------------
  app.post<{ Params: { orgId: string } }>(
    '/:orgId/rules',
    async (request) => {
      const { orgId } = request.params;
      if (request.user.orgId !== orgId) return { error: 'Unauthorized' };

      const body = createRuleSchema.parse({ ...(request.body as object), orgId });
      const engine = getEngine();
      const rule = await engine.createRule(body);
      return rule;
    },
  );

  // -----------------------------------------------------------------------
  // GET /care-gaps/queue/:orgId — Priority outreach queue
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/queue/:orgId',
    async (request) => {
      const { orgId } = request.params;
      const { limit } = z.object({ limit: z.coerce.number().default(50) }).parse(request.query);

      if (request.user.orgId !== orgId) {
        return { error: 'Unauthorized' };
      }

      const engine = getEngine();
      const queue = await engine.getOutreachQueue(orgId, limit);

      return { data: queue };
    },
  );

  // -----------------------------------------------------------------------
  // PATCH /care-gaps/:id — Update gap status
  // -----------------------------------------------------------------------
  app.patch<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const { id } = request.params;
      const body = updateGapStatusSchema.parse(request.body);

      // Verify the care gap belongs to the user's org
      const gap = await app.prisma.patientCareGap.findUnique({
        where: { careGapId: id },
      });
      if (!gap) {
        return reply.code(404).send({ error: 'Care gap not found' });
      }
      const gapPatient = await app.prisma.patient.findUnique({ where: { patientId: gap.patientId } });
      if (!gapPatient || gapPatient.orgId !== request.user.orgId) {
        return reply.code(404).send({ error: 'Care gap not found' });
      }

      const engine = getEngine();

      try {
        const updated = await engine.updateCareGapStatus(id, body.status);
        return { success: true, careGap: updated };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Update failed',
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // GET /care-gaps/risk/:patientId — Patient risk score
  // -----------------------------------------------------------------------
  app.get<{ Params: { patientId: string } }>(
    '/risk/:patientId',
    async (request, reply) => {
      const { patientId } = request.params;

      // Verify patient belongs to user's org
      const patient = await app.prisma.patient.findFirst({
        where: { patientId, orgId: request.user.orgId },
      });
      if (!patient) {
        return reply.code(404).send({ error: 'Patient not found' });
      }

      const engine = getEngine();
      const riskResult = await engine.calculateRiskScore(patientId);
      return riskResult;
    },
  );

  // -----------------------------------------------------------------------
  // POST /care-gaps/scan/:orgId — Trigger care gap scan
  // -----------------------------------------------------------------------
  app.post<{ Params: { orgId: string } }>(
    '/scan/:orgId',
    async (request) => {
      const { orgId } = request.params;

      if (request.user.orgId !== orgId) {
        return { error: 'Unauthorized' };
      }

      const engine = getEngine();
      const result = await engine.scanForCareGaps(orgId);

      return {
        success: true,
        ...result,
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Care Gap Rules routes (separate prefix)
// ---------------------------------------------------------------------------

export async function careGapRulesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireActivated);

  const getEngine = () => getPredictiveEngine(app.prisma);

  // -----------------------------------------------------------------------
  // POST / — Create care gap rule
  // -----------------------------------------------------------------------
  app.post('/', async (request: FastifyRequest) => {
    const body = createRuleSchema.parse(request.body);

    if (request.user.orgId !== body.orgId) {
      return { error: 'Unauthorized' };
    }

    const engine = getEngine();
    const rule = await engine.createRule(body);

    return rule;
  });

  // -----------------------------------------------------------------------
  // GET /:orgId — List rules for org
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/:orgId',
    async (request) => {
      const { orgId } = request.params;

      if (request.user.orgId !== orgId) {
        return { error: 'Unauthorized' };
      }

      const engine = getEngine();
      const rules = await engine.listRules(orgId);

      return { data: rules };
    },
  );

  // -----------------------------------------------------------------------
  // PATCH /:id — Update rule
  // -----------------------------------------------------------------------
  app.patch<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const { id } = request.params;
      const body = updateRuleSchema.parse(request.body);

      // Verify rule belongs to user's org
      const existing = await app.prisma.careGapRule.findUnique({ where: { careGapRuleId: id } });
      if (!existing || existing.orgId !== request.user.orgId) {
        return reply.code(404).send({ error: 'Rule not found' });
      }

      const engine = getEngine();

      try {
        const rule = await engine.updateRule(id, body as any);
        return { success: true, rule };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Update failed',
        };
      }
    },
  );
}
