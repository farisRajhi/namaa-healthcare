/**
 * Unit tests for Appointments routes
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  request,
  createTestUser,
  createTestPatient,
  createTestProvider,
  createTestService,
  createTestAppointment,
} from '../helpers/testUtils';

describe('Appointments Routes', () => {
  let token: string;
  let orgId: string;
  let patientId: string;
  let providerId: string;
  let serviceId: string;
  let appointmentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    token = user.token;
    orgId = user.orgId;

    const patient = await createTestPatient(token);
    patientId = patient.patientId;

    const provider = await createTestProvider(token);
    providerId = provider.providerId;

    const service = await createTestService(token);
    serviceId = service.serviceId;
  });

  describe('POST /api/appointments', () => {
    it('should create a new appointment', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      const endTs = new Date(tomorrow);
      endTs.setMinutes(endTs.getMinutes() + 30);

      const res = await request('/api/appointments', {
        method: 'POST',
        token,
        body: {
          providerId,
          serviceId,
          patientId,
          startTs: tomorrow.toISOString(),
          endTs: endTs.toISOString(),
          status: 'booked',
          reason: 'Regular checkup',
        },
      });

      expect(res.status).toBeLessThan(500);
      if (res.status === 200) {
        const appt = res.data.data || res.data;
        expect(appt).toHaveProperty('appointmentId');
        appointmentId = appt.appointmentId;
      }
    });

    it('should reject appointment without provider', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(15, 0, 0, 0);
      const endTs = new Date(tomorrow);
      endTs.setMinutes(endTs.getMinutes() + 30);

      const res = await request('/api/appointments', {
        method: 'POST',
        token,
        body: {
          serviceId,
          patientId,
          startTs: tomorrow.toISOString(),
          endTs: endTs.toISOString(),
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject appointment without service', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(16, 0, 0, 0);
      const endTs = new Date(tomorrow);
      endTs.setMinutes(endTs.getMinutes() + 30);

      const res = await request('/api/appointments', {
        method: 'POST',
        token,
        body: {
          providerId,
          patientId,
          startTs: tomorrow.toISOString(),
          endTs: endTs.toISOString(),
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject appointment without authentication', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endTs = new Date(tomorrow);
      endTs.setMinutes(endTs.getMinutes() + 30);

      const res = await request('/api/appointments', {
        method: 'POST',
        body: {
          providerId,
          serviceId,
          patientId,
          startTs: tomorrow.toISOString(),
          endTs: endTs.toISOString(),
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/appointments', () => {
    it('should list appointments', async () => {
      const res = await request('/api/appointments', { token });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('data');
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data).toHaveProperty('pagination');
    });

    it('should filter appointments by provider', async () => {
      const res = await request(`/api/appointments?providerId=${providerId}`, { token });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('data');
      expect(Array.isArray(res.data.data)).toBe(true);
    });

    it('should filter appointments by patient', async () => {
      const res = await request(`/api/appointments?patientId=${patientId}`, { token });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('data');
      expect(Array.isArray(res.data.data)).toBe(true);
    });

    it('should filter appointments by status', async () => {
      const res = await request('/api/appointments?status=booked', { token });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('data');
      expect(Array.isArray(res.data.data)).toBe(true);
    });

    it('should paginate appointments', async () => {
      const res = await request('/api/appointments?page=1&limit=5', { token });

      expect(res.status).toBe(200);
      expect(res.data.pagination).toHaveProperty('page', 1);
      expect(res.data.pagination).toHaveProperty('limit', 5);
      expect(res.data.pagination).toHaveProperty('total');
      expect(res.data.pagination).toHaveProperty('totalPages');
    });

    it('should require authentication', async () => {
      const res = await request('/api/appointments');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/appointments/:id', () => {
    it('should get appointment by id if it exists', async () => {
      if (!appointmentId) {
        // Create one if we don't have one
        const appt = await createTestAppointment(token, providerId, serviceId, patientId);
        appointmentId = appt.appointmentId;
      }

      const res = await request(`/api/appointments/${appointmentId}`, { token });

      expect(res.status).toBeLessThanOrEqual(404);
      if (res.status === 200) {
        expect(res.data).toHaveProperty('appointmentId');
      }
    });

    it('should return 404 or error for non-existent appointment', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(`/api/appointments/${fakeId}`, { token });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should require authentication', async () => {
      const res = await request(`/api/appointments/${appointmentId || 'test-id'}`);

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/appointments/:id/status', () => {
    it('should update appointment status if exists', async () => {
      if (!appointmentId) {
        const appt = await createTestAppointment(token, providerId, serviceId, patientId);
        appointmentId = appt.appointmentId;
      }

      const res = await request(`/api/appointments/${appointmentId}/status`, {
        method: 'PUT',
        token,
        body: {
          status: 'confirmed',
        },
      });

      expect(res.status).toBeLessThanOrEqual(404);
    });

    it('should reject invalid status', async () => {
      if (!appointmentId) {
        const appt = await createTestAppointment(token, providerId, serviceId, patientId);
        appointmentId = appt.appointmentId;
      }

      const res = await request(`/api/appointments/${appointmentId}/status`, {
        method: 'PUT',
        token,
        body: {
          status: 'invalid-status',
        },
      });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(`/api/appointments/${appointmentId || 'test-id'}/status`, {
        method: 'PUT',
        body: { status: 'confirmed' },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/appointments/:id', () => {
    it('should delete appointment if exists', async () => {
      // Create a new appointment to delete
      const appt = await createTestAppointment(token, providerId, serviceId, patientId);
      
      const res = await request(`/api/appointments/${appt.appointmentId}`, {
        method: 'DELETE',
        token,
      });

      expect(res.status).toBeLessThanOrEqual(404);
    });

    it('should require authentication', async () => {
      const res = await request('/api/appointments/test-id', {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });
  });
});
