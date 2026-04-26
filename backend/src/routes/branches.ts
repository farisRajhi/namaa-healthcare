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
  // Multi-branch is Enterprise-only. Starter/Pro can still create THEIR FIRST
  // branch during onboarding (needed for platform setup); additional branches
  // require an active Enterprise subscription.
  //
  // Count + create runs inside a Serializable transaction so two concurrent
  // POSTs on a non-Enterprise org cannot both read count=0 and insert,
  // bypassing the 1-branch cap.
  class BranchLimitExceeded extends Error {
    constructor(public currentPlan: string | undefined) {
      super('Multi-branch support requires the Enterprise plan.');
    }
  }

  app.post('/', {
    preHandler: [app.requireSubscription],
  }, async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const body = createBranchSchema.parse(request.body);
    const currentPlan = (request as any).subscription?.plan as string | undefined;
    const isEnterprise = currentPlan === 'enterprise';

    try {
      const branch = await app.prisma.$transaction(
        async (tx) => {
          const existingCount = await tx.branch.count({
            where: { orgId, isActive: true },
          });
          if (existingCount >= 1 && !isEnterprise) {
            throw new BranchLimitExceeded(currentPlan);
          }
          return tx.branch.create({ data: { ...body, orgId } });
        },
        { isolationLevel: 'Serializable' },
      );

      return reply.code(201).send({ data: branch });
    } catch (err) {
      if (err instanceof BranchLimitExceeded) {
        return reply.code(402).send({
          error: 'Plan upgrade required',
          message: err.message,
          code: 'PLAN_UPGRADE_REQUIRED',
          requiredPlan: 'enterprise',
          currentPlan: err.currentPlan,
          upgradeUrl: `${process.env.FRONTEND_URL}/billing?tab=plans`,
        });
      }
      throw err;
    }
  });

  // ── Update ────────────────────────────────────────────────────────────────
  // Reactivating a soft-deleted branch has to re-check the 1-branch cap the
  // same way POST does — otherwise a non-Enterprise org can create → soft-delete
  // → create → reactivate to accumulate multiple active branches.
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [app.requireSubscription],
  }, async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = updateBranchSchema.parse(request.body);
    const currentPlan = (request as any).subscription?.plan as string | undefined;
    const isEnterprise = currentPlan === 'enterprise';

    try {
      const branch = await app.prisma.$transaction(
        async (tx) => {
          const existing = await tx.branch.findFirst({ where: { branchId: id, orgId } });
          if (!existing) throw new Error('NOT_FOUND');
          if (body.isActive === true && !existing.isActive && !isEnterprise) {
            const activeCount = await tx.branch.count({
              where: { orgId, isActive: true },
            });
            if (activeCount >= 1) throw new BranchLimitExceeded(currentPlan);
          }
          return tx.branch.update({ where: { branchId: id }, data: body });
        },
        { isolationLevel: 'Serializable' },
      );

      return { data: branch };
    } catch (err) {
      if (err instanceof BranchLimitExceeded) {
        return reply.code(402).send({
          error: 'Plan upgrade required',
          message: err.message,
          code: 'PLAN_UPGRADE_REQUIRED',
          requiredPlan: 'enterprise',
          currentPlan: err.currentPlan,
          upgradeUrl: `${process.env.FRONTEND_URL}/billing?tab=plans`,
        });
      }
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
