import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MemoryType } from '@prisma/client';

const memoryTypeValues = [
  'preference', 'condition', 'allergy', 'medication',
  'family_history', 'lifestyle', 'note',
  'interest', 'service_interest', 'behavioral', 'satisfaction',
] as const;

const createMemorySchema = z.object({
  memoryType: z.enum(memoryTypeValues),
  memoryKey: z.string().min(1).max(255),
  memoryValue: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1).default(1.0),
});

const updateMemorySchema = z.object({
  memoryValue: z.string().min(1).max(2000).optional(),
  isActive: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const querySchema = z.object({
  type: z.enum(memoryTypeValues).optional(),
  active: z.coerce.boolean().optional(),
});

type MemoryParams = { patientId: string };
type MemoryItemParams = { patientId: string; memoryId: string };

export default async function patientMemoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /api/patients/:patientId/memories — قائمة ذكريات المريض
  app.get<{ Params: MemoryParams }>(
    '/:patientId/memories',
    async (request: FastifyRequest<{ Params: MemoryParams }>) => {
      const { orgId } = request.user;
      const { patientId } = request.params;
      const query = querySchema.parse(request.query);

      // التحقق من أن المريض ينتمي للمنظمة
      const patient = await app.prisma.patient.findFirst({
        where: { patientId, orgId },
      });

      if (!patient) {
        return { error: 'المريض غير موجود', data: [] };
      }

      const where: Record<string, unknown> = { patientId };
      if (query.type) {
        where.memoryType = query.type;
      }
      if (query.active !== undefined) {
        where.isActive = query.active;
      }

      const memories = await app.prisma.patientMemory.findMany({
        where,
        orderBy: [{ memoryType: 'asc' }, { updatedAt: 'desc' }],
      });

      return { data: memories };
    },
  );

  // POST /api/patients/:patientId/memories — إضافة ذاكرة جديدة
  app.post<{ Params: MemoryParams }>(
    '/:patientId/memories',
    async (request: FastifyRequest<{ Params: MemoryParams }>) => {
      const { orgId } = request.user;
      const { patientId } = request.params;
      const body = createMemorySchema.parse(request.body);

      // التحقق من أن المريض ينتمي للمنظمة
      const patient = await app.prisma.patient.findFirst({
        where: { patientId, orgId },
      });

      if (!patient) {
        return { error: 'المريض غير موجود' };
      }

      // استخدام upsert لمنع التكرار
      const memory = await app.prisma.patientMemory.upsert({
        where: {
          patientId_memoryType_memoryKey: {
            patientId,
            memoryType: body.memoryType as MemoryType,
            memoryKey: body.memoryKey,
          },
        },
        update: {
          memoryValue: body.memoryValue,
          confidence: body.confidence,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          patientId,
          memoryType: body.memoryType as MemoryType,
          memoryKey: body.memoryKey,
          memoryValue: body.memoryValue,
          confidence: body.confidence,
          isActive: true,
        },
      });

      return { data: memory };
    },
  );

  // PUT /api/patients/:patientId/memories/:memoryId — تحديث ذاكرة
  app.put<{ Params: MemoryItemParams }>(
    '/:patientId/memories/:memoryId',
    async (request: FastifyRequest<{ Params: MemoryItemParams }>) => {
      const { orgId } = request.user;
      const { patientId, memoryId } = request.params;
      const body = updateMemorySchema.parse(request.body);

      // التحقق من أن المريض ينتمي للمنظمة
      const patient = await app.prisma.patient.findFirst({
        where: { patientId, orgId },
      });

      if (!patient) {
        return { error: 'المريض غير موجود' };
      }

      // التحقق من وجود الذاكرة
      const existing = await app.prisma.patientMemory.findFirst({
        where: { memoryId, patientId },
      });

      if (!existing) {
        return { error: 'الذاكرة غير موجودة' };
      }

      const memory = await app.prisma.patientMemory.update({
        where: { memoryId },
        data: {
          ...(body.memoryValue !== undefined && { memoryValue: body.memoryValue }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.confidence !== undefined && { confidence: body.confidence }),
          updatedAt: new Date(),
        },
      });

      return { data: memory };
    },
  );

  // DELETE /api/patients/:patientId/memories/:memoryId — حذف ذاكرة
  app.delete<{ Params: MemoryItemParams }>(
    '/:patientId/memories/:memoryId',
    async (request: FastifyRequest<{ Params: MemoryItemParams }>) => {
      const { orgId } = request.user;
      const { patientId, memoryId } = request.params;

      // التحقق من أن المريض ينتمي للمنظمة
      const patient = await app.prisma.patient.findFirst({
        where: { patientId, orgId },
      });

      if (!patient) {
        return { error: 'المريض غير موجود' };
      }

      // التحقق من وجود الذاكرة
      const existing = await app.prisma.patientMemory.findFirst({
        where: { memoryId, patientId },
      });

      if (!existing) {
        return { error: 'الذاكرة غير موجودة' };
      }

      await app.prisma.patientMemory.delete({
        where: { memoryId },
      });

      return { success: true };
    },
  );
}
