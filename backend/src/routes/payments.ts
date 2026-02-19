import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';

const MOYASAR_BASE_URL = 'https://api.moyasar.com/v1';
const MOYASAR_SECRET_KEY = process.env.MOYASAR_SECRET_KEY || '';

function moyasarAuth(): string {
  return 'Basic ' + Buffer.from(MOYASAR_SECRET_KEY + ':').toString('base64');
}

const PLAN_CONFIG: Record<string, { amount: number; label: string }> = {
  starter: { amount: 29900, label: 'Namaa Starter Plan' },
  professional: { amount: 49900, label: 'Namaa Professional Plan' },
  enterprise: { amount: 79900, label: 'Namaa Enterprise Plan' },
};

const createPaymentSchema = z.object({
  amount: z.number().positive().optional(),
  currency: z.string().default('SAR'),
  description: z.string().optional(),
  source: z.any(),
  callbackUrl: z.string().optional(),
  plan: z.string().optional(),
});

export default async function paymentsRoutes(app: FastifyInstance) {
  // POST /api/payments/create — create a Moyasar payment
  app.post(
    '/create',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;
      const body = createPaymentSchema.parse(request.body);

      const planConfig = body.plan ? PLAN_CONFIG[body.plan] : null;
      const amount = planConfig?.amount ?? body.amount;
      const description =
        body.description || planConfig?.label || 'Namaa Platform Subscription';

      if (!amount || amount <= 0) {
        return reply.code(400).send({ error: 'Invalid amount' });
      }

      if (!body.source) {
        return reply.code(400).send({ error: 'Payment source is required' });
      }

      try {
        const moyasarResponse = await fetch(`${MOYASAR_BASE_URL}/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: moyasarAuth(),
          },
          body: JSON.stringify({
            amount,
            currency: body.currency,
            description,
            source: body.source,
            callback_url:
              body.callbackUrl ||
              `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?payment=callback`,
            metadata: {
              orgId: user.orgId,
              userId: user.userId,
              plan: body.plan,
            },
          }),
        });

        const moyasarData = await moyasarResponse.json();

        if (!moyasarResponse.ok) {
          return reply.code(400).send({
            error: 'Payment creation failed',
            details: moyasarData,
          });
        }

        // Store in DB
        const payment = await app.prisma.namaaPayment.create({
          data: {
            orgId: user.orgId,
            amount,
            currency: body.currency,
            status: moyasarData.status || 'pending',
            moyasarId: moyasarData.id,
            source:
              typeof body.source === 'object' ? body.source.type : body.source,
            description,
            plan: body.plan,
            callbackUrl: body.callbackUrl,
            metadata: { plan: body.plan, userId: user.userId },
          },
        });

        return reply.send({
          payment,
          moyasarPayment: moyasarData,
          transactionUrl: moyasarData.source?.transaction_url,
        });
      } catch (error: any) {
        app.log.error('[payments/create]', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    },
  );

  // GET /api/payments/verify/:id — verify Moyasar payment status
  app.get<{ Params: { id: string } }>(
    '/verify/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user;

      try {
        const moyasarResponse = await fetch(`${MOYASAR_BASE_URL}/payments/${id}`, {
          headers: { Authorization: moyasarAuth() },
        });

        if (!moyasarResponse.ok) {
          return reply.code(404).send({ error: 'Payment not found in Moyasar' });
        }

        const moyasarPayment = await moyasarResponse.json();

        // Update local DB
        const localPayment = await app.prisma.namaaPayment.findFirst({
          where: { moyasarId: id },
        });

        if (localPayment) {
          await app.prisma.namaaPayment.update({
            where: { id: localPayment.id },
            data: {
              status: moyasarPayment.status,
              updatedAt: new Date(),
            },
          });

          // If paid, activate subscription
          if (
            moyasarPayment.status === 'paid' &&
            localPayment.status !== 'paid' &&
            localPayment.plan
          ) {
            const now = new Date();
            const endDate = new Date(now);
            endDate.setMonth(endDate.getMonth() + 1);

            await app.prisma.namaaSubscription.upsert({
              where: { id: localPayment.orgId } as any,
              create: {
                orgId: localPayment.orgId,
                plan: localPayment.plan,
                status: 'active',
                moyasarId: moyasarPayment.id,
                startDate: now,
                endDate,
              },
              update: {
                plan: localPayment.plan!,
                status: 'active',
                moyasarId: moyasarPayment.id,
                startDate: now,
                endDate,
                updatedAt: now,
              },
            });
          }
        }

        return reply.send({ moyasarPayment, localPayment });
      } catch (error: any) {
        app.log.error('[payments/verify]', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    },
  );

  // POST /api/payments/webhook — Moyasar webhook handler (no auth, verified by signature)
  app.post(
    '/webhook',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = request.headers['x-moyasar-signature'] as string || '';
      const rawBody = JSON.stringify(request.body);

      // Signature verification in production
      if (process.env.NODE_ENV === 'production' && MOYASAR_SECRET_KEY) {
        const expectedSig = crypto
          .createHmac('sha256', MOYASAR_SECRET_KEY)
          .update(rawBody)
          .digest('hex');

        const sigValid = (() => {
          try {
            return crypto.timingSafeEqual(
              Buffer.from(signature, 'hex'),
              Buffer.from(expectedSig, 'hex'),
            );
          } catch {
            return false;
          }
        })();

        if (!sigValid) {
          app.log.warn('[webhook] Invalid Moyasar signature');
          return reply.code(401).send({ error: 'Invalid signature' });
        }
      }

      const event = request.body as any;
      const { type, data } = event;

      app.log.info(`[webhook] Moyasar event: ${type} paymentId=${data?.id}`);

      try {
        switch (type) {
          case 'payment_paid': {
            await app.prisma.namaaPayment.updateMany({
              where: { moyasarId: data.id },
              data: { status: 'paid', updatedAt: new Date() },
            });

            const localPayment = await app.prisma.namaaPayment.findFirst({
              where: { moyasarId: data.id },
            });

            if (localPayment?.plan) {
              const now = new Date();
              const endDate = new Date(now);
              endDate.setMonth(endDate.getMonth() + 1);

              await app.prisma.namaaSubscription.upsert({
                where: { id: localPayment.orgId } as any,
                create: {
                  orgId: localPayment.orgId,
                  plan: localPayment.plan,
                  status: 'active',
                  moyasarId: data.id,
                  startDate: now,
                  endDate,
                },
                update: {
                  plan: localPayment.plan!,
                  status: 'active',
                  moyasarId: data.id,
                  startDate: now,
                  endDate,
                  updatedAt: now,
                },
              });
            }
            break;
          }
          case 'payment_failed': {
            await app.prisma.namaaPayment.updateMany({
              where: { moyasarId: data.id },
              data: {
                status: 'failed',
                errorMessage: data.source?.message || 'Payment failed',
                updatedAt: new Date(),
              },
            });
            break;
          }
          case 'payment_refunded': {
            await app.prisma.namaaPayment.updateMany({
              where: { moyasarId: data.id },
              data: { status: 'refunded', updatedAt: new Date() },
            });
            break;
          }
          default:
            app.log.info(`[webhook] Unhandled event: ${type}`);
        }

        return reply.send({ received: true });
      } catch (error: any) {
        app.log.error('[payments/webhook]', error);
        return reply.code(500).send({ error: 'Webhook processing failed' });
      }
    },
  );

  // GET /api/payments — list payments for current org
  app.get(
    '/',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;
      const payments = await app.prisma.namaaPayment.findMany({
        where: { orgId: user.orgId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return reply.send({ payments });
    },
  );
}
