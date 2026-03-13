import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';

test.describe('Chat API', () => {
  test('POST /api/chat returns a response', async ({ request }) => {
    const res = await request.post(`${BASE}/api/chat`, {
      data: {
        message: 'Hello, what can you help me with?',
        conversationId: `test-${Date.now()}`,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response).toBeDefined();
    expect(body.response.length).toBeGreaterThan(0);
  });

  test('POST /api/chat preserves conversation context', async ({ request }) => {
    const convId = `test-ctx-${Date.now()}`;

    const res1 = await request.post(`${BASE}/api/chat`, {
      data: { message: 'My name is TestBot', conversationId: convId },
    });
    expect(res1.status()).toBe(200);

    const res2 = await request.post(`${BASE}/api/chat`, {
      data: { message: 'What is my name?', conversationId: convId },
    });
    expect(res2.status()).toBe(200);
    const body = await res2.json();
    expect(body.response.toLowerCase()).toContain('testbot');
  });

  test('DELETE /api/chat/{conversationId} clears memory', async ({ request }) => {
    const convId = `test-del-${Date.now()}`;

    // Create a conversation
    await request.post(`${BASE}/api/chat`, {
      data: { message: 'Hello', conversationId: convId },
    });

    // Delete it
    const delRes = await request.delete(`${BASE}/api/chat/${convId}`);
    expect(delRes.status()).toBe(204);
  });
});
