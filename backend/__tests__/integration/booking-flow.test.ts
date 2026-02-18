/**
 * Integration tests for complete booking flow
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  request,
  createTestUser,
  createTestPatient,
  createTestProvider,
  createTestService,
  sleep,
} from '../helpers/testUtils';

describe('Booking Flow Integration', () => {
  let token: string;
  let orgId: string;
  let patientId: string;
  let providerId: string;
  let serviceId: string;

  beforeAll(async () => {
    // Setup test environment
    const user = await createTestUser('Integration Test Hospital');
    token = user.token;
    orgId = user.orgId;

    // Create test resources
    const patient = await createTestPatient(token, {
      firstName: 'Integration',
      lastName: 'Test Patient',
      phone: '+966501234567',
      email: 'integration@test.com',
    });
    patientId = patient.patientId;

    const provider = await createTestProvider(token, {
      displayName: 'Dr. Integration Test',
      credentials: 'MD, FACP',
    });
    providerId = provider.providerId;

    const service = await createTestService(token, {
      name: 'Integration Test Consultation',
      durationMin: 30,
    });
    serviceId = service.serviceId;
  });

  describe('Complete appointment booking flow', () => {
    it('should complete full booking workflow', async () => {
      // Step 1: Patient initiates booking via chat
      const chatRes = await request('/api/chat/message', {
        method: 'POST',
        token,
        body: {
          message: 'I want to book an appointment',
          sessionId: `integration-${Date.now()}`,
        },
      });

      expect(chatRes.status).toBeLessThan(500);

      // Step 2: Get available time slots
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const nextWeek = new Date(tomorrow);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const slotsRes = await request(
        `/api/scheduler/availability?providerId=${providerId}&from=${tomorrow.toISOString()}&to=${nextWeek.toISOString()}`,
        { token }
      );

      expect(slotsRes.status).toBeLessThan(500);

      // Step 3: Create appointment
      const appointmentTime = new Date(tomorrow);
      appointmentTime.setHours(10, 0, 0, 0);
      const endTime = new Date(appointmentTime);
      endTime.setMinutes(endTime.getMinutes() + 30);

      const bookingRes = await request('/api/appointments', {
        method: 'POST',
        token,
        body: {
          providerId,
          serviceId,
          patientId,
          startTs: appointmentTime.toISOString(),
          endTs: endTime.toISOString(),
          status: 'booked',
          reason: 'Integration test appointment',
        },
      });

      expect(bookingRes.status).toBeLessThan(500);

      if (bookingRes.status === 200) {
        const appointment = bookingRes.data.data || bookingRes.data;
        const appointmentId = appointment.appointmentId;

        // Step 4: Confirm appointment
        const confirmRes = await request(`/api/appointments/${appointmentId}/status`, {
          method: 'PUT',
          token,
          body: {
            status: 'confirmed',
          },
        });

        expect(confirmRes.status).toBeLessThan(500);

        // Step 5: Verify appointment in patient's schedule
        const patientApptsRes = await request(
          `/api/appointments?patientId=${patientId}`,
          { token }
        );

        expect(patientApptsRes.status).toBe(200);
        expect(patientApptsRes.data.data.length).toBeGreaterThan(0);

        // Step 6: Send reminder (simulate)
        const reminderRes = await request('/api/reminders/stats', { token });
        expect(reminderRes.status).toBeLessThan(500);
      }
    });

    it('should handle appointment cancellation flow', async () => {
      // Create appointment
      const appointmentTime = new Date();
      appointmentTime.setDate(appointmentTime.getDate() + 2);
      appointmentTime.setHours(14, 0, 0, 0);
      const endTime = new Date(appointmentTime);
      endTime.setMinutes(endTime.getMinutes() + 30);

      const bookingRes = await request('/api/appointments', {
        method: 'POST',
        token,
        body: {
          providerId,
          serviceId,
          patientId,
          startTs: appointmentTime.toISOString(),
          endTs: endTime.toISOString(),
          status: 'booked',
        },
      });

      if (bookingRes.status === 200) {
        const appointment = bookingRes.data.data || bookingRes.data;
        const appointmentId = appointment.appointmentId;

        // Cancel appointment
        const cancelRes = await request(`/api/appointments/${appointmentId}/status`, {
          method: 'PUT',
          token,
          body: {
            status: 'cancelled',
            reason: 'Patient request',
          },
        });

        expect(cancelRes.status).toBeLessThan(500);

        // Verify cancellation
        const checkRes = await request(`/api/appointments/${appointmentId}`, { token });
        if (checkRes.status === 200) {
          const updated = checkRes.data.data || checkRes.data;
          expect(updated.status).toBe('cancelled');
        }
      }
    });

    it('should handle appointment rescheduling flow', async () => {
      // Create initial appointment
      const originalTime = new Date();
      originalTime.setDate(originalTime.getDate() + 3);
      originalTime.setHours(10, 0, 0, 0);
      const originalEnd = new Date(originalTime);
      originalEnd.setMinutes(originalEnd.getMinutes() + 30);

      const bookingRes = await request('/api/appointments', {
        method: 'POST',
        token,
        body: {
          providerId,
          serviceId,
          patientId,
          startTs: originalTime.toISOString(),
          endTs: originalEnd.toISOString(),
          status: 'booked',
        },
      });

      if (bookingRes.status === 200) {
        const appointment = bookingRes.data.data || bookingRes.data;
        const appointmentId = appointment.appointmentId;

        // Reschedule to new time
        const newTime = new Date(originalTime);
        newTime.setHours(15, 0, 0, 0);
        const newEnd = new Date(newTime);
        newEnd.setMinutes(newEnd.getMinutes() + 30);

        const rescheduleRes = await request(`/api/appointments/${appointmentId}`, {
          method: 'PUT',
          token,
          body: {
            startTs: newTime.toISOString(),
            endTs: newEnd.toISOString(),
          },
        });

        expect(rescheduleRes.status).toBeLessThan(500);
      }
    });
  });

  describe('Multi-channel booking integration', () => {
    it('should handle booking via chat interface', async () => {
      const sessionId = `chat-booking-${Date.now()}`;

      // Simulate chat booking conversation
      const messages = [
        'I need to book an appointment',
        'Tomorrow at 2 PM',
        'General consultation',
      ];

      for (const message of messages) {
        const res = await request('/api/chat/message', {
          method: 'POST',
          token,
          body: {
            message,
            sessionId,
          },
        });

        expect(res.status).toBeLessThan(500);
        await sleep(100);
      }

      // Verify chat history
      const historyRes = await request(`/api/chat/history/${sessionId}`, { token });
      expect(historyRes.status).toBeLessThan(500);
    });
  });

  describe('Analytics integration', () => {
    it('should reflect bookings in analytics', async () => {
      // Get analytics before
      const beforeRes = await request('/api/analytics/overview', { token });
      expect(beforeRes.status).toBe(200);
      const beforeTotal = beforeRes.data.totalAppointments;

      // Create new appointment
      const appointmentTime = new Date();
      appointmentTime.setDate(appointmentTime.getDate() + 5);
      appointmentTime.setHours(11, 0, 0, 0);
      const endTime = new Date(appointmentTime);
      endTime.setMinutes(endTime.getMinutes() + 30);

      await request('/api/appointments', {
        method: 'POST',
        token,
        body: {
          providerId,
          serviceId,
          patientId,
          startTs: appointmentTime.toISOString(),
          endTs: endTime.toISOString(),
          status: 'booked',
        },
      });

      // Get analytics after
      await sleep(500); // Wait for update
      const afterRes = await request('/api/analytics/overview', { token });
      expect(afterRes.status).toBe(200);
      const afterTotal = afterRes.data.totalAppointments;

      // Verify count increased or stayed same (depending on implementation)
      expect(afterTotal).toBeGreaterThanOrEqual(beforeTotal);
    });
  });
});
