// Strip patient-level PII from an audit-log `details` JSON before returning
// it through a cross-org admin endpoint. Keeps the structure intact so the UI
// can still render the action shape.
const REDACTED_KEYS = new Set([
  'patientId',
  'patient_id',
  'conversationId',
  'conversation_id',
  'args',
  'phone',
  'phoneNumber',
  'phone_number',
  'email',
  'nationalId',
  'national_id',
  'dob',
  'dateOfBirth',
  'date_of_birth',
]);

export function redactAuditDetails(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactAuditDetails);
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(k)) {
      out[k] = '[redacted]';
    } else {
      out[k] = redactAuditDetails(v);
    }
  }
  return out;
}
