import type { PrismaClient } from '@prisma/client';
import type { ChatMessage } from '../llm.js';
import { getLLMService } from '../llm.js';
import { redactPII } from '../security/piiRedactor.js';

// ─────────────────────────────────────────────────────────
// Session Compactor — Entity-Aware Conversation Compaction
// Inspired by claw-code's compact.rs pattern:
// Maintains a structured "fact sheet" that is never
// compacted away, plus a narrative summary for context.
// ─────────────────────────────────────────────────────────

const COMPACT_THRESHOLD = 20;       // Compact when message count exceeds this
const KEEP_RECENT = 8;              // Keep this many recent messages after compaction
const SUMMARY_MAX_TOKENS = 300;     // Max tokens for the narrative summary
const SUMMARY_MAX_CHARS = 1500;     // Hard char limit for the summary (enforced post-LLM)
const TOTAL_CONTEXT_BUDGET = 120_000; // Force compaction if total context exceeds this (chars)

export interface ConversationEntities {
  patientName: string | null;
  appointmentsBooked: { provider: string; date: string; time: string }[];
  appointmentsCancelled: string[];
  pendingRequest: string | null;
}

export interface CompactionResult {
  compacted: boolean;
  summary: string | null;
  entities: ConversationEntities | null;
  messages: ChatMessage[];
  originalCount: number;
  compactedCount: number;
}

export class SessionCompactor {

  /**
   * Check if a conversation needs compaction.
   * Now also checks total character budget, not just message count.
   */
  shouldCompact(messageCount: number, totalChars?: number): boolean {
    if (messageCount > COMPACT_THRESHOLD) return true;
    if (totalChars && totalChars > TOTAL_CONTEXT_BUDGET) return true;
    return false;
  }

  /**
   * Compact conversation messages:
   * 1. Extract structured entities from older messages
   * 2. Summarize narrative context
   * 3. Return [entity block + summary, ...recent messages]
   */
  async compact(
    messages: ChatMessage[],
    existingSummary?: string | null,
    existingEntities?: ConversationEntities | null,
  ): Promise<CompactionResult> {
    if (messages.length <= COMPACT_THRESHOLD) {
      return {
        compacted: false,
        summary: existingSummary ?? null,
        entities: existingEntities ?? null,
        messages,
        originalCount: messages.length,
        compactedCount: messages.length,
      };
    }

    // Split: older messages to summarize, recent messages to keep
    const olderMessages = messages.slice(0, messages.length - KEEP_RECENT);
    const recentMessages = messages.slice(messages.length - KEEP_RECENT);

    // Phase 2.1: Extract structured entities from older messages
    const entities = this.extractEntities(olderMessages, existingEntities);

    // Build narrative summary of older messages
    const summary = await this.summarizeMessages(olderMessages, existingSummary);

    // Phase 2.2: Enforce hard character limit on summary
    const truncatedSummary = summary.length > SUMMARY_MAX_CHARS
      ? summary.slice(0, SUMMARY_MAX_CHARS) + '...'
      : summary;

    // Build the entity block as structured text
    const entityBlock = this.formatEntityBlock(entities);

    // Prepend entity block + summary as a context message
    const compactedMessages: ChatMessage[] = [
      {
        role: 'assistant',
        content: `[بيانات المحادثة المحفوظة / Preserved Conversation Data]\n\n${entityBlock}\n\n[ملخص المحادثة / Conversation Summary]\n${truncatedSummary}`,
      },
      ...recentMessages,
    ];

    return {
      compacted: true,
      summary: truncatedSummary,
      entities,
      messages: compactedMessages,
      originalCount: messages.length,
      compactedCount: compactedMessages.length,
    };
  }

  /**
   * Extract structured entities from messages.
   * Parses tool call results and message content for critical medical facts.
   */
  private extractEntities(
    messages: ChatMessage[],
    existing?: ConversationEntities | null,
  ): ConversationEntities {
    const entities: ConversationEntities = {
      patientName: existing?.patientName ?? null,
      appointmentsBooked: [...(existing?.appointmentsBooked ?? [])],
      appointmentsCancelled: [...(existing?.appointmentsCancelled ?? [])],
      pendingRequest: null,
    };

    for (const msg of messages) {
      const content = msg.content;

      // Extract patient name from greeting patterns
      if (!entities.patientName) {
        const nameMatch = content.match(/(?:أنا|اسمي|my name is|I'm|أخوك|أخوي)\s+([^\s,.!?]+(?:\s+[^\s,.!?]+)?)/i);
        if (nameMatch) entities.patientName = nameMatch[1];
      }

      // Extract booked appointments from tool results
      if (content.includes('تم حجز الموعد') || content.includes('booked successfully')) {
        const providerMatch = content.match(/الطبيب:\s*(.+)/);
        const dateMatch = content.match(/التاريخ:\s*(.+)/);
        const timeMatch = content.match(/الوقت:\s*(.+)/);
        if (providerMatch) {
          entities.appointmentsBooked.push({
            provider: providerMatch[1].trim(),
            date: dateMatch?.[1]?.trim() ?? '',
            time: timeMatch?.[1]?.trim() ?? '',
          });
        }
      }

      // Extract cancelled appointments
      if (content.includes('تم إلغاء الموعد') || content.includes('cancelled successfully')) {
        const providerMatch = content.match(/الطبيب:\s*(.+)/);
        if (providerMatch) {
          entities.appointmentsCancelled.push(providerMatch[1].trim());
        }
      }

    }

    // Detect pending request from last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      const content = lastUserMsg.content.toLowerCase();
      if (content.includes('حجز') || content.includes('book') || content.includes('موعد')) {
        entities.pendingRequest = 'appointment_booking';
      } else if (content.includes('إلغاء') || content.includes('cancel')) {
        entities.pendingRequest = 'appointment_cancellation';
      }
    }

    return entities;
  }

  /**
   * Format entities as a structured text block for the LLM context.
   */
  private formatEntityBlock(entities: ConversationEntities): string {
    const lines: string[] = ['## الحقائق المحفوظة / Preserved Facts'];

    if (entities.patientName) {
      lines.push(`- اسم المريض: ${entities.patientName}`);
    }
    if (entities.appointmentsBooked.length > 0) {
      for (const apt of entities.appointmentsBooked) {
        lines.push(`- ✅ موعد محجوز: ${apt.provider} — ${apt.date} ${apt.time}`);
      }
    }
    if (entities.appointmentsCancelled.length > 0) {
      lines.push(`- ❌ مواعيد ملغية: ${entities.appointmentsCancelled.join('، ')}`);
    }
    if (entities.pendingRequest) {
      const labels: Record<string, string> = {
        appointment_booking: 'حجز موعد',
        appointment_cancellation: 'إلغاء موعد',
      };
      lines.push(`- 🔄 طلب معلق: ${labels[entities.pendingRequest] ?? entities.pendingRequest}`);
    }

    return lines.join('\n');
  }

  /**
   * Summarize a list of messages into a concise narrative summary.
   * Uses LLM if available, falls back to simple extraction.
   */
  private async summarizeMessages(
    messages: ChatMessage[],
    existingSummary?: string | null,
  ): Promise<string> {
    try {
      const llm = getLLMService();
      const conversationText = messages
        .map(m => `${m.role === 'user' ? 'المريض' : 'المساعد'}: ${m.content}`)
        .join('\n');

      const prompt = existingSummary
        ? `Previous summary:\n${existingSummary}\n\nNew messages to incorporate:\n${conversationText}`
        : conversationText;

      // Hard timeout — compaction runs in-band on every long-conversation turn.
      // If the LLM hangs (network blip, provider stall) we fall back to the
      // deterministic simple summarizer rather than blocking the patient's reply.
      const COMPACTION_TIMEOUT_MS = 10_000;
      const llmPromise = llm.chat(
        [{ role: 'user', content: prompt }],
        `You are a conversation summarizer for a medical receptionist AI. Create a brief NARRATIVE summary only (do NOT include structured data like allergies or appointments — those are handled separately).

Focus on:
- The flow of the conversation (what was discussed, in what order)
- Decisions made and reasoning
- Current state (what's pending or resolved)
- **CRITICAL: If a booking was in progress, preserve ALL details: which service, which provider, which dates/times were discussed, what the patient preferred**
- **CRITICAL: If the patient expressed preferences (morning/evening, specific doctor), note them**

Keep under ${SUMMARY_MAX_TOKENS} tokens. Write in Arabic primarily, with English terms where needed. Be factual and concise.`,
      );

      const { text: summary } = await Promise.race([
        llmPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SUMMARIZE_TIMEOUT')), COMPACTION_TIMEOUT_MS),
        ),
      ]);

      return summary;
    } catch {
      return this.simpleSummarize(messages, existingSummary);
    }
  }

  /**
   * Fallback summarizer — extracts key points without LLM.
   */
  private simpleSummarize(messages: ChatMessage[], existingSummary?: string | null): string {
    const lines: string[] = [];

    if (existingSummary) {
      lines.push(`Previous context: ${existingSummary}`);
    }

    lines.push(`[${messages.length} messages summarized]`);

    const userMsgs = messages
      .filter(m => m.role === 'user')
      .map(m => m.content.slice(0, 100));

    if (userMsgs.length > 0) {
      lines.push('Patient topics: ' + userMsgs.slice(0, 5).join(' | '));
    }

    const assistantMsgs = messages
      .filter(m => m.role === 'assistant')
      .map(m => m.content);

    for (const msg of assistantMsgs) {
      if (msg.includes('تم حجز') || msg.includes('booked')) {
        lines.push('Action: Appointment was booked');
      }
      if (msg.includes('تم إلغاء') || msg.includes('cancelled')) {
        lines.push('Action: Appointment was cancelled');
      }
    }

    return lines.join('\n');
  }

  /**
   * Save compaction summary to the ConversationSummary table.
   */
  async saveSummary(
    prisma: PrismaClient,
    conversationId: string,
    summary: string,
    messageCount: number,
  ): Promise<void> {
    const keyTopics: string[] = [];
    if (summary.includes('حجز') || summary.includes('book')) keyTopics.push('appointment_booking');
    if (summary.includes('إلغاء') || summary.includes('cancel')) keyTopics.push('appointment_cancellation');
    if (summary.includes('تحويل') || summary.includes('transfer')) keyTopics.push('handoff');

    const { redactedText: redactedSummary } = redactPII(summary);

    await prisma.conversationSummary.create({
      data: {
        conversationId,
        summary: redactedSummary,
        keyTopics,
        messageCount,
      },
    });
  }
}
