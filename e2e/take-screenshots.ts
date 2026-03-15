import { chromium } from '@playwright/test';

const SCREENSHOT_DIR = '../docs/diagrams/screenshots';

async function takeScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });

  // Mousike Chat View
  try {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/chat', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/chat-view.png`, fullPage: false });
    console.log('OK: chat-view.png');
    await page.close();
  } catch (e) { console.log('FAIL: chat-view -', (e as Error).message); }

  // Mousike Search View
  try {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/search', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/search-view.png`, fullPage: false });
    console.log('OK: search-view.png');
    await page.close();
  } catch (e) { console.log('FAIL: search-view -', (e as Error).message); }

  // Mousike Composer View
  try {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/composer', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/composer-view.png`, fullPage: false });
    console.log('OK: composer-view.png');
    await page.close();
  } catch (e) { console.log('FAIL: composer-view -', (e as Error).message); }

  // Mousike Monitor View
  try {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/monitor', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/monitor-view.png`, fullPage: false });
    console.log('OK: monitor-view.png');
    await page.close();
  } catch (e) { console.log('FAIL: monitor-view -', (e as Error).message); }

  // Phoenix UI
  try {
    const page = await context.newPage();
    await page.goto('http://localhost:6006', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/phoenix-ui.png`, fullPage: false });
    console.log('OK: phoenix-ui.png');
    await page.close();
  } catch (e) { console.log('FAIL: phoenix-ui -', (e as Error).message); }

  // Grafana UI
  try {
    const page = await context.newPage();
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/grafana-ui.png`, fullPage: false });
    console.log('OK: grafana-ui.png');
    await page.close();
  } catch (e) { console.log('FAIL: grafana-ui -', (e as Error).message); }

  // Actuator Health
  try {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/actuator/health', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/actuator-health.png`, fullPage: false });
    console.log('OK: actuator-health.png');
    await page.close();
  } catch (e) { console.log('FAIL: actuator-health -', (e as Error).message); }

  // Ollama Models
  try {
    const page = await context.newPage();
    await page.goto('http://localhost:11434/api/tags', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/ollama-models.png`, fullPage: false });
    console.log('OK: ollama-models.png');
    await page.close();
  } catch (e) { console.log('FAIL: ollama-models -', (e as Error).message); }

  await browser.close();
  console.log('Done!');
}

takeScreenshots().catch(console.error);
