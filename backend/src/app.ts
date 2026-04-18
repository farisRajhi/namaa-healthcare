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
import { fileURLToPath } from 'url';
import { ZodError } from 'zod';
import { prismaPlugin } from './plugins/prisma.js';
import { openaiPlugin } from './plugins/openai.js';
import { geminiPlugin } from './plugins/gemini.js';
import { twilioPlugin } from './plugins/twilio.js';
import { schedulerPlugin } from './plugins/scheduler.js';
import { registerRoutes } from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const isProduction = process.env.NODE_ENV === 'production';

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
        scriptSrc: ["'self'"],
        // 'unsafe-inline' required for Tailwind CSS runtime style injection
        // and inline styles in React components. Removing this breaks UI rendering.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
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
      // Use X-Forwarded-For if behind a proxy/load-balancer
      const forwarded = request.headers['x-forwarded-for'];
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0] ?? request.ip;
      return ip;
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${context.after}`,
    }),
  });

  // CORS — require explicit CORS_ORIGIN in production
  if (isProduction && !process.env.CORS_ORIGIN) {
    console.error(
      '❌  FATAL: CORS_ORIGIN must be set in production.\n' +
      '    Set it to your frontend domain(s), comma-separated.',
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
    if (process.env.SKIP_TWILIO_VERIFY === 'true') {
      console.error('❌  FATAL: SKIP_TWILIO_VERIFY=true is not allowed in production.');
      process.exit(1);
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error('FATAL: OPENAI_API_KEY is not set');
      process.exit(1);
    }
    const tapSecret = process.env.TAP_SECRET_KEY;
    if (!tapSecret || tapSecret === 'sk_test_CHANGE_ME') {
      console.error('❌  FATAL: TAP_SECRET_KEY is missing or uses the placeholder value.');
      process.exit(1);
    }
    if (!process.env.REGISTRATION_TOKEN) {
      console.warn('WARNING: REGISTRATION_TOKEN is not set — registration is open to the public');
    }
    if (process.env.SEED_PLATFORM_ADMIN_EMAIL || process.env.SEED_PLATFORM_ADMIN_PASSWORD) {
      console.error('❌  FATAL: SEED_PLATFORM_ADMIN_* env vars must not be set in production.');
      process.exit(1);
    }
  }

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
    sign: { expiresIn: '2h', algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });

  // Form body parser (required for Twilio webhooks)
  await app.register(formbody);

  // Multipart file upload (for Patient Intelligence CSV upload)
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // Static file serving for audio files
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/public/',
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

  // WebSocket support for voice streaming
  await app.register(websocket);

  // Twilio Plugin for voice calls
  await app.register(twilioPlugin);

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
