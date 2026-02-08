import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const createPatientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  sex: z.string().optional(),
  mrn: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  search: z.string().optional(),
});

export default async function patientsRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('preHandler', app.authenticate);

  // List patients
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = querySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where = {
      orgId,
      ...(query.search && {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' as const } },
          { lastName: { contains: query.search, mode: 'insensitive' as const } },
          { mrn: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [patients, total] = await Promise.all([
      app.prisma.patient.findMany({
        where,
        skip,
        take: query.limit,
        include: {
          contacts: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      app.prisma.patient.count({ where }),
    ]);

    return {
      data: patients,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // Get single patient
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const patient = await app.prisma.patient.findFirst({
      where: { patientId: id, orgId },
      include: {
        contacts: true,
        appointments: {
          include: {
            provider: true,
            service: true,
          },
          orderBy: { startTs: 'desc' },
          take: 10,
        },
      },
    });

    if (!patient) {
      return { error: 'Patient not found' };
    }

    return patient;
  });

  // Create patient
  app.post('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = createPatientSchema.parse(request.body);

    const patient = await app.prisma.patient.create({
      data: {
        orgId,
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        sex: body.sex,
        mrn: body.mrn,
        contacts: {
          create: [
            ...(body.phone ? [{ contactType: 'phone', contactValue: body.phone, isPrimary: true }] : []),
            ...(body.email ? [{ contactType: 'email', contactValue: body.email }] : []),
          ],
        },
      },
      include: {
        contacts: true,
      },
    });

    return patient;
  });

  // Update patient
  app.put<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = createPatientSchema.partial().parse(request.body);

    const patient = await app.prisma.patient.updateMany({
      where: { patientId: id, orgId },
      data: {
        ...(body.firstName && { firstName: body.firstName }),
        ...(body.lastName && { lastName: body.lastName }),
        ...(body.dateOfBirth && { dateOfBirth: new Date(body.dateOfBirth) }),
        ...(body.sex && { sex: body.sex }),
        ...(body.mrn && { mrn: body.mrn }),
      },
    });

    if (patient.count === 0) {
      return { error: 'Patient not found' };
    }

    return { success: true };
  });

  // Delete patient
  app.delete<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const result = await app.prisma.patient.deleteMany({
      where: { patientId: id, orgId },
    });

    if (result.count === 0) {
      return { error: 'Patient not found' };
    }

    return { success: true };
  });
}
