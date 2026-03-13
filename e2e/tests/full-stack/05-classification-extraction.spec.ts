import { test, expect } from '@playwright/test';
import path from 'path';
import { extractMetricCount } from './helpers';

const MOUSIKE = 'http://localhost:8080';
const SCREENSHOTS = path.resolve(__dirname, '../../screenshots');

test.describe('05 - Classification & Extraction (LLM Structured Output)', () => {
  test('classify an instrument description', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/classify`, {
      data: { description: 'A large wooden instrument with 88 black and white keys that produces sound by hammers striking strings' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
    // The response should mention piano or keyboard
    const classification = JSON.stringify(body).toLowerCase();
    expect(classification).toMatch(/piano|keyboard|percussion/);
  });

  test('classify a string instrument', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/classify`, {
      data: { description: 'A small wooden instrument with four strings played with a bow, commonly the lead voice in an orchestra' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const classification = JSON.stringify(body).toLowerCase();
    expect(classification).toMatch(/violin|string|bowed/);
  });

  test('extract composer information from text', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/extract`, {
      data: { text: 'Ludwig van Beethoven was born in Bonn, Germany in 1770. He composed 9 symphonies, 5 piano concertos, and 1 opera called Fidelio. He died in Vienna in 1827.' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
    const extraction = JSON.stringify(body).toLowerCase();
    expect(extraction).toMatch(/beethoven/);
  });

  test('extract information from a complex music description', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/extract`, {
      data: { text: 'The Four Seasons by Antonio Vivaldi, composed in 1723, is a set of four violin concertos. Each concerto represents a season: Spring (E major), Summer (G minor), Autumn (F major), and Winter (F minor). The work is part of a larger collection called Il cimento dell\'armonia e dell\'inventione.' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
    const extraction = JSON.stringify(body).toLowerCase();
    expect(extraction).toMatch(/vivaldi|four seasons/);
  });

  test('classification generates gen_ai metrics', async ({ request }) => {
    const textBefore = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    const countBefore = extractMetricCount(textBefore, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'chat', error: 'none',
    });

    await request.post(`${MOUSIKE}/api/classify`, {
      data: { description: 'A brass instrument with three valves' },
    });

    const textAfter = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    const countAfter = extractMetricCount(textAfter, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'chat', error: 'none',
    });

    expect(countAfter).toBeGreaterThan(countBefore);
  });

  test('composer extraction view works in UI', async ({ page }) => {
    await page.goto(`${MOUSIKE}/composer`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/05-composer-view.png`, fullPage: true });

    const input = page.locator('vaadin-text-area textarea, vaadin-text-field input, textarea').first();
    await expect(input).toBeVisible({ timeout: 15_000 });
  });
});
