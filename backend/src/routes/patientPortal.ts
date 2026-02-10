import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticatePatient } from './patientAuth.js';

interface PatientJwtPayload {
  patientId: string;
  orgId: string;
  type: 'patient';
}

function getPatientAuth(request: FastifyRequest): PatientJwtPayload {
  return (request as any).patientAuth as PatientJwtPayload;
}

const bookAppointmentSchema = z.object({
  providerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startTs: z.string(), // ISO date string
  reason: z.string().optional(),
  notes: z.string().optional(),
});

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).optional(),
});

const availabilityQuerySchema = z.object({
  providerId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceId: z.string().uuid().optional(),
});

export default async function patientPortalRoutes(app: FastifyInstance) {
  // All routes require patient authentication
  app.addHook('preHandler', authenticatePatient);

  // ─── Appointments ───────────────────────────────────────────

  // GET /appointments — List patient's appointments
  app.get('/appointments', async (request: FastifyRequest) => {
    const { patientId, orgId } = getPatientAuth(request);
    const query = z.object({
      type: z.enum(['upcoming', 'past', 'all']).default('all'),
      page: z.coerce.number().default(1),
      limit: z.coerce.number().default(20),
    }).parse(request.query);

    const now = new Date();
    const skip = (query.page - 1) * query.limit;

    const where: any = { patientId, orgId };
    if (query.type === 'upcoming') {
      where.startTs = { gte: now };
      where.status = { notIn: ['cancelled', 'no_show', 'expired'] };
    } else if (query.type === 'past') {
      where.startTs = { lt: now };
    }

    const [appointments, total] = await Promise.all([
      app.prisma.appointment.findMany({
        where,
        skip,
        take: query.limit,
        include: {
          provider: true,
          service: true,
          facility: true,
          department: true,
        },
        orderBy: { startTs: query.type === 'past' ? 'desc' : 'asc' },
      }),
      app.prisma.appointment.count({ where }),
    ]);

    return {
      data: appointments.map((a) => ({
        appointmentId: a.appointmentId,
        startTs: a.startTs,
        endTs: a.endTs,
        status: a.status,
        reason: a.reason,
        notes: a.notes,
        provider: {
          providerId: a.provider.providerId,
          displayName: a.provider.displayName,
          credentials: a.provider.credentials,
        },
        service: {
          serviceId: a.service.serviceId,
          name: a.service.name,
          durationMin: a.service.durationMin,
        },
        facility: a.facility ? {
          facilityId: a.facility.facilityId,
          name: a.facility.name,
        } : null,
        department: a.department ? {
          departmentId: a.department.departmentId,
          name: a.department.name,
        } : null,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // POST /appointments — Book new appointment
  app.post('/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    const { patientId, orgId } = getPatientAuth(request);
    const body = bookAppointmentSchema.parse(request.body);

    // Verify provider belongs to same org
    const provider = await app.prisma.provider.findFirst({
      where: { providerId: body.providerId, orgId, active: true },
    });
    if (!provider) {
      return reply.code(404).send({ error: 'الطبيب غير موجود', errorEn: 'Provider not found' });
    }

    // Verify service belongs to same org
    const service = await app.prisma.service.findFirst({
      where: { serviceId: body.serviceId, orgId, active: true },
    });
    if (!service) {
      return reply.code(404).send({ error: 'الخدمة غير موجودة', errorEn: 'Service not found' });
    }

    const startTs = new Date(body.startTs);
    const endTs = new Date(startTs.getTime() + service.durationMin * 60 * 1000);

    // Check for conflicts
    const conflict = await app.prisma.appointment.findFirst({
      where: {
        providerId: body.providerId,
        status: { notIn: ['cancelled', 'no_show', 'expired'] },
        OR: [
          { startTs: { lt: endTs }, endTs: { gt: startTs } },
        ],
      },
    });

    if (conflict) {
      return reply.code(409).send({
        error: 'الموعد غير متاح',
        errorEn: 'Time slot is not available',
      });
    }

    const appointment = await app.prisma.appointment.create({
      data: {
        orgId,
        providerId: body.providerId,
        patientId,
        serviceId: body.serviceId,
        facilityId: provider.facilityId,
        departmentId: provider.departmentId,
        startTs,
        endTs,
        status: 'booked',
        bookedVia: 'web',
        reason: body.reason || null,
        notes: body.notes || null,
      },
      include: {
        provider: true,
        service: true,
      },
    });

    return reply.code(201).send({
      appointmentId: appointment.appointmentId,
      startTs: appointment.startTs,
      endTs: appointment.endTs,
      status: appointment.status,
      provider: {
        displayName: appointment.provider.displayName,
      },
      service: {
        name: appointment.service.name,
      },
    });
  });

  // PATCH /appointments/:id/cancel — Cancel appointment
  app.patch<{ Params: { id: string } }>('/appointments/:id/cancel', async (request, reply) => {
    const { patientId, orgId } = getPatientAuth(request);
    const { id } = request.params;

    const appointment = await app.prisma.appointment.findFirst({
      where: { appointmentId: id, patientId, orgId },
    });

    if (!appointment) {
      return reply.code(404).send({ error: 'الموعد غير موجود', errorEn: 'Appointment not found' });
    }

    if (['cancelled', 'completed', 'no_show'].includes(appointment.status)) {
      return reply.code(400).send({
        error: 'لا يمكن إلغاء هذا الموعد',
        errorEn: 'Cannot cancel this appointment',
      });
    }

    const updated = await app.prisma.appointment.update({
      where: { appointmentId: id },
      data: {
        status: 'cancelled',
        updatedAt: new Date(),
      },
    });

    // Record status change
    await app.prisma.appointmentStatusHistory.create({
      data: {
        appointmentId: id,
        changedBy: `patient:${patientId}`,
        oldStatus: appointment.status as any,
        newStatus: 'cancelled',
        reason: 'Cancelled by patient via portal',
      },
    });

    return { appointmentId: updated.appointmentId, status: updated.status };
  });

  // ─── Prescriptions ─────────────────────────────────────────

  // GET /prescriptions — List patient's prescriptions
  app.get('/prescriptions', async (request: FastifyRequest) => {
    const { patientId, orgId } = getPatientAuth(request);

    const prescriptions = await app.prisma.prescription.findMany({
      where: { patientId, orgId },
      include: {
        refills: {
          orderBy: { requestedAt: 'desc' },
          take: 3,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: prescriptions.map((p) => ({
        prescriptionId: p.prescriptionId,
        medicationName: p.medicationName,
        medicationNameAr: p.medicationNameAr,
        dosage: p.dosage,
        frequency: p.frequency,
        refillsRemaining: p.refillsRemaining,
        refillsTotal: p.refillsTotal,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        pharmacyName: p.pharmacyName,
        notes: p.notes,
        recentRefills: p.refills.map((r) => ({
          refillId: r.refillId,
          status: r.status,
          requestedAt: r.requestedAt,
          processedAt: r.processedAt,
        })),
      })),
    };
  });

  // POST /prescriptions/:id/refill — Request refill
  app.post<{ Params: { id: string } }>('/prescriptions/:id/refill', async (request, reply) => {
    const { patientId, orgId } = getPatientAuth(request);
    const { id } = request.params;

    const prescription = await app.prisma.prescription.findFirst({
      where: { prescriptionId: id, patientId, orgId },
    });

    if (!prescription) {
      return reply.code(404).send({ error: 'الوصفة غير موجودة', errorEn: 'Prescription not found' });
    }

    if (prescription.status !== 'active') {
      return reply.code(400).send({
        error: 'الوصفة غير فعالة',
        errorEn: 'Prescription is not active',
      });
    }

    if (prescription.refillsRemaining <= 0) {
      return reply.code(400).send({
        error: 'لا يوجد إعادة تعبئة متبقية',
        errorEn: 'No refills remaining',
      });
    }

    // Check for pending refill
    const pendingRefill = await app.prisma.prescriptionRefill.findFirst({
      where: { prescriptionId: id, status: 'pending' },
    });

    if (pendingRefill) {
      return reply.code(409).send({
        error: 'يوجد طلب إعادة تعبئة معلق',
        errorEn: 'A refill request is already pending',
      });
    }

    const refill = await app.prisma.prescriptionRefill.create({
      data: {
        prescriptionId: id,
        requestedVia: 'web',
        status: 'pending',
      },
    });

    return reply.code(201).send({
      refillId: refill.refillId,
      status: refill.status,
      requestedAt: refill.requestedAt,
    });
  });

  // ─── Profile ────────────────────────────────────────────────

  // GET /profile — Get patient profile + memories
  app.get('/profile', async (request: FastifyRequest) => {
    const { patientId } = getPatientAuth(request);

    const patient = await app.prisma.patient.findUnique({
      where: { patientId },
      include: {
        contacts: true,
        memories: {
          where: { isActive: true },
        },
      },
    });

    if (!patient) {
      return { error: 'Patient not found' };
    }

    return {
      patientId: patient.patientId,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth?.toISOString().split('T')[0] || null,
      sex: patient.sex,
      mrn: patient.mrn,
      contacts: patient.contacts.map((c) => ({
        contactId: c.contactId,
        type: c.contactType,
        value: c.contactValue,
        isPrimary: c.isPrimary,
      })),
      memories: patient.memories.map((m) => ({
        type: m.memoryType,
        key: m.memoryKey,
        value: m.memoryValue,
      })),
    };
  });

  // PUT /profile — Update contact info
  app.put('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    const { patientId } = getPatientAuth(request);
    const body = updateProfileSchema.parse(request.body);

    const updateData: any = {};
    if (body.firstName) updateData.firstName = body.firstName;
    if (body.lastName) updateData.lastName = body.lastName;

    if (Object.keys(updateData).length > 0) {
      await app.prisma.patient.update({
        where: { patientId },
        data: updateData,
      });
    }

    // Update email contact
    if (body.email) {
      const emailContact = await app.prisma.patientContact.findFirst({
        where: { patientId, contactType: 'email' },
      });
      if (emailContact) {
        await app.prisma.patientContact.update({
          where: { contactId: emailContact.contactId },
          data: { contactValue: body.email },
        });
      } else {
        await app.prisma.patientContact.create({
          data: {
            patientId,
            contactType: 'email',
            contactValue: body.email,
            isPrimary: false,
          },
        });
      }
    }

    // Update phone contact
    if (body.phone) {
      let phone = body.phone.replace(/\s+/g, '');
      if (phone.startsWith('0')) phone = '+966' + phone.slice(1);
      if (!phone.startsWith('+')) phone = '+' + phone;

      const phoneContact = await app.prisma.patientContact.findFirst({
        where: { patientId, contactType: 'phone', isPrimary: true },
      });
      if (phoneContact) {
        await app.prisma.patientContact.update({
          where: { contactId: phoneContact.contactId },
          data: { contactValue: phone },
        });
      }
    }

    return { success: true };
  });

  // ─── Providers ──────────────────────────────────────────────

  // GET /providers — List available providers
  app.get('/providers', async (request: FastifyRequest) => {
    const { orgId } = getPatientAuth(request);
    const query = z.object({
      serviceId: z.string().uuid().optional(),
    }).parse(request.query);

    const where: any = { orgId, active: true };

    const providers = await app.prisma.provider.findMany({
      where,
      include: {
        department: true,
        facility: true,
        services: {
          include: { service: true },
        },
      },
      orderBy: { displayName: 'asc' },
    });

    let filtered = providers;
    if (query.serviceId) {
      filtered = providers.filter((p) =>
        p.services.some((ps) => ps.serviceId === query.serviceId)
      );
    }

    return {
      data: filtered.map((p) => ({
        providerId: p.providerId,
        displayName: p.displayName,
        credentials: p.credentials,
        department: p.department ? { departmentId: p.department.departmentId, name: p.department.name } : null,
        facility: p.facility ? { facilityId: p.facility.facilityId, name: p.facility.name } : null,
        services: p.services.map((ps) => ({
          serviceId: ps.service.serviceId,
          name: ps.service.name,
          durationMin: ps.service.durationMin,
        })),
      })),
    };
  });

  // ─── Services ───────────────────────────────────────────────

  // GET /services — List available services
  app.get('/services', async (request: FastifyRequest) => {
    const { orgId } = getPatientAuth(request);

    const services = await app.prisma.service.findMany({
      where: { orgId, active: true },
      orderBy: { name: 'asc' },
    });

    return {
      data: services.map((s) => ({
        serviceId: s.serviceId,
        name: s.name,
        durationMin: s.durationMin,
      })),
    };
  });

  // ─── Availability ───────────────────────────────────────────

  // GET /availability — Check provider availability for a date
  app.get('/availability', async (request: FastifyRequest) => {
    const { orgId } = getPatientAuth(request);
    const query = availabilityQuerySchema.parse(request.query);

    const provider = await app.prisma.provider.findFirst({
      where: { providerId: query.providerId, orgId, active: true },
    });
    if (!provider) {
      return { slots: [] };
    }

    const targetDate = new Date(query.date);
    const dayOfWeek = targetDate.getDay(); // 0=Sunday

    // Get availability rules for this day
    const rules = await app.prisma.providerAvailabilityRule.findMany({
      where: {
        providerId: query.providerId,
        dayOfWeek,
        validFrom: { lte: targetDate },
        OR: [
          { validTo: null },
          { validTo: { gte: targetDate } },
        ],
      },
    });

    if (rules.length === 0) {
      return { slots: [] };
    }

    // Get existing appointments for this provider on this date
    const dayStart = new Date(query.date + 'T00:00:00Z');
    const dayEnd = new Date(query.date + 'T23:59:59Z');

    const existingAppointments = await app.prisma.appointment.findMany({
      where: {
        providerId: query.providerId,
        startTs: { gte: dayStart, lte: dayEnd },
        status: { notIn: ['cancelled', 'no_show', 'expired'] },
      },
    });

    // Get time off
    const timeOffs = await app.prisma.providerTimeOff.findMany({
      where: {
        providerId: query.providerId,
        startTs: { lte: dayEnd },
        endTs: { gte: dayStart },
      },
    });

    // Get service duration for slot sizing
    let slotDuration = 15; // default
    if (query.serviceId) {
      const service = await app.prisma.service.findUnique({
        where: { serviceId: query.serviceId },
      });
      if (service) slotDuration = service.durationMin;
    }

    // Generate slots
    const slots: Array<{ time: string; available: boolean }> = [];

    for (const rule of rules) {
      const startParts = rule.startLocal.toISOString().match(/T(\d{2}):(\d{2})/);
      const endParts = rule.endLocal.toISOString().match(/T(\d{2}):(\d{2})/);
      if (!startParts || !endParts) continue;

      const startHour = parseInt(startParts[1]);
      const startMin = parseInt(startParts[2]);
      const endHour = parseInt(endParts[1]);
      const endMin = parseInt(endParts[2]);

      const interval = rule.slotIntervalMin || 15;

      let currentMin = startHour * 60 + startMin;
      const endMinTotal = endHour * 60 + endMin;

      while (currentMin + slotDuration <= endMinTotal) {
        const h = Math.floor(currentMin / 60);
        const m = currentMin % 60;
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

        const slotStart = new Date(`${query.date}T${timeStr}:00Z`);
        const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

        // Check conflicts
        const hasConflict = existingAppointments.some((a) => {
          return a.startTs < slotEnd && a.endTs > slotStart;
        });

        const hasTimeOff = timeOffs.some((t) => {
          return t.startTs < slotEnd && t.endTs > slotStart;
        });

        // Don't show past slots
        const isPast = slotStart < new Date();

        slots.push({
          time: timeStr,
          available: !hasConflict && !hasTimeOff && !isPast,
        });

        currentMin += interval;
      }
    }

    return { date: query.date, providerId: query.providerId, slots };
  });
}
