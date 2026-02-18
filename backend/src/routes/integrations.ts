import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const createIntegrationSchema = z.object({
  type: z.string().min(1),
  provider: z.string().min(1),
  config: z.record(z.any()).default({}),
  isActive: z.boolean().default(true),
});

const updateIntegrationSchema = z.object({
  type: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  config: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

const createWebhookSchema = z.object({
  event: z.string().min(1),
  url: z.string().url(),
  secret: z.string().min(1).optional(),
  isActive: z.boolean().default(true),
});

const updateWebhookSchema = z.object({
  event: z.string().min(1).optional(),
  url: z.string().url().optional(),
  secret: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function integrationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // ── Integrations CRUD ──────────────────────────────────

  // List integrations
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const integrations = await app.prisma.integration.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: integrations };
  });

  // Get single integration
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { orgId } = request.user;
    const { id } = request.params as { id: string };
    const integration = await app.prisma.integration.findFirst({
      where: { integrationId: id, orgId },
    });
    if (!integration) return reply.code(404).send({ error: 'Integration not found' });
    return integration;
  });

  // Create integration
  app.post('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = createIntegrationSchema.parse(request.body);
    const integration = await app.prisma.integration.create({
      data: {
        orgId,
        type: body.type,
        provider: body.provider,
        config: body.config,
        isActive: body.isActive,
      },
    });
    return { data: integration };
  });

  // Update integration
  app.put('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { orgId } = request.user;
    const { id } = request.params as { id: string };
    const body = updateIntegrationSchema.parse(request.body);

    const existing = await app.prisma.integration.findFirst({
      where: { integrationId: id, orgId },
    });
    if (!existing) return reply.code(404).send({ error: 'Integration not found' });

    const integration = await app.prisma.integration.update({
      where: { integrationId: id },
      data: body,
    });
    return { data: integration };
  });

  // Delete integration
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { orgId } = request.user;
    const { id } = request.params as { id: string };

    const existing = await app.prisma.integration.findFirst({
      where: { integrationId: id, orgId },
    });
    if (!existing) return reply.code(404).send({ error: 'Integration not found' });

    await app.prisma.integration.delete({ where: { integrationId: id } });
    return { success: true };
  });

  // Sync integration (toggle lastSyncAt)
  app.post('/:id/sync', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { orgId } = request.user;
    const { id } = request.params as { id: string };

    const existing = await app.prisma.integration.findFirst({
      where: { integrationId: id, orgId },
    });
    if (!existing) return reply.code(404).send({ error: 'Integration not found' });

    const integration = await app.prisma.integration.update({
      where: { integrationId: id },
      data: { lastSyncAt: new Date() },
    });
    return { data: integration };
  });
}

export async function webhookSubscriptionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // List webhook subscriptions
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const webhooks = await app.prisma.webhookSubscription.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: webhooks };
  });

  // Create webhook subscription
  app.post('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = createWebhookSchema.parse(request.body);
    const webhook = await app.prisma.webhookSubscription.create({
      data: {
        orgId,
        event: body.event,
        url: body.url,
        secret: body.secret || `whsec_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
        isActive: body.isActive,
      },
    });
    return { data: webhook };
  });

  // Update webhook subscription
  app.put('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { orgId } = request.user;
    const { id } = request.params as { id: string };
    const body = updateWebhookSchema.parse(request.body);

    const existing = await app.prisma.webhookSubscription.findFirst({
      where: { webhookId: id, orgId },
    });
    if (!existing) return reply.code(404).send({ error: 'Webhook not found' });

    const webhook = await app.prisma.webhookSubscription.update({
      where: { webhookId: id },
      data: body,
    });
    return { data: webhook };
  });

  // Delete webhook subscription
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { orgId } = request.user;
    const { id } = request.params as { id: string };

    const existing = await app.prisma.webhookSubscription.findFirst({
      where: { webhookId: id, orgId },
    });
    if (!existing) return reply.code(404).send({ error: 'Webhook not found' });

    await app.prisma.webhookSubscription.delete({ where: { webhookId: id } });
    return { success: true };
  });

  // Test webhook (fire a test payload)
  app.post('/:id/test', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { orgId } = request.user;
    const { id } = request.params as { id: string };

    const webhook = await app.prisma.webhookSubscription.findFirst({
      where: { webhookId: id, orgId },
    });
    if (!webhook) return reply.code(404).send({ error: 'Webhook not found' });

    // Send test payload
    try {
      const testPayload = {
        event: webhook.event,
        test: true,
        timestamp: new Date().toISOString(),
        data: { message: 'Test webhook from Namaa' },
      };

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': webhook.secret,
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000),
      });

      // Update lastFiredAt
      await app.prisma.webhookSubscription.update({
        where: { webhookId: id },
        data: { lastFiredAt: new Date(), failCount: response.ok ? 0 : webhook.failCount + 1 },
      });

      return {
        success: response.ok,
        status: response.status,
        message: response.ok ? 'Test webhook sent successfully' : `Webhook returned ${response.status}`,
      };
    } catch (err: any) {
      // Update fail count
      await app.prisma.webhookSubscription.update({
        where: { webhookId: id },
        data: { failCount: webhook.failCount + 1 },
      });

      return reply.code(502).send({
        success: false,
        message: `Failed to reach webhook URL: ${err.message}`,
      });
    }
  });
}

export default integrationsRoutes;
