import { test, expect } from '@playwright/test';
import path from 'path';

const MOUSIKE = 'http://localhost:8080';
const PHOENIX = 'http://localhost:6006';
const SCREENSHOTS = path.resolve(__dirname, '../../screenshots');

/**
 * Phoenix Trace Visualization Screenshots:
 * Captures detailed screenshots of the Phoenix UI showing:
 * 1. Project overview with trace count
 * 2. Traces list with all spans
 * 3. Individual trace detail with full call stack
 * 4. LLM span detail with prompt/completion
 * 5. Embedding span detail
 * 6. Vector query span detail
 * 7. Full RAG trace timeline
 */
test.describe.serial('10 - Phoenix Trace Screenshots', () => {
  let projectId = '';

  test('step 0: generate fresh traces via API calls', async ({ request }) => {
    // Chat call
    const chatRes = await request.post(`${MOUSIKE}/api/chat`, {
      data: { message: 'Explain the difference between a violin and a viola in detail', conversationId: 'phoenix-screenshot-test' },
    });
    expect(chatRes.status()).toBe(200);

    // RAG call — generates embedding + vector search + chat spans
    const ragRes = await request.post(`${MOUSIKE}/api/rag/query?mode=naive`, {
      data: { question: 'What are the major works of Bach, Beethoven and Mozart in classical music history' },
    });
    expect(ragRes.status()).toBe(200);

    // Search call — generates embedding + vector query spans
    const searchRes = await request.get(`${MOUSIKE}/api/search?q=classical+music+composers+instruments&topK=5`);
    expect(searchRes.status()).toBe(200);

    // Get project ID for URL construction
    const projRes = await request.get(`${PHOENIX}/v1/projects`);
    const projData = await projRes.json();
    projectId = projData.data[0]?.id || '';
    expect(projectId).toBeTruthy();

    // Wait for spans to be exported
    await new Promise(r => setTimeout(r, 5000));
  });

  test('step 1: screenshot Phoenix projects page', async ({ page }) => {
    await page.goto(PHOENIX);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOTS}/10-phoenix-projects-overview.png`, fullPage: true });
  });

  test('step 2: screenshot Phoenix traces list', async ({ page }) => {
    // Click into the default project from the home page
    await page.goto(PHOENIX);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Click the default project card
    const projectCard = page.locator('text=default').first();
    await projectCard.click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: `${SCREENSHOTS}/10-phoenix-traces-list.png`, fullPage: true });
  });

  test('step 3: screenshot Phoenix trace detail — chat flow', async ({ page, request }) => {
    // Get spans via REST API to find a chat trace
    const spansRes = await request.get(`${PHOENIX}/v1/projects/default/spans?limit=100`);
    const spansData = await spansRes.json();
    const spans = spansData.data || [];

    // Find a root span for /api/chat
    const chatRoot = spans.find((s: any) =>
      !s.parent_id && (s.name || '').includes('/api/chat')
    );

    // Navigate into the project via UI first
    await page.goto(PHOENIX);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(2000);
    const projectCard = page.locator('text=default').first();
    await projectCard.click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Try to click on a trace row that contains 'chat'
    const chatRow = page.locator('tr:has-text("chat"), [role="row"]:has-text("chat")').first();
    if (await chatRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await chatRow.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${SCREENSHOTS}/10-phoenix-trace-chat-detail.png`, fullPage: true });
    } else {
      // Click the first visible trace row
      const firstRow = page.locator('table tbody tr').first();
      if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForTimeout(3000);
      }
      await page.screenshot({ path: `${SCREENSHOTS}/10-phoenix-trace-chat-detail.png`, fullPage: true });
    }
  });

  test('step 4: screenshot Phoenix trace detail — RAG flow', async ({ page }) => {
    // Navigate into the project via UI
    await page.goto(PHOENIX);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.locator('text=default').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Look for a RAG trace row
    const ragRow = page.locator('tr:has-text("rag"), [role="row"]:has-text("rag")').first();
    if (await ragRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await ragRow.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${SCREENSHOTS}/10-phoenix-trace-rag-detail.png`, fullPage: true });
    } else {
      // Fallback: click second trace row
      const rows = page.locator('table tbody tr');
      const count = await rows.count();
      if (count > 1) {
        await rows.nth(1).click();
        await page.waitForTimeout(3000);
      }
      await page.screenshot({ path: `${SCREENSHOTS}/10-phoenix-trace-rag-detail.png`, fullPage: true });
    }
  });

  test('step 5: screenshot Phoenix span details — LLM call', async ({ page }) => {
    // Navigate to project traces
    await page.goto(PHOENIX);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.locator('text=default').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Click first trace to see spans
    const firstRow = page.locator('table tbody tr').first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(3000);

      // Try to find and click on a span labeled 'chat' or 'llm'
      const chatSpan = page.locator('text=/chat llama/i').first();
      if (await chatSpan.isVisible({ timeout: 3000 }).catch(() => false)) {
        await chatSpan.click();
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: `${SCREENSHOTS}/10-phoenix-span-llm-detail.png`, fullPage: true });
  });

  test('step 6: screenshot Phoenix span details — embedding', async ({ page }) => {
    await page.goto(PHOENIX);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.locator('text=default').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Find and click a trace that has embedding spans (search or RAG)
    const searchRow = page.locator('tr:has-text("search"), tr:has-text("rag")').first();
    if (await searchRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchRow.click();
      await page.waitForTimeout(3000);

      // Click on embedding span
      const embedSpan = page.locator('text=/embedding/i').first();
      if (await embedSpan.isVisible({ timeout: 3000 }).catch(() => false)) {
        await embedSpan.click();
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: `${SCREENSHOTS}/10-phoenix-span-embedding.png`, fullPage: true });
  });

  test('step 7: screenshot Phoenix span details — vector query', async ({ page }) => {
    await page.goto(PHOENIX);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.locator('text=default').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Find a trace with vector query
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 2) {
      await rows.nth(2).click();
      await page.waitForTimeout(3000);

      // Click on pg_vector span
      const vectorSpan = page.locator('text=/pg_vector/i').first();
      if (await vectorSpan.isVisible({ timeout: 3000 }).catch(() => false)) {
        await vectorSpan.click();
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: `${SCREENSHOTS}/10-phoenix-span-vector-query.png`, fullPage: true });
  });

  test('step 8: screenshot Phoenix final overview with all traces', async ({ page }) => {
    await page.goto(PHOENIX);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOTS}/10-phoenix-final-overview.png`, fullPage: true });
  });
});
