/**
 * Patient Intelligence Routes
 *
 * CSV upload → AI analysis → campaign suggestions → approval → launch.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runPipeline } from '../services/patientIntelligence/pipelineOrchestrator.js';
import {
  approveSuggestion,
  rejectSuggestion,
  editSuggestion,
} from '../services/patientIntelligence/suggestionApprover.js';
import { CampaignManager } from '../services/campaigns/campaignManager.js';

export default async function patientIntelligenceRoutes(app: FastifyInstance) {
  // All routes require authentication + active subscription (trial OK).
  // Patient Intelligence is included in every paid plan, so no plan-tier guard.
  app.addHook('onRequest', app.authenticate);
  app.addHook('preHandler', app.requireSubscription);

  // -----------------------------------------------------------------------
  // Upload CSV and start analysis pipeline
  // -----------------------------------------------------------------------
  app.post('/:orgId/upload', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const user = request.user as { userId: string; orgId: string };

    if (user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    // Check for existing active analysis
    const active = await app.prisma.externalAnalysis.findFirst({
      where: {
        orgId,
        status: { notIn: ['completed', 'failed'] },
      },
    });
    if (active) {
      return reply.code(409).send({
        error: 'An analysis is already in progress',
        analysisId: active.analysisId,
      });
    }

    // Parse multipart upload
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const buffer = await data.toBuffer();
    const fileName = data.filename || 'upload.csv';

    const ALLOWED_MIMETYPES = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];
    if (!fileName.endsWith('.csv') || !ALLOWED_MIMETYPES.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Only CSV files are accepted' });
    }

    // Create analysis record
    const analysis = await app.prisma.externalAnalysis.create({
      data: {
        orgId,
        fileName,
        fileSize: buffer.length,
        status: 'uploading',
        createdBy: user.userId,
        startedAt: new Date(),
      },
    });

    // Fire-and-forget: run pipeline asynchronously.
    // LLM provider per step is resolved via llmRouter (env-configurable).
    runPipeline(app.prisma, analysis.analysisId, buffer).catch((err) => {
      app.log.error({ err, analysisId: analysis.analysisId }, 'Pipeline failed');
    });

    return reply.code(202).send({
      analysisId: analysis.analysisId,
      status: 'uploading',
      message: 'Analysis started. Poll GET /analyses/:id for progress.',
    });
  });

  // -----------------------------------------------------------------------
  // List analyses for an org
  // -----------------------------------------------------------------------
  app.get('/:orgId/analyses', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const user = request.user as { orgId: string };

    if (user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const analyses = await app.prisma.externalAnalysis.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        analysisId: true,
        fileName: true,
        fileSize: true,
        clinicType: true,
        status: true,
        progress: true,
        currentStep: true,
        totalPatients: true,
        patientsAnalyzed: true,
        suggestionsCount: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const reshaped = analyses.map((a) => ({
      id: a.analysisId,
      fileName: a.fileName,
      fileSize: a.fileSize,
      clinicType: a.clinicType,
      status: a.status,
      progress: a.progress,
      currentStep: a.currentStep,
      totalPatients: a.totalPatients,
      patientsAnalyzed: a.patientsAnalyzed,
      suggestionsCount: a.suggestionsCount,
      error: a.errorMessage ?? null,
      createdAt: a.createdAt,
      completedAt: a.completedAt,
    }));

    return { data: reshaped };
  });

  // -----------------------------------------------------------------------
  // Get analysis status + progress (polled by frontend)
  // -----------------------------------------------------------------------
  app.get('/:orgId/analyses/:id', async (request, reply) => {
    const { orgId, id } = request.params as { orgId: string; id: string };
    const user = request.user as { orgId: string };

    if (user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const analysis = await app.prisma.externalAnalysis.findUnique({
      where: { analysisId: id },
    });

    if (!analysis || analysis.orgId !== orgId) {
      return reply.code(404).send({ error: 'Analysis not found' });
    }

    return {
      id: analysis.analysisId,
      orgId: analysis.orgId,
      fileName: analysis.fileName,
      fileSize: analysis.fileSize,
      clinicType: analysis.clinicType,
      status: analysis.status,
      progress: analysis.progress,
      currentStep: analysis.currentStep,
      totalPatients: analysis.totalPatients,
      patientsAnalyzed: analysis.patientsAnalyzed,
      suggestionsCount: analysis.suggestionsCount,
      error: analysis.errorMessage ?? null,
      createdAt: analysis.createdAt,
      completedAt: analysis.completedAt,
    };
  });

  // -----------------------------------------------------------------------
  // Get analyzed patients (paginated)
  // -----------------------------------------------------------------------
  app.get('/:orgId/analyses/:id/patients', async (request, reply) => {
    const { orgId, id } = request.params as { orgId: string; id: string };
    const query = request.query as { page?: string; limit?: string; segment?: string };
    const user = request.user as { orgId: string };

    if (user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '25', 10), 100);
    const skip = (page - 1) * limit;

    const where: any = { analysisId: id, orgId };
    if (query.segment) where.aiSegment = query.segment;

    const [patients, total] = await Promise.all([
      app.prisma.externalPatient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { aiScore: 'desc' },
        select: {
          externalPatientId: true,
          name: true,
          nameAr: true,
          phone: true,
          lastVisitDate: true,
          lastService: true,
          services: true,
          totalVisits: true,
          aiScore: true,
          aiReasoning: true,
          aiSegment: true,
          aiSuggestedAction: true,
          matchedPatientId: true,
          previousCampaigns: true,
          lastCampaignResult: true,
        },
      }),
      app.prisma.externalPatient.count({ where }),
    ]);

    return {
      data: patients,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  // -----------------------------------------------------------------------
  // Get campaign suggestions for an analysis
  // -----------------------------------------------------------------------
  app.get('/:orgId/analyses/:id/suggestions', async (request, reply) => {
    const { orgId, id } = request.params as { orgId: string; id: string };
    const user = request.user as { orgId: string };

    if (user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const suggestions = await app.prisma.aICampaignSuggestion.findMany({
      where: { analysisId: id, orgId },
      orderBy: { priority: 'desc' },
    });

    const reshaped = suggestions.map((s) => ({
      id: s.suggestionId,
      analysisId: s.analysisId,
      campaignName: s.name,
      campaignNameAr: s.nameAr ?? s.name,
      type: s.type,
      channel: s.channelSequence,
      priority: s.priority >= 70 ? 'high' : s.priority >= 40 ? 'medium' : 'low',
      patientCount: s.patientCount ?? 0,
      confidenceScore: s.confidenceScore,
      reasoning: s.reasoning ?? '',
      reasoningAr: s.reasoningAr ?? s.reasoning ?? '',
      messageScriptAr: s.scriptAr ?? '',
      messageScriptEn: s.scriptEn ?? '',
      status: s.status,
      createdAt: s.createdAt,
    }));

    return { data: reshaped };
  });

  // -----------------------------------------------------------------------
  // Approve a suggestion → create real campaign
  // -----------------------------------------------------------------------
  app.patch('/:orgId/suggestions/:id/approve', async (request, reply) => {
    const { orgId, id } = request.params as { orgId: string; id: string };
    const user = request.user as { userId: string; orgId: string };
    if (user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const approveSchema = z.object({
      scriptAr: z.string().max(2000).optional(),
      scriptEn: z.string().max(2000).optional(),
      channelSequence: z.array(z.enum(['voice', 'sms', 'whatsapp'])).optional(),
    });
    const body = approveSchema.parse(request.body || {});

    const campaignManager = new CampaignManager(app.prisma);

    const result = await approveSuggestion(app.prisma, campaignManager, {
      suggestionId: id,
      userId: user.userId,
      overrides: Object.keys(body).length > 0 ? body : undefined,
    });

    return { success: true, ...result };
  });

  // -----------------------------------------------------------------------
  // Reject a suggestion
  // -----------------------------------------------------------------------
  app.patch('/:orgId/suggestions/:id/reject', async (request, reply) => {
    const { orgId, id } = request.params as { orgId: string; id: string };
    const user = request.user as { userId: string; orgId: string };
    if (user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const rejectSchema = z.object({
      notes: z.string().max(2000).optional(),
    });
    const body = rejectSchema.parse(request.body || {});

    await rejectSuggestion(app.prisma, id, user.userId, body.notes);
    return { success: true };
  });

  // -----------------------------------------------------------------------
  // Edit a suggestion before approving
  // -----------------------------------------------------------------------
  app.patch('/:orgId/suggestions/:id/edit', async (request, reply) => {
    const { orgId, id } = request.params as { orgId: string; id: string };
    const user = request.user as { orgId: string };

    if (user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = z
      .object({
        scriptAr: z.string().optional(),
        scriptEn: z.string().optional(),
        channelSequence: z.array(z.string()).optional(),
      })
      .parse(request.body);

    await editSuggestion(app.prisma, id, body);
    return { success: true };
  });

  // -----------------------------------------------------------------------
  // Delete an analysis and its data
  // -----------------------------------------------------------------------
  app.delete('/:orgId/analyses/:id', async (request, reply) => {
    const { orgId, id } = request.params as { orgId: string; id: string };
    const user = request.user as { orgId: string };

    if (user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    // Cascade deletes ExternalPatients and AICampaignSuggestions
    const deleteResult = await app.prisma.externalAnalysis.deleteMany({
      where: { analysisId: id, orgId },
    });

    if (deleteResult.count === 0) {
      return reply.code(404).send({ error: 'Analysis not found' });
    }

    return { success: true };
  });
}
