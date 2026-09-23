import { test, expect, type Browser, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

const db = new PrismaClient();
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const workerPhone = '+998901000001';
const employerPhone = '+998900000001';
async function roleContext(browser: Browser, phone: string) {
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
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  await context.addCookies([
    { name: 'smenatop_session', value: token, url: baseURL, httpOnly: true, sameSite: 'Lax' },
    { name: 'smenatop_csrf', value: csrf, url: baseURL, sameSite: 'Lax' },
  ]);
  return {
    context,
    user,
    csrf,
    close: async () => {
      await context.close();
      await db.session.deleteMany({ where: { id: session.id } });
    },
  };
}
async function ready(page: Page) {
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('.loading-block')).toHaveCount(0);
}
async function screenshot(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${name} has horizontal overflow at ${width}px`,
  ).toBe(true);
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: `docs/screenshots/${name}-${width}.png`, fullPage: true });
}
async function editWorker(page: Page) {
  await page
    .getByRole('group', { name: 'Profil bo‘limlari' })
    .getByRole('button', { name: 'Profilni tahrirlash' })
    .click();
  await expect(page.locator('.resume-editor')).toBeVisible();
}
test.afterAll(async () => db.$disconnect());
test.setTimeout(120_000);

test('worker resume validates, retains a dirty draft, saves to API and survives reload', async ({
  browser,
}) => {
  const auth = await roleContext(browser, workerPhone);
  const original = await db.workerProfile.findUniqueOrThrow({ where: { userId: auth.user.id } });
  const originalConsents = await db.consentRecord.findMany({ where: { userId: auth.user.id } });
  const page = await auth.context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/worker/profile');
    await ready(page);
    await expect(page.locator('.resume-identity h2')).toHaveText(auth.user.name || '');
    await expect(page.locator('.resume-contact')).toContainText(workerPhone);
    await expect(page.locator('.private-files')).toBeVisible();
    await screenshot(page, 'resume-worker-overview', 1440);
    await screenshot(page, 'resume-worker-overview', 390);
    await screenshot(page, 'resume-worker-overview', 320);
    await editWorker(page);
    await screenshot(page, 'resume-worker-edit', 390);
    const name = page.getByLabel('Ism va familiya', { exact: true });
    const experience = page.locator('.resume-editor textarea');
    await name.fill('');
    await page.getByRole('button', { name: 'O‘zgarishlarni saqlash', exact: true }).click();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    const errorId = await name.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    await expect(page.locator(`[id="${errorId}"]`)).toBeVisible();
    await name.fill(auth.user.name || 'Namuna ishchi');
    const draft = `${original.experience}\nBrauzer sinovining vaqtinchalik rezyume yozuvi.`;
    await experience.fill(draft);
    await page.locator('.bottom-nav').getByRole('link', { name: 'Qidirish', exact: true }).click();
    await ready(page);
    await page.goBack();
    await expect(experience).toHaveValue(draft);
    await page.getByRole('button', { name: 'Profil ko‘rinishi', exact: true }).click();
    await expect(page.locator('.resume-draft-notice')).toBeVisible();
    await expect(page.locator('.resume-experience')).toHaveText(original.experience);
    await page.getByRole('button', { name: 'Tahrirlashni davom ettirish' }).click();
    await expect(experience).toHaveValue(draft);
    await page
      .getByRole('checkbox', {
        name: 'Foydalanish shartlari va maxfiylik siyosatiga roziman',
        exact: true,
      })
      .check();
    await page.route('**/api/v1/worker/profile', async (route) => {
      if (route.request().method() === 'PUT')
        await route.fulfill({
          status: 409,
          json: { code: 'CONTROLLED_CONFLICT', message: 'Controlled profile save failure' },
        });
      else await route.continue();
    });
    await page.getByRole('button', { name: 'O‘zgarishlarni saqlash', exact: true }).click();
    await expect(page.getByText('Controlled profile save failure', { exact: true })).toBeVisible();
    await expect(experience).toHaveValue(draft);
    await page.unroute('**/api/v1/worker/profile');
    const savedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/worker/profile') && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'O‘zgarishlarni saqlash', exact: true }).click();
    const response = await savedResponse;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toMatchObject({
      submit: false,
      termsAccepted: true,
      adultConfirmed: true,
      experience: draft,
    });
    await expect(page.getByText('Profil ma’lumotlari saqlandi.', { exact: true })).toBeVisible();
    expect(
      (await db.workerProfile.findUniqueOrThrow({ where: { id: original.id } })).experience,
    ).toBe(draft);
    await page.reload();
    await ready(page);
    await expect(page.locator('.resume-experience')).toHaveText(draft);
    await editWorker(page);
    await experience.fill('Bu matn bekor qilinadi.');
    await page.getByRole('button', { name: 'O‘zgarishlarni bekor qilish', exact: true }).click();
    await expect(page.locator('.resume-experience')).toHaveText(draft);
    await expect(page.locator('.resume-draft-notice')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await db.workerProfile.update({
      where: { id: original.id },
      data: {
        experience: original.experience,
        languages: original.languages,
        cityId: original.cityId,
        categoryIds: original.categoryIds,
        adultConfirmed: original.adultConfirmed,
        verificationStatus: original.verificationStatus,
        updatedAt: original.updatedAt,
      },
    });
    await db.user.update({
      where: { id: auth.user.id },
      data: { name: auth.user.name, updatedAt: auth.user.updatedAt },
    });
    const existingIds = new Set(originalConsents.map((item) => item.id));
    const added = (await db.consentRecord.findMany({ where: { userId: auth.user.id } })).filter(
      (item) => !existingIds.has(item.id),
    );
    if (added.length)
      await db.consentRecord.deleteMany({ where: { id: { in: added.map((item) => item.id) } } });
    await auth.close();
  }
});

test('worker dashboard and application inbox show real counts and preserve filters', async ({
  browser,
}) => {
  const auth = await roleContext(browser, workerPhone);
  const page = await auth.context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const applicationsResponse = await auth.context.request.get('/api/v1/worker/applications');
    expect(applicationsResponse.ok()).toBe(true);
    const applications = (await applicationsResponse.json()).items as {
      id: string;
      status: string;
      shift: { title: string; status: string; startAt: string };
      offers: { status: string; expiresAt: string }[];
    }[];
    await page.goto('/worker');
    await ready(page);
    const offered = applications.filter(
      (item) =>
        item.status === 'OFFERED' &&
        item.shift.status === 'PUBLISHED' &&
        Date.parse(item.shift.startAt) > Date.now() &&
        item.offers.some(
          (offer) => offer.status === 'PENDING' && Date.parse(offer.expiresAt) > Date.now(),
        ),
    );
    const active = applications.filter((item) =>
      ['SUBMITTED', 'SHORTLISTED'].includes(item.status),
    );
    await expect(page.locator('.hub-stat-grid > a').nth(0).locator('strong')).toHaveText(
      String(offered.length),
    );
    await expect(page.locator('.hub-stat-grid > a').nth(1).locator('strong')).toHaveText(
      String(active.length),
    );
    await screenshot(page, 'hub-worker', 1440);
    await screenshot(page, 'hub-worker', 390);
    await page.goto('/worker/applications');
    await ready(page);
    await expect(page.locator('.inbox-card')).toHaveCount(applications.length);
    await screenshot(page, 'inbox-worker', 390);
    const search = page.getByRole('searchbox', { name: 'Smena yoki tashkilot bo‘yicha qidirish' });
    await search.fill('zz-profile-search-no-match');
    await expect(page).toHaveURL(/q=zz-profile-search-no-match/);
    await expect(page.getByRole('heading', { name: 'Bu filtrga mos ariza yo‘q' })).toBeVisible();
    await page.reload();
    await ready(page);
    await expect(search).toHaveValue('zz-profile-search-no-match');
    await page.locator('.page-heading').getByRole('link', { name: 'Profilimni ko‘rish' }).click();
    await ready(page);
    await page.goBack();
    await ready(page);
    await expect(search).toHaveValue('zz-profile-search-no-match');
    await page
      .locator('.inbox-result-count')
      .getByRole('button', { name: 'Filtrlarni tozalash' })
      .click();
    await expect(page.locator('.inbox-card')).toHaveCount(applications.length);
    await screenshot(page, 'inbox-worker', 1440);
    await page.goto('/worker/applications?status=constructor');
    await ready(page);
    await expect(page.locator('.inbox-card')).toHaveCount(applications.length);
    expect(errors).toEqual([]);
  } finally {
    await auth.close();
  }
});

test('shift search restores URL filters after refresh and browser back', async ({ browser }) => {
  const auth = await roleContext(browser, workerPhone);
  const page = await auth.context.newPage();
  try {
    const catalog = (await (await auth.context.request.get('/api/v1/catalog')).json()) as {
      cities: { id: string; nameUz: string }[];
      categories: { id: string; nameUz: string }[];
    };
    await page.goto('/worker/shifts');
    await ready(page);
    const city = page.getByRole('combobox', { name: 'Shahar', exact: true });
    const category = page.getByRole('combobox', { name: 'Kasb', exact: true });
    await city.selectOption(catalog.cities[0].id);
    await expect(page).toHaveURL(new RegExp(`cityId=${catalog.cities[0].id}`));
    await category.selectOption(catalog.categories[0].id);
    await expect(page).toHaveURL(new RegExp(`categoryId=${catalog.categories[0].id}`));
    const input = page.getByRole('textbox', { name: 'Qidirish', exact: true });
    await input.fill('Smena');
    await page
      .locator('.search-bar')
      .getByRole('button', { name: 'Qidirish', exact: true })
      .click();
    await expect(page).toHaveURL(/q=Smena/);
    await page.reload();
    await ready(page);
    await expect(city).toHaveValue(catalog.cities[0].id);
    await expect(category).toHaveValue(catalog.categories[0].id);
    await expect(input).toHaveValue('Smena');
    await page.goBack();
    await ready(page);
    await expect(input).toHaveValue('');
    await expect(category).toHaveValue(catalog.categories[0].id);
    await page.goBack();
    await ready(page);
    await expect(city).toHaveValue(catalog.cities[0].id);
    await expect(category).toHaveValue('');
    await screenshot(page, 'shift-board-worker', 390);
  } finally {
    await auth.close();
  }
});

test('employer dashboard and candidate resume are accessible and private', async ({ browser }) => {
  const auth = await roleContext(browser, employerPhone);
  const page = await auth.context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/employer');
    await ready(page);
    await screenshot(page, 'hub-employer', 1440);
    await screenshot(page, 'hub-employer', 390);
    await page.goto('/employer/applications');
    await ready(page);
    await expect(page.locator('.inbox-card').first()).toBeVisible();
    await screenshot(page, 'inbox-employer', 390);
    await screenshot(page, 'inbox-employer', 1440);
    const opener = page
      .locator('.inbox-card')
      .first()
      .getByRole('button', { name: 'Nomzod profilini ko‘rish', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Nomzod profili', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h3')).not.toBeEmpty();
    await expect(dialog.locator('.candidate-application-context')).toBeVisible();
    await expect(dialog.locator('.resume-privacy')).toContainText(
      'Shaxsiy hujjatlar va telefon raqami bu yerda ochilmaydi.',
    );
    await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
    expect(await dialog.innerText()).not.toMatch(/\+998\d{9}/);
    await screenshot(page, 'candidate-resume', 1440);
    await screenshot(page, 'candidate-resume', 390);
    const close = dialog.getByRole('button', { name: 'Yopish', exact: true });
    await close.focus();
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    expect(errors).toEqual([]);
  } finally {
    await auth.close();
  }
});

test('company profile persists authorized changes and protects stale drafts and read-only roles', async ({
  browser,
}) => {
  const auth = await roleContext(browser, employerPhone);
  const membership = await db.organizationMembership.findFirstOrThrow({
    where: { userId: auth.user.id, role: 'OWNER', status: 'ACTIVE' },
  });
  const original = await db.organization.findUniqueOrThrow({
    where: { id: membership.organizationId },
  });
  expect(original.synthetic).toBe(true);
  const path = `/api/v1/organizations/${original.id}`;
  const page = await auth.context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`/employer/profile?org=${original.id}`);
    await ready(page);
    await screenshot(page, 'profile-company', 1440);
    await screenshot(page, 'profile-company', 390);
    await screenshot(page, 'profile-company', 320);
    await page.getByRole('button', { name: 'Profilni tahrirlash', exact: true }).click();
    const form = page.locator('.org-profile-editor');
    await expect(form).toBeVisible();
    await page.locator('#org-field-name').fill('');
    await form.getByRole('button', { name: 'O‘zgarishlarni saqlash', exact: true }).click();
    await expect(page.locator('#org-field-name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#org-error-name')).toBeVisible();
    await page.locator('#org-field-name').fill(original.name);
    const draft = `${original.description || ''}\nVaqtinchalik kompaniya profil sinovi.`.trim();
    await page.locator('#org-field-description').fill(draft);
    await page
      .locator('.bottom-nav')
      .getByRole('link', { name: 'Smena taqvimi', exact: true })
      .click();
    await ready(page);
    await page.goBack();
    await expect(page.locator('#org-field-description')).toHaveValue(draft);
    const remote = await auth.context.request.patch(path, {
      headers: { 'x-csrf-token': auth.csrf },
      data: {
        version: original.version,
        name: original.name,
        cityId: original.cityId,
        contactName: original.contactName,
        stir: original.stir,
        description: 'Parallel tahrir sinovi.',
        website: original.website,
        contactPhone: original.contactPhone,
      },
    });
    expect(remote.ok()).toBe(true);
    const conflictResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/organizations/${original.id}`) &&
        response.request().method() === 'PATCH',
    );
    await form.getByRole('button', { name: 'O‘zgarishlarni saqlash', exact: true }).click();
    expect((await conflictResponse).status()).toBe(409);
    await expect(page.locator('.org-conflict')).toBeVisible();
    await expect(page.locator('#org-field-description')).toHaveValue(draft);
    await page
      .locator('.org-conflict')
      .getByRole('button', { name: 'Saqlangan ma’lumotlarni yangilash', exact: true })
      .click();
    await expect(
      form.getByRole('button', { name: 'O‘zgarishlarni saqlash', exact: true }),
    ).toBeDisabled();
    await expect(page.locator('#org-field-description')).toHaveValue(draft);
    await form.getByRole('button', { name: 'Bekor qilish', exact: true }).click();
    const discard = page.getByRole('dialog', {
      name: 'O‘zgarishlarni bekor qilasizmi?',
      exact: true,
    });
    await expect(discard).toBeVisible();
    await discard.getByRole('button', { name: 'O‘zgarishlarni bekor qilish', exact: true }).click();
    await expect(form).toHaveCount(0);
    await page.getByRole('button', { name: 'Profilni tahrirlash', exact: true }).click();
    await page.locator('#org-field-description').fill(draft);
    await screenshot(page, 'profile-company-edit', 390);
    const savedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/organizations/${original.id}`) &&
        response.request().method() === 'PATCH',
    );
    await page
      .locator('.org-profile-editor')
      .getByRole('button', { name: 'O‘zgarishlarni saqlash', exact: true })
      .click();
    expect((await savedResponse).ok()).toBe(true);
    await expect(page.getByText('Kompaniya profili saqlandi.', { exact: true })).toBeVisible();
    await page.reload();
    await ready(page);
    await expect(
      page.locator('#org-saved-preview').getByText(draft, { exact: true }),
    ).toBeVisible();
    expect(
      (await db.organization.findUniqueOrThrow({ where: { id: original.id } })).description,
    ).toBe(draft);
    expect(errors).toEqual([]);
  } finally {
    await db.organization.update({
      where: { id: original.id },
      data: {
        description: original.description,
        website: original.website,
        contactPhone: original.contactPhone,
        version: original.version,
      },
    });
    await auth.close();
  }
  for (const phone of ['+998900000010', '+998900000011']) {
    const reader = await roleContext(browser, phone);
    try {
      const readPage = await reader.context.newPage();
      await readPage.goto(`/employer/profile?org=${original.id}`);
      await ready(readPage);
      await expect(readPage.locator('.organization-profile')).toBeVisible();
      await expect(
        readPage.getByRole('button', { name: 'Profilni tahrirlash', exact: true }),
      ).toHaveCount(0);
      await expect(readPage.locator('.org-profile-editor')).toHaveCount(0);
      const denied = await reader.context.request.patch(path, {
        headers: { 'x-csrf-token': reader.csrf },
        data: {
          version: original.version,
          name: original.name,
          cityId: original.cityId,
          contactName: original.contactName,
          description: 'Must not save',
        },
      });
      expect(denied.status()).toBe(403);
    } finally {
      await reader.close();
    }
  }
});

test('both profiles support Russian dark mode on mobile, tablet and desktop', async ({
  browser,
}) => {
  for (const [phone, route, title, name] of [
    [workerPhone, '/worker/profile', 'Мой профиль работника', 'resume-worker'],
    [employerPhone, '/employer/profile', 'Профиль компании', 'profile-company'],
  ]) {
    const auth = await roleContext(browser, phone);
    try {
      await auth.context.addInitScript(() => {
        localStorage.setItem('smenatop-language', 'ru');
        localStorage.setItem('smenatop-theme', 'dark');
      });
      const page = await auth.context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(route);
      await ready(page);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      for (const width of [320, 390, 768, 1440]) {
        await screenshot(page, `${name}-ru-dark`, width);
        if (name === 'profile-company' && width === 390) {
          await page.locator('#org-saved-preview').screenshot({
            path: 'docs/screenshots/profile-company-preview-ru-dark-390.png',
          });
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await auth.close();
    }
  }
});
