/**
 * Unit tests for Analytics routes
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { request, createTestUser } from '../helpers/testUtils';

describe('Analytics Routes', () => {
  let token: string;
  let orgId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    token = user.token;
    orgId = user.orgId;
  });

  describe('GET /api/analytics/overview', () => {
    it('should return analytics overview', async () => {
      const res = await request('/api/analytics/overview', { token });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('totalPatients');
      expect(typeof res.data.totalPatients).toBe('number');
      expect(res.data).toHaveProperty('totalAppointments');
      expect(typeof res.data.totalAppointments).toBe('number');
    });

    it('should require authentication', async () => {
      const res = await request('/api/analytics/overview');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/analytics/appointments-by-day', () => {
    it('should return appointments by day with default days', async () => {
      const res = await request('/api/analytics/appointments-by-day', { token });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('data');
      expect(Array.isArray(res.data.data)).toBe(true);
    });

    it('should return appointments by day with custom days', async () => {
      const res = await request('/api/analytics/appointments-by-day?days=30', { token });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('data');
      expect(Array.isArray(res.data.data)).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request('/api/analytics/appointments-by-day');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/analytics/booking-channels', () => {
    it('should return booking channels data', async () => {
      const res = await request('/api/analytics/booking-channels', { token });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('data');
      expect(Array.isArray(res.data.data)).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request('/api/analytics/booking-channels');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/analytics/provider-performance', () => {
    it('should return provider performance metrics', async () => {
      const res = await request('/api/analytics/provider-performance', { token });

      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        expect(res.data).toHaveProperty('data');
        expect(Array.isArray(res.data.data)).toBe(true);
      }
    });

    it('should require authentication', async () => {
      const res = await request('/api/analytics/provider-performance');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/analytics/patient-demographics', () => {
    it('should return patient demographics', async () => {
      const res = await request('/api/analytics/patient-demographics', { token });

      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        expect(res.data).toBeDefined();
      }
    });

    it('should require authentication', async () => {
      const res = await request('/api/analytics/patient-demographics');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/analytics/no-show-rate', () => {
    it('should return no-show rate metrics', async () => {
      const res = await request('/api/analytics/no-show-rate', { token });

      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        expect(res.data).toHaveProperty('data');
      }
    });

    it('should require authentication', async () => {
      const res = await request('/api/analytics/no-show-rate');

      expect(res.status).toBe(401);
    });
  });
});
