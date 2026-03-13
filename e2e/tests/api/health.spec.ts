import { test, expect } from '@playwright/test';

const MOUSIKE_URL = 'http://localhost:8080';
const DOC_SERVICE_URL = 'http://localhost:8091';

test.describe('Health Checks', () => {
  test('mousike actuator health is UP', async ({ request }) => {
    const res = await request.get(`${MOUSIKE_URL}/actuator/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('UP');
  });

  test('mousike health shows db component', async ({ request }) => {
    const res = await request.get(`${MOUSIKE_URL}/actuator/health`);
    const body = await res.json();
    expect(body.components).toBeDefined();
    expect(body.components.db).toBeDefined();
    expect(body.components.db.status).toBe('UP');
  });

  test('document-service actuator health is UP', async ({ request }) => {
    const res = await request.get(`${DOC_SERVICE_URL}/actuator/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('UP');
  });

  test('mousike prometheus metrics endpoint available', async ({ request }) => {
    const res = await request.get(`${MOUSIKE_URL}/actuator/prometheus`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('jvm_memory');
  });

  test('mousike info endpoint available', async ({ request }) => {
    const res = await request.get(`${MOUSIKE_URL}/actuator/info`);
    expect(res.status()).toBe(200);
  });
});
