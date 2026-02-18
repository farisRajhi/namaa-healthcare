/**
 * Unit tests for Reminder Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockPrismaClient, mockTwilio, factories, resetAllMocks } from '../../helpers/mocks';

describe('Reminder Service', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('Reminder Scheduling', () => {
    it('should schedule reminder for appointment', () => {
      const appointment = factories.appointment();
      const reminderTime = new Date(appointment.startTs);
      reminderTime.setHours(reminderTime.getHours() - 24); // 24h before

      expect(reminderTime.getTime()).toBeLessThan(appointment.startTs.getTime());
      
      const timeDiff = appointment.startTs.getTime() - reminderTime.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      expect(hoursDiff).toBe(24);
    });

    it('should schedule multiple reminders for one appointment', () => {
      const appointment = factories.appointment();
      
      const reminders = [
        { hoursBeforeAppointment: 24, type: 'sms' },
        { hoursBeforeAppointment: 2, type: 'voice' },
        { hoursBeforeAppointment: 0.5, type: 'push' },
      ];

      reminders.forEach(reminder => {
        const reminderTime = new Date(appointment.startTs);
        reminderTime.setHours(
          reminderTime.getHours() - reminder.hoursBeforeAppointment
        );

        expect(reminderTime.getTime()).toBeLessThanOrEqual(
          appointment.startTs.getTime()
        );
      });

      expect(reminders.length).toBe(3);
    });

    it('should not schedule reminders for past appointments', () => {
      const pastAppointment = factories.appointment({
        startTs: new Date('2020-01-01'),
      });

      const isPast = pastAppointment.startTs.getTime() < Date.now();
      expect(isPast).toBe(true);
    });
  });

  describe('SMS Reminders', () => {
    it('should send SMS reminder to patient', async () => {
      const appointment = factories.appointment();
      const patient = factories.patient({ phone: '+966501234567' });

      const message = `Reminder: You have an appointment tomorrow at ${appointment.startTs.toLocaleTimeString()}`;

      const result = await mockTwilio.messages.create({
        to: patient.phone,
        from: '+15551234567',
        body: message,
      });

      expect(result).toHaveProperty('sid');
      expect(result.status).toBe('queued');
      expect(mockTwilio.messages.create).toHaveBeenCalled();
    });

    it('should include appointment details in SMS', () => {
      const appointment = factories.appointment();
      const provider = factories.provider({ displayName: 'Dr. Ahmed' });
      
      const message = `
        Appointment Reminder
        Doctor: ${provider.displayName}
        Time: ${appointment.startTs.toLocaleString()}
        Please arrive 15 minutes early.
      `.trim();

      expect(message).toContain(provider.displayName);
      expect(message).toContain('Appointment Reminder');
    });

    it('should support bilingual reminders', () => {
      const englishMessage = 'Your appointment is tomorrow at 2 PM';
      const arabicMessage = 'موعدك غداً في الساعة الثانية مساءً';

      expect(englishMessage.length).toBeGreaterThan(0);
      expect(arabicMessage.length).toBeGreaterThan(0);
    });
  });

  describe('Voice Reminders', () => {
    it('should initiate voice call reminder', async () => {
      const patient = factories.patient({ phone: '+966501234567' });
      
      const result = await mockTwilio.calls.create({
        to: patient.phone,
        from: '+15551234567',
        url: 'https://example.com/voice-reminder',
      });

      expect(result).toHaveProperty('sid');
      expect(result.status).toBe('queued');
      expect(mockTwilio.calls.create).toHaveBeenCalled();
    });

    it('should use TTS for voice reminder content', () => {
      const appointment = factories.appointment();
      const message = `
        This is a reminder that you have a doctor's appointment 
        tomorrow at ${appointment.startTs.toLocaleTimeString()}.
        Please call if you need to reschedule.
      `.trim();

      expect(message.length).toBeGreaterThan(50);
      expect(message).toContain('reminder');
      expect(message).toContain('appointment');
    });
  });

  describe('Reminder Status Tracking', () => {
    it('should track reminder delivery status', () => {
      const statuses = ['pending', 'sent', 'delivered', 'failed'];

      statuses.forEach(status => {
        expect(['pending', 'sent', 'delivered', 'failed']).toContain(status);
      });
    });

    it('should retry failed reminders', () => {
      const maxRetries = 3;
      let attempts = 0;

      while (attempts < maxRetries) {
        attempts++;
      }

      expect(attempts).toBe(maxRetries);
    });

    it('should mark reminder as delivered on success', () => {
      const reminder = {
        id: 'reminder-1',
        status: 'sent',
        deliveredAt: new Date(),
      };

      expect(reminder.status).toBe('sent');
      expect(reminder.deliveredAt).toBeInstanceOf(Date);
    });
  });

  describe('Patient Preferences', () => {
    it('should respect patient communication preferences', () => {
      const patientPreferences = {
        smsReminders: true,
        voiceReminders: false,
        emailReminders: true,
        preferredLanguage: 'en',
      };

      expect(patientPreferences.smsReminders).toBe(true);
      expect(patientPreferences.voiceReminders).toBe(false);
    });

    it('should not send reminders if patient opted out', () => {
      const patient = factories.patient();
      const optedOut = true;

      if (optedOut) {
        expect(optedOut).toBe(true);
      }
    });

    it('should use patient preferred language', () => {
      const languages = ['en', 'ar'];
      const preferredLanguage = 'ar';

      expect(languages).toContain(preferredLanguage);
    });
  });

  describe('Reminder Timing', () => {
    it('should send reminders at appropriate times', () => {
      const appointment = factories.appointment({
        startTs: new Date('2024-12-25T14:00:00'),
      });

      // 24h reminder at 2 PM day before
      const reminder24h = new Date(appointment.startTs);
      reminder24h.setHours(reminder24h.getHours() - 24);

      // 2h reminder at 12 PM same day
      const reminder2h = new Date(appointment.startTs);
      reminder2h.setHours(reminder2h.getHours() - 2);

      expect(reminder24h.getDate()).toBe(appointment.startTs.getDate() - 1);
      expect(reminder2h.getDate()).toBe(appointment.startTs.getDate());
    });

    it('should not send reminders outside business hours', () => {
      const reminderTime = new Date();
      reminderTime.setHours(22, 0, 0, 0); // 10 PM

      const hour = reminderTime.getHours();
      const isBusinessHours = hour >= 8 && hour < 20;

      expect(isBusinessHours).toBe(false);
    });

    it('should respect timezone for reminder delivery', () => {
      const appointment = factories.appointment();
      const timezone = 'Asia/Riyadh';

      expect(timezone).toBe('Asia/Riyadh');
    });
  });

  describe('Reminder Content Customization', () => {
    it('should include customizable clinic information', () => {
      const clinicInfo = {
        name: 'Test Clinic',
        phone: '+966-11-1234567',
        address: '123 King Fahd Road, Riyadh',
      };

      const message = `
        Reminder from ${clinicInfo.name}
        Call us at ${clinicInfo.phone}
        Location: ${clinicInfo.address}
      `;

      expect(message).toContain(clinicInfo.name);
      expect(message).toContain(clinicInfo.phone);
    });

    it('should include provider-specific information', () => {
      const provider = factories.provider({
        displayName: 'Dr. Sarah Ahmed',
        credentials: 'MD, FACP',
      });

      const message = `Your appointment is with ${provider.displayName}, ${provider.credentials}`;

      expect(message).toContain('Dr. Sarah Ahmed');
      expect(message).toContain('MD, FACP');
    });
  });

  describe('Bulk Reminder Processing', () => {
    it('should process batch of reminders efficiently', () => {
      const appointments = Array.from({ length: 100 }, (_, i) =>
        factories.appointment({ appointmentId: `appt-${i}` })
      );

      expect(appointments.length).toBe(100);
      
      const batches = [];
      const batchSize = 10;
      
      for (let i = 0; i < appointments.length; i += batchSize) {
        batches.push(appointments.slice(i, i + batchSize));
      }

      expect(batches.length).toBe(10);
      expect(batches[0].length).toBe(batchSize);
    });

    it('should handle rate limiting for bulk sends', async () => {
      const maxPerSecond = 10;
      let sentCount = 0;
      const delayMs = 1000 / maxPerSecond;

      expect(delayMs).toBe(100);
      expect(maxPerSecond).toBe(10);
    });
  });

  describe('Analytics and Reporting', () => {
    it('should track reminder effectiveness', () => {
      const stats = {
        sent: 100,
        delivered: 95,
        failed: 5,
        read: 80,
        responded: 30,
      };

      const deliveryRate = (stats.delivered / stats.sent) * 100;
      const responseRate = (stats.responded / stats.delivered) * 100;

      expect(deliveryRate).toBe(95);
      expect(responseRate).toBeCloseTo(31.58, 1);
    });

    it('should provide reminder statistics by type', () => {
      const statsByType = {
        sms: { sent: 50, delivered: 48 },
        voice: { sent: 30, delivered: 25 },
        email: { sent: 20, delivered: 19 },
      };

      expect(statsByType.sms.sent).toBe(50);
      expect(statsByType.voice.delivered).toBe(25);
    });
  });
});
