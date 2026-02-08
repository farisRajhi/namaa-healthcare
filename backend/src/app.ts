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
import { registerRoutes } from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
  });

  // JWT Authentication
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
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

  // OpenAI Plugin
  await app.register(openaiPlugin);

  // Gemini Plugin (for Gemini Multimodal Live API)
  await app.register(geminiPlugin);

  // WebSocket support for voice streaming
  await app.register(websocket);

  // Twilio Plugin for voice calls
  await app.register(twilioPlugin);

  // Register all routes
  await registerRoutes(app);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
