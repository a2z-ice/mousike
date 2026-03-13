import { test, expect } from '@playwright/test';
import path from 'path';

const MOUSIKE = 'http://localhost:8080';
const DOC_SERVICE = 'http://localhost:8091';
const PHOENIX = 'http://localhost:6006';
const GRAFANA = 'http://localhost:3000';
const SCREENSHOTS = path.resolve(__dirname, '../../screenshots');

test.describe('01 - Infrastructure Health', () => {
  test('all Kubernetes pods are healthy via actuator', async ({ request }) => {
    // mousike-app
    const mousike = await request.get(`${MOUSIKE}/actuator/health`);
    expect(mousike.status()).toBe(200);
    const mBody = await mousike.json();
    expect(mBody.status).toBe('UP');

    // document-service
    const doc = await request.get(`${DOC_SERVICE}/actuator/health`);
    expect(doc.status()).toBe(200);
    const dBody = await doc.json();
    expect(dBody.status).toBe('UP');
  });

  test('PostgreSQL + PGVector is connected', async ({ request }) => {
    const res = await request.get(`${MOUSIKE}/actuator/health`);
    const body = await res.json();
    expect(body.components.db.status).toBe('UP');
    expect(body.components.db.details.database).toBe('PostgreSQL');
  });

  test('Phoenix observability platform is running', async ({ request }) => {
    const res = await request.get(`${PHOENIX}/healthz`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('OK');
  });

  test('Phoenix UI loads successfully', async ({ page }) => {
    await page.goto(PHOENIX);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    // Phoenix SPA renders a React app in #root
    await expect(page.locator('#root')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/01-phoenix-ui.png`, fullPage: true });
  });

  test('Grafana LGTM stack is healthy', async ({ request }) => {
    const res = await request.get(`${GRAFANA}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.database).toBe('ok');
  });

  test('Grafana UI loads successfully', async ({ page }) => {
    await page.goto(GRAFANA);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/01-grafana-ui.png`, fullPage: true });
  });

  test('Grafana has all datasources configured', async ({ request }) => {
    const res = await request.get(`${GRAFANA}/api/datasources`, {
      headers: { Authorization: 'Basic ' + btoa('admin:admin') },
    });
    expect(res.status()).toBe(200);
    const datasources = await res.json();
    const names = datasources.map((d: { name: string }) => d.name);
    expect(names).toContain('Prometheus');
    expect(names).toContain('Tempo');
    expect(names).toContain('Loki');
  });

  test('Prometheus is scraping mousike metrics', async ({ request }) => {
    const res = await request.get(`${MOUSIKE}/actuator/prometheus`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    // JVM metrics
    expect(text).toContain('jvm_memory');
    expect(text).toContain('jvm_threads');
    // Application tag
    expect(text).toContain('application="mousike"');
    // HTTP server metrics
    expect(text).toContain('http_server');
  });

  test('Ollama LLM is accessible from cluster', async ({ request }) => {
    // The chat endpoint works = Ollama is reachable
    const res = await request.post(`${MOUSIKE}/api/chat`, {
      data: { message: 'Say hello in one word', conversationId: `infra-test-${Date.now()}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response.length).toBeGreaterThan(0);
  });
});
