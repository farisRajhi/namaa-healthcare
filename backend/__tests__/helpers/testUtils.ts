/**
 * Test utilities and helpers for Vitest
 */

import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3003';

export interface FetchOptions {
  method?: string;
  body?: Record<string, any>;
  token?: string;
  headers?: Record<string, string>;
}

/**
 * Make HTTP request to API
 */
export async function request(
  path: string,
  options: FetchOptions = {}
): Promise<{ status: number; data: any; headers: Headers }> {
  const { method = 'GET', body, token, headers = {} } = options;

  const fetchHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (token) {
    fetchHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: fetchHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: any;
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { status: response.status, data, headers: response.headers };
}

/**
 * Generate unique email for testing
 */
export function uniqueEmail(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.com`;
}

/**
 * Generate unique MRN
 */
export function uniqueMRN(): string {
  return `MRN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Generate unique phone number
 */
export function uniquePhone(): string {
  return `+966${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`;
}

/**
 * Create a test user and organization
 */
export async function createTestUser(orgName?: string): Promise<{
  token: string;
  userId: string;
  orgId: string;
  email: string;
}> {
  const email = uniqueEmail();
  const password = 'TestPass123!';
  const name = orgName || `TestOrg_${Date.now()}`;

  const res = await request('/api/auth/register', {
    method: 'POST',
    body: { email, password, orgName: name },
  });

  if (res.status !== 200) {
    throw new Error(`Failed to create test user: ${JSON.stringify(res.data)}`);
  }

  return {
    token: res.data.token,
    userId: res.data.user.userId,
    orgId: res.data.org.id,
    email,
  };
}

/**
 * Create a test patient
 */
export async function createTestPatient(token: string, overrides?: Partial<any>): Promise<any> {
  const res = await request('/api/patients', {
    method: 'POST',
    token,
    body: {
      firstName: 'Test',
      lastName: 'Patient',
      sex: 'male',
      mrn: uniqueMRN(),
      phone: uniquePhone(),
      ...overrides,
    },
  });

  if (res.status !== 200) {
    throw new Error(`Failed to create test patient: ${JSON.stringify(res.data)}`);
  }

  return res.data.data || res.data;
}

/**
 * Create a test provider
 */
export async function createTestProvider(token: string, overrides?: Partial<any>): Promise<any> {
  const res = await request('/api/providers', {
    method: 'POST',
    token,
    body: {
      displayName: 'Dr. Test Provider',
      credentials: 'MD',
      active: true,
      ...overrides,
    },
  });

  if (res.status !== 200) {
    throw new Error(`Failed to create test provider: ${JSON.stringify(res.data)}`);
  }

  return res.data.data || res.data;
}

/**
 * Create a test service
 */
export async function createTestService(token: string, overrides?: Partial<any>): Promise<any> {
  const res = await request('/api/services', {
    method: 'POST',
    token,
    body: {
      name: `Test Service ${Date.now()}`,
      durationMin: 30,
      ...overrides,
    },
  });

  if (res.status !== 200) {
    throw new Error(`Failed to create test service: ${JSON.stringify(res.data)}`);
  }

  return res.data.data || res.data;
}

/**
 * Create a test department
 */
export async function createTestDepartment(token: string, overrides?: Partial<any>): Promise<any> {
  const res = await request('/api/departments', {
    method: 'POST',
    token,
    body: {
      name: `Test Department ${Date.now()}`,
      ...overrides,
    },
  });

  if (res.status !== 200) {
    throw new Error(`Failed to create test department: ${JSON.stringify(res.data)}`);
  }

  return res.data;
}

/**
 * Create a test facility
 */
export async function createTestFacility(token: string, overrides?: Partial<any>): Promise<any> {
  const res = await request('/api/facilities', {
    method: 'POST',
    token,
    body: {
      name: `Test Facility ${Date.now()}`,
      timezone: 'Asia/Riyadh',
      ...overrides,
    },
  });

  if (res.status !== 200) {
    throw new Error(`Failed to create test facility: ${JSON.stringify(res.data)}`);
  }

  return res.data.data || res.data;
}

/**
 * Create a test appointment
 */
export async function createTestAppointment(
  token: string,
  providerId: string,
  serviceId: string,
  patientId: string,
  overrides?: Partial<any>
): Promise<any> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
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
      ...overrides,
    },
  });

  if (res.status !== 200) {
    throw new Error(`Failed to create test appointment: ${JSON.stringify(res.data)}`);
  }

  return res.data.data || res.data;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for condition');
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
