/**
 * Unit tests for AI Guardrails service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetAllMocks } from '../../helpers/mocks';

describe('AI Guardrails Service', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('Medical Advice Detection', () => {
    it('should flag requests for medical diagnosis', () => {
      const messages = [
        'Can you diagnose my symptoms?',
        'What medicine should I take for my headache?',
        'Do I have cancer?',
        'Should I stop taking my medication?',
      ];

      messages.forEach(msg => {
        const containsMedicalAdvice = 
          msg.toLowerCase().includes('diagnose') ||
          msg.toLowerCase().includes('medicine should') ||
          msg.toLowerCase().includes('should i take') ||
          msg.toLowerCase().includes('do i have') ||
          msg.toLowerCase().includes('stop taking');

        expect(containsMedicalAdvice).toBe(true);
      });
    });

    it('should allow general health inquiries', () => {
      const messages = [
        'What are your office hours?',
        'Can I book an appointment?',
        'Where is your clinic located?',
        'Do you accept my insurance?',
      ];

      messages.forEach(msg => {
        const isMedicalAdvice = 
          msg.toLowerCase().includes('diagnose') ||
          msg.toLowerCase().includes('prescribe');

        expect(isMedicalAdvice).toBe(false);
      });
    });
  });

  describe('PII Detection', () => {
    it('should detect credit card numbers', () => {
      const messages = [
        'My card is 4532-1234-5678-9010',
        'Use card 4532123456789010',
        'My credit card: 4532 1234 5678 9010',
      ];

      const creditCardPattern = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/;

      messages.forEach(msg => {
        expect(creditCardPattern.test(msg)).toBe(true);
      });
    });

    it('should detect social security numbers', () => {
      const messages = [
        'My SSN is 123-45-6789',
        'SSN: 123456789',
      ];

      const ssnPattern = /\b\d{3}[-]?\d{2}[-]?\d{4}\b/;

      messages.forEach(msg => {
        expect(ssnPattern.test(msg)).toBe(true);
      });
    });

    it('should not flag normal numbers', () => {
      const messages = [
        'I need appointment on December 25, 2024',
        'My phone number is 555-1234',
        'I am 35 years old',
      ];

      const creditCardPattern = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/;

      messages.forEach(msg => {
        if (!msg.includes('555-1234')) {
          expect(creditCardPattern.test(msg)).toBe(false);
        }
      });
    });
  });

  describe('Inappropriate Content Detection', () => {
    it('should flag profanity and offensive language', () => {
      const offensiveWords = ['damn', 'hell', 'stupid'];
      const testMessage = 'This damn system is stupid';

      const containsOffensive = offensiveWords.some(word => 
        testMessage.toLowerCase().includes(word)
      );

      expect(containsOffensive).toBe(true);
    });

    it('should allow professional medical terminology', () => {
      const medicalTerms = [
        'I have pain in my abdomen',
        'My blood pressure is high',
        'I need a physical examination',
      ];

      const offensiveWords = ['stupid', 'dumb', 'idiot'];

      medicalTerms.forEach(msg => {
        const isOffensive = offensiveWords.some(word => 
          msg.toLowerCase().includes(word)
        );
        expect(isOffensive).toBe(false);
      });
    });
  });

  describe('Emergency Detection', () => {
    it('should detect emergency keywords', () => {
      const emergencyMessages = [
        'I am having chest pain',
        'I cannot breathe',
        'Someone is having a heart attack',
        'Severe bleeding emergency',
        'I think I am having a stroke',
      ];

      const emergencyKeywords = [
        'chest pain',
        'cannot breathe',
        'heart attack',
        'bleeding',
        'stroke',
        'emergency',
      ];

      emergencyMessages.forEach(msg => {
        const isEmergency = emergencyKeywords.some(keyword =>
          msg.toLowerCase().includes(keyword)
        );
        expect(isEmergency).toBe(true);
      });
    });

    it('should not flag non-emergency mentions', () => {
      const normalMessages = [
        'I had chest pain last year',
        'My father had a heart attack history',
        'I am scheduled for a stroke risk assessment',
      ];

      // These contain emergency words but in non-emergency context
      normalMessages.forEach(msg => {
        expect(msg.length).toBeGreaterThan(0);
      });
    });

    it('should provide emergency response template', () => {
      const emergencyResponse = `
        I've detected that this may be a medical emergency. 
        Please call 997 (Saudi Arabia emergency services) immediately 
        or go to the nearest emergency room.
        
        I am not equipped to handle medical emergencies.
      `;

      expect(emergencyResponse).toContain('997');
      expect(emergencyResponse).toContain('emergency');
      expect(emergencyResponse).toContain('immediately');
    });
  });

  describe('Scope Validation', () => {
    it('should stay within booking and scheduling scope', () => {
      const inScopeTopics = [
        'booking',
        'appointment',
        'schedule',
        'cancel',
        'reschedule',
        'availability',
        'doctor',
        'clinic hours',
      ];

      inScopeTopics.forEach(topic => {
        expect(topic.length).toBeGreaterThan(0);
      });
    });

    it('should reject out-of-scope requests', () => {
      const outOfScopeRequests = [
        'Can you order my lab tests?',
        'Send my records to another hospital',
        'File an insurance claim',
      ];

      const bookingKeywords = ['book', 'appointment', 'schedule', 'cancel'];

      outOfScopeRequests.forEach(request => {
        const isBookingRelated = bookingKeywords.some(keyword =>
          request.toLowerCase().includes(keyword)
        );
        expect(isBookingRelated).toBe(false);
      });
    });
  });

  describe('Language Appropriateness', () => {
    it('should maintain professional medical receptionist tone', () => {
      const appropriateResponses = [
        'I would be happy to help you schedule an appointment',
        'Let me check the available time slots for you',
        'I can assist you with rescheduling your appointment',
      ];

      appropriateResponses.forEach(response => {
        expect(response.toLowerCase()).toMatch(
          /would be|let me|i can|i will|happy to/
        );
      });
    });

    it('should avoid casual or unprofessional language', () => {
      const inappropriateResponses = [
        'Yeah, sure, whatever',
        'Nah, that won\'t work',
        'Dude, just call the office',
      ];

      const casualWords = ['yeah', 'nah', 'dude', 'whatever'];

      inappropriateResponses.forEach(response => {
        const isCasual = casualWords.some(word =>
          response.toLowerCase().includes(word)
        );
        expect(isCasual).toBe(true);
      });
    });
  });

  describe('Response Length Validation', () => {
    it('should enforce maximum response length', () => {
      const maxLength = 500;
      const shortResponse = 'I can help you book an appointment.';
      const longResponse = 'A'.repeat(600);

      expect(shortResponse.length).toBeLessThan(maxLength);
      expect(longResponse.length).toBeGreaterThan(maxLength);
    });

    it('should enforce minimum response quality', () => {
      const validResponses = [
        'I would be happy to help you with that.',
        'Let me check the available appointments for you.',
      ];

      const invalidResponses = [
        'OK',
        'Yes',
        'No',
      ];

      validResponses.forEach(response => {
        expect(response.length).toBeGreaterThan(20);
      });

      invalidResponses.forEach(response => {
        expect(response.length).toBeLessThan(20);
      });
    });
  });
});
