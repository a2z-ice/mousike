import { test, expect } from '@playwright/test';
import path from 'path';
import { extractMetricCount } from './helpers';

const MOUSIKE = 'http://localhost:8080';
const SCREENSHOTS = path.resolve(__dirname, '../../screenshots');

test.describe('04 - RAG Pipeline (Retrieval-Augmented Generation)', () => {
  test('naive RAG retrieves context and generates answer', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/rag/query?mode=naive`, {
      data: { question: 'Tell me about the famous classical composers Bach, Beethoven and Mozart and their major works' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('naive');
    expect(body.answer).toBeDefined();
    expect(body.answer.length).toBeGreaterThan(10);
  });

  test('advanced RAG generates enriched answer', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/rag/query?mode=advanced`, {
      data: { question: 'Tell me about the famous classical composers Bach, Beethoven and Mozart and their major works' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('advanced');
    expect(body.answer).toBeDefined();
    expect(body.answer.length).toBeGreaterThan(10);
  });

  test('agentic RAG uses MCP tools (document-service)', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/rag/query?mode=agentic`, {
      data: { question: 'Search the music knowledge base for information about composers' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('agentic');
    expect(body.answer).toBeDefined();
    expect(body.answer.length).toBeGreaterThan(0);
  });

  test('RAG guardrails: retrieval gate blocks when no relevant docs', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/rag/query?mode=naive`, {
      data: { question: 'What is the population of Tokyo, Japan?' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Guardrails should prevent hallucination for out-of-domain queries
    expect(body.answer).toContain("don't have enough information");
  });

  test('RAG with conversation context preservation', async ({ request }) => {
    const convId = `rag-ctx-${Date.now()}`;

    // First RAG query
    await request.post(`${MOUSIKE}/api/rag/query?mode=advanced&conversationId=${convId}`, {
      data: { question: 'Tell me about the famous classical composers Bach, Beethoven and Mozart' },
    });

    // Follow-up query in same conversation
    const res = await request.post(`${MOUSIKE}/api/rag/query?mode=advanced&conversationId=${convId}`, {
      data: { question: 'Which of them composed the Brandenburg Concertos?' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.answer).toBeDefined();
  });

  test('embedding metrics increase during RAG operations', async ({ request }) => {
    const textBefore = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    const embedBefore = extractMetricCount(textBefore, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'embedding', error: 'none',
    });

    // Trigger a RAG query (which performs embedding)
    await request.post(`${MOUSIKE}/api/rag/query?mode=naive`, {
      data: { question: 'Tell me about music theory, scales, and harmony in classical music compositions' },
    });

    const textAfter = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    const embedAfter = extractMetricCount(textAfter, 'gen_ai_client_operation_seconds_count', {
      gen_ai_operation_name: 'embedding', error: 'none',
    });

    expect(embedAfter).toBeGreaterThan(embedBefore);
  });

  test('vector store metrics track PGVector operations', async ({ request }) => {
    const text = await (await request.get(`${MOUSIKE}/actuator/prometheus`)).text();
    const vectorCount = extractMetricCount(text, 'db_vector_client_operation_seconds_count', {
      db_system: 'pg_vector',
    });
    expect(vectorCount).toBeGreaterThan(0);
  });
});
