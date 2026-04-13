import { describe, it, expect } from 'vitest';
import { getSkillNames, loadSkillsForClinicType } from '@/services/patientIntelligence/skillLoader.js';

describe('getSkillNames', () => {
  it('should return dental skill + always-loaded for dental clinic', () => {
    const names = getSkillNames('dental');
    expect(names).toContain('dental.md');
    expect(names).toContain('saudiPatientBehavior.md');
    expect(names).toContain('campaignBestPractices.md');
    expect(names).toHaveLength(3);
  });

  it('should return dermatology skill for dermatology clinic', () => {
    const names = getSkillNames('dermatology');
    expect(names).toContain('dermatology.md');
    expect(names).toContain('saudiPatientBehavior.md');
    expect(names).toContain('campaignBestPractices.md');
  });

  it('should return dermatology skill for cosmetic clinic', () => {
    const names = getSkillNames('cosmetic');
    expect(names).toContain('dermatology.md');
  });

  it('should fallback to general.md for unknown clinic type', () => {
    const names = getSkillNames('unknown_type');
    expect(names).toContain('general.md');
    expect(names).toContain('saudiPatientBehavior.md');
    expect(names).toContain('campaignBestPractices.md');
  });

  it('should fallback to general.md for ophthalmology', () => {
    const names = getSkillNames('ophthalmology');
    expect(names).toContain('general.md');
  });

  it('should always include saudiPatientBehavior and campaignBestPractices', () => {
    const clinicTypes = ['dental', 'dermatology', 'cosmetic', 'general', 'pediatrics', 'orthopedic'];
    for (const type of clinicTypes) {
      const names = getSkillNames(type);
      expect(names).toContain('saudiPatientBehavior.md');
      expect(names).toContain('campaignBestPractices.md');
    }
  });
});

describe('loadSkillsForClinicType', () => {
  it('should load dental skills with content', async () => {
    const result = await loadSkillsForClinicType('dental');
    expect(result.names).toContain('dental.md');
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('should include dental-specific content for dental clinic', async () => {
    const result = await loadSkillsForClinicType('dental');
    // Dental skill should mention cleaning cycles, whitening, etc.
    expect(result.content).toContain('Cleaning');
    expect(result.content).toContain('Whitening');
  });

  it('should include Saudi behavior content for any clinic', async () => {
    const result = await loadSkillsForClinicType('dental');
    expect(result.content).toContain('Ramadan');
    expect(result.content).toContain('WhatsApp');
  });

  it('should include campaign best practices for any clinic', async () => {
    const result = await loadSkillsForClinicType('dental');
    expect(result.content).toContain('CTA');
    expect(result.content).toContain('patient_name');
  });

  it('should respect content length limit (16000 chars)', async () => {
    const result = await loadSkillsForClinicType('dental');
    expect(result.content.length).toBeLessThanOrEqual(16500); // small buffer for separator text
  });

  it('should load general skills for unknown type', async () => {
    const result = await loadSkillsForClinicType('unknown');
    expect(result.names).toContain('general.md');
    expect(result.content).toBeTruthy();
  });
});
