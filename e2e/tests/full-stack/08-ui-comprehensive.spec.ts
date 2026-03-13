import { test, expect } from '@playwright/test';
import path from 'path';

const MOUSIKE = 'http://localhost:8080';
const PHOENIX = 'http://localhost:6006';
const GRAFANA = 'http://localhost:3000';
const SCREENSHOTS = path.resolve(__dirname, '../../screenshots');

test.describe('08 - UI Comprehensive Tests', () => {
  test('Vaadin app loads with main layout', async ({ page }) => {
    await page.goto(`${MOUSIKE}/`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/08-main-layout.png`, fullPage: true });
  });

  test('chat view — full interaction flow', async ({ page }) => {
    await page.goto(`${MOUSIKE}/chat`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // Verify chat elements exist
    const input = page.locator('#chat-input input, vaadin-text-field input').first();
    await expect(input).toBeVisible({ timeout: 15_000 });
    const sendBtn = page.locator('vaadin-button, button').filter({ hasText: /send|submit|ask/i }).first();
    await expect(sendBtn).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: `${SCREENSHOTS}/08-chat-empty.png`, fullPage: true });

    // Type and send a message
    await input.fill('What is a symphony?');
    await sendBtn.click();

    // Wait for LLM response
    await page.waitForTimeout(15_000);
    await page.screenshot({ path: `${SCREENSHOTS}/08-chat-with-response.png`, fullPage: true });
  });

  test('search view — UI elements present', async ({ page }) => {
    await page.goto(`${MOUSIKE}/search`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/08-search-view.png`, fullPage: true });

    const searchInput = page.locator('vaadin-text-field, input[type="text"]').first();
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    const searchBtn = page.locator('vaadin-button, button').filter({ hasText: /search/i }).first();
    await expect(searchBtn).toBeVisible({ timeout: 15_000 });
  });

  test('search view — perform search and see results', async ({ page }) => {
    await page.goto(`${MOUSIKE}/search`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    const searchInput = page.locator('#search-input input, vaadin-text-field input').first();
    await expect(searchInput).toBeVisible({ timeout: 15_000 });
    await searchInput.fill('classical composers music theory');

    const searchBtn = page.locator('vaadin-button, button').filter({ hasText: /search/i }).first();
    await searchBtn.click();

    await page.waitForTimeout(5_000);
    await page.screenshot({ path: `${SCREENSHOTS}/08-search-results.png`, fullPage: true });
  });

  test('composer view — extraction UI elements', async ({ page }) => {
    await page.goto(`${MOUSIKE}/composer`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/08-composer-view.png`, fullPage: true });

    const textArea = page.locator('vaadin-text-area textarea, vaadin-text-field input, textarea').first();
    await expect(textArea).toBeVisible({ timeout: 15_000 });
  });

  test('monitor view — observability dashboard links', async ({ page }) => {
    await page.goto(`${MOUSIKE}/monitor`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/08-monitor-view.png`, fullPage: true });
  });

  test('Phoenix trace viewer UI', async ({ page }) => {
    await page.goto(PHOENIX);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/08-phoenix-traces.png`, fullPage: true });
  });

  test('Grafana dashboard UI', async ({ page }) => {
    // Login to Grafana
    await page.goto(`${GRAFANA}/login`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // Fill login form
    const usernameInput = page.locator('input[name="user"]');
    const passwordInput = page.locator('input[name="password"]');

    if (await usernameInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await usernameInput.fill('admin');
      await passwordInput.fill('admin');
      const loginBtn = page.locator('button[type="submit"]');
      await loginBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // Skip password change if prompted
      const skipBtn = page.locator('a, button').filter({ hasText: /skip/i }).first();
      if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await skipBtn.click();
        await page.waitForLoadState('networkidle', { timeout: 10_000 });
      }
    }

    await page.screenshot({ path: `${SCREENSHOTS}/08-grafana-home.png`, fullPage: true });
  });

  test('Grafana Explore — Tempo traces view', async ({ page }) => {
    await page.goto(`${GRAFANA}/explore?orgId=1&left=%7B%22datasource%22:%22tempo%22%7D`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // Login if needed
    const usernameInput = page.locator('input[name="user"]');
    if (await usernameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await usernameInput.fill('admin');
      await page.locator('input[name="password"]').fill('admin');
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
      const skipBtn = page.locator('a, button').filter({ hasText: /skip/i }).first();
      if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await skipBtn.click();
      }
      await page.goto(`${GRAFANA}/explore?orgId=1&left=%7B%22datasource%22:%22tempo%22%7D`);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    }

    await page.screenshot({ path: `${SCREENSHOTS}/08-grafana-tempo-explore.png`, fullPage: true });
  });

  test('Grafana Explore — Prometheus metrics view', async ({ page }) => {
    await page.goto(`${GRAFANA}/explore?orgId=1&left=%7B%22datasource%22:%22prometheus%22%7D`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    const usernameInput = page.locator('input[name="user"]');
    if (await usernameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await usernameInput.fill('admin');
      await page.locator('input[name="password"]').fill('admin');
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
      const skipBtn = page.locator('a, button').filter({ hasText: /skip/i }).first();
      if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await skipBtn.click();
      }
      await page.goto(`${GRAFANA}/explore?orgId=1&left=%7B%22datasource%22:%22prometheus%22%7D`);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    }

    await page.screenshot({ path: `${SCREENSHOTS}/08-grafana-prometheus-explore.png`, fullPage: true });
  });
});
