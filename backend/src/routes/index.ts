import { FastifyInstance } from 'fastify';
import { authPlugin } from '../plugins/auth.js';
import { platformAuthPlugin } from '../plugins/platformAuth.js';
import { activationGuardPlugin } from '../plugins/activationGuard.js';
// HIDDEN: billing system — re-enable when subscriptions return
// import { subscriptionGuardPlugin } from '../plugins/subscriptionGuard.js';
// import { planGuardPlugin } from '../plugins/planGuard.js';
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
import demoChatRoutes from './demoChat.js';
import { registerAuditMiddleware } from '../services/security/auditLogger.js';
import remindersRoutes from './reminders.js';
import careGapsRoutes, { careGapRulesRoutes } from './careGaps.js';
import faqRoutes, { triageRulesRoutes } from './faq.js';
import patientMemoryRoutes from './patientMemory.js';
import widgetRoutes from './widget.js';
import baileysWhatsAppRoutes from './baileysWhatsApp.js';
import patientAuthRoutes from './patientAuth.js';
import patientPortalRoutes from './patientPortal.js';
import platformAuthRoutes from './platformAuth.js';
import platformOrgsRoutes from './platformOrgs.js';
import platformMetricsRoutes from './platformMetrics.js';
// HIDDEN: billing system — re-enable when subscriptions return
// import platformSubscriptionsRoutes from './platformSubscriptions.js';
import platformAuditRoutes from './platformAudit.js';
import agentBuilderRoutes from './agentBuilder.js';
import campaignRoutes from './campaigns.js';
import outboundCampaignsRoutes from './outboundCampaigns.js';
import { integrationsRoutes, webhookSubscriptionsRoutes } from './integrations.js';
import settingsRoutes from './settings.js';
import reportsRoutes from './reports.js';
// HIDDEN: billing system — re-enable when subscriptions return
// import paymentsRoutes from './payments.js';
// import subscriptionRoutes from './subscription.js';
import publicBookingRoutes from './publicBooking.js';
import branchRoutes from './branches.js';
import usageRoutes from './usage.js';
import offerRoutes from './offers.js';
import marketingConsentRoutes from './marketingConsent.js';
import audienceAnalyticsRoutes from './audienceAnalytics.js';
import suggestionsRoutes from './suggestions.js';
import patientIntelligenceRoutes from './patientIntelligence.js';
import brandingRoutes from './branding.js';
import adImagesRoutes from './adImages.js';

export async function registerRoutes(app: FastifyInstance) {
  // Register auth plugin
  await app.register(authPlugin);

  // Register platform-admin auth plugin (separate JWT type)
  await app.register(platformAuthPlugin);

  // HIDDEN: billing system — re-enable when subscriptions return
  // await app.register(subscriptionGuardPlugin);
  // await app.register(planGuardPlugin);

  // Activation guard (replaces subscription/plan guards while billing is hidden)
  await app.register(activationGuardPlugin);

  // Public routes
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Webhook routes (secured by API key, not JWT)
  await app.register(webhooksRoutes, { prefix: '/api/webhooks' });

  // Baileys WhatsApp Web routes (QR pairing, session management)
  await app.register(baileysWhatsAppRoutes, { prefix: '/api/baileys-whatsapp' });

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
  // HIDDEN: billing system — re-enable when subscriptions return
  // await app.register(platformSubscriptionsRoutes, { prefix: '/api/platform/subscriptions' });
  await app.register(platformAuditRoutes, { prefix: '/api/platform/audit-log' });

  // Serve widget.js at root level too (for <script src="/widget.js">)
  await app.register(async (instance) => {
    instance.get('/widget.js', async (request, reply) => {
      // Proxy to the widget route handler
      return reply.redirect('/api/widget/widget.js');
    });
  });

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

  // FAQ & Triage
  await app.register(faqRoutes, { prefix: '/api/faq' });
  await app.register(triageRulesRoutes, { prefix: '/api/triage-rules' });

  // Appointment Reminder routes
  await app.register(remindersRoutes, { prefix: '/api/reminders' });

  // Care Gap routes (predictive analytics)
  await app.register(careGapsRoutes, { prefix: '/api/care-gaps' });
  await app.register(careGapRulesRoutes, { prefix: '/api/care-gap-rules' });

  // Enhanced Analytics (Conversational Intelligence, QA, Call Drivers)
  await app.register(analyticsEnhancedRoutes, { prefix: '/api/analytics-v2' });

  // Campaign routes (org-scoped: /api/campaigns/:orgId)
  await app.register(campaignRoutes, { prefix: '/api/campaigns' });

  // Legacy outbound campaign URLs (used by the campaigns dashboard)
  await app.register(outboundCampaignsRoutes, { prefix: '/api/outbound/campaigns' });

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

  // HIDDEN: billing system — re-enable when subscriptions return
  // await app.register(paymentsRoutes, { prefix: '/api/payments' });
  // await app.register(subscriptionRoutes, { prefix: '/api/subscription' });

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

  // Brand identity (logo, colors, voice/tone) used by AI ad image generation
  await app.register(brandingRoutes, { prefix: '/api/branding' });

  // AI-generated ad images for marketing campaigns
  await app.register(adImagesRoutes, { prefix: '/api/ad-images' });

  // Register audit trail middleware (auto-logs sensitive route access)
  registerAuditMiddleware(app);
}
