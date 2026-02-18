import { buildApp } from './app.js';

const start = async () => {
  const app = await buildApp();

  const port = Number(process.env.PORT) || 3003;
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
    console.log(`API Documentation at http://${host}:${port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // ──────────────────────────────────────────
  // Graceful Shutdown (SIGTERM / SIGINT)
  // Required for Docker, PM2, and k8s SIGTERM on deploy
  // ──────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n[server] Received ${signal} — shutting down gracefully...`);
    try {
      await app.close(); // Closes Prisma connections, scheduler, etc.
      console.log('[server] Shutdown complete.');
      process.exit(0);
    } catch (err) {
      console.error('[server] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start();
