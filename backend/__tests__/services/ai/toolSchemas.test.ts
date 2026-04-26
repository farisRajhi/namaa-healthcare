/**
 * Unit tests for tool-arg Zod validation.
 *
 * Lesson 2 hardening: before this layer existed, a malformed LLM tool call
 * (e.g. missing phone, wrong date format) crashed deep inside a DB query.
 * Now validation catches the problem up front and returns an Arabic+English
 * error the LLM can recover from. These tests pin that contract.
 */

import { describe, it, expect } from 'vitest';
import { validateToolArgs } from '../../../src/services/ai/toolSchemas.js';

describe('validateToolArgs', () => {
  // ── book_appointment_guest (the most error-prone one) ────
  describe('book_appointment_guest', () => {
    const validArgs = {
      firstName: 'محمد',
      lastName: 'الحربي',
      phone: '+966501234567',
      providerId: '7a0c3b00-1111-2222-3333-444455556666',
      serviceId: '7a0c3b00-aaaa-bbbb-cccc-ddddeeeeffff',
      date: '2026-05-01',
      time: '10:00',
    };

    it('accepts well-formed args', () => {
      const r = validateToolArgs('book_appointment_guest', validArgs);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.firstName).toBe('محمد');
        expect(r.data.phone).toBe('+966501234567');
      }
    });

    it('strips "whatsapp:" prefix from phone', () => {
      const r = validateToolArgs('book_appointment_guest', {
        ...validArgs,
        phone: 'whatsapp:+966501234567',
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.phone).toBe('+966501234567');
    });

    it('rejects missing phone with a field-specific message', () => {
      const { phone, ...rest } = validArgs;
      const r = validateToolArgs('book_appointment_guest', rest);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.message).toContain('phone');
        // Bilingual recovery guidance
        expect(r.message.toLowerCase()).toContain('tool');
        expect(r.message).toContain('book_appointment_guest');
      }
    });

    it('rejects missing firstName AND lastName together', () => {
      const { firstName, lastName, ...rest } = validArgs;
      const r = validateToolArgs('book_appointment_guest', rest);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.message).toContain('firstName');
        expect(r.message).toContain('lastName');
      }
    });

    it('rejects date with wrong format (slashes)', () => {
      const r = validateToolArgs('book_appointment_guest', {
        ...validArgs,
        date: '2026/05/01',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.message).toContain('date');
        expect(r.message).toContain('YYYY-MM-DD');
      }
    });

    it('rejects time with wrong format (12h with suffix)', () => {
      const r = validateToolArgs('book_appointment_guest', {
        ...validArgs,
        time: '10:00 AM',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain('time');
    });

    it('rejects phone that is clearly not a phone number', () => {
      const r = validateToolArgs('book_appointment_guest', {
        ...validArgs,
        phone: 'not-a-phone',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain('phone');
    });

    it('rejects empty firstName string', () => {
      const r = validateToolArgs('book_appointment_guest', {
        ...validArgs,
        firstName: '   ',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain('firstName');
    });
  });

  // ── book_appointment (identified patient path) ───────────
  describe('book_appointment', () => {
    const validArgs = {
      providerId: 'prov-uuid',
      serviceId: 'svc-uuid',
      date: '2026-05-01',
      time: '10:00',
    };

    it('accepts minimum required fields', () => {
      const r = validateToolArgs('book_appointment', validArgs);
      expect(r.ok).toBe(true);
    });

    it('accepts optional holdAppointmentId and notes', () => {
      const r = validateToolArgs('book_appointment', {
        ...validArgs,
        holdAppointmentId: 'hold-uuid',
        notes: 'مراجعة متابعة',
      });
      expect(r.ok).toBe(true);
    });

    it('rejects when providerId is missing', () => {
      const { providerId, ...rest } = validArgs;
      const r = validateToolArgs('book_appointment', rest);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain('providerId');
    });
  });

  // ── hold_appointment ─────────────────────────────────────
  describe('hold_appointment', () => {
    it('requires provider/service/date/time', () => {
      const r = validateToolArgs('hold_appointment', { date: '2026-05-01' });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.message).toContain('providerId');
        expect(r.message).toContain('serviceId');
        expect(r.message).toContain('time');
      }
    });
  });

  // ── cancel_appointment ───────────────────────────────────
  describe('cancel_appointment', () => {
    it('accepts empty args — tool auto-resolves to single upcoming appointment', () => {
      const r = validateToolArgs('cancel_appointment', {});
      expect(r.ok).toBe(true);
    });

    it('accepts appointmentId + optional reason', () => {
      const r = validateToolArgs('cancel_appointment', {
        appointmentId: 'appt-uuid',
        reason: 'المريض غير راغب',
      });
      expect(r.ok).toBe(true);
    });
  });

  // ── reschedule_appointment ───────────────────────────────
  describe('reschedule_appointment', () => {
    it('still requires newDate and newTime even when appointmentId is omitted', () => {
      const r = validateToolArgs('reschedule_appointment', {});
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.message).toContain('newDate');
        expect(r.message).toContain('newTime');
      }
    });

    it('accepts call with appointmentId omitted (tool auto-resolves)', () => {
      const r = validateToolArgs('reschedule_appointment', {
        newDate: '2026-05-01',
        newTime: '13:00',
      });
      expect(r.ok).toBe(true);
    });
  });

  // ── check_availability ───────────────────────────────────
  describe('check_availability', () => {
    it('requires only a date; provider/service are optional', () => {
      const r = validateToolArgs('check_availability', { date: '2026-05-01' });
      expect(r.ok).toBe(true);
    });

    it('rejects a missing date', () => {
      const r = validateToolArgs('check_availability', {});
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain('date');
    });
  });

  // ── Unregistered tools fall through ──────────────────────
  describe('unregistered tools', () => {
    it('list_services passes through unchanged (no schema registered)', () => {
      const args = { departmentId: 'dept-1' };
      const r = validateToolArgs('list_services', args);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toEqual(args);
    });

    it('get_today_date passes through unchanged', () => {
      const r = validateToolArgs('get_today_date', {});
      expect(r.ok).toBe(true);
    });

    it('an entirely unknown tool name still passes through', () => {
      const r = validateToolArgs('some_future_tool', { x: 1 });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toEqual({ x: 1 });
    });
  });

  // ── Error-message shape ──────────────────────────────────
  describe('error message shape', () => {
    it('includes both Arabic and English recovery guidance', () => {
      const r = validateToolArgs('book_appointment_guest', {});
      expect(r.ok).toBe(false);
      if (!r.ok) {
        // Arabic instruction to ask the patient for missing data
        expect(r.message).toContain('المريض');
        // English instruction for the LLM
        expect(r.message.toLowerCase()).toContain('ask the user');
      }
    });

    it('lists every missing field (not just the first)', () => {
      const r = validateToolArgs('book_appointment_guest', {});
      expect(r.ok).toBe(false);
      if (!r.ok) {
        // All seven required fields should be mentioned
        expect(r.message).toContain('firstName');
        expect(r.message).toContain('lastName');
        expect(r.message).toContain('phone');
        expect(r.message).toContain('providerId');
        expect(r.message).toContain('serviceId');
        expect(r.message).toContain('date');
        expect(r.message).toContain('time');
      }
    });
  });
});
