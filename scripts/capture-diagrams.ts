const { chromium } = require('@playwright/test');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIAGRAMS_DIR = path.join(PROJECT_ROOT, 'docs/diagrams');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'docs/images/diagrams');
const TEMP_DIR = path.join(OUTPUT_DIR, '.tmp');

const diagrams = [
  { file: '01-architecture-overview.html', name: '01-architecture-overview', frames: 20, delay: 15, width: 1200, height: 780 },
  { file: '02-rag-pipeline-flow.html',    name: '02-rag-pipeline-naive',    frames: 16, delay: 18, width: 1000, height: 700, tab: 'naive' },
  { file: '02-rag-pipeline-flow.html',    name: '02-rag-pipeline-agentic',  frames: 16, delay: 18, width: 1000, height: 730, tab: 'agentic' },
  { file: '03-request-lifecycle.html',     name: '03-request-lifecycle',     frames: 24, delay: 15, width: 1200, height: 880 },
  { file: '04-kubernetes-topology.html',   name: '04-kubernetes-topology',   frames: 16, delay: 18, width: 1200, height: 830 },
  { file: '05-observability-trace-flow.html', name: '05-observability-trace-flow', frames: 18, delay: 16, width: 1100, height: 780 },
  { file: '06-document-ingestion-pipeline.html', name: '06-document-ingestion', frames: 16, delay: 18, width: 1100, height: 630 },
  { file: '07-mcp-communication.html',    name: '07-mcp-communication',     frames: 20, delay: 15, width: 1050, height: 760 },
];

async function captureFrames() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  for (const d of diagrams) {
    const htmlPath = `file://${path.join(DIAGRAMS_DIR, d.file)}`;
    const page = await browser.newPage();
    await page.setViewportSize({ width: d.width, height: d.height });
    await page.goto(htmlPath, { waitUntil: 'networkidle' });

    // If specific tab needed (for RAG diagram)
    if (d.tab) {
      await page.evaluate((tab) => {
        const fn = (window as any).showMode;
        if (fn) fn(tab);
        // Also click the tab button
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach((t: any) => {
          if (t.textContent?.toLowerCase().includes(tab)) t.click();
        });
      }, d.tab);
      await page.waitForTimeout(500);
    }

    // Wait for initial animations
    await page.waitForTimeout(1000);

    // Capture frames over animation cycle
    const intervalMs = 200; // capture every 200ms
    console.log(`Capturing ${d.frames} frames for ${d.name}...`);

    for (let i = 0; i < d.frames; i++) {
      const framePath = path.join(TEMP_DIR, `${d.name}_frame_${String(i).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath, type: 'png' });
      await page.waitForTimeout(intervalMs);
    }

    await page.close();
    console.log(`  Done capturing ${d.name}`);

    // Assemble GIF using ImageMagick
    const outputGif = path.join(OUTPUT_DIR, `${d.name}.gif`);
    const framePattern = path.join(TEMP_DIR, `${d.name}_frame_*.png`);

    try {
      // Use magick (ImageMagick 7) to create optimized GIF
      execSync(
        `magick -delay ${d.delay} -loop 0 -dispose previous ${framePattern} -layers Optimize "${outputGif}"`,
        { stdio: 'pipe' }
      );
      console.log(`  Created: ${outputGif}`);

      // Get file size
      const stats = fs.statSync(outputGif);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`  Size: ${sizeMB} MB`);

      // If too large (>5MB), reduce quality
      if (stats.size > 5 * 1024 * 1024) {
        console.log(`  Optimizing (too large)...`);
        execSync(
          `magick "${outputGif}" -resize 80% -colors 128 -layers Optimize "${outputGif}"`,
          { stdio: 'pipe' }
        );
        const newStats = fs.statSync(outputGif);
        console.log(`  Optimized to: ${(newStats.size / 1024 / 1024).toFixed(2)} MB`);
      }
    } catch (e: any) {
      console.error(`  Error creating GIF: ${e.message}`);
    }

    // Clean up temp frames
    const frames = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(d.name));
    frames.forEach(f => fs.unlinkSync(path.join(TEMP_DIR, f)));
  }

  await browser.close();

  // Remove temp directory
  try { fs.rmdirSync(TEMP_DIR); } catch {}

  console.log('\nAll diagrams captured!');
}

captureFrames().catch(console.error);
