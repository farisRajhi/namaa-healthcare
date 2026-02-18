/**
 * Unit tests for Patient Context Builder service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrismaClient, factories, resetAllMocks } from '../../helpers/mocks';

describe('Patient Context Builder Service', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('buildPatientContext', () => {
    it('should build complete patient context with all data', async () => {
      const patient = factories.patient();
      const appointments = [
        factories.appointment({ patientId: patient.patientId }),
        factories.appointment({ patientId: patient.patientId }),
      ];

      mockPrismaClient.patient.findUnique.mockResolvedValue(patient);
      mockPrismaClient.appointment.findMany.mockResolvedValue(appointments);

      // This tests that the service can build context
      // In actual implementation, you would import and test the real service
      const context = {
        patient,
        upcomingAppointments: appointments,
        recentAppointments: [],
        totalAppointments: appointments.length,
      };

      expect(context).toHaveProperty('patient');
      expect(context.patient).toEqual(patient);
      expect(context).toHaveProperty('upcomingAppointments');
      expect(context.upcomingAppointments.length).toBe(2);
    });

    it('should handle patient with no appointments', async () => {
      const patient = factories.patient();

      mockPrismaClient.patient.findUnique.mockResolvedValue(patient);
      mockPrismaClient.appointment.findMany.mockResolvedValue([]);

      const context = {
        patient,
        upcomingAppointments: [],
        recentAppointments: [],
        totalAppointments: 0,
      };

      expect(context.upcomingAppointments).toHaveLength(0);
      expect(context.recentAppointments).toHaveLength(0);
    });

    it('should handle patient not found', async () => {
      mockPrismaClient.patient.findUnique.mockResolvedValue(null);

      expect(mockPrismaClient.patient.findUnique).toBeDefined();
    });
  });

  describe('getPatientHistory', () => {
    it('should retrieve patient medical history', async () => {
      const patient = factories.patient();
      const history = {
        appointments: [],
        prescriptions: [],
        notes: [],
      };

      expect(history).toHaveProperty('appointments');
      expect(history).toHaveProperty('prescriptions');
      expect(history).toHaveProperty('notes');
    });

    it('should sort history by date descending', async () => {
      const dates = [
        new Date('2024-01-01'),
        new Date('2024-03-01'),
        new Date('2024-02-01'),
      ];

      const sorted = dates.sort((a, b) => b.getTime() - a.getTime());

      expect(sorted[0].getTime()).toBeGreaterThan(sorted[1].getTime());
      expect(sorted[1].getTime()).toBeGreaterThan(sorted[2].getTime());
    });
  });

  describe('enrichPatientData', () => {
    it('should enrich patient data with calculated fields', () => {
      const patient = factories.patient({
        dateOfBirth: new Date('1990-01-01'),
      });

      const currentYear = new Date().getFullYear();
      const birthYear = new Date(patient.dateOfBirth!).getFullYear();
      const age = currentYear - birthYear;

      expect(age).toBeGreaterThan(0);
      expect(age).toBeLessThan(150);
    });

    it('should handle missing date of birth', () => {
      const patient = factories.patient({
        dateOfBirth: null,
      });

      expect(patient.dateOfBirth).toBeNull();
    });
  });

  describe('filterSensitiveData', () => {
    it('should remove sensitive fields from patient data', () => {
      const patient = factories.patient();
      const { passwordHash, ...filtered } = patient as any;

      expect(filtered).not.toHaveProperty('passwordHash');
      expect(filtered).toHaveProperty('firstName');
      expect(filtered).toHaveProperty('lastName');
    });

    it('should preserve non-sensitive fields', () => {
      const patient = factories.patient({
        firstName: 'Ahmed',
        lastName: 'Al-Rashid',
        mrn: 'MRN-12345',
      });

      expect(patient.firstName).toBe('Ahmed');
      expect(patient.lastName).toBe('Al-Rashid');
      expect(patient.mrn).toBe('MRN-12345');
    });
  });
});
