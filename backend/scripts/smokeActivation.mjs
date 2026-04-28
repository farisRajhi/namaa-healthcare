// Smoke test the activation gate end-to-end.
//   1. Login as a known staff user (testuser@test.com)
//   2. /api/auth/me should return org.isActivated: true (after migration backfill)
//   3. Hit /api/campaigns/<orgId> — should be 200 (or whatever data response, not 403)
//   4. Flip the org to is_activated=false via direct SQL
//   5. Hit /api/campaigns/<orgId> again — should be 403 ORG_NOT_ACTIVATED
//   6. Restore is_activated=true
//
// Run: cd backend && node scripts/smokeActivation.mjs
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:3007';
const EMAIL = 'testuser@test.com';
const PASSWORD = 'Test1234!';

const prisma = new PrismaClient();

async function main() {
  // Make sure password is what we think it is.
  const hash = await bcrypt.hash(PASSWORD, 12);
  await prisma.user.update({ where: { email: EMAIL }, data: { password: hash, isActive: true } });

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginText = await loginRes.text();
  let login;
  try {
    login = JSON.parse(loginText);
  } catch {
    console.error('login response not JSON', loginRes.status, loginText.slice(0, 500));
    process.exit(1);
  }
  console.log('login', loginRes.status, login.token ? 'token-ok' : login);
  if (!login.token) process.exit(1);

  const meRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  const me = await meRes.json();
  console.log('me', meRes.status, JSON.stringify(me));
  const orgId = me.org?.id;
  if (!orgId) process.exit(1);

  // Initially activated → /api/patients should NOT be 403 (it only requires activation, not a manager role)
  const okRes = await fetch(`${BASE}/api/patients`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  const okBody = await okRes.text();
  console.log('patients (activated)', okRes.status, okBody.slice(0, 120));

  // Flip to deactivated
  await prisma.org.update({
    where: { orgId },
    data: { isActivated: false, activatedAt: null, activatedByPlatformAdminId: null },
  });

  const blockedRes = await fetch(`${BASE}/api/patients`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  const blockedBody = await blockedRes.json().catch(() => ({}));
  console.log('patients (deactivated)', blockedRes.status, JSON.stringify(blockedBody));

  // /me should now reflect isActivated=false
  const meDeactRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  const meDeact = await meDeactRes.json();
  console.log('me (deactivated)', meDeactRes.status, JSON.stringify(meDeact));

  // Restore
  await prisma.org.update({
    where: { orgId },
    data: { isActivated: true, activatedAt: new Date() },
  });
  console.log('restored → is_activated=true');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
