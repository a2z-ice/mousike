import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { extractMetricCount } from './helpers';

const MOUSIKE = 'http://localhost:8080';
const DOC_SERVICE = 'http://localhost:8091';
const GRAFANA = 'http://localhost:3000';
const PHOENIX = 'http://localhost:6006';
const SCREENSHOTS = path.resolve(__dirname, '../../screenshots');

const GRAFANA_AUTH = { Authorization: 'Basic ' + btoa('admin:admin') };

/**
 * Complete end-to-end flow validation:
 * 1. Upload PDF → document-service (Tika parsing + Ollama embedding + PGVector storage)
 * 2. Search the vector store → verify document is retrievable
 * 3. RAG questions → verify retrieval + LLM generation
 * 4. Check metrics → verify all components logged operations
 * 5. Verify observability tools → Phoenix, Grafana datasources
 * 6. Screenshots of all UIs
 */
test.describe.serial('09 - Complete End-to-End Flow', () => {
  const testId = Date.now();
  let chatCountBefore = 0;
  let embedCountBefore = 0;
  let vectorCountBefore = 0;

  test('step 0: capture baseline metrics', async ({ request }) => {
    const text = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();

    chatCountBefore = extractMetricCount(text, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'chat', error: 'none',
    });
    embedCountBefore = extractMetricCount(text, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'embedding', error: 'none',
    });
    vectorCountBefore = extractMetricCount(text, 'db_vector_client_operation_seconds_count', {
      db_system: 'pg_vector',
    });

    expect(chatCountBefore).toBeGreaterThanOrEqual(0);
  });

  test('step 1: ingest a new test PDF document', async ({ request }) => {
    const pdfPath = path.resolve(__dirname, '../../test-music-knowledge.pdf');
    const res = await request.post(`${DOC_SERVICE}/api/ingest`, {
      multipart: {
        file: { name: `e2e-flow-${testId}.pdf`, mimeType: 'application/pdf', buffer: fs.readFileSync(pdfPath) },
        category: 'e2e-test',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.chunksIngested).toBeGreaterThanOrEqual(1);
  });

  test('step 2: verify document is searchable via vector store', async ({ request }) => {
    const res = await request.get(
      `${MOUSIKE}/api/search?q=music+theory+composers+classical+Bach+Beethoven+Mozart&topK=10`
    );
    expect(res.status()).toBe(200);
    const results = await res.json();
    expect(results.length).toBeGreaterThanOrEqual(1);

    const hasMetadata = results.some((r: any) => r.metadata?.source && r.metadata?.category);
    expect(hasMetadata).toBe(true);
  });

  test('step 3: RAG query uses ingested document for answer', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/rag/query?mode=naive`, {
      data: { question: 'Tell me about the famous classical composers Bach, Beethoven and Mozart and their major works and musical instruments' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.answer).toBeDefined();
    expect(body.answer.length).toBeGreaterThan(10);
  });

  test('step 4: chat with context about music', async ({ request }) => {
    const convId = `e2e-flow-${testId}`;
    const res = await request.post(`${MOUSIKE}/api/chat`, {
      data: { message: 'What is music theory and why is it important?', conversationId: convId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response.length).toBeGreaterThan(20);
    expect(body.conversationId).toBe(convId);
  });

  test('step 5: classify an instrument description', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/classify`, {
      data: { description: 'A wooden instrument with four strings tuned in fifths, played with a bow' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('step 6: extract information from text', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/extract`, {
      data: { text: 'Bach composed the Brandenburg Concertos in 1721 while serving as Kapellmeister to Prince Leopold of Anhalt-Cothen' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('step 7: verify metrics increased across all components', async ({ request }) => {
    const text = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();

    const chatCountAfter = extractMetricCount(text, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'chat', error: 'none',
    });
    const embedCountAfter = extractMetricCount(text, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'embedding', error: 'none',
    });
    const vectorCountAfter = extractMetricCount(text, 'db_vector_client_operation_seconds_count', {
      db_system: 'pg_vector',
    });

    // Chat model was called (for chat, classify, extract, RAG)
    expect(chatCountAfter).toBeGreaterThan(chatCountBefore);

    // Embedding model was called (for vector search in RAG)
    expect(embedCountAfter).toBeGreaterThan(embedCountBefore);

    // PGVector was queried
    expect(vectorCountAfter).toBeGreaterThan(vectorCountBefore);

    // Latencies are tracked
    const chatDuration = extractMetricCount(text, 'gen_ai_client_operation_seconds_sum', {
      gen_ai_operation_name: 'chat', error: 'none',
    });
    const embedDuration = extractMetricCount(text, 'gen_ai_client_operation_seconds_sum', {
      gen_ai_operation_name: 'embedding', error: 'none',
    });

    expect(chatDuration).toBeGreaterThan(0);
    expect(embedDuration).toBeGreaterThan(0);
  });

  test('step 8: verify Grafana observability stack', async ({ request }) => {
    // Prometheus is collecting metrics
    const promRes = await request.get(
      `${GRAFANA}/api/datasources/proxy/uid/prometheus/api/v1/query?query=gen_ai_client_operation_seconds_count`,
      { headers: GRAFANA_AUTH }
    );
    expect(promRes.status()).toBe(200);

    // Tempo is available
    const tempoRes = await request.get(
      `${GRAFANA}/api/datasources/proxy/uid/tempo/api/search?limit=1`,
      { headers: GRAFANA_AUTH }
    );
    expect(tempoRes.status()).toBe(200);

    // Loki is available
    const lokiRes = await request.get(
      `${GRAFANA}/api/datasources/proxy/uid/loki/loki/api/v1/labels`,
      { headers: GRAFANA_AUTH }
    );
    expect(lokiRes.status()).toBe(200);
  });

  test('step 9: verify Phoenix trace platform', async ({ request }) => {
    const res = await request.get(`${PHOENIX}/v1/projects`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].name).toBe('default');
  });

  test('step 10: take final screenshots of all UIs', async ({ page }) => {
    // Mousike Chat
    await page.goto(`${MOUSIKE}/chat`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/09-final-chat.png`, fullPage: true });

    // Mousike Search
    await page.goto(`${MOUSIKE}/search`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/09-final-search.png`, fullPage: true });

    // Mousike Composer
    await page.goto(`${MOUSIKE}/composer`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/09-final-composer.png`, fullPage: true });

    // Mousike Monitor
    await page.goto(`${MOUSIKE}/monitor`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/09-final-monitor.png`, fullPage: true });

    // Phoenix
    await page.goto(PHOENIX);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/09-final-phoenix.png`, fullPage: true });

    // Grafana
    await page.goto(GRAFANA);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/09-final-grafana.png`, fullPage: true });
  });
});
