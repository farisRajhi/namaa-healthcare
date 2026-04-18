import { FastifyInstance } from 'fastify';
import { authPlugin } from '../plugins/auth.js';
import { platformAuthPlugin } from '../plugins/platformAuth.js';
import { subscriptionGuardPlugin } from '../plugins/subscriptionGuard.js';
import authRoutes from './auth.js';
import patientsRoutes from './patients.js';
import appointmentsRoutes from './appointments.js';
import providersRoutes from './providers.js';
import servicesRoutes from './services.js';
import departmentsRoutes from './departments.js';
import facilitiesRoutes from './facilities.js';
import webhooksRoutes from './webhooks.js';
import analyticsRoutes from './analytics.js';
import analyticsEnhancedRoutes from './analyticsEnhanced.js';
import chatRoutes from './chat.js';
import chatWebSocketRoutes from './chatWebSocket.js';
import voiceRoutes from './voice.js';
import voiceStreamRoutes from './voiceStream.js';
import voiceStreamGeminiRoutes from './voiceStreamGemini.js';
import voiceDemoRoutes from './voiceDemo.js';
import voiceDemoRealtimeRoutes from './voiceDemoRealtime.js';
import demoChatRoutes from './demoChat.js';
import geminiTestRoutes from './geminiTest.js';
import voiceTestRoutes from './voiceTest.js';
import phoneNumbersRoutes from './phoneNumbers.js';
import { registerAuditMiddleware } from '../services/security/auditLogger.js';
import outboundRoutes from './outbound.js';
import remindersRoutes from './reminders.js';
import careGapsRoutes, { careGapRulesRoutes } from './careGaps.js';
import faqRoutes, { triageRulesRoutes } from './faq.js';
import smsTemplatesRoutes, { smsLogsRoutes } from './smsTemplates.js';
import patientMemoryRoutes from './patientMemory.js';
import widgetRoutes from './widget.js';
import whatsappChatRoutes from './whatsappChat.js';
import baileysWhatsAppRoutes from './baileysWhatsApp.js';
import patientAuthRoutes from './patientAuth.js';
import patientPortalRoutes from './patientPortal.js';
import platformAuthRoutes from './platformAuth.js';
import platformOrgsRoutes from './platformOrgs.js';
import platformMetricsRoutes from './platformMetrics.js';
import platformSubscriptionsRoutes from './platformSubscriptions.js';
import platformAuditRoutes from './platformAudit.js';
import agentBuilderRoutes from './agentBuilder.js';
import campaignRoutes from './campaigns.js';
import { integrationsRoutes, webhookSubscriptionsRoutes } from './integrations.js';
import settingsRoutes from './settings.js';
import reportsRoutes from './reports.js';
import paymentsRoutes from './payments.js';
import subscriptionRoutes from './subscription.js';
import callSummariesRoutes from './callSummaries.js';
import publicBookingRoutes from './publicBooking.js';
import branchRoutes from './branches.js';
import usageRoutes from './usage.js';
import offerRoutes from './offers.js';
import marketingConsentRoutes from './marketingConsent.js';
import audienceAnalyticsRoutes from './audienceAnalytics.js';
import suggestionsRoutes from './suggestions.js';
import patientIntelligenceRoutes from './patientIntelligence.js';

export async function registerRoutes(app: FastifyInstance) {
  // Register auth plugin
  await app.register(authPlugin);

  // Register platform-admin auth plugin (separate JWT type)
  await app.register(platformAuthPlugin);

  // Register subscription guard plugin
  await app.register(subscriptionGuardPlugin);

  // Public routes
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Webhook routes (secured by API key, not JWT)
  await app.register(webhooksRoutes, { prefix: '/api/webhooks' });

  // Voice routes (secured by Twilio signature)
  await app.register(voiceRoutes, { prefix: '/api/voice' });
  await app.register(voiceStreamRoutes, { prefix: '/api/voice' });
  await app.register(voiceStreamGeminiRoutes, { prefix: '/api/voice' });

  // WhatsApp conversational AI routes (secured by Twilio signature)
  await app.register(whatsappChatRoutes, { prefix: '/api/whatsapp' });

  // Baileys WhatsApp Web routes (QR pairing, session management)
  await app.register(baileysWhatsAppRoutes, { prefix: '/api/baileys-whatsapp' });

  // Voice demo routes — disabled in production (unauthenticated, burns API quota)
  if (process.env.NODE_ENV !== 'production') {
    await app.register(voiceDemoRoutes, { prefix: '/api/voice' });
    await app.register(voiceDemoRealtimeRoutes, { prefix: '/api/voice' });
  }

  // Demo chat routes (public - for landing page demo)
  await app.register(demoChatRoutes, { prefix: '/api/demo-chat' });

  // Widget routes (public - embeddable widget config + JS serving)
  await app.register(widgetRoutes, { prefix: '/api/widget' });

  // Patient Portal routes (patient JWT auth, separate from admin)
  await app.register(patientAuthRoutes, { prefix: '/api/patient-portal' });
  await app.register(patientPortalRoutes, { prefix: '/api/patient-portal' });

  // Platform Admin routes (platform JWT auth, separate from staff and patient)
  await app.register(platformAuthRoutes, { prefix: '/api/platform/auth' });
  await app.register(platformOrgsRoutes, { prefix: '/api/platform/orgs' });
  await app.register(platformMetricsRoutes, { prefix: '/api/platform/metrics' });
  await app.register(platformSubscriptionsRoutes, { prefix: '/api/platform/subscriptions' });
  await app.register(platformAuditRoutes, { prefix: '/api/platform/audit-log' });

  // Serve widget.js at root level too (for <script src="/widget.js">)
  await app.register(async (instance) => {
    instance.get('/widget.js', async (request, reply) => {
      // Proxy to the widget route handler
      return reply.redirect('/api/widget/widget.js');
    });
  });

  // Gemini test routes — disabled in production (unauthenticated, burns API quota)
  if (process.env.NODE_ENV !== 'production') {
    await app.register(geminiTestRoutes, { prefix: '/api/gemini-test' });
  }

  // Voice test routes (authenticated - for management dashboard)
  await app.register(voiceTestRoutes, { prefix: '/api/voice' });

  // Protected routes
  await app.register(patientsRoutes, { prefix: '/api/patients' });
  await app.register(patientMemoryRoutes, { prefix: '/api/patients' });
  await app.register(appointmentsRoutes, { prefix: '/api/appointments' });
  await app.register(providersRoutes, { prefix: '/api/providers' });
  await app.register(servicesRoutes, { prefix: '/api/services' });
  await app.register(departmentsRoutes, { prefix: '/api/departments' });
  await app.register(facilitiesRoutes, { prefix: '/api/facilities' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(chatRoutes, { prefix: '/api/chat' });
  await app.register(chatWebSocketRoutes, { prefix: '/api/chat' });
  await app.register(phoneNumbersRoutes, { prefix: '/api/phone-numbers' });

  // FAQ & Triage
  await app.register(faqRoutes, { prefix: '/api/faq' });
  await app.register(triageRulesRoutes, { prefix: '/api/triage-rules' });

  // SMS Templates & Logs
  await app.register(smsTemplatesRoutes, { prefix: '/api/sms-templates' });
  await app.register(smsLogsRoutes, { prefix: '/api/sms-logs' });

  // Outbound & Campaign routes
  await app.register(outboundRoutes, { prefix: '/api/outbound' });

  // Appointment Reminder routes
  await app.register(remindersRoutes, { prefix: '/api/reminders' });

  // Care Gap routes (predictive analytics)
  await app.register(careGapsRoutes, { prefix: '/api/care-gaps' });
  await app.register(careGapRulesRoutes, { prefix: '/api/care-gap-rules' });

  // Enhanced Analytics (Conversational Intelligence, QA, Call Drivers)
  await app.register(analyticsEnhancedRoutes, { prefix: '/api/analytics-v2' });

  // Campaign routes (org-scoped: /api/campaigns/:orgId)
  await app.register(campaignRoutes, { prefix: '/api/campaigns' });

  // Service Cycle Suggestions (patient re-engagement predictions)
  await app.register(suggestionsRoutes, { prefix: '/api/suggestions' });

  // Agent Builder (No-Code Flow Builder)
  await app.register(agentBuilderRoutes, { prefix: '/api/agent-builder' });

  // Integrations & Webhook Subscriptions management
  await app.register(integrationsRoutes, { prefix: '/api/integrations' });
  await app.register(webhookSubscriptionsRoutes, { prefix: '/api/webhook-subscriptions' });

  // Settings (org, profile, notifications)
  await app.register(settingsRoutes, { prefix: '/api/settings' });

  // Reports & Export
  await app.register(reportsRoutes, { prefix: '/api/reports' });

  // Tap Payments
  await app.register(paymentsRoutes, { prefix: '/api/payments' });

  // Subscription management
  await app.register(subscriptionRoutes, { prefix: '/api/subscription' });

  // Call Summaries, Transcripts & AI Analysis
  await app.register(callSummariesRoutes, { prefix: '/api/calls' });

  // Public patient self-booking links (no auth required)
  await app.register(publicBookingRoutes, { prefix: '/api/book' });

  // Branch management (multi-clinic/multi-branch)
  await app.register(branchRoutes, { prefix: '/api/branches' });

  // AI usage tracking
  await app.register(usageRoutes, { prefix: '/api/usage' });

  // WhatsApp Marketing Offers
  await app.register(offerRoutes, { prefix: '/api/offers' });

  // Marketing Consent (PDPL compliance)
  await app.register(marketingConsentRoutes, { prefix: '/api/consent' });

  // Audience Analytics (segments, behavior patterns, targeting preview)
  await app.register(audienceAnalyticsRoutes, { prefix: '/api/audience' });

  // Patient Intelligence (external DB AI analysis)
  await app.register(patientIntelligenceRoutes, { prefix: '/api/patient-intelligence' });

  // Register audit trail middleware (auto-logs sensitive route access)
  registerAuditMiddleware(app);
}
