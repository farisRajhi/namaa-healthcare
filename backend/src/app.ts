import Fastify from 'fastify';
import cors from '@fastify/cors';
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

  // CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
  });

  // JWT Authentication
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === 'your-super-secret-key-change-in-production') {
    app.log.warn('⚠️  JWT_SECRET is not set or uses the default value. Set a strong secret in .env for production!');
  }
  await app.register(jwt, {
    secret: jwtSecret || 'your-super-secret-key-change-in-production',
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
          url: `http://localhost:${process.env.PORT || 3000}`,
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
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
