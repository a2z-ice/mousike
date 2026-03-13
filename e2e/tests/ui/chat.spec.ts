import { test, expect } from '@playwright/test';

test.describe('Chat View', () => {
  test('chat page loads successfully', async ({ page }) => {
    await page.goto('/chat');
    await expect(page).toHaveTitle(/Mousike|mousike/i, { timeout: 30_000 });
  });

  test('chat page has message input', async ({ page }) => {
    await page.goto('/chat');
    // Wait for Vaadin to initialize
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    // Vaadin shadow DOM - look for text area or input
    const input = page.locator('vaadin-text-area, vaadin-text-field, textarea, input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 15_000 });
  });

  test('chat page has send button', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    const sendButton = page.locator('vaadin-button, button').filter({ hasText: /send|submit|ask/i }).first();
    await expect(sendButton).toBeVisible({ timeout: 15_000 });
  });

  test('can send a message and receive response', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // Vaadin text-field wraps a shadow DOM input — target the inner input
    const input = page.locator('#chat-input input, vaadin-text-field input, vaadin-text-area textarea').first();
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('Hello');

    // Click send
    const sendButton = page.locator('vaadin-button, button').filter({ hasText: /send|submit|ask/i }).first();
    await sendButton.click();

    // Wait for response to appear in the message list
    await page.waitForTimeout(10_000); // Give LLM time to respond
    const messages = page.locator('.message, vaadin-message-list, [class*="message"]');
    await expect(messages.first()).toBeVisible({ timeout: 30_000 });
  });
});
