import { test, expect } from '@playwright/test';

// Seed E2E test for staff login flow.
// Assumes:
//   - Backend running on :3007 (PORT=3007 npm run dev in backend/)
//   - Frontend running on :5174 (or playwright will start it via webServer config)
//   - A demo org has been seeded via `npx prisma db seed`
//
// If your seed credentials differ, set E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD env vars.

const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? 'admin@demo.tawafud.ai';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? 'DemoPassword123!';

test.describe('Staff login', () => {
  test('redirects to dashboard on valid credentials', async ({ page }) => {
    await page.goto('/login');

    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel(/email/i).fill(STAFF_EMAIL);
    await page.getByLabel(/password/i).fill(STAFF_PASSWORD);
    await page.getByRole('button', { name: /log in|sign in|دخول/i }).click();

    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email/i).fill(STAFF_EMAIL);
    await page.getByLabel(/password/i).fill('definitely-wrong-password');
    await page.getByRole('button', { name: /log in|sign in|دخول/i }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/invalid|بيانات الدخول غير صحيحة/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});
