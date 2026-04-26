import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  createCharge,
  retrieveCharge,
  verifyWebhookSignature,
  halalasToDecimal,
  mapStatus,
  extractCardSnapshot,
  TapWebhookEvent,
  TapApiError,
} from '../services/tap.js';
import { activateOrExtendSubscription } from '../services/billing/subscriptions.js';
import { PLAN_PRICES, isPlanKey } from '../services/billing/plans.js';

const PLAN_LABEL: Record<string, string> = {
  starter: 'Tawafud Starter Plan',
  professional: 'Tawafud Professional Plan',
  enterprise: 'Tawafud Enterprise Plan',
};

const createPaymentSchema = z.object({
  tokenId: z.string().min(1, 'tokenId is required'),
  plan: z.string().optional(),
  amount: z.number().positive().optional(),
  currency: z.string().default('SAR'),
  description: z.string().optional(),
  callbackUrl: z.string().url().optional(),
});

// In-memory dedupe of (orgId, tokenId) → resolved response, holds for 30s.
// Prevents double-clicked submissions from creating two Tap charges.
interface PendingCharge {
  promise: Promise<unknown>;
  expiresAt: number;
}
const inflightCharges = new Map<string, PendingCharge>();
function gcInflight() {
  const now = Date.now();
  for (const [k, v] of inflightCharges) {
    if (v.expiresAt < now) inflightCharges.delete(k);
  }
}

export default async function paymentsRoutes(app: FastifyInstance) {
  // POST /api/payments/create — create a Tap charge from a client-side token
  app.post(
    '/create',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;
      const body = createPaymentSchema.parse(request.body);

      const planKey = body.plan && isPlanKey(body.plan) ? body.plan : null;
      const amountHalalas = planKey ? PLAN_PRICES[planKey] : body.amount;
      const description =
        body.description || (planKey ? PLAN_LABEL[planKey] : 'Tawafud Platform Subscription');

      if (!amountHalalas || amountHalalas <= 0) {
        return reply.code(400).send({ error: 'Invalid amount' });
      }

      const currency = (body.currency || 'SAR').toUpperCase();
      const amount = halalasToDecimal(amountHalalas, currency);

      // Price-drift sanity check: warn (but allow) if the org has an active sub on the
      // same plan being charged a different amount than its locked-in priceSnapshot.
      // This catches accidental PLAN_PRICES edits without blocking legit upgrades/overrides.
      if (planKey) {
        const activeSub = await app.prisma.tawafudSubscription.findUnique({
          where: { orgId: user.orgId },
        });
        const snapshot = (activeSub as any)?.priceSnapshot as number | null | undefined;
        if (
          activeSub &&
          activeSub.status === 'active' &&
          activeSub.plan === planKey &&
          snapshot &&
          snapshot > 0 &&
          snapshot !== amountHalalas
        ) {
          app.log.warn(
            {
              orgId: user.orgId,
              plan: planKey,
              snapshotHalalas: snapshot,
              chargeHalalas: amountHalalas,
            },
            '[payments/create] price drift vs subscription priceSnapshot — proceeding (admin override or upgrade)',
          );
        }
      }

      // Dedupe identical (orgId, tokenId) submissions for 30 seconds.
      gcInflight();
      const dedupeKey = `${user.orgId}:${body.tokenId}`;
      const existing = inflightCharges.get(dedupeKey);
      if (existing) {
        try {
          return reply.send(await existing.promise);
        } catch (err: any) {
          return reply.code(400).send({
            error: 'Payment creation failed',
            message: err?.message,
          });
        }
      }

      const work = (async () => {
        const dbUser = await app.prisma.user.findUnique({ where: { userId: user.userId } });
        const nameParts = (dbUser?.name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || undefined;

        const redirectUrl =
          body.callbackUrl ||
          `${process.env.FRONTEND_URL}/billing?payment=callback${planKey ? `&plan=${planKey}` : ''}`;
        const webhookUrl = `${process.env.BASE_URL || process.env.BACKEND_URL}/api/payments/webhook`;

        // Look up an existing customer id from a prior charge (so Tap reuses the customer).
        const lastPayment = await app.prisma.tawafudPayment.findFirst({
          where: { orgId: user.orgId, customerId: { not: null } } as any,
          orderBy: { createdAt: 'desc' },
        });

        const charge = await createCharge({
          amount,
          currency,
          tokenId: body.tokenId,
          customerId: (lastPayment as any)?.customerId ?? undefined,
          description,
          customer: {
            firstName,
            lastName,
            email: dbUser?.email,
          },
          redirectUrl,
          webhookUrl,
          metadata: {
            orgId: user.orgId,
            userId: user.userId,
            plan: planKey ?? undefined,
          },
          saveCard: true,
          idempotencyKey: `pay-${user.orgId}-${body.tokenId}`,
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
            description,
            plan: planKey ?? undefined,
            callbackUrl: body.callbackUrl,
            cardId: snapshot.cardId,
            customerId: snapshot.customerId,
            cardBrand: snapshot.brand,
            lastFour: snapshot.lastFour,
            kind: 'initial',
            metadata: { plan: planKey ?? undefined, userId: user.userId },
          } as any,
        });

        if (charge.status?.toUpperCase() === 'CAPTURED' && planKey) {
          await activateOrExtendSubscription(app.prisma, {
            orgId: user.orgId,
            plan: planKey,
            tapChargeId: charge.id,
            cardId: snapshot.cardId,
            customerId: snapshot.customerId,
          });
        }

        return {
          payment,
          chargeId: charge.id,
          status: charge.status,
          transactionUrl: charge.transaction?.url,
        };
      })();

      inflightCharges.set(dedupeKey, {
        promise: work,
        expiresAt: Date.now() + 30_000,
      });

      try {
        const result = await work;
        return reply.send(result);
      } catch (error: any) {
        inflightCharges.delete(dedupeKey);
        // Full Tap payload stays in server logs for support; the client gets a
        // typed error so the UI can localize the message.
        app.log.error({ err: error, details: error?.details }, '[payments/create]');
        const tapErr = error as TapApiError;
        const isUserError = tapErr?.isUserError ?? (tapErr?.statusCode && tapErr.statusCode < 500);
        const statusCode = isUserError ? 400 : 500;
        return reply.code(statusCode).send({
          error: 'payment_failed',
          code: tapErr?.kind ?? 'unknown',
          tapCode: tapErr?.code ?? null,
          message: error?.message || 'Payment failed',
        });
      }
    },
  );

  // GET /api/payments/config — lets the frontend check whether Tap is set up
  // before rendering the card form. Does not leak the secret key.
  app.get(
    '/config',
    async (_request, reply) => {
      const publicKey = process.env.TAP_PUBLIC_KEY || '';
      const merchantId = process.env.TAP_MERCHANT_ID || '';
      const hasSecret = !!(process.env.TAP_SECRET_KEY && process.env.TAP_SECRET_KEY !== 'sk_test_CHANGE_ME');
      return reply.send({
        enabled: hasSecret && !!publicKey,
        publicKey,
        merchantId,
      });
    },
  );

  // GET /api/payments/verify/:id — verify Tap charge status, activate subscription on CAPTURED
  app.get<{ Params: { id: string } }>(
    '/verify/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user;

      try {
        const charge = await retrieveCharge(id);

        const localPayment = await app.prisma.tawafudPayment.findFirst({
          where: { tapChargeId: id, orgId: user.orgId },
        });

        if (localPayment) {
          const mapped = mapStatus(charge.status);
          const snapshot = extractCardSnapshot(charge);
          await app.prisma.tawafudPayment.update({
            where: { id: localPayment.id },
            data: {
              status: mapped,
              cardId: snapshot.cardId ?? (localPayment as any).cardId,
              customerId: snapshot.customerId ?? (localPayment as any).customerId,
              cardBrand: snapshot.brand ?? (localPayment as any).cardBrand,
              lastFour: snapshot.lastFour ?? (localPayment as any).lastFour,
              updatedAt: new Date(),
            } as any,
          });

          if (
            charge.status?.toUpperCase() === 'CAPTURED' &&
            localPayment.status !== 'paid' &&
            localPayment.plan
          ) {
            await activateOrExtendSubscription(app.prisma, {
              orgId: localPayment.orgId,
              plan: localPayment.plan,
              tapChargeId: id,
              cardId: snapshot.cardId,
              customerId: snapshot.customerId,
            });
          }
        }

        return reply.send({ charge, localPayment });
      } catch (error: any) {
        app.log.error({ err: error }, '[payments/verify]');
        return reply.code(error?.statusCode === 404 ? 404 : 500).send({
          error: 'Verification failed',
          message: error?.message,
        });
      }
    },
  );

  // POST /api/payments/webhook — Tap async webhook (verified by hashstring header)
  // Idempotent: re-delivery of the same event is a no-op. Returns 200 even when there's nothing
  // to do, so Tap doesn't retry indefinitely. Returns 503 only for transient infrastructure errors.
  app.post(
    '/webhook',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const secret = process.env.TAP_SECRET_KEY || '';
      if (!secret) {
        app.log.error('[webhook] TAP_SECRET_KEY not configured — rejecting');
        return reply.code(503).send({ error: 'Webhook not configured' });
      }

      const hashstring = (request.headers['hashstring'] as string) || '';
      const event = request.body as TapWebhookEvent;

      if (!event?.id || !event?.status) {
        return reply.code(400).send({ error: 'Invalid webhook payload' });
      }

      if (!verifyWebhookSignature(event, hashstring, secret)) {
        app.log.warn({ id: event.id }, '[webhook] Invalid Tap hashstring');
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      const mapped = mapStatus(event.status);
      app.log.info(
        { chargeId: event.id, status: event.status, mapped },
        '[webhook] Tap event received',
      );

      // Persistent idempotency: insert one row per (provider, eventId). A unique-constraint
      // violation (P2002) means Tap is replaying an event we already processed — ack 200 and stop.
      try {
        await app.prisma.webhookEvent.create({
          data: {
            provider: 'tap',
            eventId: event.id,
            eventType: event.status ?? null,
            signatureValid: true,
            payload: event as any,
          },
        });
      } catch (dedupeErr: any) {
        if (dedupeErr?.code === 'P2002') {
          app.log.info({ chargeId: event.id }, '[webhook] duplicate webhook — already processed');
          return reply.send({ received: true, processed: false, reason: 'duplicate' });
        }
        app.log.error({ err: dedupeErr, chargeId: event.id }, '[webhook] failed to record event');
        return reply.code(503).send({ error: 'Webhook processing failed', message: dedupeErr?.message });
      }

      try {
        const payment = await app.prisma.tawafudPayment.findFirst({
          where: { tapChargeId: event.id },
        });

        if (!payment) {
          // Unknown charge — log and ack so Tap doesn't retry forever.
          app.log.warn({ chargeId: event.id }, '[webhook] Unknown chargeId — ack & ignore');
          return reply.send({ received: true, processed: false, reason: 'unknown_charge' });
        }

        // Idempotency: if we already recorded this terminal status, no-op.
        const isTerminal = ['paid', 'failed', 'refunded', 'cancelled'].includes(mapped);
        if (isTerminal && payment.status === mapped) {
          return reply.send({ received: true, processed: false, reason: 'already_applied' });
        }

        await app.prisma.tawafudPayment.update({
          where: { id: payment.id },
          data: {
            status: mapped,
            errorMessage:
              mapped === 'failed'
                ? (event as any)?.response?.message || 'Payment failed'
                : null,
            updatedAt: new Date(),
          },
        });

        if (event.status?.toUpperCase() === 'CAPTURED' && payment.plan) {
          // Refetch the charge to capture saved card/customer ids for renewals.
          let snapshot = { cardId: null as string | null, customerId: null as string | null };
          try {
            const fresh = await retrieveCharge(event.id);
            snapshot = extractCardSnapshot(fresh);
          } catch (e: any) {
            app.log.warn({ err: e?.message, chargeId: event.id }, '[webhook] retrieveCharge failed');
          }

          await activateOrExtendSubscription(app.prisma, {
            orgId: payment.orgId,
            plan: payment.plan,
            tapChargeId: event.id,
            cardId: snapshot.cardId ?? (payment as any).cardId ?? null,
            customerId: snapshot.customerId ?? (payment as any).customerId ?? null,
          });
        }

        return reply.send({ received: true, processed: true });
      } catch (error: any) {
        app.log.error({ err: error, chargeId: event.id }, '[payments/webhook] DB error');
        // 503 → Tap will retry the webhook (transient infra issue).
        return reply.code(503).send({ error: 'Webhook processing failed', message: error?.message });
      }
    },
  );

  // GET /api/payments — list payments for current org
  app.get(
    '/',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;
      const payments = await app.prisma.tawafudPayment.findMany({
        where: { orgId: user.orgId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return reply.send({ payments });
    },
  );
}
