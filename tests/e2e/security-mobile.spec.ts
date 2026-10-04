import { test, expect, type Browser } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { saveScreenshot } from './screenshot';

const db = new PrismaClient();
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function role(browser: Browser, phone: string) {
  const user = await db.user.findUniqueOrThrow({ where: { phone } });
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(32).toString('base64url');
  const session = await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hash(token),
      csrfHash: hash(csrf),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  await context.addCookies([
    { name: 'smenatop_session', value: token, url: baseURL, httpOnly: true, sameSite: 'Lax' },
    { name: 'smenatop_csrf', value: csrf, url: baseURL, sameSite: 'Lax' },
  ]);
  return {
    context,
    close: async () => {
      await context.close();
      await db.session.deleteMany({ where: { id: session.id } });
    },
  };
}
test.afterAll(async () => db.$disconnect());
test.setTimeout(120_000);

test('public service documentation and local debug endpoints are closed', async ({
  request,
  page,
}) => {
  for (const path of [
    '/api/docs',
    '/api/openapi.json',
    '/api/v1/developer/inbox?phone=%2B998900000001',
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(await response.text()).not.toMatch(/"openapi"|"codeHash"|"challengeId"|Swagger UI/);
  }
  const denied = await request.get('/api/v1/admin/queue');
  expect(denied.status()).toBe(401);
  expect(denied.headers()['cache-control']).toBe('no-store');
  for (const file of [
    '.env',
    'docs/openapi.json',
    'apps/api/src/main.ts',
    'prisma/schema.prisma',
  ]) {
    const path = `/@fs/${resolve(file).replaceAll('\\', '/')}`;
    const response = await request.get(path);
    expect([403, 404], `${file} must not be served by Vite`).toContain(response.status());
  }
  await page.goto('/auth');
  await expect(page.locator('h1')).toBeVisible();
  await expect(
    page.locator('a[href^="/developer"], input[placeholder*="LOCAL_DEV_KEY"]'),
  ).toHaveCount(0);
  await page.goto('/developer');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('input[type="password"], pre')).toHaveCount(0);
});

test('workers cannot open admin actions and company profile contains no API key controls', async ({
  browser,
}) => {
  const worker = await role(browser, '+998901000001');
  try {
    const page = await worker.context.newPage();
    await page.goto('/context');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('a[href^="/developer"], a[href^="/admin"]')).toHaveCount(0);
    expect((await worker.context.request.get('/api/v1/admin/queue')).status()).toBe(403);
    await page.goto('/admin');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.queue-toolbar, .skill-review')).toHaveCount(0);
  } finally {
    await worker.close();
  }
  const employer = await role(browser, '+998900000001');
  try {
    const page = await employer.context.newPage();
    await page.goto('/employer/profile');
    await expect(page.locator('.organization-profile')).toBeVisible();
    await expect(page.locator('.org-api-layout, a[href^="/developer"], pre')).toHaveCount(0);
    await expect(page.getByText('API kalitlari', { exact: false })).toHaveCount(0);
  } finally {
    await employer.close();
  }
});

test('mobile admin shows readable names, has no technical pages and dialogs remain usable', async ({
  browser,
}) => {
  const admin = await role(browser, '+998900000099');
  try {
    const page = await admin.context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/admin');
    await expect(page.locator('.queue-toolbar')).toBeVisible();
    await expect(page.locator('.loading-block')).toHaveCount(0);
    await expect(page.locator('pre')).toHaveCount(0);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await saveScreenshot(page, {
        path: `docs/screenshots/mobile-admin-secure-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Menyu', exact: true }).click();
    const menu = page.getByRole('dialog');
    await expect(menu).toBeVisible();
    await expect(
      menu.locator('a[href="/admin/health"], a[href="/admin/audit"], a[href^="/developer"]'),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
    for (const path of ['/admin/health', '/admin/audit', '/developer/inbox']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('pre, .queue-toolbar')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  } finally {
    await admin.close();
  }
});
