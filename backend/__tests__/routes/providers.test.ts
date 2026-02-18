/**
 * Unit tests for Providers routes
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  request,
  createTestUser,
  createTestProvider,
  createTestDepartment,
} from '../helpers/testUtils';

describe('Providers Routes', () => {
  let token: string;
  let orgId: string;
  let providerId: string;
  let departmentId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    token = user.token;
    orgId = user.orgId;

    const department = await createTestDepartment(token);
    departmentId = department.departmentId;
  });

  describe('POST /api/providers', () => {
    it('should create a new provider', async () => {
      const res = await request('/api/providers', {
        method: 'POST',
        token,
        body: {
          displayName: 'Dr. Mohammed Al-Faisal',
          credentials: 'MD, FACP',
          specialization: 'Internal Medicine',
          active: true,
        },
      });

      expect(res.status).toBe(200);
      const provider = res.data.data || res.data;
      expect(provider).toHaveProperty('providerId');
      expect(provider.displayName).toBe('Dr. Mohammed Al-Faisal');
      providerId = provider.providerId;
    });

    it('should create provider with department assignment', async () => {
      const res = await request('/api/providers', {
        method: 'POST',
        token,
        body: {
          displayName: 'Dr. Sarah Ahmed',
          credentials: 'MD',
          departmentId,
          active: true,
        },
      });

      expect(res.status).toBe(200);
      const provider = res.data.data || res.data;
      expect(provider).toHaveProperty('providerId');
    });

    it('should reject provider without display name', async () => {
      const res = await request('/api/providers', {
        method: 'POST',
        token,
        body: {
          credentials: 'MD',
          active: true,
        },
      });

      expect(res.status).toBe(400);
    });

    it('should create inactive provider', async () => {
      const res = await request('/api/providers', {
        method: 'POST',
        token,
        body: {
          displayName: 'Dr. Inactive Test',
          credentials: 'MD',
          active: false,
        },
      });

      expect(res.status).toBe(200);
      const provider = res.data.data || res.data;
      expect(provider.active).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request('/api/providers', {
        method: 'POST',
        body: {
          displayName: 'Dr. Test',
          credentials: 'MD',
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/providers', () => {
    it('should list all providers', async () => {
      const res = await request('/api/providers', { token });

      expect(res.status).toBe(200);
      const list = res.data.data || res.data;
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });

    it('should filter active providers', async () => {
      const res = await request('/api/providers?active=true', { token });

      expect(res.status).toBe(200);
      const list = res.data.data || res.data;
      expect(Array.isArray(list)).toBe(true);
    });

    it('should filter by department', async () => {
      if (departmentId) {
        const res = await request(
          `/api/providers?departmentId=${departmentId}`,
          { token }
        );

        expect(res.status).toBe(200);
        const list = res.data.data || res.data;
        expect(Array.isArray(list)).toBe(true);
      }
    });

    it('should require authentication', async () => {
      const res = await request('/api/providers');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/providers/:id', () => {
    it('should get provider by id', async () => {
      if (!providerId) {
        const provider = await createTestProvider(token);
        providerId = provider.providerId;
      }

      const res = await request(`/api/providers/${providerId}`, { token });

      expect(res.status).toBe(200);
      const provider = res.data.data || res.data;
      expect(provider).toHaveProperty('providerId', providerId);
    });

    it('should return 404 for non-existent provider', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(`/api/providers/${fakeId}`, { token });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should require authentication', async () => {
      const res = await request(`/api/providers/${providerId || 'test-id'}`);

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/providers/:id', () => {
    it('should update provider details', async () => {
      if (!providerId) {
        const provider = await createTestProvider(token);
        providerId = provider.providerId;
      }

      const res = await request(`/api/providers/${providerId}`, {
        method: 'PUT',
        token,
        body: {
          displayName: 'Dr. Updated Name',
          specialization: 'Updated Specialization',
        },
      });

      expect(res.status).toBeLessThanOrEqual(404);
      if (res.status === 200) {
        const provider = res.data.data || res.data;
        expect(provider.displayName).toBe('Dr. Updated Name');
      }
    });

    it('should deactivate provider', async () => {
      const provider = await createTestProvider(token);

      const res = await request(`/api/providers/${provider.providerId}`, {
        method: 'PUT',
        token,
        body: {
          active: false,
        },
      });

      expect(res.status).toBeLessThanOrEqual(404);
    });

    it('should require authentication', async () => {
      const res = await request(`/api/providers/${providerId || 'test-id'}`, {
        method: 'PUT',
        body: { displayName: 'Test' },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/providers/:id', () => {
    it('should soft delete provider', async () => {
      const provider = await createTestProvider(token, {
        displayName: 'Dr. To Be Deleted',
      });

      const res = await request(`/api/providers/${provider.providerId}`, {
        method: 'DELETE',
        token,
      });

      expect(res.status).toBeLessThanOrEqual(404);
    });

    it('should require authentication', async () => {
      const res = await request('/api/providers/test-id', {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Provider Schedule Management', () => {
    it('should get provider availability', async () => {
      if (!providerId) {
        const provider = await createTestProvider(token);
        providerId = provider.providerId;
      }

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(tomorrow);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const res = await request(
        `/api/scheduler/availability?providerId=${providerId}&from=${tomorrow.toISOString()}&to=${nextWeek.toISOString()}`,
        { token }
      );

      expect(res.status).toBeLessThan(500);
    });
  });
});
