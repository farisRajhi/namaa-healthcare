/**
 * Zod schemas for AI tool arguments.
 *
 * Lesson 2 from the DentalDesk analysis: let strong tool contracts do the
 * teaching instead of parsing message history with regex. When the LLM calls
 * a booking tool with missing/invalid args, we reject it cleanly and return
 * an Arabic+English error the LLM can act on ("I still need your last name").
 *
 * Only the high-risk booking tools are covered here. Other tools fall through
 * to the existing behavior — we can widen coverage incrementally.
 */

import { z } from 'zod';

// ── Field-level primitives ───────────────────────────────

const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const TimeStr = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM (24h) format');

// Saudi E.164 phone (what WhatsApp always gives us) — tolerant of a leading
// "whatsapp:" prefix and spaces that LLMs occasionally re-emit.
const PhoneStr = z
  .string()
  .transform(s => s.replace(/^whatsapp:/i, '').replace(/\s+/g, ''))
  .pipe(
    z.string().regex(
      /^\+?\d{9,15}$/,
      'Phone must be digits in international format (e.g. +9665XXXXXXXX)',
    ),
  );

// UUIDs are resolved from reference numbers in the registry. By the time we
// validate, we accept either a UUID or a non-empty opaque string (the ref
// resolver may have left a placeholder that the tool-specific logic handles).
const IdStr = z.string().min(1, 'ID must not be empty');

const NameStr = z
  .string()
  .trim()
  .min(1, 'Name must not be empty')
  .max(60, 'Name is unexpectedly long');

// ── Per-tool schemas ─────────────────────────────────────

// Sanitize free-text fields the LLM might forward — strip angle brackets so
// nothing the patient said becomes injected markup in audit/notes surfaces.
// Mirrors the inline sanitizer at toolRegistry.ts cancel_appointment.reason.
const NotesStr = z
  .string()
  .max(500)
  .transform(s => s.replace(/[<>]/g, ''));

export const BookAppointmentSchema = z.object({
  providerId: IdStr,
  serviceId: IdStr,
  date: DateStr,
  time: TimeStr,
  notes: NotesStr.optional(),
  holdAppointmentId: z.string().optional(),
});

export const BookAppointmentGuestSchema = z.object({
  firstName: NameStr,
  lastName: NameStr,
  phone: PhoneStr,
  providerId: IdStr,
  serviceId: IdStr,
  date: DateStr,
  time: TimeStr,
  notes: NotesStr.optional(),
});

export const HoldAppointmentSchema = z.object({
  providerId: IdStr,
  serviceId: IdStr,
  date: DateStr,
  time: TimeStr,
});

export const CancelAppointmentSchema = z.object({
  // Optional — when omitted, the tool auto-resolves to the patient's single
  // upcoming appointment. Required only when there's more than one.
  appointmentId: IdStr.optional(),
  reason: z.string().max(500).optional(),
});

export const RescheduleAppointmentSchema = z.object({
  // Optional — when omitted, the tool auto-resolves to the patient's single
  // upcoming appointment. Required only when there's more than one.
  appointmentId: IdStr.optional(),
  newDate: DateStr,
  newTime: TimeStr,
});

export const CheckAvailabilitySchema = z.object({
  date: DateStr,
  providerId: IdStr.optional(),
  serviceId: IdStr.optional(),
  departmentId: IdStr.optional(),
});

// ── Registry: only listed tools are validated ────────────

const SCHEMAS: Record<string, z.ZodTypeAny> = {
  book_appointment: BookAppointmentSchema,
  book_appointment_guest: BookAppointmentGuestSchema,
  hold_appointment: HoldAppointmentSchema,
  cancel_appointment: CancelAppointmentSchema,
  reschedule_appointment: RescheduleAppointmentSchema,
  check_availability: CheckAvailabilitySchema,
};

// ── Public API ───────────────────────────────────────────

export type ValidateResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; message: string };

/**
 * Validate tool args against the registered schema. Returns a success
 * result with parsed data, or a bilingual error message the LLM can
 * surface/recover from.
 *
 * If no schema exists for the tool, returns ok with the args unchanged —
 * existing behavior is preserved for unvalidated tools.
 */
export function validateToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): ValidateResult {
  const schema = SCHEMAS[toolName];
  if (!schema) return { ok: true, data: args };

  const parsed = schema.safeParse(args);
  if (parsed.success) {
    return { ok: true, data: parsed.data as Record<string, unknown> };
  }

  return { ok: false, message: formatZodError(toolName, parsed.error) };
}

/**
 * Build an LLM-recoverable bilingual error string from a ZodError.
 * The message lists the specific fields and what's wrong, so the AI's
 * next turn can ask the user for exactly what's missing.
 */
function formatZodError(toolName: string, err: z.ZodError): string {
  const issues = err.issues.map(i => {
    const field = i.path.join('.') || '(root)';
    return `- ${field}: ${i.message}`;
  });

  const issueList = issues.join('\n');

  return [
    '⚠️ خطأ في بيانات الحجز — لا يمكن تنفيذ الأداة.',
    `Tool: ${toolName}`,
    '',
    'المشاكل / Issues:',
    issueList,
    '',
    'اطلبي من المريض البيانات المفقودة بلطف ثم أعيدي المحاولة.',
    'Ask the user for the missing/invalid fields, then retry the tool call.',
  ].join('\n');
}
