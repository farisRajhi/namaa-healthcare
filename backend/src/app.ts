import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { prismaPlugin } from './plugins/prisma.js';
import { openaiPlugin } from './plugins/openai.js';
import { geminiPlugin } from './plugins/gemini.js';
import { twilioPlugin } from './plugins/twilio.js';
import { schedulerPlugin } from './plugins/scheduler.js';
import { registerRoutes } from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
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
  // Must be registered before routes so headers apply to all responses.
  // CSP is disabled here to avoid breaking the Swagger UI / widget embeds;
  // enable and tighten in production via CORS_ORIGIN + a dedicated CSP header.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false, // required for Swagger UI iframes
  });

  // ── Global Rate Limiting ───────────────────────────────
  // Auth endpoints get their own tighter limit (see routes/auth.ts: 10/min).
  // This global limit protects everything else.
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    // Skip Twilio webhook IPs from rate-limiting (they POST frequently)
    skipOnError: true,
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

  // CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
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
    sign: { expiresIn: '24h' },
  });

  // Form body parser (required for Twilio webhooks)
  await app.register(formbody);

  // Static file serving for audio files
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/public/',
  });

  // Swagger Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Namaa API',
        description: 'Backend API for Namaa',
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

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

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
    // Zod validation errors → 400
    if (error.name === 'ZodError' || (error as any).issues) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Invalid request data',
        issues: (error as any).issues?.map((i: any) => ({
          path: i.path,
          message: i.message,
        })),
      });
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: error.message,
      });
    }

    // JWT errors
    if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' || error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Log full error server-side
    request.log.error(error);

    // In production, never leak stack traces
    const statusCode = error.statusCode || 500;
    if (process.env.NODE_ENV === 'production') {
      return reply.code(statusCode).send({
        error: statusCode >= 500 ? 'Internal Server Error' : error.message,
        message: statusCode >= 500 ? 'An unexpected error occurred' : error.message,
      });
    }

    // In development, include more detail (but still no raw stack in body)
    return reply.code(statusCode).send({
      error: error.message,
      code: error.code,
    });
  });

  // Register all routes (AFTER error handler so they inherit it)
  await registerRoutes(app);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString(), version: '1.1.0' };
  });

  return app;
}
