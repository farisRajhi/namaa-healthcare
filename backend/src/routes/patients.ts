import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getInsightBuilder } from '../services/patient/insightBuilder.js';

const createPatientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).optional(),
  // QA-5: enum-validated to prevent arbitrary string injection into medical records
  sex: z.enum(['male', 'female']).optional(),
  mrn: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export default async function patientsRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireActivated);

  // List patients
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = querySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where = {
      orgId,
      ...(query.search && {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' as const } },
          { lastName: { contains: query.search, mode: 'insensitive' as const } },
          { mrn: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [patients, total] = await Promise.all([
      app.prisma.patient.findMany({
        where,
        skip,
        take: query.limit,
        include: {
          contacts: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      app.prisma.patient.count({ where }),
    ]);

    return {
      data: patients,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // Knowledge base summary — enriched patient list with insights, tags, memories
  const kbQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    search: z.string().optional(),
    tag: z.string().optional(),
    serviceInterest: z.string().optional(),
  });

  app.get('/knowledge-summary', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = kbQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = {
      orgId,
      ...(query.search && {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' as const } },
          { lastName: { contains: query.search, mode: 'insensitive' as const } },
          { contacts: { some: { contactValue: { contains: query.search } } } },
        ],
      }),
      ...(query.tag && {
        tags: { some: { tag: query.tag } },
      }),
      ...(query.serviceInterest && {
        memories: { some: { memoryType: 'service_interest', memoryKey: query.serviceInterest, isActive: true } },
      }),
    };

    const [patients, total, allTags, allInterests] = await Promise.all([
      app.prisma.patient.findMany({
        where,
        skip,
        take: query.limit,
        include: {
          contacts: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
          },
          insight: {
            select: {
              engagementScore: true,
              lifetimeValue: true,
              completionRate: true,
              channelPreference: true,
              preferredTimeSlot: true,
              lastInteractionAt: true,
            },
          },
          tags: { select: { tag: true, source: true } },
          memories: {
            where: {
              memoryType: { in: ['service_interest', 'satisfaction'] },
              isActive: true,
            },
            select: { memoryType: true, memoryKey: true, memoryValue: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      app.prisma.patient.count({ where }),
      app.prisma.patientTag.findMany({
        where: { orgId },
        distinct: ['tag'],
        select: { tag: true },
      }),
      app.prisma.patientMemory.findMany({
        where: {
          patient: { orgId },
          memoryType: 'service_interest',
          isActive: true,
        },
        distinct: ['memoryKey'],
        select: { memoryKey: true },
      }),
    ]);

    return {
      data: patients,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      filters: {
        allTags: allTags.map(t => t.tag),
        allServiceInterests: allInterests.map(i => i.memoryKey),
      },
    };
  });

  // Get single patient
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const patient = await app.prisma.patient.findFirst({
      where: { patientId: id, orgId },
      include: {
        contacts: {
          select: {
            contactId: true,
            contactType: true,
            contactValue: true,
            isPrimary: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
        },
        appointments: {
          include: {
            provider: true,
            service: true,
          },
          orderBy: { startTs: 'desc' },
          take: 10,
        },
        insight: true,
        tags: true,
      },
    });

    if (!patient) {
      return reply.code(404).send({ error: 'Patient not found' });
    }

    return patient;
  });

  // Create patient
  app.post('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = createPatientSchema.parse(request.body);

    const patient = await app.prisma.patient.create({
      data: {
        orgId,
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        sex: body.sex,
        mrn: body.mrn,
        contacts: {
          create: [
            ...(body.phone ? [{ contactType: 'phone', contactValue: body.phone, isPrimary: true }] : []),
            ...(body.email ? [{ contactType: 'email', contactValue: body.email }] : []),
          ],
        },
      },
      include: {
        contacts: true,
      },
    });

    return patient;
  });

  // Update patient
  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = createPatientSchema.partial().parse(request.body);

    const patient = await app.prisma.patient.updateMany({
      where: { patientId: id, orgId },
      data: {
        ...(body.firstName && { firstName: body.firstName }),
        ...(body.lastName && { lastName: body.lastName }),
        ...(body.dateOfBirth && { dateOfBirth: new Date(body.dateOfBirth) }),
        ...(body.sex && { sex: body.sex }),
        ...(body.mrn && { mrn: body.mrn }),
      },
    });

    if (patient.count === 0) {
      return reply.code(404).send({ error: 'Patient not found' });
    }

    return { success: true };
  });

  // Delete patient
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const result = await app.prisma.patient.deleteMany({
      where: { patientId: id, orgId },
    });

    if (result.count === 0) {
      return reply.code(404).send({ error: 'Patient not found' });
    }

    return { success: true };
  });

  // ─── Knowledge Base: Insights ─────────────────────────────────────────────

  // Get patient insights
  app.get<{ Params: { id: string } }>('/:id/insights', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const patient = await app.prisma.patient.findFirst({
      where: { patientId: id, orgId },
      select: { patientId: true },
    });
    if (!patient) return reply.code(404).send({ error: 'Patient not found' });

    const insight = await app.prisma.patientInsight.findUnique({
      where: { patientId: id },
    });

    return insight || {
      patientId: id,
      totalAppointments: 0,
      completedAppointments: 0,
      noShowCount: 0,
      cancelledCount: 0,
      completionRate: 0,
      preferredServiceIds: [],
      preferredProviderIds: [],
      preferredDayOfWeek: null,
      preferredTimeSlot: null,
      channelPreference: null,
      engagementScore: 0,
      lastInteractionAt: null,
      totalConversations: 0,
      lifetimeValue: 0,
    };
  });

  // Rebuild patient insights
  app.post<{ Params: { id: string } }>('/:id/insights/rebuild', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const patient = await app.prisma.patient.findFirst({
      where: { patientId: id, orgId },
      select: { patientId: true },
    });
    if (!patient) return reply.code(404).send({ error: 'Patient not found' });

    const builder = getInsightBuilder(app.prisma);
    await builder.rebuildInsight(id, orgId);

    const insight = await app.prisma.patientInsight.findUnique({
      where: { patientId: id },
    });

    return insight;
  });

  // ─── Knowledge Base: Tags ─────────────────────────────────────────────────

  // List tags for a patient
  app.get<{ Params: { id: string } }>('/:id/tags', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const patient = await app.prisma.patient.findFirst({
      where: { patientId: id, orgId },
      select: { patientId: true },
    });
    if (!patient) return reply.code(404).send({ error: 'Patient not found' });

    const tags = await app.prisma.patientTag.findMany({
      where: { patientId: id, orgId },
      orderBy: { createdAt: 'desc' },
    });

    return tags;
  });

  // Add tag to a patient
  app.post<{ Params: { id: string } }>('/:id/tags', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = z.object({
      tag: z.string().min(1).max(100),
      source: z.enum(['manual', 'auto', 'campaign']).default('manual'),
    }).parse(request.body);

    const patient = await app.prisma.patient.findFirst({
      where: { patientId: id, orgId },
      select: { patientId: true },
    });
    if (!patient) return reply.code(404).send({ error: 'Patient not found' });

    const tag = await app.prisma.patientTag.upsert({
      where: {
        orgId_patientId_tag: { orgId, patientId: id, tag: body.tag },
      },
      update: {},
      create: {
        orgId,
        patientId: id,
        tag: body.tag,
        source: body.source,
      },
    });

    return tag;
  });

  // Remove tag from a patient
  app.delete<{ Params: { id: string; tagId: string } }>('/:id/tags/:tagId', async (request, reply) => {
    const { orgId } = request.user;
    const { tagId } = request.params;

    const result = await app.prisma.patientTag.deleteMany({
      where: { tagId, orgId },
    });

    if (result.count === 0) {
      return reply.code(404).send({ error: 'Tag not found' });
    }

    return { success: true };
  });

  // ─── Knowledge Base: Memories (all types) ─────────────────────────────────

  // Get all memories for a patient (grouped)
  app.get<{ Params: { id: string } }>('/:id/knowledge', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const patient = await app.prisma.patient.findFirst({
      where: { patientId: id, orgId },
      select: { patientId: true },
    });
    if (!patient) return reply.code(404).send({ error: 'Patient not found' });

    const [memories, insight, tags] = await Promise.all([
      app.prisma.patientMemory.findMany({
        where: { patientId: id, patient: { orgId }, isActive: true },
        orderBy: { updatedAt: 'desc' },
      }),
      app.prisma.patientInsight.findUnique({
        where: { patientId: id },
      }),
      app.prisma.patientTag.findMany({
        where: { patientId: id, orgId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Group memories by type
    const grouped: Record<string, typeof memories> = {};
    for (const mem of memories) {
      if (!grouped[mem.memoryType]) grouped[mem.memoryType] = [];
      grouped[mem.memoryType].push(mem);
    }

    return { memories: grouped, insight, tags };
  });
}
