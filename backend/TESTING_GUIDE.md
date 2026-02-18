# Namaa Backend - Testing Guide

## 🎯 Overview

This document provides a complete guide to the test suite for Namaa (نماء) AI Medical Receptionist backend.

## 📦 What Was Installed

### Testing Dependencies
```json
{
  "vitest": "^4.0.18",           // Modern, fast test framework
  "@vitest/ui": "^4.0.18",       // Interactive test UI
  "c8": "^10.1.3",               // Code coverage
  "supertest": "^7.2.2",         // HTTP assertions
  "@types/supertest": "^6.0.3",  // TypeScript types
  "happy-dom": "^20.6.1",        // DOM implementation
  "msw": "^2.12.10",             // API mocking
  "@testing-library/react": "^16.3.2",
  "@testing-library/jest-dom": "^6.9.1"
}
```

## 🗂️ Test Structure

```
backend/
├── __tests__/                    # New Vitest test suite
│   ├── helpers/
│   │   ├── testUtils.ts          # API helpers, factories
│   │   └── mocks.ts              # Mock services
│   ├── routes/                   # API endpoint tests
│   │   ├── auth.test.ts          # 20+ tests
│   │   ├── appointments.test.ts  # 25+ tests
│   │   ├── patients.test.ts      # 20+ tests
│   │   ├── providers.test.ts     # 18+ tests
│   │   ├── analytics.test.ts     # 10+ tests
│   │   └── chat.test.ts          # 12+ tests
│   ├── services/                 # Business logic tests
│   │   ├── patient/
│   │   │   └── contextBuilder.test.ts    # 8+ tests
│   │   ├── ai/
│   │   │   └── guardrails.test.ts        # 16+ tests
│   │   ├── voice/
│   │   │   └── ttsService.test.ts        # 20+ tests
│   │   └── reminders/
│   │       └── reminderService.test.ts   # 30+ tests
│   ├── integration/
│   │   └── booking-flow.test.ts  # 10+ tests
│   └── README.md                 # Test documentation
├── tests/                        # Legacy test suite (preserved)
│   ├── api.test.ts
│   └── helpers.ts
├── vitest.config.ts              # Vitest configuration
├── vitest.setup.ts               # Test setup
└── TEST_SUITE_SUMMARY.md         # This document
```

## 🚀 Running Tests

### Basic Commands

```bash
# Run all tests (single pass)
npm test

# Run tests in watch mode (reruns on file changes)
npm run test:watch

# Run tests with interactive UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Targeted Testing

```bash
# Test only routes
npm run test:routes

# Test only services
npm run test:services

# Test only integration
npm run test:integration

# Test only unit tests (routes + services)
npm run test:unit

# Run everything including coverage
npm run test:all
```

### Run Specific Files

```bash
# Run single test file
npx vitest run __tests__/routes/auth.test.ts

# Run specific test pattern
npx vitest run -t "should create a new user"

# Run tests matching a pattern
npx vitest run auth
```

## 📊 Test Coverage

### Current Test Count
- **Route Tests**: 105+ test cases
- **Service Tests**: 74+ test cases
- **Integration Tests**: 10+ test cases
- **Total**: 189+ test cases

### Coverage by Feature

#### Authentication & Authorization (20 tests)
- ✅ User registration with validation
- ✅ Login/logout flows
- ✅ Token management
- ✅ Password strength validation
- ✅ Duplicate email handling
- ✅ Missing field validation

#### Appointment Management (25 tests)
- ✅ Create, read, update, delete
- ✅ Status transitions
- ✅ Provider/patient/service linking
- ✅ Time slot validation
- ✅ Filtering & pagination
- ✅ Authorization checks

#### Patient Management (20 tests)
- ✅ CRUD operations
- ✅ Search functionality
- ✅ MRN uniqueness
- ✅ Data validation
- ✅ Demographics handling

#### Provider Management (18 tests)
- ✅ Provider CRUD
- ✅ Department assignment
- ✅ Active/inactive status
- ✅ Schedule management
- ✅ Specialization tracking

#### Analytics (10 tests)
- ✅ Overview statistics
- ✅ Appointment trends
- ✅ Channel distribution
- ✅ Provider performance
- ✅ Patient demographics

#### AI Chat (12 tests)
- ✅ Message handling
- ✅ Intent detection
- ✅ Session management
- ✅ Bilingual support (EN/AR)
- ✅ History retrieval

#### AI Guardrails (16 tests)
- ✅ Medical advice detection
- ✅ PII detection (credit cards, SSN)
- ✅ Emergency keyword detection
- ✅ Profanity filtering
- ✅ Scope validation
- ✅ Response quality

#### Voice Services (20 tests)
- ✅ Text-to-speech conversion
- ✅ Multi-language support
- ✅ Voice selection
- ✅ Audio quality
- ✅ Medical terminology
- ✅ Caching
- ✅ Error handling

#### Reminder Service (30 tests)
- ✅ Reminder scheduling
- ✅ SMS delivery
- ✅ Voice call reminders
- ✅ Bilingual templates
- ✅ Patient preferences
- ✅ Timezone handling
- ✅ Batch processing
- ✅ Delivery tracking
- ✅ Analytics

#### Integration Flows (10 tests)
- ✅ Complete booking flow
- ✅ Cancellation flow
- ✅ Rescheduling flow
- ✅ Multi-channel booking
- ✅ Analytics integration

## 🛠️ Test Utilities

### Helper Functions

```typescript
// Create authenticated test user
const user = await createTestUser();
const { token, userId, orgId, email } = user;

// Create test patient
const patient = await createTestPatient(token, {
  firstName: 'Ahmed',
  lastName: 'Al-Rashid'
});

// Create test provider
const provider = await createTestProvider(token);

// Create test service
const service = await createTestService(token);

// Create test appointment
const appointment = await createTestAppointment(
  token, 
  providerId, 
  serviceId, 
  patientId
);

// Make API requests
const res = await request('/api/patients', {
  method: 'POST',
  token,
  body: { firstName: 'Test', lastName: 'Patient' }
});

// Generate unique test data
const email = uniqueEmail();      // test_123456_abc@test.com
const mrn = uniqueMRN();          // MRN-123456-ABC
const phone = uniquePhone();      // +966501234567
```

### Mock Services

```typescript
import { 
  mockPrismaClient, 
  mockOpenAI, 
  mockTwilio, 
  mockElevenLabs,
  factories 
} from '../helpers/mocks';

// Mock Prisma queries
mockPrismaClient.patient.findUnique.mockResolvedValue(patient);

// Mock AI responses
mockOpenAI.chat.completions.create.mockResolvedValue(response);

// Mock SMS sending
mockTwilio.messages.create.mockResolvedValue({ sid: 'SM123' });

// Use factories to create test data
const patient = factories.patient({ firstName: 'Test' });
const appointment = factories.appointment();
```

## ⚙️ Configuration

### vitest.config.ts
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html', 'lcov'],
    },
    testTimeout: 30000,
  },
});
```

### Environment Variables
Create `.env.test`:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/namaa_test
JWT_SECRET=test-secret-key-for-testing-only
NODE_ENV=test
```

## 📝 Writing New Tests

### Route Test Template
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { request, createTestUser } from '../helpers/testUtils';

describe('Your Feature', () => {
  let token: string;

  beforeAll(async () => {
    const user = await createTestUser();
    token = user.token;
  });

  it('should do something', async () => {
    const res = await request('/api/endpoint', { 
      method: 'POST',
      token,
      body: { data: 'test' }
    });
    
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('expectedField');
  });
});
```

### Service Test Template
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mockPrismaClient, resetAllMocks } from '../helpers/mocks';

describe('Your Service', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('should perform business logic', async () => {
    mockPrismaClient.model.findUnique.mockResolvedValue(data);
    
    const result = await yourService.method();
    
    expect(result).toBeDefined();
    expect(mockPrismaClient.model.findUnique).toHaveBeenCalled();
  });
});
```

## 🔍 Debugging Tests

### Enable Verbose Output
```bash
# Run with verbose reporter
npx vitest run --reporter=verbose

# Run specific test with logs
DEBUG=* npx vitest run -t "test name"
```

### View Coverage Report
```bash
npm run test:coverage
# Opens coverage/index.html in browser
```

### Interactive UI
```bash
npm run test:ui
# Opens web UI at http://localhost:51204
```

## 📈 CI/CD Integration

### GitHub Actions
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

## ✅ Best Practices

1. **Isolation**: Each test is independent
2. **Cleanup**: Resources are cleaned after tests
3. **Mocking**: External services are mocked
4. **Assertions**: Use specific, meaningful checks
5. **Coverage**: Aim for 80%+ on critical paths
6. **Speed**: Tests should be fast (<30s total)

## 🔗 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Fastify Testing Guide](https://www.fastify.io/docs/latest/Guides/Testing/)

## 📞 Support

For issues or questions:
1. Check test output for error details
2. Review coverage reports
3. Check existing test examples
4. Consult `__tests__/README.md`

---

**Test suite created by: AI Subagent**  
**Date: February 17, 2026**  
**Total Tests: 189+**  
**Coverage: Comprehensive**
