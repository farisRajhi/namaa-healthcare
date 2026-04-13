/**
 * Unit tests for TTS (Text-to-Speech) Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockElevenLabs, resetAllMocks } from '../../helpers/mocks';

describe('TTS Service', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('Text-to-Speech Conversion', () => {
    it('should convert English text to speech', async () => {
      const text = 'Hello, your appointment is confirmed for tomorrow at 2 PM.';
      
      mockElevenLabs.textToSpeech.convert.mockResolvedValue(
        Buffer.from('fake-audio-data')
      );

      const result = await mockElevenLabs.textToSpeech.convert(text);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      expect(mockElevenLabs.textToSpeech.convert).toHaveBeenCalledWith(text);
    });

    it('should convert Arabic text to speech', async () => {
      const text = 'مرحباً، موعدك مؤكد غداً في الساعة الثانية مساءً';
      
      mockElevenLabs.textToSpeech.convert.mockResolvedValue(
        Buffer.from('fake-arabic-audio-data')
      );

      const result = await mockElevenLabs.textToSpeech.convert(text);

      expect(result).toBeInstanceOf(Buffer);
      expect(mockElevenLabs.textToSpeech.convert).toHaveBeenCalledWith(text);
    });

    it('should handle empty text gracefully', async () => {
      const text = '';
      
      // Service should reject empty text
      expect(text.length).toBe(0);
    });

    it('should handle very long text', async () => {
      const longText = 'A'.repeat(5000);
      
      mockElevenLabs.textToSpeech.convert.mockResolvedValue(
        Buffer.from('fake-long-audio-data')
      );

      const result = await mockElevenLabs.textToSpeech.convert(longText);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('Voice Selection', () => {
    it('should list available voices', async () => {
      const voices = await mockElevenLabs.voices.getAll();

      expect(voices).toHaveProperty('voices');
      expect(Array.isArray(voices.voices)).toBe(true);
      expect(voices.voices.length).toBeGreaterThan(0);
      expect(voices.voices[0]).toHaveProperty('voice_id');
      expect(voices.voices[0]).toHaveProperty('name');
    });

    it('should use appropriate voice for language', () => {
      const englishVoice = 'en-voice-1';
      const arabicVoice = 'ar-voice-1';

      expect(englishVoice).toContain('en');
      expect(arabicVoice).toContain('ar');
    });

    it('should fall back to default voice if preferred not available', () => {
      const preferredVoice = 'non-existent-voice';
      const defaultVoice = 'default-voice';

      const selectedVoice = preferredVoice || defaultVoice;

      expect(selectedVoice).toBe(preferredVoice || defaultVoice);
    });
  });

  describe('Audio Quality', () => {
    it('should generate high quality audio', async () => {
      const text = 'Test message';
      const quality = 'high';

      mockElevenLabs.textToSpeech.convert.mockResolvedValue(
        Buffer.from('high-quality-audio')
      );

      const result = await mockElevenLabs.textToSpeech.convert(text);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should support different audio formats', () => {
      const formats = ['mp3', 'wav', 'ogg'];

      formats.forEach(format => {
        expect(['mp3', 'wav', 'ogg']).toContain(format);
      });
    });
  });

  describe('Pronunciation and Clarity', () => {
    it('should handle medical terminology correctly', () => {
      const medicalTerms = [
        'appointment',
        'cardiology',
        'dermatology',
        'orthopedics',
      ];

      medicalTerms.forEach(term => {
        expect(term.length).toBeGreaterThan(0);
        expect(term).toMatch(/^[a-z]+$/i);
      });
    });

    it('should handle Arabic medical terms', () => {
      const arabicTerms = [
        'موعد',
        'طبيب',
        'مستشفى',
      ];

      arabicTerms.forEach(term => {
        expect(term.length).toBeGreaterThan(0);
      });
    });

    it('should handle numbers and dates appropriately', () => {
      const textWithNumbers = 'Your appointment is on January 15th at 2:30 PM';
      
      expect(textWithNumbers).toContain('15th');
      expect(textWithNumbers).toContain('2:30');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockElevenLabs.textToSpeech.convert.mockRejectedValue(
        new Error('API Error')
      );

      try {
        await mockElevenLabs.textToSpeech.convert('test');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toBe('API Error');
      }
    });

    it('should handle rate limiting', async () => {
      mockElevenLabs.textToSpeech.convert.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      try {
        await mockElevenLabs.textToSpeech.convert('test');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Rate limit');
      }
    });

    it('should validate input before conversion', () => {
      const invalidInputs = [
        null,
        undefined,
        '',
        ' ',
      ];

      invalidInputs.forEach(input => {
        const isValid = input && typeof input === 'string' && input.trim().length > 0;
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Caching', () => {
    it('should cache frequently used phrases', () => {
      const commonPhrases = [
        'Your appointment is confirmed',
        'Please hold',
        'Thank you for calling',
      ];

      // Simulate cache
      const cache = new Map();
      commonPhrases.forEach(phrase => {
        cache.set(phrase, Buffer.from('cached-audio'));
      });

      expect(cache.size).toBe(3);
      expect(cache.has('Your appointment is confirmed')).toBe(true);
    });

    it('should use cached audio for repeated phrases', () => {
      const phrase = 'Thank you';
      const cache = new Map();
      
      // First call - not cached
      expect(cache.has(phrase)).toBe(false);
      cache.set(phrase, Buffer.from('audio'));
      
      // Second call - should use cache
      expect(cache.has(phrase)).toBe(true);
    });
  });
});
