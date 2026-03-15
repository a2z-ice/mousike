import { chromium } from '@playwright/test';
import * as path from 'path';

async function captureBanner() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2, // Retina quality
  });

  const bannerPath = path.resolve(__dirname, '../docs/diagrams/banner-source.html');
  await page.goto(`file://${bannerPath}`, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.resolve(__dirname, '../docs/diagrams/og-banner.png'),
    fullPage: false,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });

  console.log('OK: og-banner.png (1200x630 @2x)');
  await browser.close();
}

captureBanner().catch(console.error);
