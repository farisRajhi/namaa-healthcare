import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchPatientsByPhone } from '@/services/patientIntelligence/patientMatcher.js';
import { mockPrismaClient, resetAllMocks } from '@tests/helpers/mocks.js';

const prisma = mockPrismaClient as any;

describe('matchPatientsByPhone', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('should match patients by normalized phone number', async () => {
    prisma.patientContact.findMany.mockResolvedValue([
      { contactValue: '966551234567', patientId: 'patient-1' },
    ]);

    const result = await matchPatientsByPhone(prisma, 'org-1', [
      { externalPatientId: 'ext-1', phone: '0551234567' },
    ]);

    expect(result.size).toBe(1);
    expect(result.get('ext-1')).toEqual({
      patientId: 'patient-1',
      confidence: 0.95,
    });
  });

  it('should normalize +966 prefix format', async () => {
    prisma.patientContact.findMany.mockResolvedValue([
      { contactValue: '+966552345678', patientId: 'patient-2' },
    ]);

    const result = await matchPatientsByPhone(prisma, 'org-1', [
      { externalPatientId: 'ext-2', phone: '+966552345678' },
    ]);

    expect(result.size).toBe(1);
    expect(result.get('ext-2')?.patientId).toBe('patient-2');
  });

  it('should normalize 00966 prefix format', async () => {
    prisma.patientContact.findMany.mockResolvedValue([
      { contactValue: '966553456789', patientId: 'patient-3' },
    ]);

    const result = await matchPatientsByPhone(prisma, 'org-1', [
      { externalPatientId: 'ext-3', phone: '00966553456789' },
    ]);

    expect(result.size).toBe(1);
    expect(result.get('ext-3')?.patientId).toBe('patient-3');
  });

  it('should skip patients with null phone', async () => {
    prisma.patientContact.findMany.mockResolvedValue([]);

    const result = await matchPatientsByPhone(prisma, 'org-1', [
      { externalPatientId: 'ext-4', phone: null },
    ]);

    expect(result.size).toBe(0);
    // Should not have queried at all since no valid phones
    expect(prisma.patientContact.findMany).not.toHaveBeenCalled();
  });

  it('should skip patients with empty phone string', async () => {
    prisma.patientContact.findMany.mockResolvedValue([]);

    const result = await matchPatientsByPhone(prisma, 'org-1', [
      { externalPatientId: 'ext-5', phone: '' },
    ]);

    expect(result.size).toBe(0);
  });

  it('should return empty map when no matches found', async () => {
    prisma.patientContact.findMany.mockResolvedValue([]);

    const result = await matchPatientsByPhone(prisma, 'org-1', [
      { externalPatientId: 'ext-6', phone: '0559999999' },
    ]);

    expect(result.size).toBe(0);
  });

  it('should return empty map for empty input', async () => {
    const result = await matchPatientsByPhone(prisma, 'org-1', []);
    expect(result.size).toBe(0);
  });

  it('should match multiple patients in a batch', async () => {
    prisma.patientContact.findMany.mockResolvedValue([
      { contactValue: '966551111111', patientId: 'patient-a' },
      { contactValue: '966552222222', patientId: 'patient-b' },
    ]);

    const result = await matchPatientsByPhone(prisma, 'org-1', [
      { externalPatientId: 'ext-a', phone: '0551111111' },
      { externalPatientId: 'ext-b', phone: '0552222222' },
      { externalPatientId: 'ext-c', phone: '0553333333' }, // no match
    ]);

    expect(result.size).toBe(2);
    expect(result.get('ext-a')?.patientId).toBe('patient-a');
    expect(result.get('ext-b')?.patientId).toBe('patient-b');
    expect(result.has('ext-c')).toBe(false);
  });

  it('should search with multiple phone format patterns', async () => {
    prisma.patientContact.findMany.mockResolvedValue([]);

    await matchPatientsByPhone(prisma, 'org-1', [
      { externalPatientId: 'ext-7', phone: '0551234567' },
    ]);

    // Should search for normalized format, +prefix, and local format
    const callArgs = prisma.patientContact.findMany.mock.calls[0][0];
    const searchValues = callArgs.where.contactValue.in;
    expect(searchValues).toContain('966551234567');
    expect(searchValues).toContain('+966551234567');
    expect(searchValues).toContain('0551234567');
  });
});
