import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.argv[2] || 'http://localhost:4173';
const browser = await chromium.launch(
  process.platform === 'win32'
    ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }
    : {},
);
const runs = [];
try {
  for (let index = 0; index < 3; index++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.__smenatopMetrics = { lcpMs: 0, cls: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__smenatopMetrics.lcpMs = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (!entry.hadRecentInput) window.__smenatopMetrics.cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.locator('h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    // Deliberate lab observation window for late font/layout events, not a test assertion delay.
    await page.waitForTimeout(1500);
    runs.push(
      await page.evaluate(() => ({
        ...window.__smenatopMetrics,
        resources: performance
          .getEntriesByType('resource')
          .reduce((sum, resource) => sum + resource.transferSize, 0),
        h1: document.querySelector('h1')?.textContent,
      })),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
const median = (field) => [...runs.map((run) => run[field])].sort((a, b) => a - b)[1];
const report = {
  measuredAt: new Date().toISOString(),
  url: baseUrl,
  profile:
    'Chrome headless, 390x844, fresh context/no cache, 4x CPU, 1.6Mbps down/750Kbps up/150ms latency; local production preview',
  runs,
  median: { lcpMs: median('lcpMs'), cls: median('cls') },
  inp: 'Not measured; requires real interaction field evidence',
};
await mkdir('docs', { recursive: true });
await writeFile('docs/performance-lab.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
