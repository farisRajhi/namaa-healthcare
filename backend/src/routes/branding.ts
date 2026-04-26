import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { uploadImage, deleteImage } from '../services/storage/objectStorage.js';

const HEX_COLOR = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

const updateBrandingSchema = z.object({
  nameAr: z.string().max(120).optional().nullable(),
  colors: z
    .array(z.string().regex(HEX_COLOR, 'Invalid hex color'))
    .max(10)
    .optional(),
  voiceTone: z.string().max(500).optional().nullable(),
});

const ALLOWED_LOGO_MIMETYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

function normalizeColors(colors: string[]): string[] {
  return colors.map((c) => (c.startsWith('#') ? c.toLowerCase() : `#${c.toLowerCase()}`));
}

export default async function brandingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const [org, branding] = await Promise.all([
      app.prisma.org.findUnique({ where: { orgId }, select: { name: true, nameAr: true } }),
      app.prisma.orgBranding.findUnique({ where: { orgId } }),
    ]);

    return {
      data: {
        name: org?.name ?? null,
        nameAr: org?.nameAr ?? null,
        logoUrl: branding?.logoUrl ?? null,
        colors: branding?.colors ?? [],
        voiceTone: branding?.voiceTone ?? null,
      },
    };
  });

  app.put('/', async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const body = updateBrandingSchema.parse(request.body);

    if (body.nameAr !== undefined) {
      await app.prisma.org.update({
        where: { orgId },
        data: { nameAr: body.nameAr },
      });
    }

    const updates: { colors?: string[]; voiceTone?: string | null } = {};
    if (body.colors !== undefined) updates.colors = normalizeColors(body.colors);
    if (body.voiceTone !== undefined) updates.voiceTone = body.voiceTone;

    const branding = await app.prisma.orgBranding.upsert({
      where: { orgId },
      update: updates,
      create: {
        orgId,
        colors: updates.colors ?? [],
        voiceTone: updates.voiceTone ?? null,
      },
    });

    return reply.send({
      data: {
        nameAr: body.nameAr ?? null,
        colors: branding.colors,
        voiceTone: branding.voiceTone,
        logoUrl: branding.logoUrl,
      },
    });
  });

  app.post('/logo', async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });

    if (!ALLOWED_LOGO_MIMETYPES.includes(file.mimetype)) {
      return reply.code(400).send({ error: 'Unsupported logo type. Use PNG, JPEG, WebP, or SVG.' });
    }

    const buffer = await file.toBuffer();
    if (buffer.length > MAX_LOGO_BYTES) {
      return reply.code(413).send({ error: 'Logo exceeds 5MB limit' });
    }

    const existing = await app.prisma.orgBranding.findUnique({ where: { orgId } });
    if (existing?.logoKey) {
      await deleteImage(existing.logoKey).catch(() => undefined);
    }

    const { url, key } = await uploadImage(orgId, 'logos', buffer, file.mimetype);

    const branding = await app.prisma.orgBranding.upsert({
      where: { orgId },
      update: { logoUrl: url, logoKey: key },
      create: { orgId, logoUrl: url, logoKey: key, colors: [] },
    });

    return reply.send({ data: { logoUrl: branding.logoUrl } });
  });

  app.delete('/logo', async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const existing = await app.prisma.orgBranding.findUnique({ where: { orgId } });
    if (!existing?.logoKey) return reply.send({ data: { logoUrl: null } });

    await deleteImage(existing.logoKey).catch(() => undefined);

    await app.prisma.orgBranding.update({
      where: { orgId },
      data: { logoUrl: null, logoKey: null },
    });

    return reply.send({ data: { logoUrl: null } });
  });
}
