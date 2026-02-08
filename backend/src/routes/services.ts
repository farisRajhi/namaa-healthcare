import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const createServiceSchema = z.object({
  name: z.string().min(1),
  durationMin: z.number().min(5),
  bufferBeforeMin: z.number().default(0),
  bufferAfterMin: z.number().default(0),
  active: z.boolean().default(true),
});

export default async function servicesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // List services
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = z.object({
      active: z.coerce.boolean().optional(),
    }).parse(request.query);

    const services = await app.prisma.service.findMany({
      where: {
        orgId,
        ...(query.active !== undefined && { active: query.active }),
      },
      include: {
        providers: {
          include: { provider: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return { data: services };
  });

  // Get single service
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const service = await app.prisma.service.findFirst({
      where: { serviceId: id, orgId },
      include: {
        providers: {
          include: { provider: true },
        },
      },
    });

    if (!service) {
      return { error: 'Service not found' };
    }

    return service;
  });

  // Create service
  app.post('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = createServiceSchema.parse(request.body);

    const service = await app.prisma.service.create({
      data: {
        orgId,
        name: body.name,
        durationMin: body.durationMin,
        bufferBeforeMin: body.bufferBeforeMin,
        bufferAfterMin: body.bufferAfterMin,
        active: body.active,
      },
    });

    return service;
  });

  // Update service
  app.put<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = createServiceSchema.partial().parse(request.body);

    const result = await app.prisma.service.updateMany({
      where: { serviceId: id, orgId },
      data: body,
    });

    if (result.count === 0) {
      return { error: 'Service not found' };
    }

    return { success: true };
  });

  // Delete service
  app.delete<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const result = await app.prisma.service.deleteMany({
      where: { serviceId: id, orgId },
    });

    if (result.count === 0) {
      return { error: 'Service not found' };
    }

    return { success: true };
  });
}
