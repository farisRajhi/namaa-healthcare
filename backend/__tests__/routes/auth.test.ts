/**
 * Unit tests for Authentication routes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request, uniqueEmail, createTestUser } from '../helpers/testUtils';

describe('Authentication Routes', () => {
  let testToken: string;
  let testOrgId: string;
  let testUserId: string;

  describe('POST /api/auth/register', () => {
    it('should create a new user with valid credentials', async () => {
      const email = uniqueEmail();
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email,
          password: 'StrongPass123!',
          orgName: 'Test Hospital',
        },
      });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('token');
      expect(res.data).toHaveProperty('user');
      expect(res.data.user).toHaveProperty('userId');
      expect(res.data).toHaveProperty('org');
      expect(res.data.org).toHaveProperty('id');
      expect(res.data.user.email).toBe(email);
    });

    it('should reject registration with weak password', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: uniqueEmail(),
          password: 'weak',
          orgName: 'Test Org',
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject registration with invalid email', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: 'not-an-email',
          password: 'StrongPass123!',
          orgName: 'Test Org',
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate email registration', async () => {
      const email = uniqueEmail();
      
      // First registration
      await request('/api/auth/register', {
        method: 'POST',
        body: {
          email,
          password: 'StrongPass123!',
          orgName: 'First Org',
        },
      });

      // Duplicate registration
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email,
          password: 'StrongPass123!',
          orgName: 'Second Org',
        },
      });

      expect(res.status).toBe(409);
    });

    it('should reject registration without orgName', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: uniqueEmail(),
          password: 'StrongPass123!',
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    const testEmail = uniqueEmail();
    const testPassword = 'TestPass123!';

    beforeAll(async () => {
      // Create a test user for login tests
      await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: testEmail,
          password: testPassword,
          orgName: 'Login Test Org',
        },
      });
    });

    it('should login with valid credentials', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: {
          email: testEmail,
          password: testPassword,
        },
      });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('token');
      expect(res.data).toHaveProperty('user');
      expect(res.data.user.email).toBe(testEmail);
    });

    it('should reject login with wrong password', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: {
          email: testEmail,
          password: 'WrongPassword123!',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should reject login with non-existent email', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: {
          email: 'nonexistent@test.com',
          password: 'SomePassword123!',
        },
      });

      expect(res.status).toBe(401);
    });

    it('should reject login without email', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: {
          password: testPassword,
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject login without password', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: {
          email: testEmail,
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    beforeAll(async () => {
      const user = await createTestUser();
      testToken = user.token;
      testUserId = user.userId;
      testOrgId = user.orgId;
    });

    it('should return current user with valid token', async () => {
      const res = await request('/api/auth/me', {
        token: testToken,
      });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('email');
      expect(res.data).toHaveProperty('org');
    });

    it('should reject request without token', async () => {
      const res = await request('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request('/api/auth/me', {
        token: 'invalid-token-12345',
      });

      expect(res.status).toBe(401);
    });

    it('should reject request with malformed token', async () => {
      const res = await request('/api/auth/me', {
        token: 'Bearer malformed',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Password validation', () => {
    it('should reject password without uppercase letter', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: uniqueEmail(),
          password: 'weakpass123!',
          orgName: 'Test Org',
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject password without lowercase letter', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: uniqueEmail(),
          password: 'WEAKPASS123!',
          orgName: 'Test Org',
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject password without number', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: uniqueEmail(),
          password: 'WeakPassword!',
          orgName: 'Test Org',
        },
      });

      expect(res.status).toBe(400);
    });

    it('should reject password shorter than 8 characters', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: uniqueEmail(),
          password: 'Short1!',
          orgName: 'Test Org',
        },
      });

      expect(res.status).toBe(400);
    });
  });
});
