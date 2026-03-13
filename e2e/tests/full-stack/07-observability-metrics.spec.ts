import { test, expect } from '@playwright/test';
import path from 'path';
import { extractMetricCount } from './helpers';

const MOUSIKE = 'http://localhost:8080';
const DOC_SERVICE = 'http://localhost:8091';
const GRAFANA = 'http://localhost:3000';
const PHOENIX = 'http://localhost:6006';
const SCREENSHOTS = path.resolve(__dirname, '../../screenshots');

const GRAFANA_AUTH = { Authorization: 'Basic ' + btoa('admin:admin') };

test.describe('07 - Observability & Metrics', () => {
  test('Spring AI gen_ai chat metrics are recorded', async ({ request }) => {
    const text = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    const chatCount = extractMetricCount(text, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'chat', error: 'none',
    });
    expect(chatCount).toBeGreaterThan(0);

    // Verify model name is tracked
    expect(text).toContain('gen_ai_request_model="llama3.2"');
    expect(text).toContain('gen_ai_system="ollama"');
  });

  test('Spring AI gen_ai embedding metrics are recorded', async ({ request }) => {
    const text = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    const embedCount = extractMetricCount(text, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'embedding', error: 'none',
    });
    expect(embedCount).toBeGreaterThan(0);

    // nomic-embed-text model
    expect(text).toContain('gen_ai_response_model="nomic-embed-text"');
  });

  test('PGVector database operations are metered', async ({ request }) => {
    const text = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    const vectorCount = extractMetricCount(text, 'db_vector_client_operation_seconds_count', {
      db_system: 'pg_vector',
    });
    expect(vectorCount).toBeGreaterThan(0);
  });

  test('HTTP server request metrics are tracked', async ({ request }) => {
    const text = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    expect(text).toMatch(/http_server_requests_seconds_count/);
  });

  test('JVM metrics are available', async ({ request }) => {
    const text = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    expect(text).toContain('jvm_memory_used_bytes');
    expect(text).toContain('jvm_threads_live_threads');
    expect(text).toContain('jvm_gc_');
  });

  test('document-service also exports metrics', async ({ request }) => {
    const res = await request.get(`${DOC_SERVICE}/actuator/prometheus`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('jvm_memory');
  });

  test('Grafana Prometheus datasource returns metrics', async ({ request }) => {
    const res = await request.get(
      `${GRAFANA}/api/datasources/proxy/uid/prometheus/api/v1/query?query=up`,
      { headers: GRAFANA_AUTH }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.data.result.length).toBeGreaterThan(0);
  });

  test('Grafana Tempo tracing datasource is reachable', async ({ request }) => {
    const res = await request.get(
      `${GRAFANA}/api/datasources/proxy/uid/tempo/api/search?limit=1`,
      { headers: GRAFANA_AUTH }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('traces');
  });

  test('Grafana Loki logging datasource is reachable', async ({ request }) => {
    const res = await request.get(
      `${GRAFANA}/api/datasources/proxy/uid/loki/loki/api/v1/labels`,
      { headers: GRAFANA_AUTH }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('success');
  });

  test('Phoenix project exists for trace collection', async ({ request }) => {
    const res = await request.get(`${PHOENIX}/v1/projects`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].name).toBe('default');
  });

  test('metrics prove full LLM call chain: embed → vector_search → chat', async ({ request }) => {
    // Trigger a full RAG pipeline
    await request.post(`${MOUSIKE}/api/rag/query?mode=naive`, {
      data: { question: 'Tell me about classical music composers and their symphonies and concertos' },
    });

    const text = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();

    // 1. Embedding was called (for query vectorization)
    const embedCount = extractMetricCount(text, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'embedding', error: 'none',
    });
    expect(embedCount).toBeGreaterThan(0);

    // 2. PGVector was queried
    const vectorCount = extractMetricCount(text, 'db_vector_client_operation_seconds_count', {
      db_system: 'pg_vector',
    });
    expect(vectorCount).toBeGreaterThan(0);

    // 3. Chat model was called (for answer generation)
    const chatCount = extractMetricCount(text, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'chat', error: 'none',
    });
    expect(chatCount).toBeGreaterThan(0);

    // 4. Latency is tracked (not zero)
    const chatDuration = extractMetricCount(text, 'gen_ai_client_operation_seconds_sum', {
      gen_ai_operation_name: 'chat', error: 'none',
    });
    expect(chatDuration).toBeGreaterThan(0);
  });
});
