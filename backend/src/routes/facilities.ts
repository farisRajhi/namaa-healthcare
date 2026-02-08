import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const createFacilitySchema = z.object({
  name: z.string().min(1),
  timezone: z.string().min(1),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

export default async function facilitiesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // List facilities
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;

    const facilities = await app.prisma.facility.findMany({
      where: { orgId },
      include: {
        _count: {
          select: { providers: true, appointments: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return { data: facilities };
  });

  // Get single facility
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const facility = await app.prisma.facility.findFirst({
      where: { facilityId: id, orgId },
      include: {
        providers: true,
        _count: {
          select: { appointments: true },
        },
      },
    });

    if (!facility) {
      return { error: 'Facility not found' };
    }

    return facility;
  });

  // Create facility
  app.post('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = createFacilitySchema.parse(request.body);

    const facility = await app.prisma.facility.create({
      data: {
        orgId,
        name: body.name,
        timezone: body.timezone,
        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2,
        city: body.city,
        region: body.region,
        postalCode: body.postalCode,
        country: body.country,
      },
    });

    return facility;
  });

  // Update facility
  app.put<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = createFacilitySchema.partial().parse(request.body);

    const result = await app.prisma.facility.updateMany({
      where: { facilityId: id, orgId },
      data: body,
    });

    if (result.count === 0) {
      return { error: 'Facility not found' };
    }

    return { success: true };
  });

  // Delete facility
  app.delete<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const result = await app.prisma.facility.deleteMany({
      where: { facilityId: id, orgId },
    });

    if (result.count === 0) {
      return { error: 'Facility not found' };
    }

    return { success: true };
  });
}
