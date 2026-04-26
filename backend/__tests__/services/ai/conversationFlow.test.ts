/**
 * Unit tests for ConversationFlowManager — the WhatsApp booking state machine.
 *
 * These are pure-logic tests: no DB, no LLM, no HTTP. They exercise the
 * state transitions and booking sub-step progression that drive every
 * WhatsApp appointment conversation. This is the safety net that prevents
 * prompt/tool refactors from silently breaking the booking funnel.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  ConversationFlowManager,
  type FlowContext,
  type ConversationState,
  type BookingContext,
} from '../../../src/services/ai/conversationFlow.js';

// State-machine methods do not touch prisma; constructor just stores the ref.
const prismaStub = {} as unknown as PrismaClient;

describe('ConversationFlowManager — state machine', () => {
  let fm: ConversationFlowManager;

  beforeEach(() => {
    fm = new ConversationFlowManager(prismaStub);
  });

  // ── initContext ──────────────────────────────────────────
  describe('initContext', () => {
    it('starts at the "start" state with empty stack', () => {
      const ctx = fm.initContext();
      expect(ctx.state).toBe('start');
      expect(ctx.stateStack).toEqual(['start']);
      expect(ctx.booking).toBeUndefined();
      expect(ctx.turnCount).toBe(0);
      expect(ctx.patientIdentified).toBe(false);
    });

    it('carries patientIdentified through to the context', () => {
      const ctx = fm.initContext(undefined, true);
      expect(ctx.patientIdentified).toBe(true);
    });

    it('preserves existing booking/stack when resuming', () => {
      const existing: Partial<FlowContext> = {
        state: 'booking',
        stateStack: ['booking', 'active'],
        booking: { step: 'time', serviceName: 'كشف عام' },
        turnCount: 5,
      };
      const ctx = fm.initContext(existing);
      expect(ctx.state).toBe('booking');
      expect(ctx.stateStack).toEqual(['booking', 'active']);
      expect(ctx.booking?.step).toBe('time');
      expect(ctx.turnCount).toBe(5);
    });
  });

  // ── detectIntentAndTransition: booking intents ───────────
  describe('detectIntentAndTransition — booking intents', () => {
    const bookingPhrases = [
      { msg: 'أبغى أحجز موعد', label: 'Arabic MSA "want to book"' },
      { msg: 'أبي موعد بكرة', label: 'Gulf dialect "أبي موعد"' },
      { msg: 'I want to book an appointment', label: 'English' },
      { msg: 'schedule a visit please', label: 'English "schedule"' },
      { msg: 'فيه مواعيد متاحة؟', label: 'Arabic "are slots available"' },
    ];

    for (const { msg, label } of bookingPhrases) {
      it(`enters booking state on: ${label}`, () => {
        const ctx = fm.initContext({ state: 'active', stateStack: ['active'] });
        const next = fm.detectIntentAndTransition('active', msg, [], ctx);
        expect(next.state).toBe('booking');
        expect(next.booking?.step).toBe('service');
      });
    }

    it('preserves booking context across turns while still in booking', () => {
      const ctx: FlowContext = {
        ...fm.initContext({ state: 'booking', stateStack: ['booking'] }),
        booking: { step: 'time', serviceName: 'كشف عام', date: '2026-05-01' },
      };
      const next = fm.detectIntentAndTransition('booking', 'تمام', [], ctx);
      expect(next.state).toBe('booking');
      expect(next.booking?.step).toBe('time');
      expect(next.booking?.serviceName).toBe('كشف عام');
    });
  });

  // ── detectIntentAndTransition: cancel, reschedule, handoff
  describe('detectIntentAndTransition — other intents', () => {
    it('enters cancelling state on Arabic cancel intent (without "موعد")', () => {
      const ctx = fm.initContext({ state: 'active', stateStack: ['active'] });
      // Note: must avoid the word "موعد" which also matches booking intent —
      // see "known ordering quirk" test below.
      const next = fm.detectIntentAndTransition('active', 'ابغى الغي', [], ctx);
      expect(next.state).toBe('cancelling');
    });

    it('pushes cancelling on top of booking (interruption)', () => {
      const ctx: FlowContext = {
        ...fm.initContext({ state: 'booking', stateStack: ['booking'] }),
        booking: { step: 'time' },
      };
      const next = fm.detectIntentAndTransition('booking', 'ابغى الغي', [], ctx);
      expect(next.state).toBe('cancelling');
      expect(next.stateStack).toEqual(['cancelling', 'booking']);
      // Suspended booking should still be present
      expect(next.booking?.step).toBe('time');
    });

    it('enters rescheduling on reschedule intent (without "موعد")', () => {
      const ctx = fm.initContext({ state: 'active', stateStack: ['active'] });
      // "أبي أأجل" = "I want to postpone" — doesn't contain "موعد"
      const next = fm.detectIntentAndTransition('active', 'أبي أأجل', [], ctx);
      expect(next.state).toBe('rescheduling');
    });

    it('inquiry about existing appointment stays in active state, not booking', () => {
      const ctx = fm.initContext({ state: 'active', stateStack: ['active'] });
      const phrases = [
        'هل عندي موعد',
        'وش موعدي',
        'متى موعدي',
        'اش وقت موعدي',
        'do I have an appointment?',
        'when is my appointment',
      ];
      for (const msg of phrases) {
        const fresh = fm.initContext({ state: 'active', stateStack: ['active'] });
        const next = fm.detectIntentAndTransition('active', msg, [], fresh);
        expect(next.state).toBe('active');
        expect(next.booking).toBeUndefined();
      }
    });

    // Documents a real ordering quirk: because BOOKING_INTENTS contains "موعد"
    // and is checked first, any cancel/reschedule phrase that also mentions
    // "موعد" (appointment) is swallowed by the booking branch. This test
    // pins current behavior so a future reorder is a deliberate decision.
    it('KNOWN QUIRK: cancel phrases containing "موعد" match booking first', () => {
      const ctx = fm.initContext({ state: 'active', stateStack: ['active'] });
      const next = fm.detectIntentAndTransition('active', 'أبغى ألغي الموعد', [], ctx);
      // TODO(dental-desk-lessons): the priority order should probably be
      // cancel > reschedule > booking so that explicit cancel phrases win.
      expect(next.state).toBe('booking');
    });

    it('enters handoff on human-handoff intent and locks the stack', () => {
      const ctx = fm.initContext({ state: 'active', stateStack: ['active'] });
      const next = fm.detectIntentAndTransition('active', 'أبغى أكلم شخص', [], ctx);
      expect(next.state).toBe('handoff');
      expect(next.stateStack).toEqual(['handoff']);
    });

    it('stays in handoff regardless of user intent', () => {
      const ctx = fm.initContext({ state: 'handoff', stateStack: ['handoff'] });
      const next = fm.detectIntentAndTransition('handoff', 'أبغى أحجز موعد', [], ctx);
      expect(next.state).toBe('handoff');
    });
  });

  // ── Tool-call-driven transitions ─────────────────────────
  describe('detectIntentAndTransition — tool-driven transitions', () => {
    it('book_appointment tool call returns to active and clears booking', () => {
      const ctx: FlowContext = {
        ...fm.initContext({ state: 'booking', stateStack: ['booking'] }),
        booking: { step: 'confirm', date: '2026-05-01', time: '10:00' },
      };
      const next = fm.detectIntentAndTransition('booking', 'تأكيد', ['book_appointment'], ctx);
      expect(next.state).toBe('active');
      expect(next.stateStack).toEqual(['active']);
      expect(next.booking).toBeUndefined();
      expect(next.lastCompletedAction).toBe('booking');
    });

    it('book_appointment_guest tool call also marks booking complete', () => {
      const ctx: FlowContext = {
        ...fm.initContext({ state: 'booking', stateStack: ['booking'] }),
        booking: { step: 'guest_info' },
      };
      const next = fm.detectIntentAndTransition('booking', 'محمد الحربي', ['book_appointment_guest'], ctx);
      expect(next.state).toBe('active');
      expect(next.booking).toBeUndefined();
      expect(next.lastCompletedAction).toBe('booking');
    });

    it('hold_appointment tool call moves booking step to confirm', () => {
      const ctx: FlowContext = {
        ...fm.initContext({ state: 'booking', stateStack: ['booking'], patientIdentified: true }, true),
        booking: { step: 'time', date: '2026-05-01' },
      };
      const next = fm.detectIntentAndTransition('booking', '10 صباحاً', ['hold_appointment'], ctx);
      expect(next.state).toBe('booking');
      expect(next.booking?.step).toBe('confirm');
    });

    it('cancel_appointment tool call records lastCompletedAction=cancellation', () => {
      const ctx = fm.initContext({ state: 'cancelling', stateStack: ['cancelling'] });
      const next = fm.detectIntentAndTransition('cancelling', 'تمام', ['cancel_appointment'], ctx);
      expect(next.state).toBe('active');
      expect(next.lastCompletedAction).toBe('cancellation');
    });

    it('transfer_to_human tool call forces handoff', () => {
      const ctx = fm.initContext({ state: 'active', stateStack: ['active'] });
      const next = fm.detectIntentAndTransition('active', 'اي شي', ['transfer_to_human'], ctx);
      expect(next.state).toBe('handoff');
    });
  });

  // ── Farewell & start-greeting edge cases ─────────────────
  describe('detectIntentAndTransition — farewell & greeting', () => {
    it('closes the conversation on "شكراً" from active', () => {
      const ctx = fm.initContext({ state: 'active', stateStack: ['active'] });
      const next = fm.detectIntentAndTransition('active', 'شكراً', [], ctx);
      expect(next.state).toBe('closed');
    });

    it('closes on short negative "لا" but NOT on "لاحقاً" (substring guard)', () => {
      const ctx = fm.initContext({ state: 'active', stateStack: ['active'] });

      const closedByNo = fm.detectIntentAndTransition('active', 'لا', [], ctx);
      expect(closedByNo.state).toBe('closed');

      // "لاحقاً" contains "لا" as substring but is not a farewell.
      // The short-negative set matches only exact-match, so "لاحقاً" must not close.
      const ctxFresh = fm.initContext({ state: 'active', stateStack: ['active'] });
      const notClosed = fm.detectIntentAndTransition('active', 'لاحقاً', [], ctxFresh);
      expect(notClosed.state).not.toBe('closed');
    });

    it('moves from start to greeting on Arabic greeting', () => {
      const ctx = fm.initContext();
      const next = fm.detectIntentAndTransition('start', 'السلام عليكم', [], ctx);
      expect(next.state).toBe('greeting');
    });

    it('moves from start to active on a non-greeting first message', () => {
      const ctx = fm.initContext();
      const next = fm.detectIntentAndTransition('start', 'كم التكلفة؟', [], ctx);
      // Not a booking/cancel/handoff intent and not a greeting keyword —
      // state machine should move start → active.
      expect(next.state).toBe('active');
    });
  });

  // ── updateBookingProgress: tool-arg-driven step changes ──
  describe('updateBookingProgress', () => {
    const baseCtx = (booking: BookingContext, patientIdentified = true): FlowContext => ({
      state: 'booking',
      stateStack: ['booking'],
      booking,
      subFlowId: null,
      subFlowHistory: [],
      turnCount: 1,
      maxTurns: 50,
      lastToolCalls: [],
      patientIdentified,
    });

    it('check_availability advances step to "time" and records date + valid UUID providerId', () => {
      const ctx = baseCtx({ step: 'date' });
      const PROVIDER_UUID = '47b554d1-d21b-4688-8ca8-53015dbcb55c';
      const next = fm.updateBookingProgress(
        ctx,
        ['check_availability'],
        [],
        [{ check_availability: { date: '2026-05-01', providerId: PROVIDER_UUID } }],
      );
      expect(next.booking?.step).toBe('time');
      expect(next.booking?.date).toBe('2026-05-01');
      expect(next.booking?.providerId).toBe(PROVIDER_UUID);
    });

    it('drops non-UUID IDs to prevent stale refs from poisoning later turns', () => {
      const ctx = baseCtx({ step: 'date' });
      const next = fm.updateBookingProgress(
        ctx,
        ['check_availability'],
        [],
        [{ check_availability: { date: '2026-05-01', providerId: '[طبيب 1]', serviceId: 'تنظيف أسنان' } }],
      );
      expect(next.booking?.providerId).toBeUndefined();
      expect(next.booking?.serviceId).toBeUndefined();
      // But the date is still persisted — it's not UUID-guarded
      expect(next.booking?.date).toBe('2026-05-01');
    });

    it('hold_appointment advances step to "confirm" and records time', () => {
      const ctx = baseCtx({ step: 'time', date: '2026-05-01' });
      const PROVIDER_UUID = '47b554d1-d21b-4688-8ca8-53015dbcb55c';
      const SERVICE_UUID = 'd5cd7907-bbc8-4332-86a4-105733a5d254';
      const next = fm.updateBookingProgress(
        ctx,
        ['hold_appointment'],
        ['appointmentId: abc-123'],
        [{ hold_appointment: { providerId: PROVIDER_UUID, serviceId: SERVICE_UUID, date: '2026-05-01', time: '10:00' } }],
      );
      expect(next.booking?.step).toBe('confirm');
      expect(next.booking?.time).toBe('10:00');
      expect(next.booking?.holdAppointmentId).toBe('abc-123');
    });

    it('anonymous patient at time step advances to guest_info when no tool called', () => {
      const ctx = baseCtx({ step: 'time', date: '2026-05-01' }, /*patientIdentified=*/false);
      // User is typing their selected time — no availability tool was called
      const next = fm.updateBookingProgress(ctx, [], [], []);
      expect(next.booking?.step).toBe('guest_info');
    });

    it('identified patient at time step does NOT auto-advance to guest_info', () => {
      const ctx = baseCtx({ step: 'time', date: '2026-05-01' }, /*patientIdentified=*/true);
      const next = fm.updateBookingProgress(ctx, [], [], []);
      expect(next.booking?.step).toBe('time');
    });

    it('book_appointment tool call clears booking context', () => {
      const ctx = baseCtx({ step: 'confirm', date: '2026-05-01', time: '10:00' });
      const next = fm.updateBookingProgress(
        ctx,
        ['book_appointment'],
        [],
        [{ book_appointment: { providerId: 'p', serviceId: 's', date: '2026-05-01', time: '10:00' } }],
      );
      expect(next.booking).toBeUndefined();
      expect(next.state).toBe('active');
    });

    it('is a no-op when state is not booking', () => {
      const ctx: FlowContext = {
        state: 'active',
        stateStack: ['active'],
        booking: undefined,
        subFlowId: null,
        subFlowHistory: [],
        turnCount: 1,
        maxTurns: 50,
        lastToolCalls: [],
        patientIdentified: true,
      };
      const next = fm.updateBookingProgress(ctx, ['list_services'], [], []);
      expect(next).toBe(ctx);
    });
  });

  // ── Turn budget ──────────────────────────────────────────
  describe('turn budget', () => {
    it('isBudgetExceeded returns false under the limit', () => {
      const ctx = fm.initContext({ turnCount: 49, maxTurns: 50 });
      expect(fm.isBudgetExceeded(ctx)).toBe(false);
    });

    it('isBudgetExceeded returns true at/over the limit', () => {
      const ctx = fm.initContext({ turnCount: 50, maxTurns: 50 });
      expect(fm.isBudgetExceeded(ctx)).toBe(true);
    });

    it('shouldWarnBudget returns true only in the warning band', () => {
      expect(fm.shouldWarnBudget(fm.initContext({ turnCount: 39, maxTurns: 50 }))).toBe(false);
      expect(fm.shouldWarnBudget(fm.initContext({ turnCount: 40, maxTurns: 50 }))).toBe(true);
      expect(fm.shouldWarnBudget(fm.initContext({ turnCount: 50, maxTurns: 50 }))).toBe(false);
    });
  });

  // ── Session snapshot & resume ────────────────────────────
  describe('createSnapshot + resumeFromSnapshot', () => {
    it('round-trips a mid-booking snapshot back into a booking context', () => {
      const original: FlowContext = {
        state: 'booking',
        stateStack: ['booking'],
        booking: { step: 'time', serviceName: 'أسنان', date: '2026-05-01', time: '14:00' },
        subFlowId: null,
        subFlowHistory: [],
        turnCount: 7,
        maxTurns: 50,
        lastToolCalls: ['check_availability'],
        patientIdentified: false,
        orgName: 'عيادة تجربة',
        patientName: 'سارة',
      };

      const snap = fm.createSnapshot(original);
      const { ctx, resumeSummary } = fm.resumeFromSnapshot(snap, /*patientIdentified=*/false);

      expect(ctx.state).toBe('booking');
      expect(ctx.booking?.step).toBe('time');
      expect(ctx.booking?.serviceName).toBe('أسنان');
      expect(ctx.orgName).toBe('عيادة تجربة');
      expect(resumeSummary).toContain('استكمال محادثة سابقة');
    });

    it('non-booking snapshot resumes into active state', () => {
      const ctx: FlowContext = {
        state: 'active',
        stateStack: ['active'],
        booking: undefined,
        subFlowId: null,
        subFlowHistory: [],
        turnCount: 3,
        maxTurns: 50,
        lastToolCalls: [],
        patientIdentified: true,
        patientName: 'أحمد',
      };
      const snap = fm.createSnapshot(ctx);
      const { ctx: resumed, resumeSummary } = fm.resumeFromSnapshot(snap, true);
      expect(resumed.state).toBe('active');
      expect(resumeSummary).toContain('أحمد');
    });
  });

  // ── Sub-flow tracking ────────────────────────────────────
  describe('startSubFlow + sealSubFlow', () => {
    it('assigns a subFlowId and fresh booking context on start', () => {
      const ctx = fm.initContext({ state: 'active', stateStack: ['active'] });
      const started = fm.startSubFlow(ctx, 'booking');
      expect(started.subFlowId).toMatch(/^sf-/);
      expect(started.booking).toEqual({ step: 'service' });
    });

    it('seals a sub-flow into history and clears booking', () => {
      const started = fm.startSubFlow(
        fm.initContext({ state: 'booking', stateStack: ['booking'] }),
        'booking',
      );
      const sealed = fm.sealSubFlow(started, 'حُجز كشف عام مع د. أحمد');
      expect(sealed.subFlowId).toBeNull();
      expect(sealed.booking).toBeUndefined();
      expect(sealed.subFlowHistory).toHaveLength(1);
      expect(sealed.subFlowHistory[0].outcome).toContain('كشف عام');
    });
  });

  // ── getStatePrompt: smoke-check that output reflects state
  describe('getStatePrompt', () => {
    const makeCtx = (overrides: Partial<FlowContext>): FlowContext => ({
      state: 'start',
      stateStack: ['start'],
      booking: undefined,
      subFlowId: null,
      subFlowHistory: [],
      turnCount: 0,
      maxTurns: 50,
      lastToolCalls: [],
      patientIdentified: false,
      ...overrides,
    });

    it('start/greeting prompts are delegated to systemPrompt.buildStateLayer', () => {
      // The conversationFlow greeting prompt is intentionally empty — the
      // real greeting content (departments list + working hours) is built
      // by systemPrompt.ts since it needs DB access. Here we just confirm
      // there's no conflicting legacy "don't list services" instruction.
      const prompt = fm.getStatePrompt(makeCtx({ state: 'start', orgName: 'عيادة النور' }));
      expect(prompt).not.toContain('⛔');
      expect(prompt).not.toContain('بداية جديدة');
    });

    it('start-state prompt surfaces the patient name when known', () => {
      const prompt = fm.getStatePrompt(makeCtx({ state: 'start', patientName: 'أحمد' }));
      expect(prompt).toContain('أحمد');
    });

    it('booking-state prompt mentions booking flow and the current step', () => {
      const prompt = fm.getStatePrompt(makeCtx({
        state: 'booking',
        booking: { step: 'date', serviceName: 'كشف عام' },
        patientIdentified: true,
      }));
      expect(prompt).toContain('حجز موعد');
      expect(prompt).toContain('كشف عام');
    });

    it('handoff-state prompt tells AI to stop helping', () => {
      const prompt = fm.getStatePrompt(makeCtx({ state: 'handoff' }));
      expect(prompt).toContain('transfer_to_human');
    });

    it('warns about turn budget when in the warning band', () => {
      const prompt = fm.getStatePrompt(makeCtx({ state: 'active', stateStack: ['active'], turnCount: 45 }));
      expect(prompt).toContain('طويلة');
    });

    it('anonymous patient sees a warning about identity-restricted tools', () => {
      const prompt = fm.getStatePrompt(makeCtx({ state: 'active', stateStack: ['active'], patientIdentified: false }));
      expect(prompt).toContain('book_appointment_guest');
    });
  });

  // ── Idempotency / immutability sanity checks ─────────────
  describe('immutability', () => {
    it('detectIntentAndTransition returns a new context (does not mutate input)', () => {
      const ctx = fm.initContext({ state: 'active', stateStack: ['active'] });
      const frozen = Object.freeze({ ...ctx, stateStack: [...ctx.stateStack] });
      // Should not throw even when the input is frozen
      const next = fm.detectIntentAndTransition('active', 'أبغى أحجز موعد', [], frozen as FlowContext);
      expect(next.state).toBe('booking');
      // Original turn count unchanged
      expect(frozen.turnCount).toBe(0);
      // New context has advanced turn count
      expect(next.turnCount).toBe(1);
    });
  });
});
