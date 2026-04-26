import { PrismaClient } from '@prisma/client';
import type { ChatCompletionTool } from 'openai/resources/chat/completions.js';
import { ToolHookRunner, READ_ONLY_TOOLS } from './toolHooks.js';
import type { HookContext } from './toolHooks.js';
import { validateToolArgs } from './toolSchemas.js';
import { riyadhNow, riyadhToUtc, riyadhMidnight, riyadhDateWithTime, riyadhDayOfWeek, utcToRiyadhDateStr, RIYADH_TZ } from '../../utils/riyadhTime.js';
import { validatePatientName } from '../security/nameValidator.js';

// ─────────────────────────────────────────────────────────
// AI Tool Registry — Declarative Actions Catalog
// Inspired by claw-code's tool registry pattern:
// All AI-callable actions defined as searchable, permission-
// filtered tools with OpenAI function calling format.
// ─────────────────────────────────────────────────────────

export type PermissionLevel = 'anonymous' | 'identified' | 'verified';

export interface ToolCallResult {
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  durationMs: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permissionLevel: PermissionLevel;
  category: 'booking' | 'inquiry' | 'general' | 'escalation';
}

/**
 * Serialized form of the per-conversation reference maps.
 * Persisted in `Conversation.context.toolRefs` between turns so that
 * "[طبيب 1]" generated in turn N can still resolve to a UUID in turn N+1.
 */
export interface SerializedToolRefs {
  provider?: Record<string, string>;
  service?: Record<string, string>;
  appointment?: Record<string, string>;
  nextProvider?: number;
  nextService?: number;
  nextAppointment?: number;
}

// ── Tool Definitions (OpenAI function calling format) ──────

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'check_availability',
    description: 'Check available appointment time slots for a specific date. Can filter by provider, service, or department. | التحقق من المواعيد المتاحة ليوم محدد',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        providerId: { type: 'string', description: 'Provider UUID (optional)' },
        serviceId: { type: 'string', description: 'Service UUID (optional)' },
        departmentId: { type: 'string', description: 'Department UUID (optional)' },
      },
      required: ['date'],
    },
    permissionLevel: 'anonymous',
    category: 'booking',
  },
  {
    name: 'book_appointment',
    description: 'Book an appointment for the patient. If a hold was placed via hold_appointment, pass the holdAppointmentId to convert it to a confirmed booking. | حجز مو��د للمريض',
    parameters: {
      type: 'object',
      properties: {
        providerId: { type: 'string', description: 'Provider UUID' },
        serviceId: { type: 'string', description: 'Service UUID' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Time in HH:MM format (24h)' },
        notes: { type: 'string', description: 'Optional appointment notes' },
        holdAppointmentId: { type: 'string', description: 'If a hold was placed via hold_appointment, pass the appointmentId to convert it to a confirmed booking instead of creating a new one' },
      },
      required: ['providerId', 'serviceId', 'date', 'time'],
    },
    permissionLevel: 'identified',
    category: 'booking',
  },
  {
    name: 'list_patient_appointments',
    description: 'List upcoming or past appointments for the current patient. | عرض مواعيد المريض',
    parameters: {
      type: 'object',
      properties: {
        upcoming: { type: 'boolean', description: 'If true, show upcoming only; if false, show past', default: true },
        limit: { type: 'number', description: 'Max results to return', default: 5 },
      },
    },
    permissionLevel: 'identified',
    category: 'inquiry',
  },
  {
    name: 'cancel_appointment',
    description: 'Cancel an existing appointment by ID. | إلغاء موعد',
    parameters: {
      type: 'object',
      properties: {
        appointmentId: { type: 'string', description: 'Appointment UUID to cancel' },
        reason: { type: 'string', description: 'Cancellation reason' },
      },
      required: ['appointmentId'],
    },
    permissionLevel: 'identified',
    category: 'booking',
  },
  {
    name: 'search_providers',
    description: 'Search for providers (doctors) by name, department, or specialty. | البحث عن الأطباء',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (name or specialty)' },
        departmentId: { type: 'string', description: 'Filter by department UUID' },
      },
    },
    permissionLevel: 'anonymous',
    category: 'inquiry',
  },
  {
    name: 'list_services',
    description: 'List available medical services, optionally filtered by department. | عرض الخدمات المتاحة',
    parameters: {
      type: 'object',
      properties: {
        departmentId: { type: 'string', description: 'Filter by department UUID (optional)' },
      },
    },
    permissionLevel: 'anonymous',
    category: 'inquiry',
  },
  {
    name: 'get_facility_info',
    description: 'Get facility information including address, phone, working hours. | معلومات المنشأة الصحية',
    parameters: {
      type: 'object',
      properties: {
        facilityId: { type: 'string', description: 'Specific facility UUID (optional, returns default facility)' },
      },
    },
    permissionLevel: 'anonymous',
    category: 'general',
  },
  {
    name: 'transfer_to_human',
    description: 'Transfer the conversation to a human agent when the AI cannot help. | تحويل المحادثة لموظف',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for transfer' },
        department: { type: 'string', description: 'Preferred department to transfer to' },
      },
      required: ['reason'],
    },
    permissionLevel: 'anonymous',
    category: 'escalation',
  },
  // Browse upcoming availability without specifying a date
  {
    name: 'browse_available_dates',
    description: 'Show which days in the next 7 days have available appointment slots. Use this when the patient asks "what dates are available?" or "show me available appointments" without specifying a date. | عرض الأيام المتاحة للحجز خلال الأسبوع القادم',
    parameters: {
      type: 'object',
      properties: {
        providerId: { type: 'string', description: 'Provider UUID (optional — filter by specific doctor)' },
        serviceId: { type: 'string', description: 'Service UUID (optional — filter by service)' },
        departmentId: { type: 'string', description: 'Department UUID (optional — filter by department)' },
        daysAhead: { type: 'number', description: 'Number of days to look ahead (default 7, max 14)' },
      },
    },
    permissionLevel: 'anonymous',
    category: 'booking',
  },
  // Guest booking for new patients (no existing patient record required)
  {
    name: 'book_appointment_guest',
    description: 'Book an appointment for a new patient who is not yet in the system. Collects name and phone, creates the patient record, and books the appointment. | حجز موعد لمريض جديد غير مسجل في النظام',
    parameters: {
      type: 'object',
      properties: {
        firstName: { type: 'string', description: 'Patient first name (Arabic or English)' },
        lastName: { type: 'string', description: 'Patient last name (Arabic or English)' },
        phone: { type: 'string', description: 'Patient phone number in +966XXXXXXXXX format' },
        providerId: { type: 'string', description: 'Provider UUID' },
        serviceId: { type: 'string', description: 'Service UUID' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Time in HH:MM format (24h)' },
        notes: { type: 'string', description: 'Optional appointment notes' },
      },
      required: ['firstName', 'lastName', 'phone', 'providerId', 'serviceId', 'date', 'time'],
    },
    permissionLevel: 'anonymous',
    category: 'booking',
  },
  // Phase 3: Hold and reschedule tools
  {
    name: 'hold_appointment',
    description: 'Temporarily hold a time slot for 10 minutes while confirming with patient. | حجز مؤقت للموعد',
    parameters: {
      type: 'object',
      properties: {
        providerId: { type: 'string', description: 'Provider UUID' },
        serviceId: { type: 'string', description: 'Service UUID' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Time in HH:MM format (24h)' },
      },
      required: ['providerId', 'serviceId', 'date', 'time'],
    },
    permissionLevel: 'identified',
    category: 'booking',
  },
  {
    name: 'reschedule_appointment',
    description: 'Reschedule an existing appointment to a new date/time. | إعادة جدولة موعد',
    parameters: {
      type: 'object',
      properties: {
        appointmentId: { type: 'string', description: 'Appointment UUID to reschedule' },
        newDate: { type: 'string', description: 'New date in YYYY-MM-DD format' },
        newTime: { type: 'string', description: 'New time in HH:MM format (24h)' },
      },
      required: ['appointmentId', 'newDate', 'newTime'],
    },
    permissionLevel: 'identified',
    category: 'booking',
  },
  // ── New tools ──────────────────────────────────────────
  {
    name: 'get_today_date',
    description: 'Get today\'s date, current time, and day of the week. Use this when the patient mentions relative dates like "tomorrow", "next week", "بكرة", "الأسبوع الجاي". | الحصول على تاريخ واليوم الحالي',
    parameters: {
      type: 'object',
      properties: {},
    },
    permissionLevel: 'anonymous',
    category: 'general',
  },
  {
    name: 'list_departments',
    description: 'List all departments in the facility with provider counts. | عرض أقسام المستشفى',
    parameters: {
      type: 'object',
      properties: {},
    },
    permissionLevel: 'anonymous',
    category: 'inquiry',
  },
  {
    name: 'search_faq',
    description: 'Search frequently asked questions about the clinic (insurance, parking, visiting hours, policies, etc.). Use when patient asks general questions. | البحث في الأسئلة الشائعة',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords (Arabic or English)' },
        category: { type: 'string', description: 'FAQ category filter (optional)' },
      },
    },
    permissionLevel: 'anonymous',
    category: 'inquiry',
  },
  {
    name: 'get_patient_info',
    description: 'Get the current patient\'s basic profile (name, contact info). Use to personalize the conversation. | عرض معلومات المريض الأساسية',
    parameters: {
      type: 'object',
      properties: {},
    },
    permissionLevel: 'identified',
    category: 'inquiry',
  },
];

/**
 * Allowlist of registered tool names. Used by the LLM service to filter out
 * any synthesized tool calls (e.g. from Gemini emitting `default_api.foo(...)`
 * code blocks) that aren't backed by a real handler.
 */
export const REGISTERED_TOOL_NAMES: ReadonlySet<string> = new Set(
  TOOL_DEFINITIONS.map(t => t.name),
);

// ── Arabic day/time helpers ──────────────────────────────

const DAYS_AR: Record<number, string> = {
  0: 'الأحد', 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء',
  4: 'الخميس', 5: 'الجمعة', 6: 'السبت',
};

function formatTimeSlot(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RIYADH_TZ, hour: 'numeric', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  let h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  if (h === 24) h = 0;
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  const period = h >= 12 ? 'مساءً' : 'صباحاً';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m} ${period}`;
}

function formatDateAr(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RIYADH_TZ, weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const dayOfWeek = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[get('weekday')] ?? 0;
  const day = DAYS_AR[dayOfWeek] ?? '';
  return `${day} ${get('day')}/${get('month')}/${get('year')}`;
}

// ── Tool Registry Class ──────────────────────────────────

export class ToolRegistry {
  private hookRunner: ToolHookRunner;
  private resultCache = new Map<string, { result: string; cachedAt: number }>();
  private static CACHE_TTL_MS = 60_000; // 60 seconds
  private permissionLevel: PermissionLevel = 'anonymous';
  private channel: string = 'web';
  private patientLanguage: 'ar' | 'en' | 'auto' = 'auto';

  // Phase 1.4: UUID-to-number mapping so patients never see raw UUIDs.
  // These maps are PER-INSTANCE and lost between turns unless seeded with
  // initialRefs from Conversation.context.refs — otherwise the LLM cannot
  // resolve "[طبيب 1]" from a previous turn back to a real UUID.
  private providerRefMap = new Map<number, string>();
  private serviceRefMap = new Map<number, string>();
  private appointmentRefMap = new Map<number, string>();
  private nextProviderRef = 1;
  private nextServiceRef = 1;
  private nextAppointmentRef = 1;

  constructor(
    private prisma: PrismaClient,
    private orgId: string,
    private patientId: string | null = null,
    private conversationId: string | null = null,
    initialRefs?: SerializedToolRefs,
  ) {
    this.hookRunner = new ToolHookRunner(prisma);
    if (initialRefs) this.loadRefs(initialRefs);
  }

  /** Hydrate ref maps from a previous turn's persisted state */
  private loadRefs(refs: SerializedToolRefs): void {
    if (refs.provider) {
      for (const [k, v] of Object.entries(refs.provider)) {
        const n = Number(k);
        if (!isNaN(n)) this.providerRefMap.set(n, v);
      }
      this.nextProviderRef = (refs.nextProvider ?? this.providerRefMap.size + 1);
    }
    if (refs.service) {
      for (const [k, v] of Object.entries(refs.service)) {
        const n = Number(k);
        if (!isNaN(n)) this.serviceRefMap.set(n, v);
      }
      this.nextServiceRef = (refs.nextService ?? this.serviceRefMap.size + 1);
    }
    if (refs.appointment) {
      for (const [k, v] of Object.entries(refs.appointment)) {
        const n = Number(k);
        if (!isNaN(n)) this.appointmentRefMap.set(n, v);
      }
      this.nextAppointmentRef = (refs.nextAppointment ?? this.appointmentRefMap.size + 1);
    }
  }

  /** Snapshot ref maps for persistence between turns */
  getRefs(): SerializedToolRefs {
    const toObj = (m: Map<number, string>): Record<string, string> => {
      const o: Record<string, string> = {};
      for (const [k, v] of m) o[String(k)] = v;
      return o;
    };
    return {
      provider: toObj(this.providerRefMap),
      service: toObj(this.serviceRefMap),
      appointment: toObj(this.appointmentRefMap),
      nextProvider: this.nextProviderRef,
      nextService: this.nextServiceRef,
      nextAppointment: this.nextAppointmentRef,
    };
  }

  /** Set the current permission level (for hook enforcement) */
  setPermissionLevel(level: PermissionLevel): void {
    this.permissionLevel = level;
  }

  /** Set the communication channel (for channel-aware formatting) */
  setChannel(channel: string): void {
    this.channel = channel;
  }

  /** Set the detected patient language for tool output */
  setPatientLanguage(lang: 'ar' | 'en' | 'auto'): void {
    this.patientLanguage = lang;
  }

  /** Whether the current channel is WhatsApp (Arabic-only, concise responses) */
  private get isWhatsApp(): boolean {
    return this.channel === 'whatsapp';
  }

  /** Whether to use Arabic labels in tool output */
  private get useArabic(): boolean {
    return this.patientLanguage !== 'en';
  }

  /** Return label in the patient's detected language */
  private label(ar: string, en: string): string {
    return this.useArabic ? ar : en;
  }

  /** Format bilingual response — respects patient language on WhatsApp, both for other channels */
  private formatResponse(arText: string, enText: string): string {
    if (this.isWhatsApp) return this.useArabic ? arText : enText;
    return `${arText}\n${enText}`;
  }

  /** Format error — respects patient language on WhatsApp, both for other channels */
  private formatError(arText: string, enText: string): string {
    if (this.isWhatsApp) return this.useArabic ? arText : enText;
    return `${arText} ${enText}`;
  }

  /** Get or assign a numbered reference for a provider UUID */
  private providerRef(uuid: string): number {
    for (const [ref, id] of this.providerRefMap) {
      if (id === uuid) return ref;
    }
    const ref = this.nextProviderRef++;
    this.providerRefMap.set(ref, uuid);
    return ref;
  }

  /** Get or assign a numbered reference for a service UUID */
  private serviceRef(uuid: string): number {
    for (const [ref, id] of this.serviceRefMap) {
      if (id === uuid) return ref;
    }
    const ref = this.nextServiceRef++;
    this.serviceRefMap.set(ref, uuid);
    return ref;
  }

  /** Get or assign a numbered reference for an appointment UUID */
  private appointmentRef(uuid: string): number {
    for (const [ref, id] of this.appointmentRefMap) {
      if (id === uuid) return ref;
    }
    const ref = this.nextAppointmentRef++;
    this.appointmentRefMap.set(ref, uuid);
    return ref;
  }

  /** Resolve a reference number back to a UUID (for tool args) */
  resolveRef(type: 'provider' | 'service' | 'appointment', refOrUuid: string): string {
    // If it's already a UUID, return as-is
    if (refOrUuid.includes('-') && refOrUuid.length > 10) return refOrUuid;

    const num = parseInt(refOrUuid, 10);
    if (isNaN(num)) return refOrUuid;

    const map = type === 'provider' ? this.providerRefMap
      : type === 'service' ? this.serviceRefMap
      : this.appointmentRefMap;

    return map.get(num) ?? refOrUuid;
  }

  /**
   * Get OpenAI-format tool definitions filtered by permission level.
   */
  getToolDefinitions(permissionLevel: PermissionLevel = 'anonymous'): ChatCompletionTool[] {
    const levelOrder: PermissionLevel[] = ['anonymous', 'identified', 'verified'];
    const maxIdx = levelOrder.indexOf(permissionLevel);

    return TOOL_DEFINITIONS
      .filter(t => levelOrder.indexOf(t.permissionLevel) <= maxIdx)
      .map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
  }

  /**
   * Get tool definitions filtered by category.
   */
  getToolsByCategory(categories: string[], permissionLevel: PermissionLevel = 'anonymous'): ChatCompletionTool[] {
    const levelOrder: PermissionLevel[] = ['anonymous', 'identified', 'verified'];
    const maxIdx = levelOrder.indexOf(permissionLevel);

    return TOOL_DEFINITIONS
      .filter(t =>
        categories.includes(t.category) &&
        levelOrder.indexOf(t.permissionLevel) <= maxIdx,
      )
      .map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
  }

  /**
   * Execute a tool by name with given arguments.
   * Runs pre-hooks → (cache check) → execution → post-hooks.
   * Returns a human-readable result string for the LLM.
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const hookCtx: HookContext = {
      toolName: name,
      args,
      orgId: this.orgId,
      patientId: this.patientId,
      conversationId: this.conversationId,
      permissionLevel: this.permissionLevel,
      channel: this.channel,
    };

    // Run pre-hooks (permission check, cancellation policy, etc.)
    const preResult = await this.hookRunner.runPreHooks(hookCtx);
    if (!preResult.allow) {
      return preResult.reason ?? this.formatError('عذراً، لا يمكن تنفيذ هذا الإجراء.', 'Action not permitted.');
    }
    let effectiveArgs = preResult.modifiedArgs ?? args;

    // Resolve reference numbers → UUIDs (WhatsApp hides UUIDs, LLM only sees [طبيب 1])
    if (typeof effectiveArgs.providerId === 'string') {
      effectiveArgs.providerId = this.resolveRef('provider', effectiveArgs.providerId);
    }
    if (typeof effectiveArgs.serviceId === 'string') {
      effectiveArgs.serviceId = this.resolveRef('service', effectiveArgs.serviceId);
    }
    if (typeof effectiveArgs.appointmentId === 'string') {
      effectiveArgs.appointmentId = this.resolveRef('appointment', effectiveArgs.appointmentId);
    }
    if (typeof effectiveArgs.holdAppointmentId === 'string') {
      effectiveArgs.holdAppointmentId = this.resolveRef('appointment', effectiveArgs.holdAppointmentId);
    }

    // Fail-open UUID guard: if ref resolution didn't produce a UUID (e.g. LLM
    // sent "[خدمة 1]" before any list was shown, or hallucinated a name), drop
    // the field so downstream Prisma doesn't crash with "Error creating UUID".
    // Required fields will be re-rejected by Zod below with a recoverable message;
    // optional filter fields (browse_available_dates.serviceId, etc.) just widen
    // the search instead of failing the whole call.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const key of ['providerId', 'serviceId', 'departmentId', 'appointmentId', 'holdAppointmentId']) {
      const val = effectiveArgs[key];
      if (typeof val === 'string' && val.length > 0 && !UUID_RE.test(val)) {
        delete effectiveArgs[key];
      }
    }

    // Validate args against the per-tool Zod schema (booking tools only for now).
    // On failure, return a bilingual LLM-recoverable error instead of crashing
    // deep inside a DB query. Skips tools without a registered schema.
    const validated = validateToolArgs(name, effectiveArgs);
    if (!validated.ok) {
      return validated.message;
    }
    effectiveArgs = validated.data;

    // Check cache for read-only tools
    if (READ_ONLY_TOOLS.has(name)) {
      const cacheKey = `${name}:${JSON.stringify(effectiveArgs)}`;
      const cached = this.resultCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < ToolRegistry.CACHE_TTL_MS) {
        return cached.result;
      }
    }

    // Execute the tool
    const startTime = Date.now();
    let result: string;
    switch (name) {
      case 'check_availability':
        result = await this.execCheckAvailability(effectiveArgs);
        break;
      case 'book_appointment':
        result = await this.execBookAppointment(effectiveArgs);
        break;
      case 'list_patient_appointments':
        result = await this.execListAppointments(effectiveArgs);
        break;
      case 'cancel_appointment':
        result = await this.execCancelAppointment(effectiveArgs);
        break;
      case 'search_providers':
        result = await this.execSearchProviders(effectiveArgs);
        break;
      case 'list_services':
        result = await this.execListServices(effectiveArgs);
        break;
      case 'get_facility_info':
        result = await this.execGetFacilityInfo(effectiveArgs);
        break;
      case 'transfer_to_human':
        result = await this.execTransferToHuman(effectiveArgs);
        break;
      case 'browse_available_dates':
        result = await this.execBrowseAvailableDates(effectiveArgs);
        break;
      case 'book_appointment_guest':
        result = await this.execBookAppointmentGuest(effectiveArgs);
        break;
      case 'hold_appointment':
        result = await this.execHoldAppointment(effectiveArgs);
        break;
      case 'reschedule_appointment':
        result = await this.execRescheduleAppointment(effectiveArgs);
        break;
      case 'get_today_date':
        result = await this.execGetTodayDate();
        break;
      case 'list_departments':
        result = await this.execListDepartments();
        break;
      case 'search_faq':
        result = await this.execSearchFaq(effectiveArgs);
        break;
      case 'get_patient_info':
        result = await this.execGetPatientInfo();
        break;
      default:
        return `Error: Unknown tool "${name}"`;
    }
    const durationMs = Date.now() - startTime;

    // Invalidate cache after mutations (booking/cancelling changes availability)
    if (!READ_ONLY_TOOLS.has(name)) {
      this.resultCache.clear();
    } else {
      // Cache read-only results
      const cacheKey = `${name}:${JSON.stringify(effectiveArgs)}`;
      this.resultCache.set(cacheKey, { result, cachedAt: Date.now() });
    }

    // Run post-hooks (audit, truncation)
    const postResult = await this.hookRunner.runPostHooks({
      ...hookCtx,
      args: effectiveArgs,
      result,
      durationMs,
    });

    return postResult.modifiedResult ?? result;
  }

  // ── Tool Implementations ─────────────────────────────

  private async execCheckAvailability(args: Record<string, unknown>): Promise<string> {
    const dateStr = args.date as string;
    if (!dateStr) return 'Error: date is required (YYYY-MM-DD)';

    const targetDate = riyadhMidnight(dateStr);
    if (isNaN(targetDate.getTime())) return 'Error: invalid date format';

    const dayOfWeek = riyadhDayOfWeek(dateStr);
    const endOfDay = riyadhDateWithTime(dateStr, 23, 59);

    // Fetch requested service to use its duration + buffer times for slot sizing
    let requestedService: { durationMin: number; bufferBeforeMin: number; bufferAfterMin: number } | null = null;
    if (args.serviceId) {
      requestedService = await this.prisma.service.findFirst({
        where: { serviceId: args.serviceId as string, orgId: this.orgId, active: true },
        select: { durationMin: true, bufferBeforeMin: true, bufferAfterMin: true },
      });
    }

    // Build provider filter
    const providerWhere: Record<string, unknown> = { orgId: this.orgId, active: true };
    if (args.providerId) providerWhere.providerId = args.providerId;
    if (args.departmentId) providerWhere.departmentId = args.departmentId;

    // Find providers with availability on that day
    const providers = await this.prisma.provider.findMany({
      where: providerWhere,
      include: {
        availabilityRules: {
          where: {
            dayOfWeek,
            validFrom: { lte: targetDate },
            OR: [{ validTo: null }, { validTo: { gte: targetDate } }],
          },
        },
        services: {
          where: args.serviceId ? { serviceId: args.serviceId as string } : undefined,
          include: { service: true },
        },
        department: { select: { name: true } },
        // Phase 0.3: Include time-off to filter out providers on leave
        timeOff: {
          where: {
            startTs: { lte: endOfDay },
            endTs: { gte: targetDate },
          },
        },
      },
    });

    // Phase 0.3: Filter out providers who have time-off covering the entire day
    const availableProviders = providers.filter(
      p => p.availabilityRules.length > 0 && p.timeOff.length === 0,
    );

    if (availableProviders.length === 0) {
      return this.formatResponse(`لا يوجد أطباء متاحين في ${formatDateAr(targetDate)}.`, `No providers available on ${dateStr}.`);
    }

    // Get existing appointments for that day to exclude booked slots
    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        orgId: this.orgId,
        startTs: { gte: targetDate, lte: endOfDay },
        status: { in: ['held', 'booked', 'confirmed', 'checked_in', 'in_progress'] },
        ...(args.providerId ? { providerId: args.providerId as string } : {}),
      },
      select: { providerId: true, startTs: true, endTs: true },
    });

    // Build a map of booked time ranges (not just start hours) for proper overlap detection
    const bookedRanges = new Map<string, { start: number; end: number }[]>();
    for (const apt of existingAppointments) {
      const ranges = bookedRanges.get(apt.providerId) || [];
      ranges.push({ start: apt.startTs.getTime(), end: apt.endTs.getTime() });
      bookedRanges.set(apt.providerId, ranges);
    }

    // Phase 0.2: Calculate effective slot duration from service or use rule's interval
    const effectiveSlotMin = requestedService
      ? requestedService.durationMin + requestedService.bufferBeforeMin + requestedService.bufferAfterMin
      : null; // will fall back to rule.slotIntervalMin per provider

    // Build availability response — WhatsApp-friendly numbered list.
    // Slots get a globally-unique number so the patient can reply "2" or "رقم 2"
    // and the LLM maps that back to a specific provider + time.
    const header = `📅 ${this.label('المواعيد المتاحة', 'Available appointments')} — ${this.useArabic ? formatDateAr(targetDate) : dateStr}`;
    const lines: string[] = [header, ''];
    let slotCounter = 1;
    type SlotEntry = { n: number; providerName: string; providerId: string; serviceId: string | null; time: string };
    const slotIndex: SlotEntry[] = [];

    for (const provider of availableProviders) {
      const providerRanges = bookedRanges.get(provider.providerId) || [];

      for (const rule of provider.availabilityRules) {
        const startH = rule.startLocal.getUTCHours();
        const startM = rule.startLocal.getUTCMinutes();
        const endH = rule.endLocal.getUTCHours();
        const endM = rule.endLocal.getUTCMinutes();

        const slotStepMin = Math.max(effectiveSlotMin ?? rule.slotIntervalMin ?? 30, 5);
        const slotDurationMin = requestedService ? Math.max(requestedService.durationMin, 5) : slotStepMin;
        const bufferBeforeMs = requestedService ? (requestedService.bufferBeforeMin ?? 0) * 60 * 1000 : 0;
        const bufferAfterMs = requestedService ? (requestedService.bufferAfterMin ?? 0) * 60 * 1000 : 0;

        const slots: string[] = [];
        let h = startH, m = startM;
        while (h < endH || (h === endH && m < endM)) {
          const slotStart = riyadhDateWithTime(dateStr, h, m);
          const slotEnd = new Date(slotStart.getTime() + slotDurationMin * 60 * 1000);

          const windowEnd = riyadhDateWithTime(dateStr, endH, endM);
          if (slotEnd > windowEnd) break;

          const conflictStart = new Date(slotStart.getTime() - bufferBeforeMs);
          const conflictEnd = new Date(slotEnd.getTime() + bufferAfterMs);
          const hasConflict = providerRanges.some(
            r => conflictStart.getTime() < r.end && conflictEnd.getTime() > r.start,
          );

          if (!hasConflict) {
            slots.push(formatTimeSlot(slotStart));
          }

          m += slotStepMin;
          if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
        }

        if (slots.length > 0) {
          const dept = provider.department?.name ?? '';
          const firstServiceId = requestedService && args.serviceId
            ? (args.serviceId as string)
            : (provider.services[0]?.serviceId ?? null);

          lines.push(`👨‍⚕️ *${provider.displayName}*${dept ? ` — ${dept}` : ''}`);
          for (const timeStr of slots) {
            lines.push(`   ${slotCounter}. ${timeStr}`);
            slotIndex.push({
              n: slotCounter,
              providerName: provider.displayName,
              providerId: provider.providerId,
              serviceId: firstServiceId,
              time: timeStr,
            });
            slotCounter++;
          }
          lines.push('');
        }
      }
    }

    if (slotIndex.length === 0) {
      return this.formatResponse(`جميع المواعيد محجوزة في ${formatDateAr(targetDate)}.`, `All slots booked on ${dateStr}.`);
    }

    // Footer guidance for the patient
    lines.push(this.label('💡 اختر رقم الوقت المناسب (مثال: "رقم 2" أو "2")', '💡 Reply with the slot number (e.g. "2")'));
    // Internal-only mapping for the LLM — so it can resolve a number to providerId/serviceId/time.
    // Not intended for the patient; the LLM should use it to call book_appointment/hold_appointment.
    lines.push('');
    lines.push('<!-- SLOT_MAP (for tool routing, do not repeat to user):');
    for (const s of slotIndex) {
      const sid = s.serviceId ? ` serviceId=${s.serviceId}` : '';
      lines.push(`${s.n}: providerId=${s.providerId}${sid} time=${s.time} (${s.providerName})`);
    }
    lines.push('-->');

    return lines.join('\n');
  }

  private async execBookAppointment(args: Record<string, unknown>): Promise<string> {
    if (!this.patientId) {
      return this.formatError('لا يمكن الحجز بدون تحديد هوية المريض.', 'Patient not identified — cannot book appointment.');
    }

    const { providerId, serviceId, date, time, notes, holdAppointmentId } = args as {
      providerId: string; serviceId: string; date: string; time: string; notes?: string; holdAppointmentId?: string;
    };

    // ── Fast path: Convert an existing hold to booked ────────
    if (holdAppointmentId) {
      const held = await this.prisma.appointment.findFirst({
        where: {
          appointmentId: holdAppointmentId,
          orgId: this.orgId,
          patientId: this.patientId!,
          status: 'held',
        },
        include: {
          provider: { select: { displayName: true } },
          service: { select: { name: true } },
          facility: { select: { name: true } },
        },
      });

      if (held) {
        const appointment = await this.prisma.appointment.update({
          where: { appointmentId: holdAppointmentId },
          data: {
            status: 'booked',
            holdExpiresAt: null,
            notes: notes as string || held.notes || null,
          },
          include: { facility: { select: { name: true } } },
        });

        await this.prisma.appointmentStatusHistory.create({
          data: {
            appointmentId: holdAppointmentId,
            oldStatus: 'held',
            newStatus: 'booked',
            changedBy: 'ai_chat',
            reason: 'Patient confirmed hold via WhatsApp',
          },
        });

        const arText =
          `✅ تم تأكيد الحجز بنجاح!\n` +
          `الطبيب: ${held.provider.displayName}\n` +
          `الخدمة: ${held.service.name}\n` +
          `التاريخ: ${formatDateAr(held.startTs)}\n` +
          `الوقت: ${formatTimeSlot(held.startTs)}\n` +
          (appointment.facility ? `المكان: ${appointment.facility.name}` : '');
        return this.formatResponse(arText, `Appointment confirmed! ID: ${appointment.appointmentId}`);
      }
      // Hold expired or not found — fall through to create a new booking
    }

    // ── Standard path: New booking (no hold) ─────────────────

    // Validate provider
    const provider = await this.prisma.provider.findFirst({
      where: { providerId, orgId: this.orgId, active: true },
      select: { displayName: true, providerId: true },
    });
    if (!provider) return this.formatError('الطبيب غير موجود.', 'Provider not found.');

    // Validate service
    const service = await this.prisma.service.findFirst({
      where: { serviceId, orgId: this.orgId, active: true },
      select: { name: true, serviceId: true, durationMin: true, bufferBeforeMin: true, bufferAfterMin: true },
    });
    if (!service) return this.formatError('الخدمة غير موجودة.', 'Service not found.');

    // Phase 0.4: Validate provider offers this service
    const providerService = await this.prisma.providerService.findUnique({
      where: { providerId_serviceId: { providerId, serviceId } },
    });
    if (!providerService) {
      return this.formatError(`الطبيب ${provider.displayName} لا يقدم هذه الخدمة.`, 'Provider does not offer this service.');
    }

    // Parse date/time (Riyadh local → UTC)
    const startTs = riyadhToUtc(date, time);
    if (isNaN(startTs.getTime())) return this.formatError('تاريخ أو وقت غير صحيح.', 'Invalid date/time.');

    if (startTs < new Date()) return this.formatError('لا يمكن الحجز في الماضي.', 'Cannot book in the past.');

    const endTs = new Date(startTs.getTime() + (service.durationMin || 30) * 60 * 1000);

    // Phase 0.3: Check provider is not on time-off
    const timeOff = await this.prisma.providerTimeOff.findFirst({
      where: {
        providerId,
        startTs: { lte: endTs },
        endTs: { gte: startTs },
      },
    });
    if (timeOff) {
      return this.formatError(`الطبيب ${provider.displayName} في إجازة في هذا التاريخ.`, 'Provider is on leave during this time.');
    }

    // Phase 0.1: Atomic conflict check + create inside a serializable transaction
    // to prevent race conditions (TOCTOU double-booking)
    try {
      const appointment = await this.prisma.$transaction(async (tx) => {
        // Phase 0.2: Expand conflict window by buffer times
        const bufferBefore = (service.bufferBeforeMin ?? 0) * 60 * 1000;
        const bufferAfter = (service.bufferAfterMin ?? 0) * 60 * 1000;
        const conflictStart = new Date(startTs.getTime() - bufferBefore);
        const conflictEnd = new Date(endTs.getTime() + bufferAfter);

        const conflict = await tx.appointment.findFirst({
          where: {
            providerId,
            status: { in: ['held', 'booked', 'confirmed'] },
            OR: [
              { startTs: { gte: conflictStart, lt: conflictEnd } },
              { endTs: { gt: conflictStart, lte: conflictEnd } },
              { AND: [{ startTs: { lte: conflictStart } }, { endTs: { gte: conflictEnd } }] },
            ],
          },
        });

        if (conflict) {
          throw new Error('SLOT_CONFLICT');
        }

        // Patient-side overlap check: prevent same patient booking two appointments at same time
        const patientOverlap = await tx.appointment.findFirst({
          where: {
            patientId: this.patientId!,
            status: { in: ['held', 'booked', 'confirmed'] },
            OR: [
              { startTs: { gte: startTs, lt: endTs } },
              { endTs: { gt: startTs, lte: endTs } },
              { AND: [{ startTs: { lte: startTs } }, { endTs: { gte: endTs } }] },
            ],
          },
        });
        if (patientOverlap) {
          throw new Error('PATIENT_OVERLAP');
        }

        // Get default facility
        const facility = await tx.facility.findFirst({
          where: { orgId: this.orgId },
          select: { facilityId: true, name: true },
        });

        return tx.appointment.create({
          data: {
            orgId: this.orgId,
            patientId: this.patientId!,
            providerId,
            serviceId,
            facilityId: facility?.facilityId,
            startTs,
            endTs,
            status: 'booked',
            notes: notes as string || null,
            bookedVia: this.channel as any ?? 'web',
          },
          include: {
            facility: { select: { name: true } },
          },
        });
      }, { isolationLevel: 'Serializable' });

      const arBookedText =
        `✅ تم حجز الموعد بنجاح!\n` +
        `الطبيب: ${provider.displayName}\n` +
        `الخدمة: ${service.name}\n` +
        `التاريخ: ${formatDateAr(startTs)}\n` +
        `الوقت: ${formatTimeSlot(startTs)}\n` +
        (appointment.facility ? `المكان: ${appointment.facility.name}` : '');
      return this.formatResponse(arBookedText, `Appointment booked successfully! ID: ${appointment.appointmentId}`);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'SLOT_CONFLICT') {
        return this.formatError('هذا الموعد محجوز بالفعل.', 'This time slot is already booked.');
      }
      if (err instanceof Error && err.message === 'PATIENT_OVERLAP') {
        return this.formatError('لديك موعد آخر في نفس الوقت.', 'You already have another appointment at this time.');
      }
      throw err; // Re-throw unexpected errors
    }
  }

  private async execBookAppointmentGuest(args: Record<string, unknown>): Promise<string> {
    const { firstName, lastName, phone, providerId, serviceId, date, time, notes } = args as {
      firstName: string; lastName: string; phone: string;
      providerId: string; serviceId: string; date: string; time: string; notes?: string;
    };

    if (!firstName || !lastName || !phone) {
      return this.formatError('الاسم الأول والأخير ورقم الجوال مطلوبة.', 'First name, last name, and phone are required.');
    }

    const nameCheck = validatePatientName(firstName, lastName);
    if (!nameCheck.ok) {
      return this.formatError(
        'الاسم اللي وصلني يبدو تحية مو اسم. ممكن تكتبين اسمك الكامل (الأول والعائلة)؟',
        'That looks like a greeting, not a name. Could you send your full name (first and last)?'
      );
    }

    // Validate phone format (Saudi +966 or international)
    const phoneNormalized = phone.startsWith('+') ? phone : `+${phone}`;
    if (!/^\+\d{10,15}$/.test(phoneNormalized)) {
      return this.formatError('رقم الجوال غير صحيح. يجب أن يكون بصيغة +966XXXXXXXXX.', 'Invalid phone format.');
    }

    // Rate limit: max 2 guest bookings per phone per day
    const todayStart = riyadhMidnight(riyadhNow().dateStr);
    const guestBookingsToday = await this.prisma.appointment.count({
      where: {
        orgId: this.orgId,
        bookedVia: { in: ['whatsapp', 'web'] },
        createdAt: { gte: todayStart },
        patient: {
          contacts: { some: { contactType: 'phone', contactValue: phoneNormalized } },
        },
      },
    });
    if (guestBookingsToday >= 2) {
      return this.formatError('تم الوصول للحد الأقصى للحجوزات اليوم. يرجى الاتصال بالعيادة.', 'Daily booking limit reached for this phone number.');
    }

    // Validate provider
    const provider = await this.prisma.provider.findFirst({
      where: { providerId, orgId: this.orgId, active: true },
      select: { displayName: true, providerId: true },
    });
    if (!provider) return this.formatError('الطبيب غير موجود.', 'Provider not found.');

    // Validate service
    const service = await this.prisma.service.findFirst({
      where: { serviceId, orgId: this.orgId, active: true },
      select: { name: true, serviceId: true, durationMin: true, bufferBeforeMin: true, bufferAfterMin: true },
    });
    if (!service) return this.formatError('الخدمة غير موجودة.', 'Service not found.');

    // Parse date/time (Riyadh local → UTC)
    const startTs = riyadhToUtc(date, time);
    if (isNaN(startTs.getTime())) return this.formatError('تاريخ أو وقت غير صحيح.', 'Invalid date/time.');
    if (startTs < new Date()) return this.formatError('لا يمكن الحجز في الماضي.', 'Cannot book in the past.');

    const endTs = new Date(startTs.getTime() + (service.durationMin || 30) * 60 * 1000);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Find or create patient by phone
        const existingContact = await tx.patientContact.findFirst({
          where: { contactType: 'phone', contactValue: phoneNormalized, patient: { orgId: this.orgId } },
          include: { patient: { select: { patientId: true, firstName: true, lastName: true } } },
        });

        let patientId: string;
        if (existingContact) {
          patientId = existingContact.patient.patientId;
        } else {
          const newPatient = await tx.patient.create({
            data: {
              orgId: this.orgId,
              firstName,
              lastName,
              dateOfBirth: null,
              contacts: {
                create: { contactType: 'phone', contactValue: phoneNormalized, isPrimary: true },
              },
            },
          });
          patientId = newPatient.patientId;
        }

        // Conflict check
        const bufferBefore = (service.bufferBeforeMin ?? 0) * 60 * 1000;
        const bufferAfter = (service.bufferAfterMin ?? 0) * 60 * 1000;
        const conflictStart = new Date(startTs.getTime() - bufferBefore);
        const conflictEnd = new Date(endTs.getTime() + bufferAfter);

        const conflict = await tx.appointment.findFirst({
          where: {
            providerId,
            status: { in: ['held', 'booked', 'confirmed'] },
            OR: [
              { startTs: { gte: conflictStart, lt: conflictEnd } },
              { endTs: { gt: conflictStart, lte: conflictEnd } },
              { AND: [{ startTs: { lte: conflictStart } }, { endTs: { gte: conflictEnd } }] },
            ],
          },
        });
        if (conflict) throw new Error('SLOT_CONFLICT');

        const facility = await tx.facility.findFirst({
          where: { orgId: this.orgId },
          select: { facilityId: true, name: true },
        });

        const appointment = await tx.appointment.create({
          data: {
            orgId: this.orgId,
            patientId,
            providerId,
            serviceId,
            facilityId: facility?.facilityId,
            startTs,
            endTs,
            status: 'booked',
            notes: notes as string || null,
            bookedVia: this.channel as any ?? 'whatsapp',
          },
          include: { facility: { select: { name: true } } },
        });

        return { appointment, patientId, facilityName: facility?.name };
      }, { isolationLevel: 'Serializable' });

      // Update the registry's patientId so subsequent tools work as identified
      this.patientId = result.patientId;

      // Link MessagingUser → new Patient for future conversations
      if (this.conversationId) {
        try {
          const conv = await this.prisma.conversation.findUnique({
            where: { conversationId: this.conversationId },
            select: { messagingUserId: true },
          });
          if (conv?.messagingUserId) {
            // Check if link already exists before creating
            const existingLink = await this.prisma.messagingUserPatientLink.findFirst({
              where: { messagingUserId: conv.messagingUserId, patientId: result.patientId },
            });
            if (!existingLink) {
              await this.prisma.messagingUserPatientLink.create({
                data: {
                  messagingUserId: conv.messagingUserId,
                  patientId: result.patientId,
                  relationship: 'self',
                  isDefault: true,
                },
              });
            }
            // Update current conversation to link the patient
            await this.prisma.conversation.update({
              where: { conversationId: this.conversationId },
              data: { patientId: result.patientId },
            });
          }
        } catch (_) { /* Non-critical — don't fail the booking */ }
      }

      const arGuestText =
        `✅ تم حجز الموعد بنجاح!\n` +
        `مرحباً ${firstName} ${lastName} — تم تسجيلك كمريض جديد.\n` +
        `الطبيب: ${provider.displayName}\n` +
        `الخدمة: ${service.name}\n` +
        `التاريخ: ${formatDateAr(startTs)}\n` +
        `الوقت: ${formatTimeSlot(startTs)}\n` +
        (result.facilityName ? `المكان: ${result.facilityName}` : '');
      return this.formatResponse(arGuestText, `Appointment booked for new patient ${firstName} ${lastName}! ID: ${result.appointment.appointmentId}`);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'SLOT_CONFLICT') {
        return this.formatError('هذا الموعد محجوز بالفعل.', 'This time slot is already booked.');
      }
      if (err instanceof Error && err.message === 'PATIENT_OVERLAP') {
        return 'Error: لديك موعد آخر في نفس الوقت. You already have another appointment at this time.';
      }
      throw err;
    }
  }

  private async execListAppointments(args: Record<string, unknown>): Promise<string> {
    if (!this.patientId) {
      return this.formatError('المريض غير محدد.', 'Patient not identified.');
    }

    const upcoming = args.upcoming !== false;
    const limit = Math.min((args.limit as number) || 5, 10);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientId: this.patientId,
        startTs: upcoming ? { gte: new Date() } : { lt: new Date() },
        status: upcoming
          ? { in: ['booked', 'confirmed'] }
          : { in: ['completed', 'cancelled', 'no_show'] },
      },
      include: {
        provider: { select: { displayName: true } },
        service: { select: { name: true } },
        facility: { select: { name: true } },
      },
      orderBy: { startTs: upcoming ? 'asc' : 'desc' },
      take: limit,
    });

    if (appointments.length === 0) {
      return upcoming
        ? this.formatResponse('لا توجد مواعيد قادمة.', 'No upcoming appointments.')
        : this.formatResponse('لا توجد مواعيد سابقة.', 'No past appointments.');
    }

    const header = upcoming
      ? `📅 ${this.label('المواعيد القادمة', 'Upcoming appointments')}:`
      : `📜 ${this.label('المواعيد السابقة', 'Past appointments')}:`;
    const lines = appointments.map(apt => {
      const date = formatDateAr(apt.startTs);
      const time = formatTimeSlot(apt.startTs);
      const statusAr: Record<string, string> = {
        booked: 'محجوز', confirmed: 'مؤكد', completed: 'مكتمل',
        cancelled: 'ملغي', no_show: 'لم يحضر',
      };
      const ref = this.appointmentRef(apt.appointmentId);
      const base =
        `• [موعد ${ref}] ${date} ${time}\n` +
        `  ${apt.service.name} مع ${apt.provider.displayName}\n` +
        `  ${apt.facility?.name ?? ''} — ${statusAr[apt.status] ?? apt.status}`;
      return this.isWhatsApp ? base : `${base}\n  ref: ${ref} (appointmentId: ${apt.appointmentId})`;
    });

    return `${header}\n\n${lines.join('\n\n')}`;
  }

  private async execCancelAppointment(args: Record<string, unknown>): Promise<string> {
    if (!this.patientId) {
      return this.formatError('المريض غير محدد.', 'Patient not identified.');
    }

    let appointmentId = args.appointmentId as string | undefined;
    // Sanitize reason to prevent LLM-generated injection into audit trail
    const reason = ((args.reason as string) || 'Cancelled via AI chat').slice(0, 200).replace(/[<>]/g, '');

    // Structural fail-safe: if the LLM forgot/skipped the appointmentId AND
    // the patient has exactly one upcoming appointment, auto-resolve to that
    // one. Prevents the "نسيت رقم الموعد" loop where the LLM keeps asking
    // patients for a UUID they don't have.
    if (!appointmentId) {
      const upcoming = await this.prisma.appointment.findMany({
        where: {
          patientId: this.patientId,
          orgId: this.orgId,
          status: { in: ['booked', 'confirmed'] },
          startTs: { gte: new Date() },
        },
        orderBy: { startTs: 'asc' },
        select: { appointmentId: true },
        take: 2,
      });
      if (upcoming.length === 1) {
        appointmentId = upcoming[0].appointmentId;
      } else if (upcoming.length === 0) {
        return this.formatError('لا توجد مواعيد قادمة لإلغائها.', 'No upcoming appointments to cancel.');
      } else {
        return this.formatError(
          'فيه أكثر من موعد قادم — استدعي list_patient_appointments لعرضها واطلبي من المريض يحدد أيهم بالتاريخ.',
          'Multiple upcoming appointments — call list_patient_appointments and ask the patient which one by date.',
        );
      }
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        appointmentId,
        patientId: this.patientId,
        orgId: this.orgId, // SECURITY: enforce org scope to prevent cross-org cancel
        status: { in: ['booked', 'confirmed'] },
      },
      include: {
        provider: { select: { displayName: true } },
        service: { select: { name: true } },
      },
    });

    if (!appointment) {
      return this.formatError('الموعد غير موجود أو لا يمكن إلغاؤه.', 'Appointment not found or cannot be cancelled.');
    }

    // Defense-in-depth: scope the write by orgId even though the preceding
    // findFirst already verified org ownership. updateMany is required because
    // Prisma's `update` only accepts unique-constraint where clauses.
    await this.prisma.appointment.updateMany({
      where: { appointmentId, orgId: this.orgId },
      data: {
        status: 'cancelled',
      },
    });

    // Track status history
    await this.prisma.appointmentStatusHistory.create({
      data: {
        appointmentId,
        oldStatus: appointment.status,
        newStatus: 'cancelled',
        changedBy: 'ai_chat',
        reason,
      },
    });

    const arCancelText =
      `✅ تم إلغاء الموعد بنجاح.\n` +
      `الطبيب: ${appointment.provider.displayName}\n` +
      `الخدمة: ${appointment.service.name}\n` +
      `التاريخ: ${formatDateAr(appointment.startTs)} ${formatTimeSlot(appointment.startTs)}`;
    return this.formatResponse(arCancelText, 'Appointment cancelled successfully.');
  }

  private async execSearchProviders(args: Record<string, unknown>): Promise<string> {
    const query = (args.query as string) || '';
    const departmentId = args.departmentId as string | undefined;

    const where: Record<string, unknown> = { orgId: this.orgId, active: true };
    if (departmentId) where.departmentId = departmentId;
    if (query) {
      where.OR = [
        { displayName: { contains: query, mode: 'insensitive' } },
        { credentials: { contains: query, mode: 'insensitive' } },
      ];
    }

    const providers = await this.prisma.provider.findMany({
      where,
      include: {
        department: { select: { name: true } },
        services: { include: { service: { select: { name: true } } } },
        availabilityRules: { select: { dayOfWeek: true, startLocal: true, endLocal: true } },
      },
      take: 10,
    });

    if (providers.length === 0) {
      return this.formatResponse('لم يتم العثور على أطباء.', 'No providers found.');
    }

    const lines = providers.map(p => {
      const services = p.services.map(s => s.service.name).join('، ');
      const days = [...new Set(p.availabilityRules.map(r => DAYS_AR[r.dayOfWeek] ?? ''))].join('، ');
      const ref = this.providerRef(p.providerId);
      return (
        `🩺 [طبيب ${ref}] ${p.displayName} ${p.credentials ?? ''}\n` +
        `   ref: ${ref} (providerId: ${p.providerId})\n` +
        (p.department ? `   القسم: ${p.department.name}\n` : '') +
        (services ? `   الخدمات: ${services}\n` : '') +
        (days ? `   أيام العمل: ${days}` : '')
      );
    });

    return `${this.label('الأطباء المتاحون', 'Available providers')}:\n\n${lines.join('\n\n')}`;
  }

  private async execListServices(args: Record<string, unknown>): Promise<string> {
    const where: Record<string, unknown> = { orgId: this.orgId, active: true };

    // If departmentId provided, filter to services offered by providers in that department
    if (args.departmentId) {
      const departmentServices = await this.prisma.providerService.findMany({
        where: { provider: { departmentId: args.departmentId as string, orgId: this.orgId } },
        select: { serviceId: true },
      });
      const serviceIds = [...new Set(departmentServices.map(ps => ps.serviceId))];
      if (serviceIds.length === 0) {
        return this.formatResponse('لا توجد خدمات متاحة لهذا القسم.', 'No services available for this department.');
      }
      where.serviceId = { in: serviceIds };
    }

    const services = await this.prisma.service.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    if (services.length === 0) {
      return this.formatResponse('لا توجد خدمات متاحة.', 'No services available.');
    }

    const lines = services.map(s => {
      const ref = this.serviceRef(s.serviceId);
      return (
        `• [خدمة ${ref}] ${s.name} (${s.durationMin} دقيقة)\n` +
        `  ref: ${ref} (serviceId: ${s.serviceId})`
      );
    });

    return `${this.label('الخدمات المتاحة', 'Available services')}:\n\n${lines.join('\n')}`;
  }

  private async execGetFacilityInfo(args: Record<string, unknown>): Promise<string> {
    const where: Record<string, unknown> = { orgId: this.orgId };
    if (args.facilityId) where.facilityId = args.facilityId;

    const facility = await this.prisma.facility.findFirst({ where });

    if (!facility) {
      return this.formatError('المنشأة غير موجودة.', 'Facility not found.');
    }

    let info = `🏥 ${facility.name}\n`;
    if (facility.addressLine1) {
      info += `📍 العنوان: ${facility.addressLine1}`;
      if (facility.addressLine2) info += `، ${facility.addressLine2}`;
      if (facility.city) info += `، ${facility.city}`;
      info += '\n';
    }
    if (facility.timezone) info += `🕐 المنطقة الزمنية: ${facility.timezone}\n`;

    // Business hours from config (separate query)
    const config = await this.prisma.facilityConfig.findFirst({
      where: { facilityId: facility.facilityId },
      select: { businessHours: true },
    });

    if (config?.businessHours) {
      const hours = config.businessHours as Record<string, { open?: string; close?: string }>;
      info += '\n⏰ ساعات العمل:\n';
      for (const [day, h] of Object.entries(hours)) {
        if (h.open && h.close) {
          info += `  ${day}: ${h.open} – ${h.close}\n`;
        }
      }
    }

    if (!this.isWhatsApp) info += `\nfacilityId: ${facility.facilityId}`;
    return info;
  }

  private async execTransferToHuman(args: Record<string, unknown>): Promise<string> {
    const reason = (args.reason as string) || 'Patient requested transfer';

    // Update conversation status to handoff (merge into existing context)
    if (this.conversationId) {
      const conversation = await this.prisma.conversation.findUnique({
        where: { conversationId: this.conversationId },
        select: { context: true },
      });
      const existingContext = (conversation?.context as Record<string, unknown>) ?? {};

      await this.prisma.conversation.update({
        where: { conversationId: this.conversationId },
        data: {
          status: 'handoff',
          context: {
            ...existingContext,
            handoffReason: reason,
            handoffAt: new Date().toISOString(),
            department: args.department || null,
          },
        },
      });

      // Create a handoff record
      await this.prisma.handoff.create({
        data: {
          conversationId: this.conversationId,
          reason,
          summary: reason,
          status: 'pending',
        },
      });
    }

    const arTransferText =
      `🔄 يتم تحويلك الآن لموظف خدمة العملاء.\n` +
      `سبب التحويل: ${reason}\n` +
      `سيتواصل معك أحد الموظفين في أقرب وقت.`;
    return this.formatResponse(arTransferText, `Transferring to human agent. Reason: ${reason}`);
  }

  // ── Browse Available Dates (next N days summary) ──────

  private async execBrowseAvailableDates(args: Record<string, unknown>): Promise<string> {
    const daysAhead = Math.min(Math.max((args.daysAhead as number) || 7, 1), 14);
    const rNow = riyadhNow();
    const today = riyadhMidnight(rNow.dateStr);

    const providerWhere: Record<string, unknown> = { orgId: this.orgId, active: true };
    if (args.providerId) providerWhere.providerId = args.providerId;
    if (args.departmentId) providerWhere.departmentId = args.departmentId;

    // Fetch providers once
    const providers = await this.prisma.provider.findMany({
      where: providerWhere,
      include: {
        availabilityRules: true,
        services: args.serviceId
          ? { where: { serviceId: args.serviceId as string }, include: { service: true } }
          : { include: { service: true } },
        department: { select: { name: true } },
        timeOff: {
          where: {
            startTs: { lte: new Date(today.getTime() + daysAhead * 86400000) },
            endTs: { gte: today },
          },
        },
      },
    });

    // If filtering by service, only keep providers who offer it
    const filteredProviders = args.serviceId
      ? providers.filter(p => p.services.length > 0)
      : providers;

    if (filteredProviders.length === 0) {
      return this.formatResponse('لا يوجد أطباء متاحين حالياً.', 'No providers available.');
    }

    // Get requested service duration for slot calculation
    let requestedService: { durationMin: number; bufferBeforeMin: number; bufferAfterMin: number } | null = null;
    if (args.serviceId) {
      requestedService = await this.prisma.service.findFirst({
        where: { serviceId: args.serviceId as string, orgId: this.orgId, active: true },
        select: { durationMin: true, bufferBeforeMin: true, bufferAfterMin: true },
      });
    }

    // Fetch all appointments for the date range
    const rangeEnd = new Date(today.getTime() + daysAhead * 86400000);
    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        orgId: this.orgId,
        startTs: { gte: today, lte: rangeEnd },
        status: { in: ['held', 'booked', 'confirmed', 'checked_in', 'in_progress'] },
        ...(args.providerId ? { providerId: args.providerId as string } : {}),
      },
      select: { providerId: true, startTs: true, endTs: true },
    });

    // Build booked ranges map (key by Riyadh date, not UTC date)
    const bookedByDateProvider = new Map<string, { start: number; end: number }[]>();
    for (const apt of existingAppointments) {
      const key = `${apt.providerId}:${utcToRiyadhDateStr(apt.startTs)}`;
      const ranges = bookedByDateProvider.get(key) || [];
      ranges.push({ start: apt.startTs.getTime(), end: apt.endTs.getTime() });
      bookedByDateProvider.set(key, ranges);
    }

    // Compressed working-hours header (e.g. "من الأحد إلى الخميس من 06:00 إلى 18:00").
    // Uses the shared clinicSchedule helper so the same text appears in the
    // greeting prompt and here — consistent patient-facing wording.
    const { getClinicSchedule } = await import('./clinicSchedule.js');
    const schedule = await getClinicSchedule(this.prisma, this.orgId);
    const workingDaysHeader = schedule.workingHoursAr
      ? `🕒 وقت العمل: ${schedule.workingHoursAr}\n`
      : '';

    const lines: string[] = [
      `📅 ${this.label('المواعيد المتاحة خلال الأيام القادمة', 'Available appointments in the coming days')}:`,
      workingDaysHeader,
    ];
    let hasAnySlots = false;

    // Iterate over Riyadh dates (use UTC-aligned base so toISOString gives correct date)
    const baseDate = new Date(Date.UTC(rNow.year, rNow.month - 1, rNow.day));
    for (let d = 0; d < daysAhead; d++) {
      const iterDate = new Date(baseDate.getTime() + d * 86400000);
      const dateStr = iterDate.toISOString().slice(0, 10);
      const dayOfWeek = riyadhDayOfWeek(dateStr);
      const date = riyadhMidnight(dateStr);

      let dayTotalSlots = 0;
      const dayProviderSummaries: string[] = [];

      for (const provider of filteredProviders) {
        // Skip providers on time-off
        const onLeave = provider.timeOff.some(
          to => to.startTs <= new Date(date.getTime() + 86400000) && to.endTs >= date,
        );
        if (onLeave) continue;

        const rules = provider.availabilityRules.filter(r => r.dayOfWeek === dayOfWeek);
        if (rules.length === 0) continue;

        const providerRanges = bookedByDateProvider.get(`${provider.providerId}:${dateStr}`) || [];
        let providerSlots = 0;

        for (const rule of rules) {
          const startH = rule.startLocal.getUTCHours();
          const startM = rule.startLocal.getUTCMinutes();
          const endH = rule.endLocal.getUTCHours();
          const endM = rule.endLocal.getUTCMinutes();

          const effectiveSlotMin = requestedService
            ? requestedService.durationMin + requestedService.bufferBeforeMin + requestedService.bufferAfterMin
            : null;
          const slotStepMin = Math.max(effectiveSlotMin ?? rule.slotIntervalMin ?? 30, 5);
          const slotDurationMin = requestedService ? Math.max(requestedService.durationMin, 5) : slotStepMin;
          const bufferBeforeMs = requestedService ? (requestedService.bufferBeforeMin ?? 0) * 60000 : 0;
          const bufferAfterMs = requestedService ? (requestedService.bufferAfterMin ?? 0) * 60000 : 0;

          let h = startH, m = startM;
          while (h < endH || (h === endH && m < endM)) {
            const slotStart = riyadhDateWithTime(dateStr, h, m);

            // Skip past slots for today
            if (d === 0 && slotStart <= new Date()) {
              m += slotStepMin;
              if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
              continue;
            }

            const slotEnd = new Date(slotStart.getTime() + slotDurationMin * 60000);
            const windowEnd = riyadhDateWithTime(dateStr, endH, endM);
            if (slotEnd > windowEnd) break;

            const conflictStart = new Date(slotStart.getTime() - bufferBeforeMs);
            const conflictEnd = new Date(slotEnd.getTime() + bufferAfterMs);
            const hasConflict = providerRanges.some(
              r => conflictStart.getTime() < r.end && conflictEnd.getTime() > r.start,
            );

            if (!hasConflict) providerSlots++;

            m += slotStepMin;
            if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
          }
        }

        if (providerSlots > 0) {
          const ref = this.providerRef(provider.providerId);
          dayProviderSummaries.push(`  🩺 [طبيب ${ref}] ${provider.displayName} (providerId: ${provider.providerId}) — ${providerSlots} موعد متاح`);
          dayTotalSlots += providerSlots;
        }
      }

      if (dayTotalSlots > 0) {
        hasAnySlots = true;
        lines.push(`📆 ${formatDateAr(date)} (${dateStr}):`);
        if (!this.isWhatsApp) {
          lines.push(`   ${this.label('إجمالي المواعيد المتاحة', 'Total available slots')}: ${dayTotalSlots}`);
        }
        for (const summary of dayProviderSummaries) {
          lines.push(summary);
        }
        lines.push('');
      }
    }

    if (!hasAnySlots) {
      return this.formatResponse(`لا توجد مواعيد متاحة خلال الـ ${daysAhead} أيام القادمة.`, `No available slots in the next ${daysAhead} days.`);
    }

    lines.push('💡 اختر اليوم المناسب وسأعرض لك الأوقات المتاحة بالتفصيل.');
    if (!this.isWhatsApp) lines.push('   Pick a day and I\'ll show you the exact available times.');

    return lines.join('\n');
  }

  // ── Phase 3: Hold Appointment ─────────────────────────

  private async execHoldAppointment(args: Record<string, unknown>): Promise<string> {
    if (!this.patientId) {
      return this.formatError('لا يمكن الحجز المؤقت بدون تحديد هوية المريض.', 'Patient not identified.');
    }

    const { providerId, serviceId, date, time } = args as {
      providerId: string; serviceId: string; date: string; time: string;
    };

    const provider = await this.prisma.provider.findFirst({
      where: { providerId, orgId: this.orgId, active: true },
      select: { displayName: true },
    });
    if (!provider) return this.formatError('الطبيب غير موجود.', 'Provider not found.');

    const service = await this.prisma.service.findFirst({
      where: { serviceId, orgId: this.orgId, active: true },
      select: { name: true, durationMin: true, bufferBeforeMin: true, bufferAfterMin: true },
    });
    if (!service) return this.formatError('الخدمة غير موجودة.', 'Service not found.');

    const startTs = riyadhToUtc(date, time);
    if (isNaN(startTs.getTime())) return this.formatError('تاريخ أو وقت غير صحيح.', 'Invalid date/time.');
    if (startTs < new Date()) return this.formatError('لا يمكن الحجز في الماضي.', 'Cannot hold in the past.');

    const endTs = new Date(startTs.getTime() + (service.durationMin || 30) * 60 * 1000);
    const holdExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    try {
      const appointment = await this.prisma.$transaction(async (tx) => {
        // Expand conflict window by buffer times (consistent with book_appointment)
        const bufferBefore = (service.bufferBeforeMin ?? 0) * 60 * 1000;
        const bufferAfter = (service.bufferAfterMin ?? 0) * 60 * 1000;
        const conflictStart = new Date(startTs.getTime() - bufferBefore);
        const conflictEnd = new Date(endTs.getTime() + bufferAfter);

        const conflict = await tx.appointment.findFirst({
          where: {
            providerId,
            status: { in: ['held', 'booked', 'confirmed'] },
            OR: [
              { startTs: { gte: conflictStart, lt: conflictEnd } },
              { endTs: { gt: conflictStart, lte: conflictEnd } },
              { AND: [{ startTs: { lte: conflictStart } }, { endTs: { gte: conflictEnd } }] },
            ],
          },
        });
        if (conflict) throw new Error('SLOT_CONFLICT');

        // Patient-side overlap check
        const patientOverlap = await tx.appointment.findFirst({
          where: {
            patientId: this.patientId!,
            status: { in: ['held', 'booked', 'confirmed'] },
            OR: [
              { startTs: { gte: startTs, lt: endTs } },
              { endTs: { gt: startTs, lte: endTs } },
              { AND: [{ startTs: { lte: startTs } }, { endTs: { gte: endTs } }] },
            ],
          },
        });
        if (patientOverlap) throw new Error('PATIENT_OVERLAP');

        return tx.appointment.create({
          data: {
            orgId: this.orgId,
            patientId: this.patientId!,
            providerId,
            serviceId,
            startTs,
            endTs,
            status: 'held',
            holdExpiresAt,
            bookedVia: this.channel as any ?? 'web',
          },
        });
      }, { isolationLevel: 'Serializable' });

      const arHoldText =
        `⏳ تم حجز الموعد مؤقتاً لمدة 10 دقائق.\n` +
        `الطبيب: ${provider.displayName}\n` +
        `الخدمة: ${service.name}\n` +
        `التاريخ: ${formatDateAr(startTs)} ${formatTimeSlot(startTs)}\n` +
        `appointmentId: ${appointment.appointmentId}`;
      return this.formatResponse(arHoldText, 'Slot held for 10 minutes. Confirm or it will be released.');
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'SLOT_CONFLICT') {
        return this.formatError('هذا الموعد محجوز بالفعل.', 'This time slot is already taken.');
      }
      if (err instanceof Error && err.message === 'PATIENT_OVERLAP') {
        return 'Error: لديك موعد آخر في نفس الوقت. You already have another appointment at this time.';
      }
      throw err;
    }
  }

  // ── Phase 3: Reschedule Appointment ───────────────────

  private async execRescheduleAppointment(args: Record<string, unknown>): Promise<string> {
    if (!this.patientId) {
      return this.formatError('المريض غير محدد.', 'Patient not identified.');
    }

    let { appointmentId } = args as { appointmentId?: string };
    const { newDate, newTime } = args as { newDate: string; newTime: string };

    // Structural fail-safe (same as cancel): auto-resolve when the LLM didn't
    // pass appointmentId but the patient has exactly one upcoming appointment.
    if (!appointmentId) {
      const upcoming = await this.prisma.appointment.findMany({
        where: {
          patientId: this.patientId,
          orgId: this.orgId,
          status: { in: ['booked', 'confirmed'] },
          startTs: { gte: new Date() },
        },
        orderBy: { startTs: 'asc' },
        select: { appointmentId: true },
        take: 2,
      });
      if (upcoming.length === 1) {
        appointmentId = upcoming[0].appointmentId;
      } else if (upcoming.length === 0) {
        return this.formatError('لا توجد مواعيد قادمة لإعادة جدولتها.', 'No upcoming appointments to reschedule.');
      } else {
        return this.formatError(
          'فيه أكثر من موعد قادم — استدعي list_patient_appointments لعرضها واطلبي من المريض يحدد أيهم بالتاريخ.',
          'Multiple upcoming appointments — call list_patient_appointments and ask the patient which one by date.',
        );
      }
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        appointmentId,
        orgId: this.orgId,
        patientId: this.patientId,
        status: { in: ['booked', 'confirmed'] },
      },
      include: {
        provider: { select: { displayName: true, providerId: true } },
        service: { select: { name: true, durationMin: true, bufferBeforeMin: true, bufferAfterMin: true } },
      },
    });

    if (!appointment) {
      return this.formatError('الموعد غير موجود أو لا يمكن إعادة جدولته.', 'Appointment not found or cannot be rescheduled.');
    }

    const newStartTs = riyadhToUtc(newDate, newTime);
    if (isNaN(newStartTs.getTime())) return 'Error: تاريخ أو وقت غير صحيح. Invalid date/time.';
    if (newStartTs < new Date()) return this.formatError('لا يمكن الحجز في الماضي.', 'Cannot reschedule to the past.');

    const newEndTs = new Date(newStartTs.getTime() + (appointment.service.durationMin || 30) * 60 * 1000);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Expand conflict window by buffer times (consistent with book_appointment)
        const bufferBefore = (appointment.service.bufferBeforeMin ?? 0) * 60 * 1000;
        const bufferAfter = (appointment.service.bufferAfterMin ?? 0) * 60 * 1000;
        const conflictStart = new Date(newStartTs.getTime() - bufferBefore);
        const conflictEnd = new Date(newEndTs.getTime() + bufferAfter);

        // Check new slot for conflicts (exclude current appointment)
        const conflict = await tx.appointment.findFirst({
          where: {
            providerId: appointment.provider.providerId,
            appointmentId: { not: appointmentId },
            status: { in: ['held', 'booked', 'confirmed'] },
            OR: [
              { startTs: { gte: conflictStart, lt: conflictEnd } },
              { endTs: { gt: conflictStart, lte: conflictEnd } },
              { AND: [{ startTs: { lte: conflictStart } }, { endTs: { gte: conflictEnd } }] },
            ],
          },
        });
        if (conflict) throw new Error('SLOT_CONFLICT');

        // Patient-side overlap check (exclude the appointment being rescheduled)
        const patientOverlap = await tx.appointment.findFirst({
          where: {
            patientId: this.patientId!,
            appointmentId: { not: appointmentId },
            status: { in: ['held', 'booked', 'confirmed'] },
            OR: [
              { startTs: { gte: newStartTs, lt: newEndTs } },
              { endTs: { gt: newStartTs, lte: newEndTs } },
              { AND: [{ startTs: { lte: newStartTs } }, { endTs: { gte: newEndTs } }] },
            ],
          },
        });
        if (patientOverlap) throw new Error('PATIENT_OVERLAP');

        // Update appointment atomically
        await tx.appointment.update({
          where: { appointmentId },
          data: { startTs: newStartTs, endTs: newEndTs },
        });

        // Record status history
        await tx.appointmentStatusHistory.create({
          data: {
            appointmentId,
            oldStatus: appointment.status,
            newStatus: appointment.status, // Status stays the same
            changedBy: 'ai_chat',
            reason: `Rescheduled from ${appointment.startTs.toISOString()} to ${newStartTs.toISOString()}`,
          },
        });
      }, { isolationLevel: 'Serializable' });

      const arRescheduleText =
        `✅ تم إعادة جدولة الموعد بنجاح!\n` +
        `الطبيب: ${appointment.provider.displayName}\n` +
        `الخدمة: ${appointment.service.name}\n` +
        `الموعد الجديد: ${formatDateAr(newStartTs)} ${formatTimeSlot(newStartTs)}\n` +
        `(كان: ${formatDateAr(appointment.startTs)} ${formatTimeSlot(appointment.startTs)})`;
      return this.formatResponse(arRescheduleText, 'Appointment rescheduled successfully!');
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'SLOT_CONFLICT') {
        return this.formatError('الموعد الجديد محجوز بالفعل.', 'The new time slot is already booked.');
      }
      if (err instanceof Error && err.message === 'PATIENT_OVERLAP') {
        return 'Error: لديك موعد آخر في نفس الوقت. You already have another appointment at this time.';
      }
      throw err;
    }
  }

  // ── New Tool Implementations ──────────────────────────

  private async execGetTodayDate(): Promise<string> {
    const rNow = riyadhNow();
    const dayAr = DAYS_AR[rNow.dayOfWeek] ?? '';
    const dayEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][rNow.dayOfWeek];

    return (
      `📅 التاريخ اليوم: ${rNow.dateStr} (${dayAr} / ${dayEn})\n` +
      `⏰ الوقت الحالي (السعودية): ${rNow.timeStr}`
    );
  }

  private async execListDepartments(): Promise<string> {
    const departments = await this.prisma.department.findMany({
      where: { orgId: this.orgId },
      orderBy: { name: 'asc' },
    });

    if (departments.length === 0) {
      return 'لا توجد أقسام. No departments found.';
    }

    // Count active providers per department
    const providerCounts = await this.prisma.provider.groupBy({
      by: ['departmentId'],
      where: { orgId: this.orgId, active: true },
      _count: { providerId: true },
    });
    const countMap = new Map(providerCounts.map(c => [c.departmentId, c._count.providerId]));

    const lines = departments.map(dept => {
      const count = countMap.get(dept.departmentId) ?? 0;
      const nameDisplay = (dept as any).nameAr || dept.name;
      return (
        `🏥 ${nameDisplay} (${count} ${count === 1 ? 'طبيب' : 'أطباء'})\n` +
        `   departmentId: ${dept.departmentId}`
      );
    });

    return `${this.label('أقسام المستشفى', 'Hospital departments')}:\n\n${lines.join('\n\n')}`;
  }

  private async execSearchFaq(args: Record<string, unknown>): Promise<string> {
    const query = (args.query as string) || '';
    const category = args.category as string | undefined;

    const where: Record<string, unknown> = { orgId: this.orgId, isActive: true };
    if (category) where.category = category;

    // Search by keyword across question and answer fields
    if (query) {
      where.OR = [
        { questionEn: { contains: query, mode: 'insensitive' } },
        { questionAr: { contains: query, mode: 'insensitive' } },
        { answerEn: { contains: query, mode: 'insensitive' } },
        { answerAr: { contains: query, mode: 'insensitive' } },
      ];
    }

    const faqs = await this.prisma.faqEntry.findMany({
      where,
      orderBy: { priority: 'desc' },
      take: 5,
    });

    if (faqs.length === 0) {
      return 'لم يتم العثور على إجابات. No FAQ entries found for this query.';
    }

    // Increment view counts (fire-and-forget)
    const faqIds = faqs.map(f => f.faqId);
    this.prisma.faqEntry.updateMany({
      where: { faqId: { in: faqIds } },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {});

    const lines = faqs.map((faq, i) => {
      const q = faq.questionAr || faq.questionEn;
      const a = faq.answerAr || faq.answerEn;
      return `❓ ${i + 1}. ${q}\n   ✅ ${a}`;
    });

    return `${this.label('الأسئلة الشائعة', 'Frequently Asked Questions')}:\n\n${lines.join('\n\n')}`;
  }

  private async execGetPatientInfo(): Promise<string> {
    if (!this.patientId) {
      return this.formatError('المريض غير محدد.', 'Patient not identified.');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { patientId: this.patientId },
      include: {
        contacts: {
          where: { isPrimary: true },
          take: 1,
        },
      },
    });

    if (!patient) {
      return 'Error: بيانات المريض غير موجودة. Patient record not found.';
    }

    let info = `👤 ${patient.firstName} ${patient.lastName}\n`;
    if (patient.mrn) info += `   رقم الملف: ${patient.mrn}\n`;

    const primaryContact = patient.contacts[0];
    if (primaryContact) {
      info += `   ${primaryContact.contactType === 'phone' ? '📱' : '📧'} ${primaryContact.contactValue}\n`;
    }

    return info;
  }
}
