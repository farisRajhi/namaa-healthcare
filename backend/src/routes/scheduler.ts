/**
 * Scheduler Management Routes
 *
 * GET  /api/scheduler/status             — List all jobs with status
 * GET  /api/scheduler/jobs               — List all jobs (alias)
 * POST /api/scheduler/jobs/:name/run     — Manually trigger a job
 * POST /api/scheduler/trigger/:jobName   — Manually trigger a job (alias)
 * POST /api/scheduler/jobs/:name/toggle  — Enable/disable a job
 */

import { FastifyInstance } from 'fastify';

export default async function schedulerRoutes(app: FastifyInstance) {
  // All scheduler routes require authentication
  app.addHook('preHandler', app.authenticate);

  // GET /api/scheduler/status
  app.get('/status', {
    schema: {
      tags: ['Scheduler'],
      summary: 'Get status of all scheduled jobs',
      response: {
        200: {
          type: 'object',
          properties: {
            jobs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  schedule: { type: 'string' },
                  enabled: { type: 'boolean' },
                  running: { type: 'boolean' },
                  lastRun: { type: 'string', nullable: true },
                  lastDurationMs: { type: 'number', nullable: true },
                  lastError: { type: 'string', nullable: true },
                  runCount: { type: 'number' },
                  errorCount: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    if (!app.scheduler) {
      return reply.code(503).send({ error: 'Scheduler not available' });
    }

    const jobs = app.scheduler.getStatus();
    return { jobs };
  });

  // GET /api/scheduler/jobs — List all jobs (same data as /status but returns array)
  app.get('/jobs', {
    schema: {
      tags: ['Scheduler'],
      summary: 'List all scheduled jobs',
    },
  }, async (request, reply) => {
    if (!app.scheduler) {
      return reply.code(503).send({ error: 'Scheduler not available' });
    }

    const jobs = app.scheduler.getStatus();
    return { jobs };
  });

  // POST /api/scheduler/trigger/:jobName — Alias for jobs/:name/run
  app.post<{ Params: { jobName: string } }>('/trigger/:jobName', {
    schema: {
      tags: ['Scheduler'],
      summary: 'Manually trigger a scheduled job (alias)',
      params: {
        type: 'object',
        properties: {
          jobName: { type: 'string' },
        },
        required: ['jobName'],
      },
    },
  }, async (request, reply) => {
    if (!app.scheduler) {
      return reply.code(503).send({ error: 'Scheduler not available' });
    }

    const { jobName } = request.params;
    const result = await app.scheduler.triggerJob(jobName);

    if (!result.success) {
      return reply.code(404).send({ error: result.error });
    }

    return { success: true, message: `Job "${jobName}" triggered successfully` };
  });

  // POST /api/scheduler/jobs/:name/run
  app.post<{ Params: { name: string } }>('/jobs/:name/run', {
    schema: {
      tags: ['Scheduler'],
      summary: 'Manually trigger a scheduled job',
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
  }, async (request, reply) => {
    if (!app.scheduler) {
      return reply.code(503).send({ error: 'Scheduler not available' });
    }

    const { name } = request.params;
    const result = await app.scheduler.triggerJob(name);

    if (!result.success) {
      return reply.code(404).send({ error: result.error });
    }

    return { success: true, message: `Job "${name}" triggered successfully` };
  });

  // POST /api/scheduler/jobs/:name/toggle
  app.post<{ Params: { name: string } }>('/jobs/:name/toggle', {
    schema: {
      tags: ['Scheduler'],
      summary: 'Enable or disable a scheduled job',
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
  }, async (request, reply) => {
    if (!app.scheduler) {
      return reply.code(503).send({ error: 'Scheduler not available' });
    }

    const { name } = request.params;
    const result = app.scheduler.toggleJob(name);

    if (!result.success) {
      return reply.code(404).send({ error: result.error });
    }

    return {
      success: true,
      message: `Job "${name}" is now ${result.enabled ? 'enabled' : 'disabled'}`,
      enabled: result.enabled,
    };
  });
}
