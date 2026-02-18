# Namaa Backend Test Suite

Comprehensive test suite for the Namaa AI Medical Receptionist backend using Vitest.

## 📁 Test Structure

```
__tests__/
├── helpers/
│   ├── testUtils.ts      # Test utilities and API helpers
│   └── mocks.ts          # Mock services and factories
├── routes/               # API endpoint tests
│   ├── auth.test.ts
│   ├── appointments.test.ts
│   ├── patients.test.ts
│   ├── analytics.test.ts
│   └── chat.test.ts
├── services/             # Business logic tests
│   ├── patient/
│   │   └── contextBuilder.test.ts
│   ├── ai/
│   │   └── guardrails.test.ts
│   ├── voice/
│   │   └── ttsService.test.ts
│   └── reminders/
│       └── reminderService.test.ts
└── integration/          # End-to-end flow tests
    └── booking-flow.test.ts
```

## 🚀 Running Tests

### Run all tests
```bash
npm test
```

### Watch mode (for development)
```bash
npm run test:watch
```

### Test with UI (interactive dashboard)
```bash
npm run test:ui
```

### Run specific test suites
```bash
# Route tests only
npm run test:routes

# Service tests only
npm run test:services

# Integration tests only
npm run test:integration

# All unit tests (routes + services)
npm run test:unit
```

### Coverage report
```bash
npm run test:coverage
```

## 📊 Test Categories

### 1. Route Tests (API Endpoints)

Tests for all HTTP endpoints:
- **Authentication** (`auth.test.ts`)
  - User registration
  - Login/logout
  - Token validation
  - Password requirements
  
- **Appointments** (`appointments.test.ts`)
  - Create/read/update/delete appointments
  - Status transitions
  - Filtering and pagination
  
- **Patients** (`patients.test.ts`)
  - Patient CRUD operations
  - Search and filtering
  - Validation rules
  
- **Analytics** (`analytics.test.ts`)
  - Overview statistics
  - Charts and reports
  - Performance metrics
  
- **Chat** (`chat.test.ts`)
  - AI chat interactions
  - Intent detection
  - Session management

### 2. Service Tests (Business Logic)

Tests for core services:
- **Patient Context Builder**
  - Context enrichment
  - History retrieval
  - Data filtering
  
- **AI Guardrails**
  - Medical advice detection
  - PII detection
  - Emergency detection
  - Content filtering
  
- **TTS Service**
  - Text-to-speech conversion
  - Multi-language support
  - Voice selection
  - Caching
  
- **Reminder Service**
  - Scheduling logic
  - SMS/voice reminders
  - Batch processing
  - Status tracking

### 3. Integration Tests

End-to-end workflow tests:
- Complete booking flow
- Multi-channel interactions
- Analytics integration
- Error handling

## 🛠️ Test Utilities

### API Request Helper
```typescript
import { request } from '../helpers/testUtils';

const res = await request('/api/patients', {
  method: 'POST',
  token: authToken,
  body: { firstName: 'Test', lastName: 'Patient' }
});
```

### Test Data Factories
```typescript
import { createTestUser, createTestPatient } from '../helpers/testUtils';

const user = await createTestUser();
const patient = await createTestPatient(user.token);
```

### Mocks
```typescript
import { mockPrismaClient, mockOpenAI, mockTwilio } from '../helpers/mocks';

mockPrismaClient.patient.findUnique.mockResolvedValue(patient);
```

## ✅ Test Coverage Goals

- **Routes**: 90%+ coverage of all endpoints
- **Services**: 85%+ coverage of business logic
- **Integration**: All critical user flows
- **Error Cases**: Validation and error handling

## 🔍 Writing New Tests

### Route Test Example
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { request, createTestUser } from '../helpers/testUtils';

describe('Your Route', () => {
  let token: string;

  beforeAll(async () => {
    const user = await createTestUser();
    token = user.token;
  });

  it('should do something', async () => {
    const res = await request('/api/your-endpoint', { token });
    expect(res.status).toBe(200);
  });
});
```

### Service Test Example
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mockPrismaClient, resetAllMocks } from '../helpers/mocks';

describe('Your Service', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('should perform business logic', () => {
    // Test service logic
    expect(result).toBeDefined();
  });
});
```

## 🧪 Test Environment

Tests run against:
- **Database**: PostgreSQL (test database on port 5434)
- **Environment**: `NODE_ENV=test`
- **Base URL**: `http://localhost:3003` (configurable)

### Environment Variables

Create `.env.test` file:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/namaa_test
JWT_SECRET=test-secret-key
NODE_ENV=test
```

## 📝 Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Clean up created resources after tests
3. **Mocking**: Mock external services (OpenAI, Twilio, etc.)
4. **Assertions**: Use specific, meaningful assertions
5. **Naming**: Use descriptive test names
6. **Coverage**: Aim for high coverage, but prioritize critical paths

## 🐛 Debugging Tests

### Run specific test file
```bash
npx vitest run __tests__/routes/auth.test.ts
```

### Run specific test case
```bash
npx vitest run -t "should create a new user"
```

### Enable verbose logging
```bash
DEBUG=* npm test
```

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [API Testing Guide](https://www.fastify.io/docs/latest/Guides/Testing/)

## 🤝 Contributing

When adding new features:
1. Write tests first (TDD approach recommended)
2. Ensure all tests pass
3. Maintain or improve coverage
4. Update this README if needed

## 📞 Support

For test-related questions, check:
- Test output and error messages
- Coverage reports in `coverage/` directory
- Existing test examples in `__tests__/`
