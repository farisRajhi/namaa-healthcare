import { test, expect } from '@playwright/test';

// Seed E2E test for the public booking flow.
// Assumes a seeded org with a public-booking slug.
// Set E2E_BOOKING_SLUG to override the default ('demo').

const BOOKING_SLUG = process.env.E2E_BOOKING_SLUG ?? 'demo';

test.describe('Public booking page', () => {
  test('booking page loads and shows providers', async ({ page }) => {
    await page.goto(`/book/${BOOKING_SLUG}`);

    // Page should not 404 and should show some org branding
    await expect(page).not.toHaveURL(/404|not[- ]found/i);

    // Wait for the providers list to appear (any element matching common patterns).
    // Adjust selectors once we wire data-testid attributes into BookingPage.
    const providersOrLoading = page.locator(
      '[data-testid="providers-list"], [data-testid="booking-loading"], [role="list"]'
    );
    await expect(providersOrLoading.first()).toBeVisible({ timeout: 10_000 });
  });

  test('returns 404-style state for unknown slug', async ({ page }) => {
    await page.goto('/book/this-slug-should-not-exist-xyz');

    await expect(
      page.getByText(/not found|غير موجود|عيادة غير موجودة/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
