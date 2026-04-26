import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FaqEngine, FaqCategory, TriageSeverity, TriageAction } from '../services/knowledge/faqEngine.js';

// ─────────────────────────────────────────────────────────
// FAQ & Triage API Routes
// ─────────────────────────────────────────────────────────

const CATEGORIES = ['general', 'insurance', 'procedures', 'locations', 'policies'] as const;
const SEVERITIES = ['emergency', 'urgent', 'routine'] as const;
const ACTIONS = ['call_emergency', 'schedule_urgent', 'schedule_routine', 'transfer_nurse'] as const;

const createFaqSchema = z.object({
  category: z.enum(CATEGORIES),
  questionEn: z.string().min(1),
  questionAr: z.string().min(1),
  answerEn: z.string().min(1),
  answerAr: z.string().min(1),
  priority: z.number().int().default(0),
});

const updateFaqSchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  questionEn: z.string().min(1).optional(),
  questionAr: z.string().min(1).optional(),
  answerEn: z.string().min(1).optional(),
  answerAr: z.string().min(1).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const searchSchema = z.object({
  query: z.string().min(1),
  category: z.enum(CATEGORIES).optional(),
  lang: z.enum(['en', 'ar']).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

const triageSchema = z.object({
  symptoms: z.string().min(1),
});

const createTriageRuleSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1),
  severity: z.enum(SEVERITIES),
  responseEn: z.string().min(1),
  responseAr: z.string().min(1),
  action: z.enum(ACTIONS),
});

const faqQuerySchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export default async function faqRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  const engine = new FaqEngine(app.prisma);

  // ──── GET /api/faq/:orgId — List FAQs (with category filter) ────
  app.get<{ Params: { orgId: string } }>('/:orgId', async (request, reply) => {
    const { orgId } = request.params;
    if (request.user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    const query = faqQuerySchema.parse(request.query);

    return engine.listByOrg(orgId, {
      category: query.category as FaqCategory | undefined,
      page: query.page,
      limit: query.limit,
    });
  });

  // ──── POST /api/faq — Create FAQ entry ────
  app.post('/', async (request: FastifyRequest) => {
    const { orgId: userOrgId } = request.user;
    const body = createFaqSchema.parse(request.body);

    const entry = await engine.create({
      orgId: userOrgId,
      category: body.category as FaqCategory,
      questionEn: body.questionEn,
      questionAr: body.questionAr,
      answerEn: body.answerEn,
      answerAr: body.answerAr,
      priority: body.priority,
    });

    return { data: entry };
  });

  // ──── PATCH /api/faq/:id — Update FAQ ────
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = updateFaqSchema.parse(request.body);

    // Verify FAQ belongs to user's org
    const existing = await app.prisma.faqEntry.findUnique({ where: { faqId: id } });
    if (!existing || existing.orgId !== request.user.orgId) {
      return reply.code(404).send({ error: 'FAQ entry not found' });
    }

    try {
      const updated = await engine.update(id, body as any);
      return { data: updated };
    } catch {
      return { error: 'FAQ entry not found' };
    }
  });

  // ──── DELETE /api/faq/:id — Delete FAQ ────
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    // Verify FAQ belongs to user's org
    const existing = await app.prisma.faqEntry.findUnique({ where: { faqId: id } });
    if (!existing || existing.orgId !== request.user.orgId) {
      return reply.code(404).send({ error: 'FAQ entry not found' });
    }

    try {
      await engine.delete(id);
      return { success: true };
    } catch {
      return { error: 'FAQ entry not found' };
    }
  });

  // ──── POST /api/faq/search — Semantic search FAQs ────
  app.post('/search', async (request: FastifyRequest) => {
    const { orgId: userOrgId } = request.user;
    const body = searchSchema.parse(request.body);
    const orgId = userOrgId;

    const results = await engine.search(orgId, body.query, {
      category: body.category as FaqCategory | undefined,
      lang: body.lang,
      limit: body.limit,
    });

    return { data: results };
  });

  // ──── POST /api/faq/triage — Symptom triage ────
  app.post('/triage', async (request: FastifyRequest) => {
    const { orgId: userOrgId } = request.user;
    const body = triageSchema.parse(request.body);
    const orgId = userOrgId;

    const result = await engine.triageSymptoms(orgId, body.symptoms);

    return { data: result };
  });

  // ──── GET /api/faq/hours/:facilityId — Operating hours ────
  app.get<{ Params: { facilityId: string } }>('/hours/:facilityId', async (request) => {
    const { facilityId } = request.params;

    const result = await engine.getOperatingHours(facilityId);
    return { data: result };
  });
}

// ─────────────────────────────────────────────────────────
// Triage Rules — separate route plugin registered alongside faq
// ─────────────────────────────────────────────────────────
export async function triageRulesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  const engine = new FaqEngine(app.prisma);

  // ──── GET /api/triage-rules/:orgId — List triage rules ────
  app.get<{ Params: { orgId: string } }>('/:orgId', async (request, reply) => {
    const { orgId } = request.params;
    if (request.user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    const rules = await engine.listTriageRules(orgId);
    return { data: rules };
  });

  // ──── POST /api/triage-rules — Create triage rule ────
  app.post('/', async (request: FastifyRequest) => {
    const { orgId: userOrgId } = request.user;
    const body = createTriageRuleSchema.parse(request.body);

    const rule = await engine.createTriageRule({
      orgId: userOrgId,
      keywords: body.keywords,
      severity: body.severity as TriageSeverity,
      responseEn: body.responseEn,
      responseAr: body.responseAr,
      action: body.action as TriageAction,
    });

    return { data: rule };
  });

  // ──── PATCH /api/triage-rules/:id — Update triage rule ────
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = z.object({
      keywords: z.array(z.string()).optional(),
      severity: z.enum(SEVERITIES).optional(),
      responseEn: z.string().optional(),
      responseAr: z.string().optional(),
      action: z.enum(ACTIONS).optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body);

    // Verify rule belongs to user's org
    const existing = await app.prisma.triageRule.findUnique({ where: { ruleId: id } });
    if (!existing || existing.orgId !== request.user.orgId) {
      return reply.code(404).send({ error: 'Triage rule not found' });
    }

    try {
      const updated = await engine.updateTriageRule(id, body as any);
      return { data: updated };
    } catch {
      return { error: 'Triage rule not found' };
    }
  });
}
