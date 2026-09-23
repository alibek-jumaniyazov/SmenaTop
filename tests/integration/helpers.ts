import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient();
export const base = process.env.TEST_API_URL ?? 'http://127.0.0.1:3001/api/v1';
export const digest = (text: string) => createHash('sha256').update(text).digest('hex');
export class Client {
  cookie = '';
  csrf = '';
  userId = '';
  async request<T = Record<string, unknown>>(
    path: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        Origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.csrf ? { 'x-csrf-token': this.csrf } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) this.cookie = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
    const data = (await response.json().catch(() => ({}))) as T;
    if (data && typeof data === 'object' && 'csrfToken' in data) this.csrf = String(data.csrfToken);
    return { status: response.status, data, response };
  }
}
export async function actor(name: string, permissions: string[] = []) {
  const user = await db.user.create({
    data: {
      phone: `+998${String(BigInt(`0x${randomBytes(5).toString('hex')}`) % 1_000_000_000n).padStart(9, '0')}`,
      name: `TEST ${name} ${randomUUID().slice(0, 8)}`,
    },
  });
  if (permissions.length)
    await db.platformRoleGrant.create({
      data: { userId: user.id, role: 'TEST_GRANTED', permissions },
    });
  const client = new Client();
  const token = randomBytes(32).toString('base64url');
  client.csrf = randomBytes(32).toString('base64url');
  client.userId = user.id;
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: digest(token),
      csrfHash: digest(client.csrf),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  client.cookie = `smenatop_session=${token}; smenatop_csrf=${client.csrf}`;
  return client;
}
export async function catalog() {
  const city = await db.city.upsert({
    where: { code: 'test-city' },
    create: { code: 'test-city', nameUz: 'Sinov shahri', nameRu: 'Тестовый город' },
    update: {},
  });
  const category = await db.jobCategory.upsert({
    where: { code: 'test-category' },
    create: { code: 'test-category', nameUz: 'Sinov yordamchisi', nameRu: 'Тестовый помощник' },
    update: {},
  });
  return { city, category };
}
export async function tenant(
  owner: Client,
  options: { publishLimit?: number; expired?: boolean } = {},
) {
  const { city } = await catalog();
  const plan = await db.plan.create({
    data: {
      code: `test-${randomUUID()}`,
      name: 'TEST plan',
      versions: {
        create: {
          version: 1,
          priceMinor: 49_900_000n,
          currency: 'UZS',
          branchLimit: 3,
          memberLimit: 10,
          publishLimit: options.publishLimit ?? 20,
        },
      },
    },
    include: { versions: true },
  });
  const organization = await db.organization.create({
    data: {
      name: `TEST tenant ${randomUUID().slice(0, 8)}`,
      contactName: 'Synthetic owner',
      cityId: city.id,
      verificationStatus: 'VERIFIED',
      synthetic: true,
      isDemo: true,
      memberships: { create: { userId: owner.userId, role: 'OWNER', branchIds: [] } },
    },
  });
  const branch = await db.branch.create({
    data: {
      organizationId: organization.id,
      cityId: city.id,
      name: 'TEST branch',
      address: 'Synthetic address',
      area: 'Synthetic area',
    },
  });
  const start = new Date(Date.now() - 86400_000);
  const end = new Date(Date.now() + (options.expired ? -3600_000 : 6 * 86400_000));
  const subscription = await db.subscription.create({
    data: {
      organizationId: organization.id,
      planVersionId: plan.versions[0]!.id,
      status: options.expired ? 'EXPIRED' : 'ACTIVE',
      currentPeriodStart: start,
      currentPeriodEnd: end,
      anchorDay: 22,
    },
  });
  await db.entitlement.create({
    data: {
      organizationId: organization.id,
      subscriptionId: subscription.id,
      renewalSequence: 0,
      planVersionId: plan.versions[0]!.id,
      startsAt: start,
      endsAt: end,
    },
  });
  return { organization, branch, subscription, planVersion: plan.versions[0]! };
}
export async function worker(name: string) {
  const user = await actor(name);
  const { city, category } = await catalog();
  await db.workerProfile.create({
    data: {
      userId: user.userId,
      cityId: city.id,
      categoryIds: [category.id],
      languages: ['uz'],
      adultConfirmed: true,
      verificationStatus: 'VERIFIED',
    },
  });
  return user;
}
export async function shiftFixture(
  _owner: Client,
  organization: Awaited<ReturnType<typeof tenant>>,
  options: {
    startAt?: Date;
    endAt?: Date;
    headcount?: number;
    status?: string;
    requiredSkillIds?: string[];
  } = {},
) {
  const { city, category } = await catalog();
  const startAt = options.startAt ?? new Date(Date.now() + 48 * 3600_000);
  const endAt = options.endAt ?? new Date(startAt.getTime() + 8 * 3600_000);
  return db.shift.create({
    data: {
      organizationId: organization.organization.id,
      branchId: organization.branch.id,
      cityId: city.id,
      categoryId: category.id,
      title: 'TEST shift',
      description: 'Synthetic integration test shift',
      duties: ['Testing'],
      requirements: [],
      requiredSkillIds: options.requiredSkillIds ?? [],
      startAt,
      endAt,
      headcount: options.headcount ?? 1,
      amountMinor: 2_500_000n,
      applyDeadline: startAt,
      status: options.status ?? 'PUBLISHED',
    },
  });
}
export async function offerFixture(
  owner: Client,
  workerClient: Client,
  shift: Awaited<ReturnType<typeof shiftFixture>>,
) {
  const application = await db.shiftApplication.create({
    data: {
      organizationId: shift.organizationId,
      shiftId: shift.id,
      workerId: workerClient.userId,
      status: 'OFFERED',
    },
  });
  const offer = await db.shiftOffer.create({
    data: {
      organizationId: shift.organizationId,
      applicationId: application.id,
      shiftId: shift.id,
      workerId: workerClient.userId,
      createdById: owner.userId,
      expiresAt: shift.startAt,
    },
  });
  return { application, offer };
}
