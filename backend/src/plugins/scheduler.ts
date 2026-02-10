/**
 * Scheduler Fastify Plugin
 *
 * Initializes the TaskScheduler after the server starts,
 * passes the Prisma client, and gracefully stops on shutdown.
 * Only active in production and development (not test).
 */

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { TaskScheduler } from '../services/scheduler/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    scheduler: TaskScheduler;
  }
}

const schedulerPlugin: FastifyPluginAsync = async (fastify) => {
  // Skip in test environment
  if (process.env.NODE_ENV === 'test') {
    fastify.log.info('[Scheduler] Skipped — test environment');
    return;
  }

  const scheduler = new TaskScheduler(fastify.prisma);

  // Initialize job definitions
  scheduler.init();

  // Decorate the Fastify instance so routes can access it
  fastify.decorate('scheduler', scheduler);

  // Start all enabled jobs once the server is ready
  fastify.addHook('onReady', async () => {
    scheduler.start();
    fastify.log.info('[Scheduler] All cron jobs started');
  });

  // Gracefully stop on shutdown
  fastify.addHook('onClose', async () => {
    scheduler.stop();
    fastify.log.info('[Scheduler] All cron jobs stopped');
  });
};

export default fp(schedulerPlugin, {
  name: 'scheduler',
  dependencies: ['prisma'],
});

export { schedulerPlugin };
