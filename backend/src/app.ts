import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { ZodError } from 'zod';
import { prismaPlugin } from './plugins/prisma.js';
import { openaiPlugin } from './plugins/openai.js';
import { geminiPlugin } from './plugins/gemini.js';
import { schedulerPlugin } from './plugins/scheduler.js';
import { registerRoutes } from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase().trim();
  const isProduction = nodeEnv === 'production' || nodeEnv === 'prod';

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    trustProxy: isProduction,
    // Allow empty JSON request bodies (e.g. POST /api/chat/new)
    bodyLimit: 1_048_576,
  });

  // Override default JSON parser to allow empty bodies
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: 1_048_576 },
    (_req: any, body: string, done: (err: Error | null, result?: any) => void) => {
      try {
        const str = (body || '').trim();
        done(null, str ? JSON.parse(str) : undefined);
      } catch (err: any) {
        err.statusCode = 400;
        done(err);
      }
    },
  );

  // ── Security Headers (helmet) ──────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://sdk.tap.company'],
        // 'unsafe-inline' required for Tailwind CSS runtime style injection
        // and inline styles in React components. Removing this breaks UI rendering.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://tap-assets.b-cdn.net'],
        connectSrc: ["'self'", 'https://api.tap.company'],
        frameSrc: ['https://sdk.tap.company'],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    } : false,
    crossOriginEmbedderPolicy: false,
  });

  // ── Global Rate Limiting ───────────────────────────────
  // Auth endpoints get their own tighter limit (see routes/auth.ts: 10/min).
  // This global limit protects everything else.
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    skipOnError: false,
    keyGenerator: (request) => {
      // Fastify's `trustProxy: isProduction` already resolves the proxy chain safely.
      // Reading X-Forwarded-For directly here would let any client spoof the rate-limit key.
      return request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${context.after}`,
    }),
  });

  // CORS — require explicit CORS_ORIGIN in production, reject wildcards
  if (isProduction && !process.env.CORS_ORIGIN) {
    console.error(
      '❌  FATAL: CORS_ORIGIN must be set in production.\n' +
      '    Set it to your frontend domain(s), comma-separated.',
    );
    process.exit(1);
  }
  if (isProduction && process.env.CORS_ORIGIN?.split(',').some((o) => o.trim() === '*')) {
    console.error(
      '❌  FATAL: CORS_ORIGIN must not contain "*" in production.\n' +
      '    Wildcard with credentials:true is unsafe — allowlist explicit domains.',
    );
    process.exit(1);
  }
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
  });

  // JWT Authentication
  // ⚠️  A missing or default JWT_SECRET is a critical security vulnerability.
  // The server refuses to start without a real secret to prevent signing tokens
  // with a publicly-known key (QA-3 / CWE-521).
  const jwtSecret = process.env.JWT_SECRET;
  const INSECURE_DEFAULTS = new Set([
    'your-super-secret-key-change-in-production',
    'secret',
    'changeme',
    '',
  ]);
  // ── Production startup guards ────────────────────────
  if (isProduction) {
    const webhookKey = process.env.WEBHOOK_API_KEY;
    if (!webhookKey || webhookKey === 'your-webhook-api-key-here') {
      console.error('❌  FATAL: WEBHOOK_API_KEY is missing or uses the placeholder value.');
      process.exit(1);
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error('FATAL: OPENAI_API_KEY is not set');
      process.exit(1);
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('⚠️   ANTHROPIC_API_KEY not set — Patient Intelligence pipeline will be unavailable.');
    }
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌  FATAL: GEMINI_API_KEY is not set. Chat AI will fail at runtime.');
      process.exit(1);
    }
    // HIDDEN: billing system — re-enable when subscriptions return.
    // const tapSecret = process.env.TAP_SECRET_KEY;
    // if (!tapSecret || tapSecret === 'sk_test_CHANGE_ME') {
    //   console.error('❌  FATAL: TAP_SECRET_KEY is missing or uses the placeholder value.');
    //   process.exit(1);
    // }
    const registrationToken = process.env.REGISTRATION_TOKEN;
    if (!registrationToken || registrationToken === 'CHANGE_ME_RANDOM_TOKEN') {
      console.error('❌  FATAL: REGISTRATION_TOKEN is missing or uses the placeholder value.');
      process.exit(1);
    }
    if (!process.env.FRONTEND_URL) {
      console.error('❌  FATAL: FRONTEND_URL must be set in production (used for billing redirects, upgrade links).');
      process.exit(1);
    }
    if (!process.env.BASE_URL) {
      console.error('❌  FATAL: BASE_URL must be set in production (used for Tap webhook callbacks).');
      process.exit(1);
    }
    if (process.env.SEED_PLATFORM_ADMIN_EMAIL || process.env.SEED_PLATFORM_ADMIN_PASSWORD) {
      console.error('❌  FATAL: SEED_PLATFORM_ADMIN_* env vars must not be set in production.');
      process.exit(1);
    }
  }
  // HIDDEN: billing system — TAP_SECRET_KEY dev warning removed while billing routes are unregistered.

  if (!jwtSecret || INSECURE_DEFAULTS.has(jwtSecret)) {
    // Use console.error so the message is visible even before the logger is ready
    console.error(
      '❌  FATAL: JWT_SECRET environment variable is missing or uses an insecure default value.\n' +
      '    Generate a strong secret and set it in your .env file:\n' +
      '      node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n' +
      '    Server will not start until JWT_SECRET is properly configured.',
    );
    process.exit(1);
  }
  await app.register(jwt, {
    secret: jwtSecret,
    sign: { expiresIn: '3650d', algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });

  // Form body parser
  await app.register(formbody);

  // Multipart file upload (for Patient Intelligence CSV upload)
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // Static file serving for audio files
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/public/',
  });

  // Static file serving for locally-stored uploads (logos, generated ad images).
  // Used as a dev / S3-not-configured fallback for the object storage helper.
  const uploadsRoot = path.join(__dirname, '..', 'uploads');
  mkdirSync(uploadsRoot, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadsRoot,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // Swagger Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Tawafud API',
        description: 'Backend API for Tawafud',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT || 3003}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  // Swagger UI only available in non-production environments
  if (!isProduction) {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
    });
  }

  // Prisma Database Plugin
  await app.register(prismaPlugin);

  // Task Scheduler Plugin (depends on prisma)
  await app.register(schedulerPlugin);

  // OpenAI Plugin
  await app.register(openaiPlugin);

  // Gemini Plugin (for Gemini Multimodal Live API)
  await app.register(geminiPlugin);

  // WebSocket support
  await app.register(websocket);

  // Global error handler — catches Zod errors, validation errors, etc.
  // MUST be set BEFORE registerRoutes() so encapsulated plugins inherit it
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Validation error', details: error.issues });
    }
    request.log.error(error);
    const statusCode = error.statusCode ?? 500;
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal server error' : error.message,
    });
  });

  // Register all routes (AFTER error handler so they inherit it)
  await registerRoutes(app);

  // Health check
  app.get('/health', async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', timestamp: new Date().toISOString(), version: '1.1.0' };
    } catch {
      return reply.code(503).send({ status: 'unhealthy', error: 'Database unavailable' });
    }
  });

  return app;
}
