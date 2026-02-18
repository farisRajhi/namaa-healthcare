/**
 * Vitest setup file
 * Runs before all tests
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Global test setup
beforeAll(async () => {
  console.log('🧪 Starting Vitest test suite...');
  // Setup test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5434/namaa_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only';
});

afterAll(async () => {
  console.log('✅ Vitest test suite completed');
});

// Per-test setup
beforeEach(async () => {
  // Reset any global state if needed
});

afterEach(async () => {
  // Cleanup after each test
});
