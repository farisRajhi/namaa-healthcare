import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';

// Patient JWT payload is separate from admin JWT
interface PatientJwtPayload {
  patientId: string;
  orgId: string;
  type: 'patient';
}

const loginSchema = z.object({
  phone: z.string().min(10).max(15),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  clinicSlug: z.string().optional(),
});

/**
 * Middleware to authenticate patient JWT tokens.
 * Separate from admin auth — checks for type === 'patient' in payload.
 */
export async function authenticatePatient(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<PatientJwtPayload>();
    if (decoded.type !== 'patient') {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid patient token' });
    }
    // Attach to request for downstream usage
    (request as any).patientAuth = decoded;
  } catch {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

export default async function patientAuthRoutes(app: FastifyInstance) {
  // Rate-limit patient login: max 5 attempts per 15 minutes per IP
  // Prevents brute-force of phone + DOB combinations (~36,500 possibilities).
  await app.register(rateLimit, {
    max: 5,
    timeWindow: '15 minutes',
    keyGenerator: (request: FastifyRequest) => request.ip,
    errorResponseBuilder: (_request: FastifyRequest, context: { after: string }) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `محاولات كثيرة جداً. حاول مرة أخرى بعد ${context.after}`,
    }),
  });

  // POST /login — Login with phone + date of birth (MVP auth)
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    // Normalize phone: strip spaces, ensure +966 format
    let phone = body.phone.replace(/\s+/g, '');
    if (phone.startsWith('0')) {
      phone = '+966' + phone.slice(1);
    }
    if (!phone.startsWith('+')) {
      phone = '+' + phone;
    }

    // Resolve org scope from clinicSlug if provided
    let orgScope: { orgId: string } | undefined;
    if (body.clinicSlug) {
      const facility = await app.prisma.facility.findUnique({
        where: { clinicSlug: body.clinicSlug },
        select: { orgId: true },
      });
      if (facility) {
        orgScope = { orgId: facility.orgId };
      }
    }

    // Look up patient by phone number, scoped to org if available
    const contact = await app.prisma.patientContact.findFirst({
      where: {
        contactType: 'phone',
        contactValue: phone,
        ...(orgScope ? { patient: orgScope } : {}),
      },
      include: {
        patient: true,
      },
    });

    if (!contact) {
      // Try without + prefix
      const contactAlt = await app.prisma.patientContact.findFirst({
        where: {
          contactType: 'phone',
          contactValue: { in: [phone, phone.replace('+', ''), '0' + phone.slice(4)] },
          ...(orgScope ? { patient: orgScope } : {}),
        },
        include: {
          patient: true,
        },
      });

      if (!contactAlt) {
        return reply.code(401).send({
          error: 'رقم الهاتف غير مسجل',
          errorEn: 'Phone number not found',
        });
      }

      // Verify date of birth
      const patient = contactAlt.patient;
      if (!patient.dateOfBirth) {
        return reply.code(401).send({
          error: 'لا يمكن التحقق من الهوية',
          errorEn: 'Cannot verify identity — no date of birth on file',
        });
      }

      const patientDob = patient.dateOfBirth.toISOString().split('T')[0];
      if (patientDob !== body.dateOfBirth) {
        return reply.code(401).send({
          error: 'تاريخ الميلاد غير صحيح',
          errorEn: 'Date of birth does not match',
        });
      }

      const token = (app.jwt.sign as any)(
        { patientId: patient.patientId, orgId: patient.orgId, type: 'patient' },
        { expiresIn: '8h' }
      );

      return {
        token,
        patient: {
          patientId: patient.patientId,
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: patientDob,
        },
      };
    }

    // Verify date of birth
    const patient = contact.patient;
    if (!patient.dateOfBirth) {
      return reply.code(401).send({
        error: 'لا يمكن التحقق من الهوية',
        errorEn: 'Cannot verify identity — no date of birth on file',
      });
    }

    const patientDob = patient.dateOfBirth.toISOString().split('T')[0];
    if (patientDob !== body.dateOfBirth) {
      return reply.code(401).send({
        error: 'تاريخ الميلاد غير صحيح',
        errorEn: 'Date of birth does not match',
      });
    }

    // Generate JWT
    const token = (app.jwt.sign as any)(
      { patientId: patient.patientId, orgId: patient.orgId, type: 'patient' },
      { expiresIn: '8h' }
    );

    return {
      token,
      patient: {
        patientId: patient.patientId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patientDob,
      },
    };
  });

  // GET /me — Get current patient profile
  app.get('/me', {
    preHandler: [authenticatePatient],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { patientId } = (request as any).patientAuth as PatientJwtPayload;

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
      return reply.code(404).send({ error: 'المريض غير موجود' });
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
}
