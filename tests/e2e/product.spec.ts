import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

const db = new PrismaClient();
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function roleContext(browser: Browser, phone: string) {
  const user = await db.user.findUniqueOrThrow({ where: { phone } });
  const token = randomBytes(32).toString('base64url'),
    csrf = randomBytes(32).toString('base64url');
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hash(token),
      csrfHash: hash(csrf),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  await context.addCookies([
    {
      name: 'smenatop_session',
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
    },
    { name: 'smenatop_csrf', value: csrf, url: baseURL, sameSite: 'Lax' },
  ]);
  return context;
}
async function ready(page: Page) {
  await page.locator('h1').first().waitFor();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('.loading-block')).toHaveCount(0);
}

async function assertDrawerInteraction(page: Page, dialog: Locator, screenshotName: string) {
  const menu = page.getByRole('button', { name: 'Menyu', exact: true });
  const originalOverflow = await page.locator('body').evaluate((body) => body.style.overflow);
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).toHaveAttribute('aria-controls', (await dialog.getAttribute('id')) as string);
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await mkdir('docs/screenshots', { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `docs/screenshots/${screenshotName}-390.png` });
  const close = dialog.getByRole('button', { name: 'Yopish', exact: true });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press(index < 15 ? 'Tab' : 'Shift+Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.move(4, 4);
  await page.mouse.wheel(0, 650);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
  expect(await page.locator('body').evaluate((body) => body.style.overflow)).toBe(originalOverflow);

  await menu.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(dialog).not.toBeVisible();
  await expect(menu).toBeFocused();
  expect(await page.locator('body').evaluate((body) => body.style.overflow)).toBe(originalOverflow);

  await menu.click();
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(dialog).not.toBeVisible();
  expect(await page.locator('body').evaluate((body) => body.style.overflow)).toBe(originalOverflow);
  await page.setViewportSize({ width: 390, height: 844 });
}
test.afterAll(async () => db.$disconnect());

test('public timeline is keyboard usable and Uzbek/Russian + reduced motion work', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await ready(page);
  const headline = page.getByRole('heading', { level: 1 });
  await expect(headline).toBeVisible();
  const uzbekHeadline = await headline.innerText();
  expect(uzbekHeadline.trim().length).toBeGreaterThan(5);
  await expect(page.locator('.hero').getByRole('link', { name: /Smena topish/ })).toHaveAttribute(
    'href',
    '/shifts',
  );
  await page.getByRole('button', { name: 'Ertalab', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Ertalab', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.demo-shift')).toContainText('10:00—14:00');
  expect(
    await page
      .locator('.button')
      .first()
      .evaluate((element) =>
        getComputedStyle(element)
          .transitionDuration.split(',')
          .some((value) => parseFloat(value) > 0),
      ),
  ).toBe(true);
  const scrollReveal = page.locator('.benefit-card.reveal').first();
  await scrollReveal.scrollIntoViewIfNeeded();
  await expect(scrollReveal).toHaveAttribute('data-reveal', 'visible');
  await expect(scrollReveal).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: /Til|Language|Язык/ }).click();
  await expect(headline).toContainText(/[А-Яа-яЁё]/);
  const russianHeadline = await headline.innerText();
  expect(russianHeadline).not.toBe(uzbekHeadline);
  await page.reload();
  await expect(headline).toHaveText(russianHeadline, { useInnerText: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
  const animatedSurfaces = await page
    .locator('.hero, .time-demo, .demo-shift, .button')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return { transition: style.transitionDuration, animation: style.animationName };
      }),
    );
  expect(animatedSurfaces.length).toBeGreaterThan(3);
  for (const surface of animatedSurfaces) {
    expect(surface.transition).toBe('0s');
    expect(surface.animation).toBe('none');
  }
  await expect(page.locator('.reveal[data-reveal="pending"]')).toHaveCount(0);
  const revealedSurfaces = await page.locator('.reveal').evaluateAll((elements) =>
    elements.map((element) => ({
      opacity: getComputedStyle(element).opacity,
      transition: getComputedStyle(element).transitionDuration,
    })),
  );
  expect(revealedSurfaces.length).toBeGreaterThan(1);
  for (const surface of revealedSurfaces) {
    expect(surface.opacity).toBe('1');
    expect(surface.transition).toBe('0s');
  }
  await page.getByRole('button', { name: 'Язык', exact: true }).click();
  await page.getByRole('button', { name: 'Kechqurun', exact: true }).click();
  await expect(page.locator('.demo-shift')).toContainText('16:00—21:00');
  await expect(page.getByRole('button', { name: 'Kechqurun', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('landing category choices recover from catalog failure and load matching live shifts', async ({
  page,
}) => {
  let failCatalog = true;
  await page.route('**/api/v1/catalog', async (route) => {
    if (failCatalog)
      await route.fulfill({
        status: 503,
        json: { code: 'SERVICE_UNAVAILABLE', message: 'Controlled catalog failure' },
      });
    else await route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await ready(page);
  const catalogFeedback = page.locator('.catalog-feedback');
  await expect(catalogFeedback).toBeVisible();
  await expect(catalogFeedback).toHaveAttribute('role', 'status');
  await expect(page.locator('.landing-shifts .shift-card')).not.toHaveCount(0);
  failCatalog = false;
  await catalogFeedback.getByRole('button', { name: 'Qayta urinish', exact: true }).click();
  await expect(catalogFeedback).not.toBeVisible();
  const category = page
    .locator('.opportunity-filters')
    .getByRole('button', { name: 'Ofitsiant', exact: true });
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/shifts?') &&
      response.url().includes('categoryId=') &&
      response.request().method() === 'GET',
  );
  await category.click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as { items: { id: string; title: string }[] };
  await expect(category).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.landing-shifts .shift-card')).toHaveCount(data.items.length);
  for (const shift of data.items)
    await expect(
      page
        .locator(`.landing-shifts a[href="/shifts/${shift.id}"]`)
        .getByRole('heading', { name: shift.title, exact: true }),
    ).toBeVisible();
  if (!data.items.length)
    await expect(page.locator('.opportunities-section .empty-state')).toBeVisible();
  await expect(page.locator('.error-state')).toHaveCount(0);
});

test('public mobile navigation traps focus, dismisses, unlocks scroll and follows a route', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await ready(page);
  const drawer = page.getByRole('dialog', { name: 'Menyu', exact: true });
  await assertDrawerInteraction(page, drawer, 'public-navigation');
  await page.getByRole('button', { name: 'Menyu', exact: true }).click();
  await drawer.getByRole('link', { name: 'Tariflar', exact: true }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await ready(page);
  await expect(drawer).not.toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});

test('keyboard action dialog and workspace mobile drawer retain focus and route behavior', async ({
  browser,
}) => {
  const assignment = await db.assignment.findFirstOrThrow({
    where: { status: 'CONFIRMED' },
    include: { worker: true },
  });
  const context = await roleContext(browser, assignment.worker.phone);
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/worker/assignments/${assignment.id}`);
    await ready(page);
    await expect(page.locator('.sidebar')).toBeHidden();
    const cancel = page.getByRole('button', { name: 'Bekor qilish', exact: true });
    await cancel.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Bekor qilish' });
    await expect(dialog).toBeVisible();
    let rejectedRequests = 0;
    await page.route(`**/api/v1/assignments/${assignment.id}/cancel`, async (route) => {
      rejectedRequests++;
      await route.fulfill({
        status: 409,
        json: {
          code: 'ASSIGNMENT_CHANGED',
          message: 'Smena holati yangilangan. Qayta tekshiring.',
        },
      });
    });
    const reason = 'Controlled browser failure verification';
    await dialog.getByRole('textbox').fill(reason);
    await dialog.getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      'Smena holati yangilangan. Qayta tekshiring.',
    );
    await expect(dialog.getByRole('textbox')).toHaveValue(reason);
    await expect(dialog.locator('.success-line')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
    await expect.poll(() => rejectedRequests).toBe(2);
    await expect(dialog.getByRole('button', { name: 'Tasdiqlash', exact: true })).toBeEnabled();
    expect((await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe(
      'CONFIRMED',
    );
    for (let index = 0; index < 6; index++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(cancel).toBeFocused();
    const drawer = page.getByRole('dialog', { name: 'Asosiy navigatsiya', exact: true });
    await assertDrawerInteraction(page, drawer, 'workspace-navigation');
    await page.getByRole('button', { name: 'Menyu', exact: true }).click();
    await drawer.getByRole('link', { name: 'Smena topish', exact: true }).click();
    await expect(page).toHaveURL(/\/worker\/shifts$/);
    await ready(page);
    await expect(drawer).not.toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    const bottomNavigation = page.locator('.bottom-nav');
    await expect(bottomNavigation).toBeVisible();
    await expect(
      bottomNavigation.getByRole('link', { name: 'Qidirish', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      await bottomNavigation
        .getByRole('link', { name: 'Qidirish', exact: true })
        .getByText('Qidirish', { exact: true })
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(12);
  } finally {
    await context.close();
  }
});

test('phone OTP browser flow starts a real session with no universal code', async ({
  page,
  request,
}) => {
  const phone = `+99884${String(Date.now()).slice(-7)}`;
  await page.goto('/auth');
  await page.getByLabel('Telefon raqam').fill(phone);
  const challengePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/auth/otp/request') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Kod yuborish' }).click();
  const challenge = (await (await challengePromise).json()) as {
    challengeId: string;
    code?: string;
  };
  expect(challenge.code).toBeUndefined();
  const inbox = await request.get(
    `http://localhost:3000/api/v1/developer/inbox?phone=${encodeURIComponent(phone)}`,
    { headers: { 'x-dev-key': process.env.LOCAL_DEV_KEY! } },
  );
  const data = (await inbox.json()) as { items: { code: string }[] };
  await page.getByLabel('Tasdiqlash kodi', { exact: true }).fill(data.items[0]!.code);
  await page.getByRole('button', { name: 'Davom etish' }).click();
  await expect(page).toHaveURL(/\/context$/);
  await expect(page.getByRole('heading', { name: 'Ish maydonini tanlang' })).toBeVisible();
});

test('mobile employer calendar starts with Tashkent today and preserves explicit day or week choices', async ({
  browser,
}) => {
  const context = await roleContext(browser, '+998900000001');
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(new Date('2026-01-31T20:30:00Z'));
    await page.goto('/employer/calendar');
    await ready(page);
    const day = page.getByRole('button', { name: 'Kun', exact: true });
    const week = page.getByRole('button', { name: 'Hafta', exact: true });
    await expect(page.getByLabel('Sana', { exact: true })).toHaveValue('2026-02-01');
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.calendar-day')).toHaveCount(1);
    await expect(page.locator('.calendar-day-empty')).toHaveText('Bu kunda smena yo‘q');
    await expect(
      page.getByRole('region', { name: 'Smena taqvimi · Kun', exact: true }),
    ).not.toHaveAttribute('tabindex', '0');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(week).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.calendar-day')).toHaveCount(7);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    await week.click();
    await expect(week).toHaveAttribute('aria-pressed', 'true');
    const weekRegion = page.getByRole('region', { name: 'Smena taqvimi · Hafta', exact: true });
    await expect(weekRegion).toHaveAttribute('tabindex', '0');
    await weekRegion.focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(() => weekRegion.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(week).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Keyingi', exact: true }).click();
    await expect(page.getByLabel('Sana', { exact: true })).toHaveValue('2026-02-08');
    await day.click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.calendar-day')).toHaveCount(1);
    await page.getByRole('button', { name: 'Keyingi', exact: true }).click();
    await expect(page.getByLabel('Sana', { exact: true })).toHaveValue('2026-02-09');
    await expect(page.locator('.error-state')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('employer creates and publishes a shift; worker applies, receives offer and confirms in both cabinets', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const employerContext = await roleContext(browser, '+998900000001'),
    workerContext = await roleContext(browser, '+998901000017');
  const employer = await employerContext.newPage(),
    person = await workerContext.newPage();
  const title = `QA smena ${Date.now()}`;
  const day = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  try {
    await employer.goto('/employer/shifts/new');
    await ready(employer);
    await employer.getByLabel('Sarlavha', { exact: true }).fill(title);
    await employer
      .getByRole('combobox', { name: 'Kasb', exact: true })
      .selectOption({ label: 'Ofitsiant' });
    await employer.getByLabel('Boshlanish', { exact: true }).fill(`${day}T09:00`);
    await employer.getByLabel('Tugash', { exact: true }).fill(`${day}T17:00`);
    await employer.getByLabel('Summa (so‘m)', { exact: true }).fill('220000');
    await employer
      .getByLabel('Tavsif', { exact: true })
      .fill('Brauzer orqali yaratilgan sintetik sinov smenasi.');
    await employer.getByRole('button', { name: 'Qoralamani saqlash' }).click();
    await expect(employer).toHaveURL(/\/employer\/calendar$/);
    await employer
      .getByRole('button')
      .filter({ has: employer.getByText(title, { exact: true }) })
      .click();
    await employer.getByRole('button', { name: 'E’lon qilish', exact: true }).click();
    const shift = await db.shift.findFirstOrThrow({ where: { title } });
    await expect
      .poll(async () => (await db.shift.findUniqueOrThrow({ where: { id: shift.id } })).status)
      .toBe('PUBLISHED');
    await person.goto(`/worker/shifts/${shift.id}`);
    await ready(person);
    await person.getByRole('button', { name: 'Ariza yuborish', exact: true }).click();
    await expect.poll(() => db.shiftApplication.count({ where: { shiftId: shift.id } })).toBe(1);
    await employer.goto('/employer/applications');
    await ready(employer);
    const application = employer.locator('article').filter({ hasText: title });
    await application.getByRole('button', { name: 'Taklif berish', exact: true }).click();
    await person.goto('/worker/applications');
    await ready(person);
    const workerApplication = person.locator('article').filter({ hasText: title });
    await workerApplication
      .getByRole('button', { name: 'Taklifni qabul qilish', exact: true })
      .click();
    await expect
      .poll(() => db.assignment.count({ where: { shiftId: shift.id, status: 'CONFIRMED' } }))
      .toBe(1);
    await person.goto('/worker/assignments');
    await expect(person.getByText(title, { exact: true })).toBeVisible();
    await employer.goto('/employer/assignments');
    await expect(employer.getByText(title, { exact: true })).toBeVisible();
    await person.reload();
    await expect(person.getByText(title, { exact: true })).toBeVisible();
    const assignment = await db.assignment.findFirstOrThrow({
      where: { shiftId: shift.id, status: 'CONFIRMED' },
    });
    const workerCsrf = (await workerContext.cookies()).find(
      (cookie) => cookie.name === 'smenatop_csrf',
    )!.value;
    await workerContext.request.post(`/api/v1/assignments/${assignment.id}/cancel`, {
      headers: { 'x-csrf-token': workerCsrf },
      data: { reason: 'Completed synthetic browser verification' },
    });
    const employerCsrf = (await employerContext.cookies()).find(
      (cookie) => cookie.name === 'smenatop_csrf',
    )!.value;
    await employerContext.request.post(
      `/api/v1/organizations/${shift.organizationId}/shifts/${shift.id}/cancel`,
      {
        headers: { 'x-csrf-token': employerCsrf },
        data: { reason: 'Completed synthetic browser verification' },
      },
    );
  } finally {
    await employerContext.close();
    await workerContext.close();
  }
});

test('responsive visual QA across public, worker, employer, billing, admin and developer routes', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await mkdir('docs/screenshots', { recursive: true });
  const assignment = await db.assignment.findFirstOrThrow({
    where: { status: { in: ['CONFIRMED', 'COMPLETED', 'CHECKED_IN', 'CHECKED_OUT'] } },
    include: { worker: true },
  });
  const contexts: Record<string, BrowserContext> = {
    public: await browser.newContext({ baseURL, reducedMotion: 'reduce' }),
    worker: await roleContext(browser, assignment.worker.phone),
    employer: await roleContext(browser, '+998900000001'),
    admin: await roleContext(browser, '+998900000099'),
    developer: await roleContext(browser, '+998900000098'),
  };
  const publicShift = await db.shift.findFirstOrThrow({ where: { status: 'PUBLISHED' } });
  const targets = [
    ['landing', 'public', '/'],
    ['auth', 'public', '/auth'],
    ['pricing', 'public', '/pricing'],
    ['worker-search', 'worker', '/worker/shifts'],
    ['shift-detail', 'worker', `/worker/shifts/${publicShift.id}`],
    ['worker-assignment', 'worker', `/worker/assignments/${assignment.id}`],
    ['employer-calendar', 'employer', '/employer/calendar'],
    ['billing', 'employer', '/employer/billing'],
    ['admin-queue', 'admin', '/admin'],
    ['developer', 'developer', '/developer'],
  ];
  try {
    for (const [name, role, url] of targets) {
      const page = await contexts[role!]!.newPage();
      const runtimeErrors: string[] = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      await page.goto(url!);
      await ready(page);
      await page.evaluate(() => document.fonts.ready);
      for (const viewport of [
        { width: 360, height: 800 },
        { width: 390, height: 844 },
        { width: 767, height: 1000 },
        { width: 768, height: 1000 },
        { width: 844, height: 390 },
        { width: 960, height: 1000 },
        { width: 1024, height: 1000 },
        { width: 1440, height: 1000 },
      ]) {
        const { width } = viewport;
        await page.setViewportSize(viewport);
        if (name === 'auth' && width <= 390)
          expect(
            await page
              .getByLabel('Telefon raqam')
              .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
          ).toBeGreaterThanOrEqual(16);
        if ([390, 1440].includes(width) || (name === 'employer-calendar' && width === 360))
          await page.screenshot({ path: `docs/screenshots/${name}-${width}.png`, fullPage: true });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          `${name} overflows at ${width}`,
        ).toBe(true);
      }
      await expect(page.locator('.error-state')).toHaveCount(0);
      expect(runtimeErrors, `${name} emitted a browser exception`).toEqual([]);
      await page.close();
    }
    for (const [name, role, url] of [
      ['landing', 'public', '/'],
      ['employer-calendar', 'employer', '/employer/calendar'],
    ]) {
      const page = await contexts[role!]!.newPage();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(url!);
      await ready(page);
      await page.getByRole('button', { name: 'Qorong‘i', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.getByRole('button', { name: 'Til', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Язык', exact: true })).toBeVisible();
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.screenshot({
          path: `docs/screenshots/${name}-ru-dark-${width}.png`,
          fullPage: true,
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        ).toBe(true);
      }
      await page.close();
    }
  } finally {
    for (const context of Object.values(contexts)) await context.close();
  }
});
