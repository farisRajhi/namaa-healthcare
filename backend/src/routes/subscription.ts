import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export default async function subscriptionRoutes(app: FastifyInstance) {
  // GET /api/subscription — get current org subscription + payment history
  app.get(
    '/',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;

      const subscription = await app.prisma.tawafudSubscription.findFirst({
        where: { orgId: user.orgId },
        orderBy: { createdAt: 'desc' },
      });

      const payments = await app.prisma.tawafudPayment.findMany({
        where: { orgId: user.orgId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      return reply.send({
        subscription,
        payments,
        isActive:
          subscription?.status === 'active' &&
          !!subscription.endDate &&
          new Date(subscription.endDate) > new Date(),
      });
    },
  );

  // POST /api/subscription/upgrade — initiate plan upgrade payment
  app.post(
    '/upgrade',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;
      const body = request.body as any;

      const PLAN_PRICES: Record<string, number> = {
        starter: 29900,
        professional: 49900,
        enterprise: 79900,
      };

      const { plan, source, callbackUrl } = body;

      if (!plan || !PLAN_PRICES[plan]) {
        return reply.code(400).send({
          error: 'Invalid plan. Choose: starter, professional, enterprise',
        });
      }

      if (!source) {
        return reply.code(400).send({ error: 'Payment source required' });
      }

      const MOYASAR_BASE_URL = 'https://api.moyasar.com/v1';
      const MOYASAR_SECRET_KEY = process.env.MOYASAR_SECRET_KEY || '';
      const moyasarAuth = 'Basic ' + Buffer.from(MOYASAR_SECRET_KEY + ':').toString('base64');

      const moyasarResponse = await fetch(`${MOYASAR_BASE_URL}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: moyasarAuth,
        },
        body: JSON.stringify({
          amount: PLAN_PRICES[plan],
          currency: 'SAR',
          description: `Tawafud ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
          source,
          callback_url:
            callbackUrl ||
            `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing?payment=callback&plan=${plan}`,
          metadata: { orgId: user.orgId, userId: user.userId, plan },
        }),
      });

      const moyasarData = await moyasarResponse.json();

      if (!moyasarResponse.ok) {
        return reply.code(400).send({
          error: 'Failed to initiate payment',
          details: moyasarData,
        });
      }

      const payment = await app.prisma.tawafudPayment.create({
        data: {
          orgId: user.orgId,
          amount: PLAN_PRICES[plan],
          currency: 'SAR',
          status: moyasarData.status || 'pending',
          moyasarId: moyasarData.id,
          source: typeof source === 'object' ? source.type : source,
          description: `${plan} plan upgrade`,
          plan,
          callbackUrl,
          metadata: { plan, userId: user.userId },
        },
      });

      return reply.send({
        payment,
        moyasarPayment: moyasarData,
        transactionUrl: moyasarData.source?.transaction_url,
      });
    },
  );
}
