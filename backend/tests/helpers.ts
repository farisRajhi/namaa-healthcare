/**
 * Test helpers — shared utilities for API tests
 */

const BASE_URL = 'http://localhost:3003';

interface FetchOptions {
  method?: string;
  body?: Record<string, any>;
  token?: string;
  headers?: Record<string, string>;
}

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

// Generate a unique email for testing
export function uniqueEmail(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.com`;
}

// Register + login, return token + user info
export async function createTestUser(): Promise<{
  token: string;
  userId: string;
  orgId: string;
  email: string;
}> {
  const email = uniqueEmail();
  const password = 'TestPass123!';
  const orgName = `TestOrg_${Date.now()}`;

  const res = await request('/api/auth/register', {
    method: 'POST',
    body: { email, password, orgName },
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
