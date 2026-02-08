import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const createDepartmentSchema = z.object({
  name: z.string().min(1),
});

export default async function departmentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // List departments
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;

    const departments = await app.prisma.department.findMany({
      where: { orgId },
      include: {
        _count: {
          select: { providers: true, appointments: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return { data: departments };
  });

  // Get single department
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const department = await app.prisma.department.findFirst({
      where: { departmentId: id, orgId },
      include: {
        providers: true,
        _count: {
          select: { appointments: true },
        },
      },
    });

    if (!department) {
      return { error: 'Department not found' };
    }

    return department;
  });

  // Create department
  app.post('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = createDepartmentSchema.parse(request.body);

    const department = await app.prisma.department.create({
      data: {
        orgId,
        name: body.name,
      },
    });

    return department;
  });

  // Update department
  app.put<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = createDepartmentSchema.partial().parse(request.body);

    const result = await app.prisma.department.updateMany({
      where: { departmentId: id, orgId },
      data: body,
    });

    if (result.count === 0) {
      return { error: 'Department not found' };
    }

    return { success: true };
  });

  // Delete department
  app.delete<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const result = await app.prisma.department.deleteMany({
      where: { departmentId: id, orgId },
    });

    if (result.count === 0) {
      return { error: 'Department not found' };
    }

    return { success: true };
  });
}
