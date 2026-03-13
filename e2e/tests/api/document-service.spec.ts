import { test, expect } from '@playwright/test';

const DOC_BASE = 'http://localhost:8091';

test.describe('Document Service API', () => {
  test('health endpoint is UP', async ({ request }) => {
    const res = await request.get(`${DOC_BASE}/actuator/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('UP');
  });

  test('document-service root is accessible', async ({ request }) => {
    const res = await request.get(`${DOC_BASE}/actuator/info`);
    expect(res.status()).toBe(200);
  });

  test('prometheus metrics available', async ({ request }) => {
    const res = await request.get(`${DOC_BASE}/actuator/prometheus`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('jvm_memory');
  });
});
