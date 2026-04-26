import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { generateAdImage, validateInstruction } from '../services/ai/imageGeneration.js';
import { uploadImage, deleteImage } from '../services/storage/objectStorage.js';

const generateSchema = z.object({
  instruction: z.string().min(8).max(800),
  size: z.enum(['square', 'portrait', 'landscape']).optional(),
});

const DAILY_LIMIT_PER_ORG = Number(process.env.AD_IMAGE_DAILY_LIMIT ?? 30);

export default async function adImagesRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);
  app.addHook('preHandler', app.requireSubscription);

  app.post('/generate', async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const body = generateSchema.parse(request.body);

    const validation = validateInstruction(body.instruction);
    if (!validation.ok) {
      return reply.code(400).send({ error: validation.reason });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const generatedToday = await app.prisma.adImage.count({
      where: { orgId, createdAt: { gte: since } },
    });
    if (generatedToday >= DAILY_LIMIT_PER_ORG) {
      return reply.code(429).send({
        error: 'daily_generation_limit_reached',
        limit: DAILY_LIMIT_PER_ORG,
      });
    }

    const [org, branding] = await Promise.all([
      app.prisma.org.findUnique({
        where: { orgId },
        select: { name: true, nameAr: true },
      }),
      app.prisma.orgBranding.findUnique({ where: { orgId } }),
    ]);

    if (!org) return reply.code(404).send({ error: 'Organization not found' });

    let result;
    try {
      result = await generateAdImage(app.openai, {
        instruction: body.instruction,
        size: body.size,
        brand: {
          name: org.name,
          nameAr: org.nameAr,
          colors: branding?.colors ?? [],
          voiceTone: branding?.voiceTone ?? null,
        },
      });
    } catch (err) {
      app.log.error({ err, orgId }, 'AI image generation failed');
      return reply.code(502).send({ error: 'image_generation_failed' });
    }

    const stored = await uploadImage(orgId, 'ad-images', result.buffer, result.mimetype);

    const adImage = await app.prisma.adImage.create({
      data: {
        orgId,
        instruction: body.instruction,
        promptUsed: result.promptUsed,
        url: stored.url,
        storageKey: stored.key,
        mimetype: result.mimetype,
        status: 'ready',
      },
    });

    return reply.send({
      data: {
        adImageId: adImage.adImageId,
        url: adImage.url,
        mimetype: adImage.mimetype,
        createdAt: adImage.createdAt,
      },
    });
  });

  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const items = await app.prisma.adImage.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        adImageId: true,
        url: true,
        mimetype: true,
        instruction: true,
        createdAt: true,
        status: true,
      },
    });
    return { data: items };
  });

  app.get('/:id', async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const { id } = request.params as { id: string };
    const item = await app.prisma.adImage.findFirst({
      where: { adImageId: id, orgId },
    });
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { data: item };
  });

  app.delete('/:id', async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const { id } = request.params as { id: string };
    const item = await app.prisma.adImage.findFirst({
      where: { adImageId: id, orgId },
    });
    if (!item) return reply.code(404).send({ error: 'not_found' });

    await deleteImage(item.storageKey).catch(() => undefined);
    await app.prisma.adImage.delete({ where: { adImageId: id } });

    return reply.send({ data: { adImageId: id, deleted: true } });
  });
}
