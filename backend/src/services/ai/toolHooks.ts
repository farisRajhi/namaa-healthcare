import { PrismaClient } from '@prisma/client';
import type { PermissionLevel } from './toolRegistry.js';

// ─────────────────────────────────────────────────────────
// Tool Execution Hooks — Pre/Post Lifecycle
// Inspired by claw-code's hooks.rs pattern:
// Pre-hooks can block or modify tool execution.
// Post-hooks handle audit logging and result processing.
// ─────────────────────────────────────────────────────────

export interface HookContext {
  toolName: string;
  args: Record<string, unknown>;
  result?: string;            // Only set for post-hooks
  durationMs?: number;        // Only set for post-hooks
  orgId: string;
  patientId: string | null;
  conversationId: string | null;
  permissionLevel: PermissionLevel;
  channel?: string;           // 'web' | 'whatsapp' | 'voice' etc.
}

export interface HookResult {
  allow: boolean;
  reason?: string;            // Bilingual message shown to LLM if blocked
  modifiedArgs?: Record<string, unknown>;  // Pre-hook can modify args
  modifiedResult?: string;    // Post-hook can modify result
}

export interface ToolHook {
  name: string;
  phase: 'pre' | 'post';
  toolNames: string[] | '*';  // Which tools this hook applies to
  handler: (ctx: HookContext) => Promise<HookResult>;
}

// ── Max result length before truncation ────────────────
const MAX_RESULT_LENGTH = 2000;
const MAX_ENTRIES_PER_PAGE = 6;

// ── Read-only tools (safe to cache, no side effects) ───
const READ_ONLY_TOOLS = new Set([
  'check_availability', 'search_providers', 'list_services',
  'get_facility_info', 'list_patient_appointments',
  'browse_available_dates', 'get_today_date', 'list_departments',
  'search_faq', 'get_patient_info',
]);

// ── Permission level ordering ──────────────────────────
const LEVEL_ORDER: PermissionLevel[] = ['anonymous', 'identified', 'verified'];

// Tool permission requirements (must match TOOL_DEFINITIONS in toolRegistry.ts)
const TOOL_PERMISSIONS: Record<string, PermissionLevel> = {
  check_availability: 'anonymous',
  browse_available_dates: 'anonymous',
  search_providers: 'anonymous',
  list_services: 'anonymous',
  get_facility_info: 'anonymous',
  transfer_to_human: 'anonymous',
  book_appointment_guest: 'anonymous',
  get_today_date: 'anonymous',
  list_departments: 'anonymous',
  search_faq: 'anonymous',
  book_appointment: 'identified',
  list_patient_appointments: 'identified',
  cancel_appointment: 'identified',
  hold_appointment: 'identified',
  reschedule_appointment: 'identified',
  get_patient_info: 'identified',
};

// ── Built-in Hooks ─────────────────────────────────────

/**
 * PermissionHook (pre): Runtime permission check.
 * Ensures the caller has sufficient permission level for the tool.
 */
function createPermissionHook(): ToolHook {
  return {
    name: 'permission_check',
    phase: 'pre',
    toolNames: '*',
    handler: async (ctx) => {
      const required = TOOL_PERMISSIONS[ctx.toolName];
      if (!required) return { allow: true };

      const currentIdx = LEVEL_ORDER.indexOf(ctx.permissionLevel);
      const requiredIdx = LEVEL_ORDER.indexOf(required);

      if (currentIdx < requiredIdx) {
        return {
          allow: false,
          reason: `يجب التحقق من هويتك أولاً لاستخدام هذه الخدمة. Identity verification required for this action.`,
        };
      }
      return { allow: true };
    },
  };
}

/**
 * CancellationPolicyHook (pre): Block cancellations within a configurable window.
 */
function createCancellationPolicyHook(prisma: PrismaClient, minHoursBefore = 2): ToolHook {
  return {
    name: 'cancellation_policy',
    phase: 'pre',
    toolNames: ['cancel_appointment'],
    handler: async (ctx) => {
      const appointmentId = ctx.args.appointmentId as string;
      if (!appointmentId) return { allow: true };

      const appointment = await prisma.appointment.findFirst({
        where: { appointmentId },
        select: { startTs: true },
      });

      if (!appointment) return { allow: true }; // Let the tool handler deal with "not found"

      const hoursUntil = (appointment.startTs.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil < minHoursBefore && hoursUntil > 0) {
        return {
          allow: false,
          reason: `لا يمكن إلغاء الموعد قبل أقل من ${minHoursBefore} ساعات. يرجى الاتصال بالعيادة مباشرة. Cannot cancel within ${minHoursBefore} hours of appointment. Please call the clinic directly.`,
        };
      }
      return { allow: true };
    },
  };
}

/**
 * AuditHook (post): Log every tool execution to AuditLog.
 */
function createAuditHook(prisma: PrismaClient): ToolHook {
  return {
    name: 'audit_trail',
    phase: 'post',
    toolNames: '*',
    handler: async (ctx) => {
      // Fire-and-forget — don't block the response
      prisma.auditLog.create({
        data: {
          orgId: ctx.orgId,
          userId: null,
          action: `ai_tool.${ctx.toolName}`,
          resource: ctx.toolName,
          resourceId: extractResourceId(ctx.toolName, ctx.args, ctx.result),
          details: {
            args: redactSensitiveArgs(ctx.args),
            resultSnippet: ctx.result?.slice(0, 200),
            durationMs: ctx.durationMs,
            patientId: ctx.patientId,
            conversationId: ctx.conversationId,
            channel: ctx.channel,
          } as any,
        },
      }).catch(() => {/* swallow audit log errors */});

      return { allow: true };
    },
  };
}

/**
 * ResultTruncationHook (post): Semantic pagination instead of hard truncation.
 * Counts entries (bullets/emojis) and caps at MAX_ENTRIES_PER_PAGE.
 * Appends remaining count with AI hint to ask patient about more options.
 */
function createResultTruncationHook(): ToolHook {
  return {
    name: 'result_truncation',
    phase: 'post',
    toolNames: '*',
    handler: async (ctx) => {
      if (!ctx.result || ctx.result.length <= MAX_RESULT_LENGTH) {
        return { allow: true };
      }

      const lines = ctx.result.split('\n');

      // Identify entry boundaries (lines starting with bullet, emoji, or numbered markers)
      const entryPattern = /^[•🩺💊📅🏥\u2022]|^\[\w+ \d+\]/;
      const entryIndices: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (entryPattern.test(lines[i].trim())) {
          entryIndices.push(i);
        }
      }

      const totalEntries = entryIndices.length;

      // If few entries or no entry pattern detected, fall back to char truncation
      if (totalEntries <= MAX_ENTRIES_PER_PAGE) {
        const truncated = ctx.result.slice(0, MAX_RESULT_LENGTH);
        const lastNewline = truncated.lastIndexOf('\n');
        const clean = lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated;
        return { allow: true, modifiedResult: clean + `\n\n... (تم اختصار النتيجة / result truncated)` };
      }

      // Take the header lines (before first entry) + first MAX_ENTRIES_PER_PAGE entries
      const headerEnd = entryIndices[0];
      const cutoffIdx = entryIndices.length > MAX_ENTRIES_PER_PAGE
        ? entryIndices[MAX_ENTRIES_PER_PAGE]
        : lines.length;

      const visibleLines = lines.slice(0, cutoffIdx);
      const remaining = totalEntries - MAX_ENTRIES_PER_PAGE;

      const paginationNote = remaining > 0
        ? `\n\n📋 يوجد ${remaining} خيارات إضافية. اسأل المريض إذا يبي يشوف المزيد.\n(${remaining} more options available. Ask the patient if they want to see more.)`
        : '';

      return { allow: true, modifiedResult: visibleLines.join('\n') + paginationNote };
    },
  };
}

// ── Helper functions ───────────────────────────────────

/** Extract a resource ID from tool args/result for audit logging */
function extractResourceId(
  toolName: string,
  args: Record<string, unknown>,
  result?: string,
): string | null {
  if (args.appointmentId) return args.appointmentId as string;
  if (args.facilityId) return args.facilityId as string;

  // Extract appointment ID from booking result
  if (toolName === 'book_appointment' && result) {
    const match = result.match(/ID: ([0-9a-f-]+)/i);
    if (match) return match[1];
  }
  return null;
}

/** Remove sensitive fields from args before logging */
function redactSensitiveArgs(args: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...args };
  // Don't log notes which might contain PHI
  if (redacted.notes) redacted.notes = '[REDACTED]';
  return redacted;
}

// ── Hook Runner ────────────────────────────────────────

export class ToolHookRunner {
  private hooks: ToolHook[] = [];

  constructor(private prisma: PrismaClient) {
    // Register built-in hooks
    this.hooks.push(createPermissionHook());
    this.hooks.push(createCancellationPolicyHook(prisma));
    this.hooks.push(createAuditHook(prisma));
    this.hooks.push(createResultTruncationHook());
  }

  /** Register a custom hook */
  addHook(hook: ToolHook): void {
    this.hooks.push(hook);
  }

  /**
   * Run all pre-hooks for a tool. Returns { allow, reason, modifiedArgs }.
   * If any pre-hook blocks, execution stops immediately.
   */
  async runPreHooks(ctx: HookContext): Promise<HookResult> {
    const preHooks = this.hooks.filter(
      h => h.phase === 'pre' && (h.toolNames === '*' || h.toolNames.includes(ctx.toolName)),
    );

    let currentArgs = ctx.args;
    for (const hook of preHooks) {
      const result = await hook.handler({ ...ctx, args: currentArgs });
      if (!result.allow) {
        return result; // Blocked — stop immediately
      }
      if (result.modifiedArgs) {
        currentArgs = result.modifiedArgs;
      }
    }

    return { allow: true, modifiedArgs: currentArgs };
  }

  /**
   * Run all post-hooks for a tool. Returns { modifiedResult }.
   */
  async runPostHooks(ctx: HookContext): Promise<{ modifiedResult?: string }> {
    const postHooks = this.hooks.filter(
      h => h.phase === 'post' && (h.toolNames === '*' || h.toolNames.includes(ctx.toolName)),
    );

    let currentResult = ctx.result;
    for (const hook of postHooks) {
      const result = await hook.handler({ ...ctx, result: currentResult });
      if (result.modifiedResult) {
        currentResult = result.modifiedResult;
      }
    }

    return { modifiedResult: currentResult !== ctx.result ? currentResult : undefined };
  }
}

export { READ_ONLY_TOOLS };
