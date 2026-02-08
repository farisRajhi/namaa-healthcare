import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export default async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Dashboard overview stats
  app.get('/overview', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = dateRangeSchema.parse(request.query);

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [
      totalPatients,
      totalProviders,
      todayAppointments,
      monthAppointments,
      appointmentsByStatus,
    ] = await Promise.all([
      // Total patients
      app.prisma.patient.count({ where: { orgId } }),

      // Total active providers
      app.prisma.provider.count({ where: { orgId, active: true } }),

      // Today's appointments
      app.prisma.appointment.count({
        where: {
          orgId,
          startTs: { gte: startOfToday, lte: endOfToday },
        },
      }),

      // This month's appointments
      app.prisma.appointment.count({
        where: {
          orgId,
          startTs: { gte: startOfMonth, lte: endOfMonth },
        },
      }),

      // Appointments by status this month
      app.prisma.appointment.groupBy({
        by: ['status'],
        where: {
          orgId,
          startTs: { gte: startOfMonth, lte: endOfMonth },
        },
        _count: { status: true },
      }),
    ]);

    return {
      totalPatients,
      totalProviders,
      todayAppointments,
      monthAppointments,
      appointmentsByStatus: appointmentsByStatus.map((s) => ({
        status: s.status,
        count: s._count.status,
      })),
    };
  });

  // Appointments by day for chart
  app.get('/appointments-by-day', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = z.object({
      days: z.coerce.number().default(30),
    }).parse(request.query);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - query.days);
    startDate.setHours(0, 0, 0, 0);

    const appointments = await app.prisma.appointment.findMany({
      where: {
        orgId,
        startTs: { gte: startDate },
      },
      select: {
        startTs: true,
        status: true,
      },
    });

    // Group by day
    const byDay: Record<string, { total: number; completed: number; cancelled: number }> = {};

    appointments.forEach((apt) => {
      const day = apt.startTs.toISOString().split('T')[0];
      if (!byDay[day]) {
        byDay[day] = { total: 0, completed: 0, cancelled: 0 };
      }
      byDay[day].total++;
      if (apt.status === 'completed') byDay[day].completed++;
      if (apt.status === 'cancelled' || apt.status === 'no_show') byDay[day].cancelled++;
    });

    return {
      data: Object.entries(byDay)
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  });

  // Top services
  app.get('/top-services', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = z.object({
      limit: z.coerce.number().default(5),
    }).parse(request.query);

    const services = await app.prisma.appointment.groupBy({
      by: ['serviceId'],
      where: { orgId },
      _count: { serviceId: true },
      orderBy: { _count: { serviceId: 'desc' } },
      take: query.limit,
    });

    const serviceDetails = await app.prisma.service.findMany({
      where: {
        serviceId: { in: services.map((s) => s.serviceId) },
      },
    });

    return {
      data: services.map((s) => ({
        serviceId: s.serviceId,
        name: serviceDetails.find((d) => d.serviceId === s.serviceId)?.name || 'Unknown',
        count: s._count.serviceId,
      })),
    };
  });

  // Booking channels breakdown
  app.get('/booking-channels', async (request: FastifyRequest) => {
    const { orgId } = request.user;

    const channels = await app.prisma.appointment.groupBy({
      by: ['bookedVia'],
      where: { orgId },
      _count: { bookedVia: true },
    });

    return {
      data: channels.map((c) => ({
        channel: c.bookedVia,
        count: c._count.bookedVia,
      })),
    };
  });
}
