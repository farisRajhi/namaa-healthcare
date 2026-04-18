import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  createCharge,
  halalasToDecimal,
  mapStatus,
  extractCardSnapshot,
} from '../services/tap.js';
import { PLAN_PRICES } from '../services/billing/plans.js';
import {
  activateOrExtendSubscription,
  cancelSubscription,
} from '../services/billing/subscriptions.js';

const upgradeSchema = z.object({
  plan: z.enum(['starter', 'professional', 'enterprise']),
  tokenId: z.string().min(1, 'tokenId is required'),
  callbackUrl: z.string().url().optional(),
});

export default async function subscriptionRoutes(app: FastifyInstance) {
  // GET /api/subscription — current org subscription + payment history
  app.get(
    '/',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;

      const subscription = await app.prisma.tawafudSubscription.findUnique({
        where: { orgId: user.orgId },
      });

      const payments = await app.prisma.tawafudPayment.findMany({
        where: { orgId: user.orgId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const isActive =
        !!subscription &&
        ['active', 'past_due'].includes(subscription.status) &&
        new Date(subscription.endDate) > new Date();

      return reply.send({
        subscription,
        payments,
        isActive,
      });
    },
  );

  // POST /api/subscription/upgrade — initiate plan upgrade with a Tap card token
  app.post(
    '/upgrade',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;
      const { plan, tokenId, callbackUrl } = upgradeSchema.parse(request.body);

      const amountHalalas = PLAN_PRICES[plan];
      const currency = 'SAR';
      const amount = halalasToDecimal(amountHalalas, currency);

      const dbUser = await app.prisma.user.findUnique({ where: { userId: user.userId } });
      const nameParts = (dbUser?.name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Customer';
      const lastName = nameParts.slice(1).join(' ') || undefined;

      const redirectUrl =
        callbackUrl ||
        `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?payment=callback&plan=${plan}`;
      const webhookUrl = `${process.env.BASE_URL || process.env.BACKEND_URL || 'http://localhost:3003'}/api/payments/webhook`;

      // Reuse existing Tap customer if we have one, so saved cards stay on a single customer.
      const lastPayment = await app.prisma.tawafudPayment.findFirst({
        where: { orgId: user.orgId, customerId: { not: null } } as any,
        orderBy: { createdAt: 'desc' },
      });

      try {
        const charge = await createCharge({
          amount,
          currency,
          tokenId,
          customerId: (lastPayment as any)?.customerId ?? undefined,
          description: `Tawafud ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
          customer: { firstName, lastName, email: dbUser?.email },
          redirectUrl,
          webhookUrl,
          metadata: { orgId: user.orgId, userId: user.userId, plan },
          saveCard: true,
          idempotencyKey: `upgrade-${user.orgId}-${tokenId}`,
        });

        const snapshot = extractCardSnapshot(charge);

        const payment = await app.prisma.tawafudPayment.create({
          data: {
            orgId: user.orgId,
            amount: amountHalalas,
            currency,
            status: mapStatus(charge.status),
            tapChargeId: charge.id,
            source: 'card',
            description: `${plan} plan upgrade`,
            plan,
            callbackUrl,
            cardId: snapshot.cardId,
            customerId: snapshot.customerId,
            cardBrand: snapshot.brand,
            lastFour: snapshot.lastFour,
            kind: 'initial',
            metadata: { plan, userId: user.userId },
          } as any,
        });

        // Activate immediately if Tap captured synchronously (no 3DS).
        if (charge.status?.toUpperCase() === 'CAPTURED') {
          await activateOrExtendSubscription(app.prisma, {
            orgId: user.orgId,
            plan,
            tapChargeId: charge.id,
            cardId: snapshot.cardId,
            customerId: snapshot.customerId,
          });
        }

        return reply.send({
          payment,
          chargeId: charge.id,
          status: charge.status,
          transactionUrl: charge.transaction?.url,
        });
      } catch (error: any) {
        app.log.error({ err: error, details: error?.details }, '[subscription/upgrade]');
        return reply.code(error?.statusCode && error.statusCode < 500 ? 400 : 500).send({
          error: 'Failed to initiate payment',
          message: error?.message,
          details: error?.details,
        });
      }
    },
  );

  // POST /api/subscription/cancel — cancel current subscription (access continues until endDate)
  app.post(
    '/cancel',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;

      const subscription = await app.prisma.tawafudSubscription.findUnique({
        where: { orgId: user.orgId },
      });
      if (!subscription) {
        return reply.code(404).send({ error: 'No subscription found' });
      }
      if (subscription.status === 'cancelled') {
        return reply.send({ subscription, alreadyCancelled: true });
      }

      const updated = await cancelSubscription(app.prisma, user.orgId);

      await app.prisma.auditLog.create({
        data: {
          orgId: user.orgId,
          userId: user.userId,
          action: 'subscription.cancel',
          resource: 'subscription',
          resourceId: subscription.id,
          details: { plan: subscription.plan, endDate: subscription.endDate.toISOString() },
          ipAddress: request.ip,
        },
      });

      return reply.send({ subscription: updated });
    },
  );

  // POST /api/subscription/resume — undo a cancellation if endDate hasn't passed yet
  app.post(
    '/resume',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;

      const subscription = await app.prisma.tawafudSubscription.findUnique({
        where: { orgId: user.orgId },
      });
      if (!subscription) {
        return reply.code(404).send({ error: 'No subscription found' });
      }
      if (subscription.status !== 'cancelled') {
        return reply.code(400).send({ error: 'Subscription is not cancelled' });
      }
      if (new Date(subscription.endDate) <= new Date()) {
        return reply.code(400).send({ error: 'Cancellation period already passed' });
      }

      const updated = await app.prisma.tawafudSubscription.update({
        where: { orgId: user.orgId },
        data: {
          status: 'active',
          cancelledAt: null,
          updatedAt: new Date(),
        },
      });

      await app.prisma.auditLog.create({
        data: {
          orgId: user.orgId,
          userId: user.userId,
          action: 'subscription.resume',
          resource: 'subscription',
          resourceId: subscription.id,
          details: { plan: subscription.plan },
          ipAddress: request.ip,
        },
      });

      return reply.send({ subscription: updated });
    },
  );
}
