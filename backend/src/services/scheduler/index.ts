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
import { getCampaignManager } from '../campaigns/campaignManager.js';
import { PredictiveEngine } from '../analytics/predictiveEngine.js';
import { CareGapCampaignPipeline } from '../pipelines/careGapCampaign.js';
import { getInsightBuilder } from '../patient/insightBuilder.js';
import { OfferManager } from '../offers/offerManager.js';
import { getServiceCyclePredictor } from '../patient/serviceCyclePredictor.js';
import { runDunning } from '../billing/dunning.js';

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
        description: 'Mark due appointment reminders as sent (WhatsApp dispatch handled separately via Baileys)',
        enabled: true,
        handler: async () => {
          const reminderService = new AppointmentReminderService(this.prisma);
          const result = await reminderService.processDueReminders();
          console.log(`[Scheduler]   → Marked ${result.sent} reminders as sent, ${result.skipped} skipped`);
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

      // 10. Offer Expiry — daily at midnight AST
      {
        name: 'offer-expiry',
        schedule: '0 0 * * *',
        description: 'Expire active offers that have passed their validUntil date',
        enabled: true,
        timezone: 'Asia/Riyadh',
        handler: async () => {
          const offerManager = new OfferManager(this.prisma);
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
              // Atomic claim: only one scheduler instance flips draft → active.
              // Prevents double audience-enrollment during rolling deploys
              // where two schedulers may briefly run in parallel.
              const claimed = await this.prisma.campaign.updateMany({
                where: { campaignId: campaign.campaignId, status: 'draft' },
                data: { status: 'active', startDate: new Date() },
              });
              if (claimed.count === 0) continue; // another instance won the race

              const cm = getCampaignManager(this.prisma);
              await cm.enrollCampaignTargets(campaign.campaignId);
              started++;
            } catch (err: any) {
              console.error(`[Scheduler]   → Failed to start salary-day campaign ${campaign.name}:`, err?.message);
            }
          }

          console.log(`[Scheduler]   ✓ Salary day: ${started} campaigns started (dispatch via Baileys WhatsApp)`);
        },
      },

      // 13. Service Cycle Suggestions — daily at 3:30 AM AST (after insights rebuild)
      {
        name: 'service-cycle-suggestions',
        schedule: '30 3 * * *',
        description: 'Generate service-cycle-based patient suggestions (reminder/offer)',
        enabled: true,
        timezone: 'Asia/Riyadh',
        handler: async () => {
          const predictor = getServiceCyclePredictor(this.prisma);
          const orgs = await this.prisma.org.findMany({ select: { orgId: true } });
          let totalSuggestions = 0;
          for (const org of orgs) {
            try {
              const result = await predictor.generateSuggestions(org.orgId);
              totalSuggestions += result.suggestionsCreated;
            } catch (err: any) {
              console.error(`[Scheduler]   → Suggestion generation failed for org ${org.orgId}:`, err?.message);
            }
          }
          console.log(`[Scheduler]   ✓ ${totalSuggestions} service cycle suggestions generated across ${orgs.length} orgs`);
        },
      },

      // 15. Subscription dunning — daily at 4:30 AM AST
      // Auto-renew Tap subscriptions ~3 days before endDate using saved cards.
      // Retries failed charges with backoff, transitions to past_due then expired.
      {
        name: 'subscription-dunning',
        schedule: '30 4 * * *',
        description: 'Renew Tawafud subscriptions, retry failed renewals, and expire past-due subs',
        enabled: true,
        timezone: 'Asia/Riyadh',
        handler: async () => {
          const result = await runDunning(this.prisma);
          console.log(
            `[Scheduler]   ✓ Dunning: scanned=${result.scanned} renewed=${result.renewed} pastDue=${result.pastDue} expired=${result.expired} errors=${result.errors}`,
          );
        },
      },

      // 14. Dismiss Completed Suggestions — daily at 4:00 AM AST
      {
        name: 'dismiss-completed-suggestions',
        schedule: '0 4 * * *',
        description: 'Clean up suggestions where patient already completed the service',
        enabled: true,
        timezone: 'Asia/Riyadh',
        handler: async () => {
          const predictor = getServiceCyclePredictor(this.prisma);
          const orgs = await this.prisma.org.findMany({ select: { orgId: true } });
          let totalDismissed = 0;
          for (const org of orgs) {
            try {
              const count = await predictor.dismissCompleted(org.orgId);
              totalDismissed += count;
            } catch (err: any) {
              console.error(`[Scheduler]   → Dismiss completed failed for org ${org.orgId}:`, err?.message);
            }
          }
          if (totalDismissed > 0) {
            console.log(`[Scheduler]   ✓ ${totalDismissed} completed suggestions dismissed`);
          }
        },
      },

    ];
  }
}
