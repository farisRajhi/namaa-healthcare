// ─────────────────────────────────────────────────────────
// Agent Builder — API Routes
// CRUD for flows, templates, simulation, and analytics
// ─────────────────────────────────────────────────────────

import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { FlowEngine } from '../services/agentBuilder/flowEngine.js'
import { ALL_TEMPLATES } from '../services/agentBuilder/templates.js'

// ─── Validation Schemas ──────────────────────────────────

const createFlowSchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  nodes: z.array(z.any()).default([]),
  edges: z.array(z.any()).default([]),
  variables: z.record(z.any()).optional(),
  settings: z.record(z.any()).optional(),
})

const updateFlowSchema = z.object({
  name: z.string().min(1).optional(),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
  variables: z.record(z.any()).optional(),
  settings: z.record(z.any()).optional(),
})

const simulateMessageSchema = z.object({
  message: z.string().min(1),
})

const listFlowsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z.coerce.boolean().optional(),
})

// ─── Flow CRUD Routes ────────────────────────────────────

export default async function agentBuilderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  const engine = new FlowEngine(app.prisma)

  // ──── GET /api/agent-builder/flows — List flows for org ────
  app.get('/flows', async (request: FastifyRequest) => {
    const { orgId } = request.user
    const query = listFlowsQuerySchema.parse(request.query)
    const skip = (query.page - 1) * query.limit

    const where: any = { orgId, isTemplate: false }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive
    }

    const [flows, total] = await Promise.all([
      app.prisma.agentFlow.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: query.limit,
        select: {
          agentFlowId: true,
          name: true,
          nameAr: true,
          description: true,
          descriptionAr: true,
          isActive: true,
          version: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { sessions: true } },
        },
      }),
      app.prisma.agentFlow.count({ where }),
    ])

    return {
      data: flows.map(f => ({
        id: f.agentFlowId,
        name: f.name,
        nameAr: f.nameAr,
        description: f.description,
        descriptionAr: f.descriptionAr,
        isActive: f.isActive,
        version: f.version,
        publishedAt: f.publishedAt,
        sessionsCount: f._count.sessions,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })),
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        pages: Math.ceil(total / query.limit),
      },
    }
  })

  // ──── GET /api/agent-builder/flows/:id — Get flow detail ────
  app.get<{ Params: { id: string } }>('/flows/:id', async (request) => {
    const { orgId } = request.user
    const { id } = request.params

    const flow = await app.prisma.agentFlow.findFirst({
      where: { agentFlowId: id, orgId },
    })

    if (!flow) {
      return { error: 'Flow not found', statusCode: 404 }
    }

    return {
      data: {
        id: flow.agentFlowId,
        name: flow.name,
        nameAr: flow.nameAr,
        description: flow.description,
        descriptionAr: flow.descriptionAr,
        nodes: flow.nodes,
        edges: flow.edges,
        variables: flow.variables,
        settings: flow.settings,
        isActive: flow.isActive,
        isTemplate: flow.isTemplate,
        templateCategory: flow.templateCategory,
        version: flow.version,
        publishedAt: flow.publishedAt,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
      },
    }
  })

  // ──── POST /api/agent-builder/flows — Create flow ────
  app.post('/flows', async (request: FastifyRequest) => {
    const { orgId } = request.user
    const body = createFlowSchema.parse(request.body)

    const flow = await app.prisma.agentFlow.create({
      data: {
        orgId,
        name: body.name,
        nameAr: body.nameAr,
        description: body.description,
        descriptionAr: body.descriptionAr,
        nodes: body.nodes as any,
        edges: body.edges as any,
        variables: body.variables ?? {},
        settings: body.settings ?? {},
      },
    })

    return {
      data: {
        id: flow.agentFlowId,
        name: flow.name,
        nameAr: flow.nameAr,
        createdAt: flow.createdAt,
      },
    }
  })

  // ──── PUT /api/agent-builder/flows/:id — Update flow ────
  app.put<{ Params: { id: string } }>('/flows/:id', async (request) => {
    const { orgId } = request.user
    const { id } = request.params
    const body = updateFlowSchema.parse(request.body)

    // Verify ownership
    const existing = await app.prisma.agentFlow.findFirst({
      where: { agentFlowId: id, orgId },
    })
    if (!existing) {
      return { error: 'Flow not found', statusCode: 404 }
    }

    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.nameAr !== undefined) updateData.nameAr = body.nameAr
    if (body.description !== undefined) updateData.description = body.description
    if (body.descriptionAr !== undefined) updateData.descriptionAr = body.descriptionAr
    if (body.nodes !== undefined) updateData.nodes = body.nodes
    if (body.edges !== undefined) updateData.edges = body.edges
    if (body.variables !== undefined) updateData.variables = body.variables
    if (body.settings !== undefined) updateData.settings = body.settings

    const flow = await app.prisma.agentFlow.update({
      where: { agentFlowId: id },
      data: updateData,
    })

    return {
      data: {
        id: flow.agentFlowId,
        name: flow.name,
        updatedAt: flow.updatedAt,
      },
    }
  })

  // ──── DELETE /api/agent-builder/flows/:id — Delete flow ────
  app.delete<{ Params: { id: string } }>('/flows/:id', async (request) => {
    const { orgId } = request.user
    const { id } = request.params

    const existing = await app.prisma.agentFlow.findFirst({
      where: { agentFlowId: id, orgId },
    })
    if (!existing) {
      return { error: 'Flow not found', statusCode: 404 }
    }

    await app.prisma.agentFlow.delete({ where: { agentFlowId: id } })

    return { success: true }
  })

  // ──── POST /api/agent-builder/flows/:id/publish — Publish flow ────
  app.post<{ Params: { id: string } }>('/flows/:id/publish', async (request) => {
    const { orgId } = request.user
    const { id } = request.params

    const existing = await app.prisma.agentFlow.findFirst({
      where: { agentFlowId: id, orgId },
    })
    if (!existing) {
      return { error: 'Flow not found', statusCode: 404 }
    }

    // Validate flow has at least a START and END node
    const nodes = existing.nodes as any[]
    const hasStart = nodes.some((n: any) => n.type === 'start')
    if (!hasStart) {
      return { error: 'Flow must have a START node to be published', statusCode: 400 }
    }

    const flow = await app.prisma.agentFlow.update({
      where: { agentFlowId: id },
      data: {
        isActive: true,
        publishedAt: new Date(),
        version: { increment: 1 },
      },
    })

    return {
      data: {
        id: flow.agentFlowId,
        isActive: flow.isActive,
        publishedAt: flow.publishedAt,
        version: flow.version,
      },
    }
  })

  // ──── POST /api/agent-builder/flows/:id/unpublish — Unpublish flow ────
  app.post<{ Params: { id: string } }>('/flows/:id/unpublish', async (request) => {
    const { orgId } = request.user
    const { id } = request.params

    const existing = await app.prisma.agentFlow.findFirst({
      where: { agentFlowId: id, orgId },
    })
    if (!existing) {
      return { error: 'Flow not found', statusCode: 404 }
    }

    const flow = await app.prisma.agentFlow.update({
      where: { agentFlowId: id },
      data: { isActive: false },
    })

    return {
      data: {
        id: flow.agentFlowId,
        isActive: flow.isActive,
      },
    }
  })

  // ─── Template Routes ───────────────────────────────────

  // ──── GET /api/agent-builder/templates — List templates ────
  app.get('/templates', async () => {
    // Return both database templates and built-in ones
    const dbTemplates = await app.prisma.agentFlow.findMany({
      where: { isTemplate: true },
      orderBy: { createdAt: 'asc' },
      select: {
        agentFlowId: true,
        name: true,
        nameAr: true,
        description: true,
        descriptionAr: true,
        templateCategory: true,
        createdAt: true,
      },
    })

    // Merge with built-in templates that aren't in DB yet
    const dbCategories = new Set(dbTemplates.map(t => t.templateCategory))
    const builtInTemplates = ALL_TEMPLATES
      .filter(t => !dbCategories.has(t.templateCategory))
      .map(t => ({
        agentFlowId: `builtin-${t.templateCategory}`,
        name: t.name,
        nameAr: t.nameAr,
        description: t.description,
        descriptionAr: t.descriptionAr,
        templateCategory: t.templateCategory,
        isBuiltIn: true,
      }))

    return {
      data: [
        ...dbTemplates.map(t => ({
          id: t.agentFlowId,
          name: t.name,
          nameAr: t.nameAr,
          description: t.description,
          descriptionAr: t.descriptionAr,
          templateCategory: t.templateCategory,
          isBuiltIn: false,
          createdAt: t.createdAt,
        })),
        ...builtInTemplates.map(t => ({
          id: t.agentFlowId,
          name: t.name,
          nameAr: t.nameAr,
          description: t.description,
          descriptionAr: t.descriptionAr,
          templateCategory: t.templateCategory,
          isBuiltIn: true,
        })),
      ],
    }
  })

  // ──── POST /api/agent-builder/templates/:id/clone — Clone template to org ────
  app.post<{ Params: { id: string } }>('/templates/:id/clone', async (request) => {
    const { orgId } = request.user
    const { id } = request.params

    let templateData: {
      name: string
      nameAr: string | null
      description: string | null
      descriptionAr: string | null
      nodes: any
      edges: any
      variables: any
      settings: any
      templateCategory: string | null
    }

    // Check if it's a built-in template
    if (id.startsWith('builtin-')) {
      const category = id.replace('builtin-', '')
      const template = ALL_TEMPLATES.find(t => t.templateCategory === category)
      if (!template) {
        return { error: 'Template not found', statusCode: 404 }
      }
      templateData = {
        name: template.name,
        nameAr: template.nameAr,
        description: template.description,
        descriptionAr: template.descriptionAr,
        nodes: template.nodes,
        edges: template.edges,
        variables: template.variables,
        settings: template.settings,
        templateCategory: template.templateCategory,
      }
    } else {
      // Database template
      const dbTemplate = await app.prisma.agentFlow.findFirst({
        where: { agentFlowId: id, isTemplate: true },
      })
      if (!dbTemplate) {
        return { error: 'Template not found', statusCode: 404 }
      }
      templateData = {
        name: dbTemplate.name,
        nameAr: dbTemplate.nameAr,
        description: dbTemplate.description,
        descriptionAr: dbTemplate.descriptionAr,
        nodes: dbTemplate.nodes,
        edges: dbTemplate.edges,
        variables: dbTemplate.variables,
        settings: dbTemplate.settings,
        templateCategory: dbTemplate.templateCategory,
      }
    }

    // Create a clone for the org
    const flow = await app.prisma.agentFlow.create({
      data: {
        orgId,
        name: `${templateData.name} (Copy)`,
        nameAr: templateData.nameAr ? `${templateData.nameAr} (نسخة)` : null,
        description: templateData.description,
        descriptionAr: templateData.descriptionAr,
        nodes: templateData.nodes,
        edges: templateData.edges,
        variables: templateData.variables ?? {},
        settings: templateData.settings ?? {},
        isTemplate: false,
        templateCategory: templateData.templateCategory,
      },
    })

    return {
      data: {
        id: flow.agentFlowId,
        name: flow.name,
        nameAr: flow.nameAr,
        createdAt: flow.createdAt,
      },
    }
  })

  // ─── Simulation / Testing Routes ───────────────────────

  // ──── POST /api/agent-builder/flows/:id/simulate — Start test session ────
  app.post<{ Params: { id: string } }>('/flows/:id/simulate', async (request) => {
    const { orgId } = request.user
    const { id } = request.params

    // Verify flow belongs to org
    const flow = await app.prisma.agentFlow.findFirst({
      where: { agentFlowId: id, orgId },
    })
    if (!flow) {
      return { error: 'Flow not found', statusCode: 404 }
    }

    try {
      const response = await engine.startFlow(id)
      return { data: response }
    } catch (err: any) {
      return { error: err.message, statusCode: 400 }
    }
  })

  // ──── POST /api/agent-builder/sessions/:id/message — Send message to session ────
  app.post<{ Params: { id: string } }>('/sessions/:id/message', async (request) => {
    const { id } = request.params
    const body = simulateMessageSchema.parse(request.body)

    try {
      const response = await engine.processInput(id, body.message)
      return { data: response }
    } catch (err: any) {
      return { error: err.message, statusCode: 400 }
    }
  })

  // ──── GET /api/agent-builder/sessions/:id — Get session state ────
  app.get<{ Params: { id: string } }>('/sessions/:id', async (request) => {
    const { id } = request.params

    try {
      const state = await engine.getSessionState(id)
      return { data: state }
    } catch (err: any) {
      return { error: err.message, statusCode: 404 }
    }
  })

  // ─── Analytics Route ───────────────────────────────────

  // ──── GET /api/agent-builder/flows/:id/analytics — Flow usage stats ────
  app.get<{ Params: { id: string } }>('/flows/:id/analytics', async (request) => {
    const { orgId } = request.user
    const { id } = request.params

    // Verify flow belongs to org
    const flow = await app.prisma.agentFlow.findFirst({
      where: { agentFlowId: id, orgId },
    })
    if (!flow) {
      return { error: 'Flow not found', statusCode: 404 }
    }

    const [totalSessions, activeSessions, completedSessions, transferredSessions, abandonedSessions] =
      await Promise.all([
        app.prisma.agentFlowSession.count({ where: { flowId: id } }),
        app.prisma.agentFlowSession.count({ where: { flowId: id, status: 'active' } }),
        app.prisma.agentFlowSession.count({ where: { flowId: id, status: 'completed' } }),
        app.prisma.agentFlowSession.count({ where: { flowId: id, status: 'transferred' } }),
        app.prisma.agentFlowSession.count({ where: { flowId: id, status: 'abandoned' } }),
      ])

    // Average session duration for completed sessions
    const completedSessionsData = await app.prisma.agentFlowSession.findMany({
      where: { flowId: id, status: 'completed', completedAt: { not: null } },
      select: { startedAt: true, completedAt: true },
      take: 100,
      orderBy: { completedAt: 'desc' },
    })

    let avgDurationSec: number | null = null
    if (completedSessionsData.length > 0) {
      const totalMs = completedSessionsData.reduce((sum, s) => {
        if (s.completedAt) {
          return sum + (s.completedAt.getTime() - s.startedAt.getTime())
        }
        return sum
      }, 0)
      avgDurationSec = Math.round(totalMs / completedSessionsData.length / 1000)
    }

    // Completion rate
    const completionRate = totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0

    return {
      data: {
        flowId: id,
        flowName: flow.name,
        flowNameAr: flow.nameAr,
        totalSessions,
        activeSessions,
        completedSessions,
        transferredSessions,
        abandonedSessions,
        completionRate,
        avgDurationSec,
      },
    }
  })
}
