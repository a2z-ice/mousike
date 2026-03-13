import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { extractMetricCount } from './helpers';

const DOC_SERVICE = 'http://localhost:8091';
const MOUSIKE = 'http://localhost:8080';
const SCREENSHOTS = path.resolve(__dirname, '../../screenshots');

test.describe.serial('02 - Document Ingestion Pipeline', () => {
  test('ingest music theory PDF into vector store', async ({ request }) => {
    const pdfPath = path.resolve(__dirname, '../../test-music-knowledge.pdf');
    const res = await request.post(`${DOC_SERVICE}/api/ingest`, {
      multipart: {
        file: { name: 'test-music-knowledge.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(pdfPath) },
        category: 'theory',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.chunksIngested).toBeGreaterThanOrEqual(1);
    expect(body.filename).toBe('test-music-knowledge.pdf');
  });

  test('ingest composers guide PDF into vector store', async ({ request }) => {
    const pdfPath = path.resolve(__dirname, '../../test-composers-guide.pdf');
    const res = await request.post(`${DOC_SERVICE}/api/ingest`, {
      multipart: {
        file: { name: 'test-composers-guide.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(pdfPath) },
        category: 'composers',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.chunksIngested).toBeGreaterThanOrEqual(1);
  });

  test('document-service lists available documents', async ({ request }) => {
    const res = await request.get(`${DOC_SERVICE}/api/documents`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('vector store returns ingested content via semantic search', async ({ request }) => {
    const res = await request.get(
      `${MOUSIKE}/api/search?q=composers+classical+music+Bach+Beethoven+Mozart&topK=10`
    );
    expect(res.status()).toBe(200);
    const results = await res.json();
    expect(results.length).toBeGreaterThanOrEqual(1);

    // Verify metadata integrity
    const sources = results.map((r: any) => r.metadata?.source);
    expect(sources.some((s: string) => s?.includes('.pdf'))).toBe(true);
  });

  test('vector store supports category-filtered search', async ({ request }) => {
    const res = await request.get(
      `${MOUSIKE}/api/search?q=music+theory+scales+major+minor&category=theory&topK=5`
    );
    expect(res.status()).toBe(200);
    const results = await res.json();
    // All returned docs should have category=theory
    for (const r of results) {
      if (r.metadata?.category) {
        expect(r.metadata.category).toBe('theory');
      }
    }
  });

  test('embedding model produces successful operations', async ({ request }) => {
    // Verify through prometheus metrics that embedding operations succeed
    const text = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    const embedCount = extractMetricCount(text, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'embedding', error: 'none',
    });
    expect(embedCount).toBeGreaterThan(0);
  });
});
