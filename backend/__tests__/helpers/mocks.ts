/**
 * Mock services and utilities for testing
 */

import { vi } from 'vitest';

/**
 * Mock Prisma client responses
 */
export const mockPrismaClient = {
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  patient: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  provider: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  appointment: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  service: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  department: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  facility: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
};

/**
 * Mock OpenAI service
 */
export const mockOpenAI = {
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Mocked AI response',
              role: 'assistant',
            },
          },
        ],
      }),
    },
  },
};

/**
 * Mock ElevenLabs TTS service
 */
export const mockElevenLabs = {
  textToSpeech: {
    convert: vi.fn().mockResolvedValue(Buffer.from('fake-audio-data')),
  },
  voices: {
    getAll: vi.fn().mockResolvedValue({
      voices: [
        { voice_id: 'voice-1', name: 'Test Voice 1' },
        { voice_id: 'voice-2', name: 'Test Voice 2' },
      ],
    }),
  },
};

/**
 * Mock Twilio service
 */
export const mockTwilio = {
  calls: {
    create: vi.fn().mockResolvedValue({
      sid: 'CA' + 'x'.repeat(32),
      status: 'queued',
    }),
  },
  messages: {
    create: vi.fn().mockResolvedValue({
      sid: 'SM' + 'x'.repeat(32),
      status: 'queued',
    }),
  },
  incomingPhoneNumbers: {
    list: vi.fn().mockResolvedValue([
      {
        phoneNumber: '+15551234567',
        friendlyName: 'Test Number',
      },
    ]),
  },
};

/**
 * Mock Google Gemini service
 */
export const mockGemini = {
  generateContent: vi.fn().mockResolvedValue({
    response: {
      text: () => 'Mocked Gemini response',
    },
  }),
  startChat: vi.fn().mockReturnValue({
    sendMessage: vi.fn().mockResolvedValue({
      response: {
        text: () => 'Mocked Gemini chat response',
      },
    }),
  }),
};

/**
 * Factory functions for test data
 */
export const factories = {
  user: (overrides = {}) => ({
    userId: `user-${Date.now()}`,
    email: `test${Date.now()}@test.com`,
    passwordHash: 'hashed-password',
    orgId: `org-${Date.now()}`,
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  organization: (overrides = {}) => ({
    id: `org-${Date.now()}`,
    name: `Test Org ${Date.now()}`,
    slug: `test-org-${Date.now()}`,
    plan: 'pro',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  patient: (overrides = {}) => ({
    patientId: `patient-${Date.now()}`,
    firstName: 'Test',
    lastName: 'Patient',
    mrn: `MRN-${Date.now()}`,
    sex: 'male',
    phone: '+966500000000',
    email: `patient${Date.now()}@test.com`,
    orgId: `org-${Date.now()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  provider: (overrides = {}) => ({
    providerId: `provider-${Date.now()}`,
    displayName: 'Dr. Test',
    credentials: 'MD',
    active: true,
    orgId: `org-${Date.now()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  appointment: (overrides = {}) => {
    const start = new Date();
    start.setHours(start.getHours() + 1);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30);

    return {
      appointmentId: `appt-${Date.now()}`,
      providerId: `provider-${Date.now()}`,
      patientId: `patient-${Date.now()}`,
      serviceId: `service-${Date.now()}`,
      startTs: start,
      endTs: end,
      status: 'booked',
      orgId: `org-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  },

  service: (overrides = {}) => ({
    serviceId: `service-${Date.now()}`,
    name: `Test Service ${Date.now()}`,
    durationMin: 30,
    orgId: `org-${Date.now()}`,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  department: (overrides = {}) => ({
    departmentId: `dept-${Date.now()}`,
    name: `Test Department ${Date.now()}`,
    orgId: `org-${Date.now()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  facility: (overrides = {}) => ({
    facilityId: `facility-${Date.now()}`,
    name: `Test Facility ${Date.now()}`,
    timezone: 'Asia/Riyadh',
    orgId: `org-${Date.now()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),
};

/**
 * Reset all mocks
 */
export function resetAllMocks() {
  vi.clearAllMocks();
  Object.values(mockPrismaClient).forEach(model => {
    Object.values(model).forEach(method => {
      if (typeof method === 'function') {
        method.mockReset();
      }
    });
  });
}
