import { FastifyInstance } from 'fastify';
import { authPlugin } from '../plugins/auth.js';
import authRoutes from './auth.js';
import patientsRoutes from './patients.js';
import appointmentsRoutes from './appointments.js';
import providersRoutes from './providers.js';
import servicesRoutes from './services.js';
import departmentsRoutes from './departments.js';
import facilitiesRoutes from './facilities.js';
import webhooksRoutes from './webhooks.js';
import analyticsRoutes from './analytics.js';
import chatRoutes from './chat.js';
import voiceRoutes from './voice.js';
import voiceStreamRoutes from './voiceStream.js';
import voiceStreamGeminiRoutes from './voiceStreamGemini.js';
import voiceDemoRoutes from './voiceDemo.js';
import voiceDemoRealtimeRoutes from './voiceDemoRealtime.js';
import demoChatRoutes from './demoChat.js';
import geminiTestRoutes from './geminiTest.js';
import voiceTestRoutes from './voiceTest.js';
import phoneNumbersRoutes from './phoneNumbers.js';

export async function registerRoutes(app: FastifyInstance) {
  // Register auth plugin
  await app.register(authPlugin);

  // Public routes
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Webhook routes (secured by API key, not JWT)
  await app.register(webhooksRoutes, { prefix: '/api/webhooks' });

  // Voice routes (secured by Twilio signature)
  await app.register(voiceRoutes, { prefix: '/api/voice' });
  await app.register(voiceStreamRoutes, { prefix: '/api/voice' });
  await app.register(voiceStreamGeminiRoutes, { prefix: '/api/voice' });

  // Voice demo routes (public - for testing)
  await app.register(voiceDemoRoutes, { prefix: '/api/voice' });
  await app.register(voiceDemoRealtimeRoutes, { prefix: '/api/voice' });

  // Demo chat routes (public - for landing page demo)
  await app.register(demoChatRoutes, { prefix: '/api/demo-chat' });

  // Gemini test routes (public - for testing Gemini integration)
  await app.register(geminiTestRoutes, { prefix: '/api/gemini-test' });

  // Voice test routes (authenticated - for management dashboard)
  await app.register(voiceTestRoutes, { prefix: '/api/voice' });

  // Protected routes
  await app.register(patientsRoutes, { prefix: '/api/patients' });
  await app.register(appointmentsRoutes, { prefix: '/api/appointments' });
  await app.register(providersRoutes, { prefix: '/api/providers' });
  await app.register(servicesRoutes, { prefix: '/api/services' });
  await app.register(departmentsRoutes, { prefix: '/api/departments' });
  await app.register(facilitiesRoutes, { prefix: '/api/facilities' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(chatRoutes, { prefix: '/api/chat' });
  await app.register(phoneNumbersRoutes, { prefix: '/api/phone-numbers' });
}
