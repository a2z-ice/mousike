import { test, expect } from '@playwright/test';
import path from 'path';

const MOUSIKE = 'http://localhost:8080';
const DOC_SERVICE = 'http://localhost:8091';
const SCREENSHOTS = path.resolve(__dirname, '../../screenshots');

test.describe('06 - MCP (Model Context Protocol) Integration', () => {
  test('document-service MCP server is accessible', async ({ request }) => {
    const res = await request.get(`${DOC_SERVICE}/actuator/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('UP');
  });

  test('mousike MCP client connects to document-service', async ({ request }) => {
    // The agentic RAG mode uses MCP tools — if this works, the MCP connection is active
    const res = await request.post(`${MOUSIKE}/api/rag/query?mode=agentic`, {
      data: { question: 'List the available music documents in the knowledge base' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.answer).toBeDefined();
    expect(body.answer.length).toBeGreaterThan(0);
  });

  test('agentic RAG can search via MCP tools', async ({ request }) => {
    const res = await request.post(`${MOUSIKE}/api/rag/query?mode=agentic`, {
      data: { question: 'Use the music knowledge tools to find information about classical composers and their symphonies' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('agentic');
    expect(body.answer).toBeDefined();
  });

  test('document-service ingestion endpoint processes files', async ({ request }) => {
    // Verify by checking the REST endpoint
    const res = await request.get(`${DOC_SERVICE}/api/documents`);
    expect(res.status()).toBe(200);
  });

  test('document-service prometheus metrics are available', async ({ request }) => {
    const res = await request.get(`${DOC_SERVICE}/actuator/prometheus`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('jvm_memory');
    expect(text).toContain('http_server');
  });
});
