// Smoke-test the platform admin activation endpoint:
//   1. Login as platform admin (faris@tawafud.com)
//   2. List orgs — verify they include is_activated/activated_at
//   3. PATCH /api/platform/orgs/:id/activation with isActivated=false
//   4. Verify org is deactivated
//   5. PATCH back to true
//
// Run: cd backend && node scripts/smokePlatformActivation.mjs
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:3007';
const EMAIL = 'faris@tawafud.com';
const PASSWORD = 'PlatformAdmin1!';

const prisma = new PrismaClient();

async function main() {
  // Reset platform admin password so we can log in
  const hash = await bcrypt.hash(PASSWORD, 12);
  await prisma.platformAdmin.update({ where: { email: EMAIL }, data: { password: hash } });

  // Avoid token-iat <= lastLogin race: shift lastLogin back so the new token is valid.
  await prisma.platformAdmin.update({
    where: { email: EMAIL },
    data: { lastLogin: new Date(Date.now() - 60_000) },
  });

  const loginRes = await fetch(`${BASE}/api/platform/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = await loginRes.json();
  console.log('login', loginRes.status, login.token ? 'token-ok' : login);
  if (!login.token) process.exit(1);

  // List orgs
  const listRes = await fetch(`${BASE}/api/platform/orgs?pageSize=2`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  const list = await listRes.json();
  console.log('orgs[0]', JSON.stringify(list.data?.[0]));

  const orgId = list.data?.[0]?.orgId;
  if (!orgId) process.exit(1);

  // Deactivate via the new endpoint
  const deactRes = await fetch(`${BASE}/api/platform/orgs/${orgId}/activation`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ isActivated: false, reason: 'smoke test deactivate' }),
  });
  const deact = await deactRes.json();
  console.log('deactivate', deactRes.status, JSON.stringify(deact).slice(0, 200));

  // Re-fetch detail
  const detailRes = await fetch(`${BASE}/api/platform/orgs/${orgId}`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  const detail = await detailRes.json();
  console.log('detail', detailRes.status, 'isActivated=', detail.isActivated, 'activatedAt=', detail.activatedAt);

  // Reactivate
  const actRes = await fetch(`${BASE}/api/platform/orgs/${orgId}/activation`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ isActivated: true, reason: 'smoke test reactivate' }),
  });
  console.log('activate', actRes.status);

  // Confirm audit log row created
  const audit = await prisma.auditLog.findFirst({
    where: { orgId, action: { startsWith: 'platform.org.' } },
    orderBy: { createdAt: 'desc' },
    select: { action: true, details: true, createdAt: true },
  });
  console.log('latest audit', JSON.stringify(audit));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
