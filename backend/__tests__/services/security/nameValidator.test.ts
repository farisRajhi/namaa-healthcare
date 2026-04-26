import { describe, it, expect } from 'vitest';
import { validatePatientName } from '../../../src/services/security/nameValidator.js';

describe('validatePatientName', () => {
  describe('rejects greetings', () => {
    it('rejects "السلام عليكم" split as first/last', () => {
      const r = validatePatientName('السلام', 'عليكم');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('greeting');
    });

    it('rejects reversed greeting "وعليكم السلام"', () => {
      const r = validatePatientName('وعليكم', 'السلام');
      expect(r.ok).toBe(false);
    });

    it('rejects "صباح الخير"', () => {
      const r = validatePatientName('صباح', 'الخير');
      expect(r.ok).toBe(false);
    });

    it('rejects "مساء الخير"', () => {
      const r = validatePatientName('مساء', 'الخير');
      expect(r.ok).toBe(false);
    });

    it('rejects English "hello there"', () => {
      const r = validatePatientName('hello', 'there');
      expect(r.ok).toBe(false);
    });

    it('rejects "Hi Khan" (case-insensitive)', () => {
      const r = validatePatientName('Hi', 'Khan');
      expect(r.ok).toBe(false);
    });

    it('rejects greeting with diacritics ("السَّلام عليكم")', () => {
      const r = validatePatientName('السَّلام', 'عليكم');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('greeting');
    });
  });

  describe('rejects invalid input', () => {
    it('rejects single-letter parts', () => {
      const r = validatePatientName('A', 'Khan');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('too_short');
    });

    it('rejects empty strings', () => {
      const r = validatePatientName('  ', 'Khan');
      expect(r.ok).toBe(false);
    });

    it('rejects names containing digits', () => {
      const r = validatePatientName('Ahmed1', 'Khan');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('invalid_chars');
    });

    it('rejects names containing Arabic-Indic digits', () => {
      const r = validatePatientName('أحمد', 'الخان٢');
      expect(r.ok).toBe(false);
    });

    it('rejects names with punctuation', () => {
      const r = validatePatientName('Ahmed?', 'Khan');
      expect(r.ok).toBe(false);
    });

    it('rejects non-string input', () => {
      const r = validatePatientName(undefined as unknown as string, 'Khan');
      expect(r.ok).toBe(false);
    });
  });

  describe('accepts real names', () => {
    it('accepts "محمد العتيبي"', () => {
      expect(validatePatientName('محمد', 'العتيبي').ok).toBe(true);
    });

    it('accepts "Ahmed Khan"', () => {
      expect(validatePatientName('Ahmed', 'Khan').ok).toBe(true);
    });

    it('accepts compound last names with space', () => {
      expect(validatePatientName('فاطمة', 'آل سعود').ok).toBe(true);
    });

    it('accepts hyphenated names', () => {
      expect(validatePatientName('Mary-Anne', 'Smith').ok).toBe(true);
    });
  });
});
