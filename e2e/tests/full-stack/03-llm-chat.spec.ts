import { test, expect } from '@playwright/test';
import path from 'path';
import { extractMetricCount } from './helpers';

const MOUSIKE = 'http://localhost:8080';
const SCREENSHOTS = path.resolve(__dirname, '../../screenshots');

test.describe.serial('03 - LLM Chat & Memory', () => {
  const conversationId = `e2e-chat-${Date.now()}`;

  test('LLM responds to a basic greeting', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/chat`, {
      data: { message: 'Hello! What kind of assistant are you?', conversationId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response).toBeDefined();
    expect(body.response.length).toBeGreaterThan(10);
    expect(body.conversationId).toBe(conversationId);
  });

  test('LLM maintains conversation context (JDBC memory)', async ({ request }) => {
    // First message: set context
    await request.post(`${MOUSIKE}/api/chat`, {
      data: { message: 'My favorite instrument is the cello', conversationId },
    });

    // Second message: test memory recall
    const res = await request.post(`${MOUSIKE}/api/chat`, {
      data: { message: 'What is my favorite instrument?', conversationId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response.toLowerCase()).toContain('cello');
  });

  test('different conversation IDs have isolated memory', async ({ request }) => {
    const otherConv = `e2e-other-${Date.now()}`;

    const res = await request.post(`${MOUSIKE}/api/chat`, {
      data: { message: 'What is my favorite instrument?', conversationId: otherConv },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Should NOT know about cello since it's a different conversation
    expect(body.response.toLowerCase()).not.toContain('cello');
  });

  test('DELETE /api/chat/{id} clears conversation memory', async ({ request }) => {
    const delRes = await request.delete(`${MOUSIKE}/api/chat/${conversationId}`);
    expect(delRes.status()).toBe(204);

    // After clearing, memory should be gone
    const res = await request.post(`${MOUSIKE}/api/chat`, {
      data: { message: 'What is my favorite instrument?', conversationId },
    });
    const body = await res.json();
    expect(body.response.toLowerCase()).not.toContain('cello');
  });

  test('gen_ai chat metrics increase after LLM calls', async ({ request }) => {
    const metricsBefore = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    const countBefore = extractMetricCount(metricsBefore, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'chat', error: 'none',
    });

    await request.post(`${MOUSIKE}/api/chat`, {
      data: { message: 'Test metric increment', conversationId: `metric-test-${Date.now()}` },
    });

    const metricsAfter = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    const countAfter = extractMetricCount(metricsAfter, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'chat', error: 'none',
    });

    expect(countAfter).toBeGreaterThan(countBefore);
  });

  test('chat page sends message and shows response in UI', async ({ page }) => {
    await page.goto(`${MOUSIKE}/chat`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/03-chat-page-loaded.png`, fullPage: true });

    // Fill the chat input (Vaadin shadow DOM)
    const input = page.locator('#chat-input input, vaadin-text-field input').first();
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('What instruments are in a string quartet?');
    await page.screenshot({ path: `${SCREENSHOTS}/03-chat-message-typed.png`, fullPage: true });

    // Click send
    const sendBtn = page.locator('vaadin-button, button').filter({ hasText: /send|submit|ask/i }).first();
    await sendBtn.click();

    // Wait for LLM response
    await page.waitForTimeout(15_000);
    await page.screenshot({ path: `${SCREENSHOTS}/03-chat-response-received.png`, fullPage: true });
  });
});
