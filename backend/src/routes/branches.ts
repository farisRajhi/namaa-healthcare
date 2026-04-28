/**
 * Branch Management Routes
 *
 * Allows an org to define multiple branches (physical clinic locations).
 * Each branch maps to one or more Facility records.
 *
 * GET    /api/branches          – List all branches for the org
 * POST   /api/branches          – Create a branch
 * PUT    /api/branches/:id      – Update a branch
 * DELETE /api/branches/:id      – Soft-delete a branch (isActive = false)
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const createBranchSchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  facilityIds: z.array(z.string().uuid()).default([]),
});

const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export default async function branchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // ── List ──────────────────────────────────────────────────────────────────
  // List stays open to any authenticated user so a 1-branch org can still
  // view its single branch when the trial lapses.
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const branches = await app.prisma.branch.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
    });
    return { data: branches };
  });

  // ── Create ────────────────────────────────────────────────────────────────
  app.post('/', {
    preHandler: [app.requireActivated],
  }, async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const body = createBranchSchema.parse(request.body);

    const branch = await app.prisma.$transaction(
      async (tx) => tx.branch.create({ data: { ...body, orgId } }),
      { isolationLevel: 'Serializable' },
    );

    return reply.code(201).send({ data: branch });
  });

  // ── Update ────────────────────────────────────────────────────────────────
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [app.requireActivated],
  }, async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = updateBranchSchema.parse(request.body);

    try {
      const branch = await app.prisma.$transaction(
        async (tx) => {
          const existing = await tx.branch.findFirst({ where: { branchId: id, orgId } });
          if (!existing) throw new Error('NOT_FOUND');
          return tx.branch.update({ where: { branchId: id }, data: body });
        },
        { isolationLevel: 'Serializable' },
      );

      return { data: branch };
    } catch (err) {
      if (err instanceof Error && err.message === 'NOT_FOUND') {
        return reply.code(404).send({ error: 'Branch not found' });
      }
      throw err;
    }
  });

  // ── Delete (soft) ─────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const existing = await app.prisma.branch.findFirst({ where: { branchId: id, orgId } });
    if (!existing) return reply.code(404).send({ error: 'Branch not found' });

    await app.prisma.branch.update({
      where: { branchId: id },
      data: { isActive: false },
    });

    return { success: true };
  });
}
