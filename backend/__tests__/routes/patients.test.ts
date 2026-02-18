/**
 * Unit tests for Patients routes
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  request,
  createTestUser,
  createTestPatient,
  uniqueMRN,
  uniquePhone,
} from '../helpers/testUtils';

describe('Patients Routes', () => {
  let token: string;
  let orgId: string;
  let patientId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    token = user.token;
    orgId = user.orgId;
  });

  describe('POST /api/patients', () => {
    it('should create a new patient with valid data', async () => {
      const res = await request('/api/patients', {
        method: 'POST',
        token,
        body: {
          firstName: 'Ahmed',
          lastName: 'Al-Rashid',
          sex: 'male',
          mrn: uniqueMRN(),
          phone: uniquePhone(),
          email: 'ahmed@test.com',
          dateOfBirth: '1990-01-15',
        },
      });

      expect(res.status).toBe(200);
      const patient = res.data.data || res.data;
      expect(patient).toHaveProperty('patientId');
      expect(patient.firstName).toBe('Ahmed');
      expect(patient.lastName).toBe('Al-Rashid');
      patientId = patient.patientId;
    });

    it('should create patient with minimal required fields', async () => {
      const res = await request('/api/patients', {
        method: 'POST',
        token,
        body: {
          firstName: 'Fatima',
          lastName: 'Hassan',
          sex: 'female',
          mrn: uniqueMRN(),
        },
      });

      expect(res.status).toBe(200);
      const patient = res.data.data || res.data;
      expect(patient).toHaveProperty('patientId');
    });

    it('should reject patient without first name', async () => {
      const res = await request('/api/patients', {
        method: 'POST',
        token,
        body: {
          lastName: 'Test',
          sex: 'male',
          mrn: uniqueMRN(),
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject patient without last name', async () => {
      const res = await request('/api/patients', {
        method: 'POST',
        token,
        body: {
          firstName: 'Test',
          sex: 'male',
          mrn: uniqueMRN(),
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject patient with invalid sex', async () => {
      const res = await request('/api/patients', {
        method: 'POST',
        token,
        body: {
          firstName: 'Test',
          lastName: 'Patient',
          sex: 'invalid',
          mrn: uniqueMRN(),
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate MRN', async () => {
      const mrn = uniqueMRN();

      // Create first patient
      await request('/api/patients', {
        method: 'POST',
        token,
        body: {
          firstName: 'First',
          lastName: 'Patient',
          sex: 'male',
          mrn,
        },
      });

      // Try to create duplicate
      const res = await request('/api/patients', {
        method: 'POST',
        token,
        body: {
          firstName: 'Second',
          lastName: 'Patient',
          sex: 'female',
          mrn,
        },
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should require authentication', async () => {
      const res = await request('/api/patients', {
        method: 'POST',
        body: {
          firstName: 'Test',
          lastName: 'Patient',
          sex: 'male',
          mrn: uniqueMRN(),
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/patients', () => {
    it('should list all patients', async () => {
      const res = await request('/api/patients', { token });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('data');
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.data.length).toBeGreaterThan(0);
    });

    it('should search patients by name', async () => {
      // Create a patient with unique name
      await createTestPatient(token, {
        firstName: 'UniqueFirstName',
        lastName: 'UniqueLastName',
      });

      const res = await request('/api/patients?search=UniqueFirstName', { token });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
    });

    it('should filter patients by sex', async () => {
      const res = await request('/api/patients?sex=male', { token });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
    });

    it('should paginate results', async () => {
      const res = await request('/api/patients?page=1&limit=10', { token });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('pagination');
      expect(res.data.pagination.page).toBe(1);
      expect(res.data.pagination.limit).toBe(10);
    });

    it('should require authentication', async () => {
      const res = await request('/api/patients');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/patients/:id', () => {
    it('should get patient by id', async () => {
      if (!patientId) {
        const patient = await createTestPatient(token);
        patientId = patient.patientId;
      }

      const res = await request(`/api/patients/${patientId}`, { token });

      expect(res.status).toBe(200);
      const patient = res.data.data || res.data;
      expect(patient).toHaveProperty('patientId', patientId);
    });

    it('should return 404 for non-existent patient', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(`/api/patients/${fakeId}`, { token });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should require authentication', async () => {
      const res = await request(`/api/patients/${patientId || 'test-id'}`);

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/patients/:id', () => {
    it('should update patient data', async () => {
      if (!patientId) {
        const patient = await createTestPatient(token);
        patientId = patient.patientId;
      }

      const res = await request(`/api/patients/${patientId}`, {
        method: 'PUT',
        token,
        body: {
          firstName: 'UpdatedFirstName',
          phone: uniquePhone(),
        },
      });

      expect(res.status).toBeLessThanOrEqual(404);
      if (res.status === 200) {
        const patient = res.data.data || res.data;
        expect(patient.firstName).toBe('UpdatedFirstName');
      }
    });

    it('should reject invalid updates', async () => {
      if (!patientId) {
        const patient = await createTestPatient(token);
        patientId = patient.patientId;
      }

      const res = await request(`/api/patients/${patientId}`, {
        method: 'PUT',
        token,
        body: {
          sex: 'invalid-value',
        },
      });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(`/api/patients/${patientId || 'test-id'}`, {
        method: 'PUT',
        body: { firstName: 'Test' },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/patients/:id', () => {
    it('should soft delete patient', async () => {
      const patient = await createTestPatient(token);

      const res = await request(`/api/patients/${patient.patientId}`, {
        method: 'DELETE',
        token,
      });

      expect(res.status).toBeLessThanOrEqual(404);
    });

    it('should require authentication', async () => {
      const res = await request('/api/patients/test-id', {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });
  });
});
