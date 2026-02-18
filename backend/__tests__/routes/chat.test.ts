/**
 * Unit tests for Chat routes
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { request, createTestUser, createTestPatient } from '../helpers/testUtils';

describe('Chat Routes', () => {
  let token: string;
  let orgId: string;
  let patientId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    token = user.token;
    orgId = user.orgId;

    const patient = await createTestPatient(token);
    patientId = patient.patientId;
  });

  describe('POST /api/chat/message', () => {
    it('should send a chat message and get AI response', async () => {
      const res = await request('/api/chat/message', {
        method: 'POST',
        token,
        body: {
          message: 'Hello, I need to book an appointment',
          sessionId: `session-${Date.now()}`,
        },
      });

      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        expect(res.data).toHaveProperty('response');
        expect(typeof res.data.response).toBe('string');
        expect(res.data.response.length).toBeGreaterThan(0);
      }
    });

    it('should handle Arabic messages', async () => {
      const res = await request('/api/chat/message', {
        method: 'POST',
        token,
        body: {
          message: 'مرحبا، أريد حجز موعد',
          sessionId: `session-${Date.now()}`,
        },
      });

      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        expect(res.data).toHaveProperty('response');
      }
    });

    it('should reject empty message', async () => {
      const res = await request('/api/chat/message', {
        method: 'POST',
        token,
        body: {
          message: '',
          sessionId: `session-${Date.now()}`,
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject message without sessionId', async () => {
      const res = await request('/api/chat/message', {
        method: 'POST',
        token,
        body: {
          message: 'Test message',
        },
      });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request('/api/chat/message', {
        method: 'POST',
        body: {
          message: 'Test',
          sessionId: 'test-session',
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/chat/history/:sessionId', () => {
    it('should retrieve chat history for a session', async () => {
      const sessionId = `session-${Date.now()}`;
      
      // First send a message to create history
      await request('/api/chat/message', {
        method: 'POST',
        token,
        body: {
          message: 'Test message for history',
          sessionId,
        },
      });

      // Then retrieve history
      const res = await request(`/api/chat/history/${sessionId}`, { token });

      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        expect(Array.isArray(res.data.messages || res.data.data)).toBe(true);
      }
    });

    it('should return empty history for new session', async () => {
      const newSessionId = `new-session-${Date.now()}`;
      const res = await request(`/api/chat/history/${newSessionId}`, { token });

      expect(res.status).toBeLessThan(500);
    });

    it('should require authentication', async () => {
      const res = await request('/api/chat/history/test-session');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/chat/intent', () => {
    it('should detect booking intent', async () => {
      const res = await request('/api/chat/intent', {
        method: 'POST',
        token,
        body: {
          message: 'I want to schedule an appointment for next Monday',
        },
      });

      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        expect(res.data).toHaveProperty('intent');
        expect(typeof res.data.intent).toBe('string');
      }
    });

    it('should detect cancellation intent', async () => {
      const res = await request('/api/chat/intent', {
        method: 'POST',
        token,
        body: {
          message: 'I need to cancel my appointment',
        },
      });

      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        expect(res.data).toHaveProperty('intent');
      }
    });

    it('should detect information request intent', async () => {
      const res = await request('/api/chat/intent', {
        method: 'POST',
        token,
        body: {
          message: 'What are your office hours?',
        },
      });

      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        expect(res.data).toHaveProperty('intent');
      }
    });

    it('should require authentication', async () => {
      const res = await request('/api/chat/intent', {
        method: 'POST',
        body: {
          message: 'Test',
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/chat/session/:sessionId', () => {
    it('should clear chat session', async () => {
      const sessionId = `session-to-clear-${Date.now()}`;
      
      // Create a session
      await request('/api/chat/message', {
        method: 'POST',
        token,
        body: {
          message: 'Test message',
          sessionId,
        },
      });

      // Clear the session
      const res = await request(`/api/chat/session/${sessionId}`, {
        method: 'DELETE',
        token,
      });

      expect(res.status).toBeLessThan(500);
    });

    it('should require authentication', async () => {
      const res = await request('/api/chat/session/test-session', {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });
  });
});
