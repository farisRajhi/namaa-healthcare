/**
 * Outbound Call Engine
 *
 * Proactive patient outreach via voice, SMS, and WhatsApp.
 * Queues outbound calls with priority, throttles per-campaign,
 * respects Do-Not-Call lists, retries on no-answer, and
 * transitions to scheduling when patient wants to book.
 */
import { PrismaClient } from '@prisma/client';
import type { Twilio } from 'twilio';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutboundCallerConfig {
  /** Twilio "from" number for voice calls */
  voiceFromNumber: string;
  /** Twilio "from" number for SMS */
  smsFromNumber: string;
  /** WhatsApp sender (e.g. whatsapp:+14155238886) */
  whatsappFromNumber: string;
  /** Base URL for TwiML webhooks (e.g. https://api.tawafud.raskh.app) */
  baseUrl: string;
  /** Default calling window start (24h format, e.g. "09:00") */
  defaultCallWindowStart: string;
  /** Default calling window end */
  defaultCallWindowEnd: string;
  /** Default max attempts per target before giving up */
  defaultMaxAttempts: number;
  /** Hours between retries */
  defaultRetryIntervalHours: number;
  /** Default org timezone (IANA) */
  defaultTimezone: string;
}

export interface QueuedCall {
  targetId: string;
  campaignId: string;
  patientId: string;
  phone: string;
  priority: number; // higher = more urgent
  scriptAr?: string | null;
  scriptEn?: string | null;
  channelSequence: string[];
  currentChannelIndex: number;
  attempt: number;
  maxAttempts: number;
  retryAfter?: Date;
}

interface CallOutcome {
  targetId: string;
  status: 'reached' | 'no_answer' | 'booked' | 'declined' | 'dnc' | 'failed';
  bookedApptId?: string;
  notes?: string;
}

interface DoNotCallEntry {
  patientId: string;
  phone: string;
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: OutboundCallerConfig = {
  voiceFromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  smsFromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  whatsappFromNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
  baseUrl: process.env.BASE_URL || 'https://api.tawafud.raskh.app',
  defaultCallWindowStart: '09:00',
  defaultCallWindowEnd: '21:00',
  defaultMaxAttempts: 3,
  defaultRetryIntervalHours: 24,
  defaultTimezone: 'Asia/Riyadh',
};

// ---------------------------------------------------------------------------
// OutboundCaller service
// ---------------------------------------------------------------------------

export class OutboundCaller {
  private prisma: PrismaClient;
  private twilio: Twilio | null;
  private config: OutboundCallerConfig;
  private callQueue: QueuedCall[] = [];
  private activeCallCount = 0;
  private dncCache: Set<string> = new Set(); // patientId set
  private processing = false;

  constructor(
    prisma: PrismaClient,
    twilio: Twilio | null,
    config?: Partial<OutboundCallerConfig>,
  ) {
    this.prisma = prisma;
    this.twilio = twilio;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Load DNC list into memory for fast lookups.
   * DNC is stored as PatientMemory entries with memoryKey = 'do_not_call'.
   */
  async loadDoNotCallList(orgId: string): Promise<void> {
    const dncEntries = await this.prisma.patientMemory.findMany({
      where: {
        memoryKey: 'do_not_call',
        memoryValue: 'true',
        isActive: true,
        patient: { orgId },
      },
      select: { patientId: true },
    });
    this.dncCache = new Set(dncEntries.map((e) => e.patientId));
  }

  /**
   * Check if a patient is on the DNC list.
   */
  isDoNotCall(patientId: string): boolean {
    return this.dncCache.has(patientId);
  }

  /**
   * Add a patient to the DNC list.
   */
  async addToDoNotCall(patientId: string, orgId: string): Promise<void> {
    this.dncCache.add(patientId);
    await this.prisma.patientMemory.upsert({
      where: {
        patientId_memoryType_memoryKey: {
          patientId,
          memoryType: 'preference',
          memoryKey: 'do_not_call',
        },
      },
      update: { memoryValue: 'true', isActive: true },
      create: {
        patientId,
        memoryType: 'preference',
        memoryKey: 'do_not_call',
        memoryValue: 'true',
      },
    });
  }

  /**
   * Check if calling is allowed right now based on the configured window
   * and the org's timezone.
   */
  isWithinCallingWindow(timezone?: string): boolean {
    const tz = timezone || this.config.defaultTimezone;
    const now = new Date();
    // Get hours in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = this.config.defaultCallWindowStart.split(':').map(Number);
    const [endH, endM] = this.config.defaultCallWindowEnd.split(':').map(Number);
    const windowStart = startH * 60 + startM;
    const windowEnd = endH * 60 + endM;

    return currentMinutes >= windowStart && currentMinutes <= windowEnd;
  }

  /**
   * Enqueue all pending targets for a campaign.
   * Loads campaign + targets from DB, checks DNC, adds to internal queue.
   */
  async enqueueCampaignTargets(campaignId: string): Promise<number> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { campaignId },
      include: {
        targets: {
          where: {
            status: { in: ['pending', 'no_answer'] },
          },
          include: {
            // We need patient contacts — pull through raw query or join
          },
        },
      },
    });

    if (!campaign || campaign.status !== 'active') {
      return 0;
    }

    // Load DNC for this org
    await this.loadDoNotCallList(campaign.orgId);

    // For each target, resolve phone number and enqueue
    let enqueued = 0;
    for (const target of campaign.targets) {
      if (this.isDoNotCall(target.patientId)) {
        // Mark target as dnc and skip
        await this.prisma.campaignTarget.update({
          where: { targetId: target.targetId },
          data: { status: 'dnc', notes: 'Patient on Do Not Call list' },
        });
        continue;
      }

      // Check retry timing
      if (target.status === 'no_answer' && target.updatedAt) {
        const retryAfter = new Date(
          target.updatedAt.getTime() +
            this.config.defaultRetryIntervalHours * 3600_000,
        );
        if (new Date() < retryAfter) continue; // Not time to retry yet
      }

      // Resolve phone number
      const contact = await this.prisma.patientContact.findFirst({
        where: { patientId: target.patientId, contactType: 'phone', isPrimary: true },
      });
      if (!contact) continue;

      // Determine which channel to use based on sequence and attempts
      const channelSeq = campaign.channelSequence as string[];
      const channelIndex = Math.min(target.attempts, channelSeq.length - 1);

      const queued: QueuedCall = {
        targetId: target.targetId,
        campaignId: campaign.campaignId,
        patientId: target.patientId,
        phone: contact.contactValue,
        priority: this.priorityFromType(campaign.type),
        scriptAr: campaign.scriptAr,
        scriptEn: campaign.scriptEn,
        channelSequence: channelSeq,
        currentChannelIndex: channelIndex,
        attempt: target.attempts,
        maxAttempts: campaign.maxCallsPerHour > 0
          ? this.config.defaultMaxAttempts
          : this.config.defaultMaxAttempts,
      };

      this.callQueue.push(queued);
      enqueued++;
    }

    // Sort queue by priority (descending)
    this.callQueue.sort((a, b) => b.priority - a.priority);

    return enqueued;
  }

  /**
   * Process the call queue — main execution loop.
   * Respects throttling (maxCallsPerHour per campaign) and calling windows.
   */
  async processQueue(maxConcurrent: number = 5): Promise<CallOutcome[]> {
    if (this.processing) return [];
    this.processing = true;

    const outcomes: CallOutcome[] = [];
    const campaignCallCounts = new Map<string, number>();

    try {
      while (this.callQueue.length > 0 && this.activeCallCount < maxConcurrent) {
        // Check calling window
        if (!this.isWithinCallingWindow()) {
          break;
        }

        const call = this.callQueue.shift();
        if (!call) break;

        // Check campaign throttle
        const campaign = await this.prisma.campaign.findUnique({
          where: { campaignId: call.campaignId },
        });
        if (!campaign || campaign.status !== 'active') continue;

        const hourlyCount = campaignCallCounts.get(call.campaignId) || 0;
        if (hourlyCount >= campaign.maxCallsPerHour) {
          // Put back and break — this campaign is throttled
          this.callQueue.unshift(call);
          break;
        }

        // Max attempts check
        if (call.attempt >= call.maxAttempts) {
          await this.prisma.campaignTarget.update({
            where: { targetId: call.targetId },
            data: {
              status: 'no_answer',
              notes: `Exhausted ${call.maxAttempts} attempts`,
            },
          });
          continue;
        }

        // Determine channel
        const channel = call.channelSequence[call.currentChannelIndex] || 'sms';

        this.activeCallCount++;
        campaignCallCounts.set(call.campaignId, hourlyCount + 1);

        try {
          let outcome: CallOutcome;

          switch (channel) {
            case 'voice':
              outcome = await this.placeVoiceCall(call, campaign.orgId);
              break;
            case 'sms':
              outcome = await this.sendSms(call, campaign.orgId);
              break;
            case 'whatsapp':
              outcome = await this.sendWhatsApp(call, campaign.orgId);
              break;
            default:
              outcome = await this.sendSms(call, campaign.orgId);
          }

          // Update target in DB
          await this.prisma.campaignTarget.update({
            where: { targetId: call.targetId },
            data: {
              status: outcome.status,
              attempts: call.attempt + 1,
              lastChannel: channel,
              bookedApptId: outcome.bookedApptId || undefined,
              notes: outcome.notes,
            },
          });

          outcomes.push(outcome);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          await this.prisma.campaignTarget.update({
            where: { targetId: call.targetId },
            data: {
              status: 'no_answer',
              attempts: call.attempt + 1,
              lastChannel: channel,
              notes: `Error: ${errMsg}`,
            },
          });

          outcomes.push({
            targetId: call.targetId,
            status: 'failed',
            notes: errMsg,
          });
        } finally {
          this.activeCallCount--;
        }
      }
    } finally {
      this.processing = false;
    }

    return outcomes;
  }

  /**
   * Get current queue size.
   */
  getQueueSize(): number {
    return this.callQueue.length;
  }

  /**
   * Clear queue for a specific campaign (e.g. when pausing).
   */
  clearCampaignQueue(campaignId: string): number {
    const before = this.callQueue.length;
    this.callQueue = this.callQueue.filter((c) => c.campaignId !== campaignId);
    return before - this.callQueue.length;
  }

  // -----------------------------------------------------------------------
  // Channel-specific call/send methods
  // -----------------------------------------------------------------------

  /**
   * Place an outbound voice call via Twilio.
   * The TwiML endpoint at /api/voice/outbound-script handles the AI conversation.
   */
  private async placeVoiceCall(call: QueuedCall, orgId: string): Promise<CallOutcome> {
    if (!this.twilio) {
      throw new Error('Twilio client not configured');
    }

    // Mark target as calling
    await this.prisma.campaignTarget.update({
      where: { targetId: call.targetId },
      data: { status: 'calling' },
    });

    try {
      const twilioCall = await this.twilio.calls.create({
        to: call.phone,
        from: this.config.voiceFromNumber,
        url: `${this.config.baseUrl}/api/voice/outbound-script?` +
          new URLSearchParams({
            targetId: call.targetId,
            campaignId: call.campaignId,
            patientId: call.patientId,
            orgId,
            lang: call.scriptAr ? 'ar' : 'en',
          }).toString(),
        statusCallback: `${this.config.baseUrl}/api/webhooks/outbound-call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        machineDetection: 'DetectMessageEnd',
        timeout: 30,
      });

      // Create VoiceCall record
      await this.prisma.voiceCall.create({
        data: {
          orgId,
          twilioCallSid: twilioCall.sid,
          callerPhone: this.config.voiceFromNumber,
          calledPhone: call.phone,
          direction: 'outbound',
          status: 'ringing',
          context: {
            campaignId: call.campaignId,
            targetId: call.targetId,
            patientId: call.patientId,
          },
        },
      });

      // At this point the call is initiated — the actual outcome will be
      // determined by the status callback. We return 'reached' optimistically
      // and the webhook handler will update the final status.
      return {
        targetId: call.targetId,
        status: 'reached',
        notes: `Voice call initiated: ${twilioCall.sid}`,
      };
    } catch (error) {
      return {
        targetId: call.targetId,
        status: 'no_answer',
        notes: `Call failed: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  /**
   * Send an outbound SMS via Twilio.
   */
  private async sendSms(call: QueuedCall, orgId: string): Promise<CallOutcome> {
    if (!this.twilio) {
      throw new Error('Twilio client not configured');
    }

    const body = this.buildMessageBody(call);

    try {
      const message = await this.twilio.messages.create({
        to: call.phone,
        from: this.config.smsFromNumber,
        body,
        statusCallback: `${this.config.baseUrl}/api/webhooks/outbound-sms-status`,
      });

      // Log the SMS
      await this.prisma.smsLog.create({
        data: {
          orgId,
          patientId: call.patientId,
          phone: call.phone,
          channel: 'sms',
          body,
          status: 'sent',
          twilioSid: message.sid,
          triggeredBy: 'scheduled',
        },
      });

      return {
        targetId: call.targetId,
        status: 'reached',
        notes: `SMS sent: ${message.sid}`,
      };
    } catch (error) {
      return {
        targetId: call.targetId,
        status: 'failed',
        notes: `SMS failed: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  /**
   * Send an outbound WhatsApp message via Twilio.
   */
  private async sendWhatsApp(call: QueuedCall, orgId: string): Promise<CallOutcome> {
    if (!this.twilio) {
      throw new Error('Twilio client not configured');
    }

    const body = this.buildMessageBody(call);
    const toWhatsapp = call.phone.startsWith('whatsapp:')
      ? call.phone
      : `whatsapp:${call.phone}`;

    try {
      const message = await this.twilio.messages.create({
        to: toWhatsapp,
        from: this.config.whatsappFromNumber,
        body,
        statusCallback: `${this.config.baseUrl}/api/webhooks/outbound-sms-status`,
      });

      await this.prisma.smsLog.create({
        data: {
          orgId,
          patientId: call.patientId,
          phone: call.phone,
          channel: 'whatsapp',
          body,
          status: 'sent',
          twilioSid: message.sid,
          triggeredBy: 'scheduled',
        },
      });

      return {
        targetId: call.targetId,
        status: 'reached',
        notes: `WhatsApp sent: ${message.sid}`,
      };
    } catch (error) {
      return {
        targetId: call.targetId,
        status: 'failed',
        notes: `WhatsApp failed: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Build the text body for SMS / WhatsApp from the campaign script.
   * Falls back to a generic template if no script is provided.
   */
  private buildMessageBody(call: QueuedCall): string {
    if (call.scriptAr) return call.scriptAr;
    if (call.scriptEn) return call.scriptEn;

    // Generic fallback in Arabic (Saudi market)
    return (
      'السلام عليكم، هذه رسالة من عيادتكم لتذكيركم بأهمية المتابعة الطبية. ' +
      'يرجى التواصل معنا لحجز موعد. شكراً لكم.'
    );
  }

  /**
   * Map campaign type to a numeric priority.
   */
  private priorityFromType(type: string): number {
    const priorities: Record<string, number> = {
      recall: 50,
      preventive: 40,
      follow_up: 60,
      satisfaction: 20,
      announcement: 10,
    };
    return priorities[type] ?? 30;
  }

  /**
   * Handle Twilio outbound call status webhook.
   * Called by the outbound-call-status webhook endpoint.
   */
  async handleCallStatusUpdate(params: {
    CallSid: string;
    CallStatus: string;
    CallDuration?: string;
    AnsweredBy?: string;
  }): Promise<void> {
    const { CallSid, CallStatus, CallDuration, AnsweredBy } = params;

    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      completed: 'completed',
      'no-answer': 'no_answer',
      busy: 'busy',
      failed: 'failed',
      canceled: 'failed',
    };

    const voiceCall = await this.prisma.voiceCall.findUnique({
      where: { twilioCallSid: CallSid },
    });

    if (!voiceCall) return;

    const mappedStatus = statusMap[CallStatus] || CallStatus;

    await this.prisma.voiceCall.update({
      where: { callId: voiceCall.callId },
      data: {
        status: mappedStatus as any,
        durationSec: CallDuration ? parseInt(CallDuration, 10) : undefined,
        endedAt: ['completed', 'no-answer', 'busy', 'failed', 'canceled'].includes(CallStatus)
          ? new Date()
          : undefined,
      },
    });

    // Update campaign target if this was a campaign call
    const context = voiceCall.context as Record<string, string>;
    if (context?.targetId) {
      const targetStatus =
        CallStatus === 'completed'
          ? AnsweredBy === 'machine_end_other' || AnsweredBy === 'machine_end_beep'
            ? 'no_answer' // Voicemail
            : 'reached'
          : 'no_answer';

      await this.prisma.campaignTarget.update({
        where: { targetId: context.targetId },
        data: {
          status: targetStatus,
          notes: `Call ${CallStatus}${AnsweredBy ? ` (${AnsweredBy})` : ''}, duration: ${CallDuration || 0}s`,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton factory (to be used with Fastify plugin/DI)
// ---------------------------------------------------------------------------

let _instance: OutboundCaller | null = null;

export function getOutboundCaller(
  prisma: PrismaClient,
  twilio: Twilio | null,
  config?: Partial<OutboundCallerConfig>,
): OutboundCaller {
  if (!_instance) {
    _instance = new OutboundCaller(prisma, twilio, config);
  }
  return _instance;
}

export function resetOutboundCaller(): void {
  _instance = null;
}
