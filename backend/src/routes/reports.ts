import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

const reportTypeSchema = z.object({
  type: z.enum(['appointments', 'patients', 'calls', 'campaigns', 'prescriptions']),
  from: z.string().optional(),
  to: z.string().optional(),
  format: z.enum(['json', 'csv']).default('csv'),
});

function toCsv(data: Record<string, any>[], columns?: string[]): string {
  if (data.length === 0) return '';
  const cols = columns || Object.keys(data[0]);
  const header = cols.join(',');
  const rows = data.map((row) =>
    cols
      .map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Escape CSV values
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(',')
  );
  return [header, ...rows].join('\n');
}

export default async function reportsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Summary report (aggregated stats for a date range)
  app.get('/summary', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = dateRangeSchema.parse(request.query);

    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : new Date();

    const [
      totalPatients,
      newPatients,
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      noShowAppointments,
      totalCalls,
      totalPrescriptions,
      activeCampaigns,
    ] = await Promise.all([
      app.prisma.patient.count({ where: { orgId } }),
      app.prisma.patient.count({ where: { orgId, createdAt: { gte: from, lte: to } } }),
      app.prisma.appointment.count({ where: { orgId, createdAt: { gte: from, lte: to } } }),
      app.prisma.appointment.count({ where: { orgId, status: 'completed', createdAt: { gte: from, lte: to } } }),
      app.prisma.appointment.count({ where: { orgId, status: 'cancelled', createdAt: { gte: from, lte: to } } }),
      app.prisma.appointment.count({ where: { orgId, status: 'no_show', createdAt: { gte: from, lte: to } } }),
      app.prisma.voiceCall.count({ where: { orgId, createdAt: { gte: from, lte: to } } }),
      app.prisma.prescription.count({ where: { orgId, createdAt: { gte: from, lte: to } } }),
      app.prisma.campaign.count({ where: { orgId, status: 'active' } }),
    ]);

    const completionRate = totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0;
    const noShowRate = totalAppointments > 0 ? Math.round((noShowAppointments / totalAppointments) * 100) : 0;

    return {
      data: {
        period: { from: from.toISOString(), to: to.toISOString() },
        patients: { total: totalPatients, new: newPatients },
        appointments: {
          total: totalAppointments,
          completed: completedAppointments,
          cancelled: cancelledAppointments,
          noShow: noShowAppointments,
          completionRate,
          noShowRate,
        },
        calls: { total: totalCalls },
        prescriptions: { total: totalPrescriptions },
        campaigns: { active: activeCampaigns },
      },
    };
  });

  // Export report data
  app.get('/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.user;
    const query = reportTypeSchema.parse(request.query);

    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : new Date();

    let data: Record<string, any>[] = [];
    let filename = '';

    switch (query.type) {
      case 'appointments': {
        const appointments = await app.prisma.appointment.findMany({
          where: { orgId, createdAt: { gte: from, lte: to } },
          include: {
            patient: { select: { firstName: true, lastName: true, mrn: true } },
            provider: { select: { displayName: true } },
            service: { select: { name: true } },
            department: { select: { name: true } },
            facility: { select: { name: true } },
          },
          orderBy: { startTs: 'desc' },
          take: 5000,
        });
        data = appointments.map((a) => ({
          appointmentId: a.appointmentId,
          patientName: a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : 'N/A',
          patientMRN: a.patient?.mrn || '',
          provider: a.provider?.displayName || '',
          service: a.service?.name || '',
          department: a.department?.name || '',
          facility: a.facility?.name || '',
          status: a.status,
          startTime: a.startTs.toISOString(),
          endTime: a.endTs.toISOString(),
          bookedVia: a.bookedVia,
          reason: a.reason || '',
          createdAt: a.createdAt.toISOString(),
        }));
        filename = `appointments_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
        break;
      }
      case 'patients': {
        const patients = await app.prisma.patient.findMany({
          where: { orgId, createdAt: { gte: from, lte: to } },
          include: {
            contacts: { where: { isPrimary: true }, take: 1 },
            _count: { select: { appointments: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5000,
        });
        data = patients.map((p) => ({
          patientId: p.patientId,
          firstName: p.firstName,
          lastName: p.lastName,
          mrn: p.mrn || '',
          dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : '',
          sex: p.sex || '',
          primaryContact: p.contacts[0]?.contactValue || '',
          contactType: p.contacts[0]?.contactType || '',
          totalAppointments: p._count.appointments,
          registeredAt: p.createdAt.toISOString(),
        }));
        filename = `patients_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
        break;
      }
      case 'calls': {
        const calls = await app.prisma.voiceCall.findMany({
          where: { orgId, createdAt: { gte: from, lte: to } },
          orderBy: { startedAt: 'desc' },
          take: 5000,
        });
        data = calls.map((c) => ({
          callId: c.callId,
          direction: c.direction,
          status: c.status,
          callerPhone: c.callerPhone,
          calledPhone: c.calledPhone,
          detectedDialect: c.detectedDialect || '',
          durationSec: c.durationSec || 0,
          startedAt: c.startedAt.toISOString(),
          endedAt: c.endedAt ? c.endedAt.toISOString() : '',
        }));
        filename = `calls_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
        break;
      }
      case 'campaigns': {
        const campaigns = await app.prisma.campaign.findMany({
          where: { orgId, createdAt: { gte: from, lte: to } },
          include: { _count: { select: { targets: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1000,
        });
        data = campaigns.map((c) => ({
          campaignId: c.campaignId,
          name: c.name,
          type: c.type,
          status: c.status,
          totalTargets: c._count.targets,
          startDate: c.startDate ? c.startDate.toISOString().slice(0, 10) : '',
          endDate: c.endDate ? c.endDate.toISOString().slice(0, 10) : '',
          createdAt: c.createdAt.toISOString(),
        }));
        filename = `campaigns_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
        break;
      }
      case 'prescriptions': {
        const prescriptions = await app.prisma.prescription.findMany({
          where: { orgId, createdAt: { gte: from, lte: to } },
          orderBy: { createdAt: 'desc' },
          take: 5000,
        });
        data = prescriptions.map((p) => ({
          prescriptionId: p.prescriptionId,
          patientId: p.patientId,
          providerId: p.providerId,
          medicationName: p.medicationName,
          dosage: p.dosage,
          frequency: p.frequency,
          status: p.status,
          refillsRemaining: p.refillsRemaining,
          refillsTotal: p.refillsTotal,
          startDate: p.startDate.toISOString().slice(0, 10),
          endDate: p.endDate ? p.endDate.toISOString().slice(0, 10) : '',
          pharmacyName: p.pharmacyName || '',
          createdAt: p.createdAt.toISOString(),
        }));
        filename = `prescriptions_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
        break;
      }
    }

    if (query.format === 'csv') {
      const csv = toCsv(data);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return csv;
    }

    return { data, meta: { count: data.length, filename } };
  });

  // Appointment statistics by provider
  app.get('/by-provider', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = dateRangeSchema.parse(request.query);
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : new Date();

    const providers = await app.prisma.provider.findMany({
      where: { orgId, active: true },
      select: {
        providerId: true,
        displayName: true,
        _count: {
          select: {
            appointments: {
              where: { createdAt: { gte: from, lte: to } },
            },
          },
        },
      },
    });

    // Get completed + no-show counts per provider
    const providerStats = await Promise.all(
      providers.map(async (p) => {
        const [completed, noShow, cancelled] = await Promise.all([
          app.prisma.appointment.count({
            where: { orgId, providerId: p.providerId, status: 'completed', createdAt: { gte: from, lte: to } },
          }),
          app.prisma.appointment.count({
            where: { orgId, providerId: p.providerId, status: 'no_show', createdAt: { gte: from, lte: to } },
          }),
          app.prisma.appointment.count({
            where: { orgId, providerId: p.providerId, status: 'cancelled', createdAt: { gte: from, lte: to } },
          }),
        ]);
        return {
          providerId: p.providerId,
          displayName: p.displayName,
          totalAppointments: p._count.appointments,
          completed,
          noShow,
          cancelled,
          completionRate: p._count.appointments > 0 ? Math.round((completed / p._count.appointments) * 100) : 0,
        };
      })
    );

    return { data: providerStats };
  });

  // Appointment statistics by department
  app.get('/by-department', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = dateRangeSchema.parse(request.query);
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : new Date();

    const departments = await app.prisma.department.findMany({
      where: { orgId },
      select: {
        departmentId: true,
        name: true,
        _count: {
          select: {
            appointments: {
              where: { createdAt: { gte: from, lte: to } },
            },
          },
        },
      },
    });

    return {
      data: departments.map((d) => ({
        departmentId: d.departmentId,
        name: d.name,
        totalAppointments: d._count.appointments,
      })),
    };
  });

  // Daily appointment trend
  app.get('/daily-trend', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = dateRangeSchema.parse(request.query);
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : new Date();

    const appointments = await app.prisma.appointment.findMany({
      where: { orgId, startTs: { gte: from, lte: to } },
      select: { startTs: true, status: true },
      orderBy: { startTs: 'asc' },
    });

    // Group by date
    const dailyMap = new Map<string, { total: number; completed: number; cancelled: number; noShow: number }>();
    for (const a of appointments) {
      const dateKey = a.startTs.toISOString().slice(0, 10);
      const entry = dailyMap.get(dateKey) || { total: 0, completed: 0, cancelled: 0, noShow: 0 };
      entry.total++;
      if (a.status === 'completed') entry.completed++;
      if (a.status === 'cancelled') entry.cancelled++;
      if (a.status === 'no_show') entry.noShow++;
      dailyMap.set(dateKey, entry);
    }

    const trend = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { data: trend };
  });
}
