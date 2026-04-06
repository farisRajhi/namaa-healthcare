/**
 * Task Scheduler Service
 *
 * Centralized cron-based scheduler for all automated background tasks:
 *   - Appointment reminders (every 5 min)
 *   - Campaign execution (every 10 min)
 *   - Care gap scanning (daily 2:00 AM AST)
 *   - Medication reminders (every 30 min)
 *   - Quality analysis (every hour)
 *   - Waitlist expiry (every hour)
 *   - Hold expiration (every minute)
 *
 * Each job runs independently — a failure in one never affects others.
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { AppointmentReminderService } from '../reminders/appointmentReminder.js';
import { CampaignManager, getCampaignManager } from '../campaigns/campaignManager.js';
import { PredictiveEngine } from '../analytics/predictiveEngine.js';
import { CareGapCampaignPipeline } from '../pipelines/careGapCampaign.js';
import { getInsightBuilder } from '../patient/insightBuilder.js';
import { OfferManager } from '../offers/offerManager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduledJobConfig {
  name: string;
  /** cron expression (node-cron format) */
  schedule: string;
  /** Human-readable description */
  description: string;
  /** The actual work */
  handler: () => Promise<void>;
  /** Whether the job is currently enabled */
  enabled: boolean;
  /** Timezone override (defaults to Asia/Riyadh) */
  timezone?: string;
}

export interface JobStatus {
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  running: boolean;
  lastRun: Date | null;
  lastDurationMs: number | null;
  lastError: string | null;
  runCount: number;
  errorCount: number;
}

interface JobState {
  config: ScheduledJobConfig;
  task: cron.ScheduledTask | null;
  running: boolean;
  lastRun: Date | null;
  lastDurationMs: number | null;
  lastError: string | null;
  runCount: number;
  errorCount: number;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export class TaskScheduler {
  private prisma: PrismaClient;
  private jobs = new Map<string, JobState>();
  private defaultTimezone = 'Asia/Riyadh';

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Initialize and register all scheduled jobs.
   */
  init(): void {
    const jobConfigs = this.buildJobConfigs();

    for (const config of jobConfigs) {
      this.registerJob(config);
    }

    console.log(`[Scheduler] Initialized ${this.jobs.size} jobs`);
  }

  /**
   * Start all enabled cron jobs.
   */
  start(): void {
    for (const [name, state] of this.jobs) {
      if (state.config.enabled) {
        this.startJob(name);
      }
    }
    console.log('[Scheduler] All enabled jobs started');
  }

  /**
   * Stop all running cron jobs gracefully.
   */
  stop(): void {
    for (const [name, state] of this.jobs) {
      if (state.task) {
        state.task.stop();
        console.log(`[Scheduler] Stopped job: ${name}`);
      }
    }
    console.log('[Scheduler] All jobs stopped');
  }

  /**
   * Get status of all jobs.
   */
  getStatus(): JobStatus[] {
    const statuses: JobStatus[] = [];
    for (const [, state] of this.jobs) {
      statuses.push({
        name: state.config.name,
        description: state.config.description,
        schedule: state.config.schedule,
        enabled: state.config.enabled,
        running: state.running,
        lastRun: state.lastRun,
        lastDurationMs: state.lastDurationMs,
        lastError: state.lastError,
        runCount: state.runCount,
        errorCount: state.errorCount,
      });
    }
    return statuses;
  }

  /**
   * Manually trigger a specific job by name.
   */
  async triggerJob(name: string): Promise<{ success: boolean; error?: string }> {
    const state = this.jobs.get(name);
    if (!state) {
      return { success: false, error: `Job "${name}" not found` };
    }
    if (state.running) {
      return { success: false, error: `Job "${name}" is already running` };
    }

    await this.executeJob(state);
    return { success: true };
  }

  /**
   * Toggle a job's enabled state.
   */
  toggleJob(name: string): { success: boolean; enabled?: boolean; error?: string } {
    const state = this.jobs.get(name);
    if (!state) {
      return { success: false, error: `Job "${name}" not found` };
    }

    state.config.enabled = !state.config.enabled;

    if (state.config.enabled) {
      this.startJob(name);
    } else {
      if (state.task) {
        state.task.stop();
        state.task = null;
      }
    }

    console.log(`[Scheduler] Job "${name}" ${state.config.enabled ? 'enabled' : 'disabled'}`);
    return { success: true, enabled: state.config.enabled };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private registerJob(config: ScheduledJobConfig): void {
    this.jobs.set(config.name, {
      config,
      task: null,
      running: false,
      lastRun: null,
      lastDurationMs: null,
      lastError: null,
      runCount: 0,
      errorCount: 0,
    });
  }

  private startJob(name: string): void {
    const state = this.jobs.get(name);
    if (!state) return;

    // Stop existing task if any
    if (state.task) {
      state.task.stop();
    }

    const tz = state.config.timezone || this.defaultTimezone;

    state.task = cron.schedule(
      state.config.schedule,
      async () => {
        await this.executeJob(state);
      },
      { timezone: tz },
    );

    console.log(`[Scheduler] Started job: ${name} (${state.config.schedule}, tz=${tz})`);
  }

  private async executeJob(state: JobState): Promise<void> {
    if (state.running) {
      console.log(`[Scheduler] Skipping "${state.config.name}" — already running`);
      return;
    }

    state.running = true;
    const start = Date.now();
    const jobName = state.config.name;

    try {
      console.log(`[Scheduler] ▶ Running "${jobName}"...`);
      await state.config.handler();
      state.lastError = null;
      const durationMs = Date.now() - start;
      state.lastDurationMs = durationMs;
      console.log(`[Scheduler] ✓ "${jobName}" completed in ${durationMs}ms`);
    } catch (err: any) {
      const durationMs = Date.now() - start;
      state.lastDurationMs = durationMs;
      state.lastError = err?.message || String(err);
      state.errorCount++;
      console.error(`[Scheduler] ✗ "${jobName}" failed after ${durationMs}ms:`, err?.message || err);
    } finally {
      state.running = false;
      state.lastRun = new Date();
      state.runCount++;
    }
  }

  // -----------------------------------------------------------------------
  // Job definitions
  // -----------------------------------------------------------------------

  private buildJobConfigs(): ScheduledJobConfig[] {
    return [
      // 1. Appointment Reminders — every 5 minutes
      {
        name: 'appointment-reminders',
        schedule: '*/5 * * * *',
        description: 'Check for upcoming appointments and send reminders (48h, 24h, 2h before)',
        enabled: true,
        handler: async () => {
          const reminderService = new AppointmentReminderService(this.prisma, null);
          const result = await reminderService.processDueReminders();
          console.log(`[Scheduler]   → Sent ${result.sent} reminders, ${result.failed} failed`);
        },
      },

      // 2. Campaign Executor — every 10 minutes
      {
        name: 'campaign-executor',
        schedule: '*/10 * * * *',
        description: 'Process active campaigns and execute next batch of outreach targets',
        enabled: true,
        handler: async () => {
          const campaignManager = new CampaignManager(this.prisma, null);
          const results = await campaignManager.executeAllActiveCampaigns();
          console.log(`[Scheduler]   → Processed ${results.length} active campaigns`);
        },
      },

      // 3. Care Gap Scanner — daily at 2:00 AM AST
      {
        name: 'care-gap-scanner',
        schedule: '0 2 * * *',
        description: 'Scan all patients against care gap rules and generate PatientCareGap records',
        enabled: true,
        timezone: 'Asia/Riyadh',
        handler: async () => {
          const engine = new PredictiveEngine(this.prisma);
          // Scan for all orgs
          const orgs = await this.prisma.org.findMany({
            select: { orgId: true },
          });
          let totalGaps = 0;
          for (const org of orgs) {
            try {
              const result = await engine.scanForCareGaps(org.orgId);
              totalGaps += result.gapsDetected;
            } catch (err: any) {
              console.error(`[Scheduler]   → Care gap scan failed for org ${org.orgId}:`, err?.message);
            }
          }
          console.log(`[Scheduler]   → Scanned ${orgs.length} orgs, detected ${totalGaps} care gaps`);
        },
      },

      // 4. Hold Expiration — every minute
      {
        name: 'hold-expiration',
        schedule: '* * * * *',
        description: 'Expire appointment holds where holdExpiresAt has passed',
        enabled: true,
        handler: async () => {
          const now = new Date();

          const result = await this.prisma.appointment.updateMany({
            where: {
              status: 'held',
              holdExpiresAt: { lt: now },
            },
            data: {
              status: 'expired',
              holdExpiresAt: null,
            },
          });

          if (result.count > 0) {
            console.log(`[Scheduler]   → Expired ${result.count} held appointments`);
          }
        },
      },

      // 8. Care Gap → Campaign Pipeline — daily at 6:00 AM AST
      {
        name: 'care-gap-campaign',
        schedule: '0 6 * * *',
        description: 'Scan open care gaps and auto-create outreach campaigns for groups with 5+ patients',
        enabled: true,
        timezone: 'Asia/Riyadh',
        handler: async () => {
          const pipeline = new CareGapCampaignPipeline(this.prisma);
          const results = await pipeline.processAllOrgs();
          const totalCampaigns = results.reduce((sum, r) => sum + r.campaignsCreated, 0);
          const totalPatients = results.reduce((sum, r) => sum + r.patientsEnrolled, 0);
          console.log(
            `[Scheduler]   → Care gap campaigns: ${totalCampaigns} campaigns created, ${totalPatients} patients enrolled`,
          );
        },
      },

      // 9. Daily SMS Appointment Reminders — every day at 9:00 AM AST
      {
        name: 'daily-sms-reminders',
        schedule: '0 9 * * *',
        description: 'Send SMS reminders for all confirmed appointments scheduled for tomorrow',
        enabled: true,
        timezone: 'Asia/Riyadh',
        handler: async () => {
          const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);

          const startOfTomorrow = new Date(tomorrow);
          startOfTomorrow.setHours(0, 0, 0, 0);
          const endOfTomorrow = new Date(tomorrow);
          endOfTomorrow.setHours(23, 59, 59, 999);

          const appointments = await this.prisma.appointment.findMany({
            where: {
              startTs: { gte: startOfTomorrow, lt: endOfTomorrow },
              status: { in: ['booked', 'confirmed'] },
            },
            include: {
              provider: { select: { displayName: true } },
              patient: {
                include: {
                  contacts: {
                    where: { contactType: 'phone', isPrimary: true },
                    take: 1,
                  },
                },
              },
            },
          });

          let sent = 0;
          let skipped = 0;

          // SECURITY: Instantiate Twilio client once outside the loop; fail fast if creds missing
          const accountSid = process.env.TWILIO_ACCOUNT_SID;
          const authToken = process.env.TWILIO_AUTH_TOKEN;
          const fromNumber = process.env.TWILIO_PHONE_NUMBER;
          if (!accountSid || !authToken || !fromNumber) {
            throw new Error('Twilio credentials not configured for SMS reminders');
          }
          const twilioClient = (await import('twilio')).default(accountSid, authToken);

          for (const apt of appointments) {
            try {
              const phone = apt.patient?.contacts?.[0]?.contactValue;
              if (!phone) { skipped++; continue; }

              const timeStr = apt.startTs.toLocaleTimeString('ar-SA', {
                hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh',
              });
              const body =
                `تذكير: لديك موعد غداً مع ${apt.provider.displayName} الساعة ${timeStr}. ` +
                `للتأكيد أرسل 1، للإلغاء أرسل 2`;

              await twilioClient.messages.create({
                to: phone,
                from: fromNumber,
                body,
              });

              await this.prisma.smsLog.create({
                data: {
                  orgId: apt.orgId,
                  patientId: apt.patientId ?? undefined,
                  phone,
                  channel: 'sms',
                  body,
                  status: 'sent',
                  triggeredBy: 'daily-sms-reminders-cron',
                },
              });

              sent++;
            } catch (err: any) {
              skipped++;
              console.error(`[Scheduler]   ✗ SMS reminder failed for apt ${apt.appointmentId}:`, err?.message);
            }
          }

          console.log(`[Scheduler]   ✓ Daily SMS reminders: ${sent} sent, ${skipped} skipped (of ${appointments.length} tomorrow's appointments)`);
        },
      },

      // 10. Offer Expiry — daily at midnight AST
      {
        name: 'offer-expiry',
        schedule: '0 0 * * *',
        description: 'Expire active offers that have passed their validUntil date',
        enabled: true,
        timezone: 'Asia/Riyadh',
        handler: async () => {
          const offerManager = new OfferManager(this.prisma, null);
          const expired = await offerManager.expireOverdueOffers();
          if (expired > 0) {
            console.log(`[Scheduler]   → Expired ${expired} overdue offers`);
          }
        },
      },

      // 11. Patient Insights Rebuild — daily at 3:00 AM AST
      {
        name: 'patient-insights-rebuild',
        schedule: '0 3 * * *',
        description: 'Recompute engagement scores and behavioral insights for all patients',
        enabled: true,
        timezone: 'Asia/Riyadh',
        handler: async () => {
          const builder = getInsightBuilder(this.prisma);
          const orgs = await this.prisma.org.findMany({ select: { orgId: true } });
          let totalPatients = 0;
          for (const org of orgs) {
            try {
              const count = await builder.rebuildAllInsights(org.orgId);
              totalPatients += count;
            } catch (err: any) {
              console.error(`[Scheduler]   → Insight rebuild failed for org ${org.orgId}:`, err?.message);
            }
          }
          console.log(`[Scheduler]   ✓ Patient insights rebuilt for ${totalPatients} patients across ${orgs.length} orgs`);
        },
      },

      // 12. Salary Day Campaigns — 10 AM on 25th-27th of each month
      {
        name: 'salary-day-campaigns',
        schedule: '0 10 25-27 * *',
        description: 'Activate and execute salary-day campaigns (Saudi payday: 25th-27th)',
        enabled: true,
        timezone: 'Asia/Riyadh',
        handler: async () => {
          // Find draft salary-day campaigns and start them
          const draftCampaigns = await this.prisma.campaign.findMany({
            where: { salaryDayOnly: true, status: 'draft' },
          });

          let started = 0;
          for (const campaign of draftCampaigns) {
            try {
              const cm = getCampaignManager(this.prisma, null);
              await cm.startCampaign(campaign.campaignId);
              started++;
            } catch (err: any) {
              console.error(`[Scheduler]   → Failed to start salary-day campaign ${campaign.name}:`, err?.message);
            }
          }

          // Execute active salary-day campaigns
          const cm = getCampaignManager(this.prisma, null);
          const results = await cm.executeAllActiveCampaigns();
          const salaryResults = results.filter(r => r.enqueued > 0 || r.processed > 0);

          // Auto-complete salary-day campaigns on the 28th
          const riyadhNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
          if (riyadhNow.getDate() === 27) {
            // Last salary day — campaigns will be completed by normal execution flow
            // or on next campaign-executor run when endDate passes
          }

          console.log(`[Scheduler]   ✓ Salary day: ${started} campaigns started, ${salaryResults.length} campaigns processed`);
        },
      },

    ];
  }
}
