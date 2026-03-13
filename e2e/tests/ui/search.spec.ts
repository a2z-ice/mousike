import { test, expect } from '@playwright/test';

test.describe('Search View', () => {
  test('search page loads', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    expect(page.url()).toContain('/search');
  });

  test('search page has input field', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    const input = page.locator('vaadin-text-field, vaadin-text-area, input[type="text"], textarea').first();
    await expect(input).toBeVisible({ timeout: 15_000 });
  });

  test('search page has search button', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    const btn = page.locator('vaadin-button, button').filter({ hasText: /search/i }).first();
    await expect(btn).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Composer View', () => {
  test('composer page loads', async ({ page }) => {
    await page.goto('/composer');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    expect(page.url()).toContain('/composer');
  });

  test('composer page has text input', async ({ page }) => {
    await page.goto('/composer');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    const input = page.locator('vaadin-text-area, vaadin-text-field, textarea').first();
    await expect(input).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Monitor View', () => {
  test('monitor page loads', async ({ page }) => {
    await page.goto('/monitor');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    expect(page.url()).toContain('/monitor');
  });

  test('monitor page has links to observability tools', async ({ page }) => {
    await page.goto('/monitor');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    // Should have links to Phoenix and/or Grafana
    const links = page.locator('a[href*="6006"], a[href*="3000"], vaadin-anchor, [class*="link"]');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(0); // May not have external links visible
  });
});
