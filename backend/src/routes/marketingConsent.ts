/**
 * Marketing Consent Routes (PDPL Compliance)
 *
 * GET    /api/consent/:orgId/:patientId         — Get consent status
 * POST   /api/consent/:orgId/:patientId/grant   — Grant consent
 * POST   /api/consent/:orgId/:patientId/revoke  — Revoke consent
 * GET    /api/consent/:orgId/stats              — Org consent statistics
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MarketingConsentService } from '../services/compliance/marketingConsent.js';

const grantConsentSchema = z.object({
  smsMarketing: z.boolean().optional(),
  whatsappMarketing: z.boolean().optional(),
  voiceMarketing: z.boolean().optional(),
  emailMarketing: z.boolean().optional(),
  consentSource: z.enum(['booking_form', 'whatsapp_optin', 'portal', 'manual', 'api']),
  consentText: z.string().optional(),
});

const revokeConsentSchema = z.object({
  smsMarketing: z.boolean().optional(),
  whatsappMarketing: z.boolean().optional(),
  voiceMarketing: z.boolean().optional(),
  emailMarketing: z.boolean().optional(),
}).optional();

export default async function marketingConsentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireActivated);

  const getService = () => new MarketingConsentService(app.prisma);

  // GET /api/consent/:orgId/stats — Org consent statistics
  app.get<{ Params: { orgId: string } }>('/:orgId/stats', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const service = getService();
    return service.getOrgStats(orgId);
  });

  // GET /api/consent/:orgId/:patientId — Get consent status
  app.get<{ Params: { orgId: string; patientId: string } }>('/:orgId/:patientId', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId, patientId } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const service = getService();
    const consent = await service.getConsentStatus(patientId, orgId);
    return consent || { patientId, orgId, smsMarketing: false, whatsappMarketing: false, voiceMarketing: false, emailMarketing: false };
  });

  // POST /api/consent/:orgId/:patientId/grant — Grant consent
  app.post<{ Params: { orgId: string; patientId: string } }>('/:orgId/:patientId/grant', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId, patientId } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const body = grantConsentSchema.parse(request.body);
    const service = getService();
    return service.grantConsent(
      patientId,
      orgId,
      {
        smsMarketing: body.smsMarketing,
        whatsappMarketing: body.whatsappMarketing,
        voiceMarketing: body.voiceMarketing,
        emailMarketing: body.emailMarketing,
      },
      body.consentSource,
      body.consentText,
      request.ip,
    );
  });

  // POST /api/consent/:orgId/:patientId/revoke — Revoke consent
  app.post<{ Params: { orgId: string; patientId: string } }>('/:orgId/:patientId/revoke', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId, patientId } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const body = revokeConsentSchema.parse(request.body);
    const service = getService();
    const channels = body ? {
      smsMarketing: body.smsMarketing === true ? false : undefined,
      whatsappMarketing: body.whatsappMarketing === true ? false : undefined,
      voiceMarketing: body.voiceMarketing === true ? false : undefined,
      emailMarketing: body.emailMarketing === true ? false : undefined,
    } : undefined;

    const result = await service.revokeConsent(patientId, orgId, channels);
    return result || { error: 'No consent record found' };
  });
}
