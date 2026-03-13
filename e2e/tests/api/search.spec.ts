import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';

test.describe('Semantic Search API', () => {
  test('GET /api/search returns results array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/search?q=music&topK=5`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/search respects topK parameter', async ({ request }) => {
    const res = await request.get(`${BASE}/api/search?q=harmony&topK=3`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(3);
  });

  test('GET /api/search with category filter', async ({ request }) => {
    const res = await request.get(`${BASE}/api/search?q=music&category=theory`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

test.describe('Classification API', () => {
  test('POST /api/classify returns classification', async ({ request }) => {
    const res = await request.post(`${BASE}/api/classify`, {
      data: { description: 'Bach composed the Well-Tempered Clavier' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });
});

test.describe('Extraction API', () => {
  test('POST /api/extract returns extracted data', async ({ request }) => {
    const res = await request.post(`${BASE}/api/extract`, {
      data: { text: 'Beethoven wrote Symphony No. 9 in D minor in 1824' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });
});

test.describe('RAG API', () => {
  test('POST /api/rag/query with naive mode', async ({ request }) => {
    const res = await request.post(`${BASE}/api/rag/query?mode=naive`, {
      data: { question: 'What is music theory?' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.answer).toBeDefined();
    expect(body.mode).toBe('naive');
  });

  test('POST /api/rag/query with advanced mode', async ({ request }) => {
    const res = await request.post(`${BASE}/api/rag/query?mode=advanced`, {
      data: { question: 'Tell me about harmony' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.answer).toBeDefined();
    expect(body.mode).toBe('advanced');
  });
});
