import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  actor,
  base,
  catalog,
  Client,
  db,
  digest,
  offerFixture,
  shiftFixture,
  tenant,
  worker,
} from './helpers';
import { totp } from '../../apps/api/src/mfa/totp';

const accept = (client: Client, id: string, key = randomUUID()) =>
  client.request<{ id: string }>(`/offers/${id}/accept`, {}, 'POST', { 'Idempotency-Key': key });
before(async () => {
  // Reset only this suite's synthetic OTP rate-limit fixtures in the isolated test DB.
  if (
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL ||
    process.env.APP_ENV === 'production'
  )
    throw new Error('Integration fixture isolation required');
  const phones = { OR: [{ phone: { startsWith: '+99881' } }, { phone: { startsWith: '+99882' } }] };
  await db.localInbox.deleteMany({ where: phones });
  await db.otpChallenge.deleteMany({ where: phones });
  await catalog();
  const plan = await db.plan.upsert({
    where: { code: 'TRIAL' },
    create: { code: 'TRIAL', name: 'Trial' },
    update: {},
  });
  await db.planVersion.upsert({
    where: { planId_version: { planId: plan.id, version: 1 } },
    create: {
      planId: plan.id,
      version: 1,
      priceMinor: 0n,
      branchLimit: 1,
      memberLimit: 2,
      publishLimit: 5,
    },
    update: {},
  });
});
after(async () => db.$disconnect());

test('OTP is opaque, single-use, attempt-limited and revocable; local inbox requires secret', async () => {
  const client = new Client();
  const phone = `+99881${String(Date.now()).slice(-7)}`;
  const challenge = await client.request<{ challengeId: string; code?: string }>(
    '/auth/otp/request',
    { phone },
  );
  assert.equal(challenge.status, 201);
  assert.equal(challenge.data.code, undefined);
  assert.equal((await client.request('/auth/otp/request', { phone })).status, 429);
  assert.equal(
    (await client.request(`/developer/inbox?phone=${encodeURIComponent(phone)}`)).status,
    403,
  );
  const inbox = await client.request<{ items: { code: string }[] }>(
    `/developer/inbox?phone=${encodeURIComponent(phone)}`,
    undefined,
    'GET',
    { 'x-dev-key': process.env.LOCAL_DEV_KEY! },
  );
  assert.equal(inbox.status, 200);
  const code = inbox.data.items[0]!.code;
  const login = await client.request('/auth/otp/verify', {
    challengeId: challenge.data.challengeId,
    code,
  });
  assert.equal(login.status, 201);
  assert.ok(client.cookie.includes('smenatop_session='));
  assert.match(login.response.headers.getSetCookie()[0]!, /HttpOnly/i);
  assert.equal(
    (await client.request('/auth/otp/verify', { challengeId: challenge.data.challengeId, code }))
      .status,
    401,
  );
  assert.equal((await client.request('/auth/me')).status, 200);
  const oldCookie = client.cookie;
  await client.request('/auth/logout', {});
  client.cookie = oldCookie;
  assert.equal((await client.request('/auth/me')).status, 401);
  const second = await client.request<{ challengeId: string }>('/auth/otp/request', {
    phone: `+99882${String(Date.now()).slice(-7)}`,
  });
  const stored = await db.otpChallenge.findUniqueOrThrow({
    where: { id: second.data.challengeId },
  });
  const correct = await db.localInbox.findFirstOrThrow({ where: { challengeId: stored.id } });
  const wrong = correct.body === '000000' ? '000001' : '000000';
  for (let n = 0; n < 5; n++)
    assert.equal(
      (await client.request('/auth/otp/verify', { challengeId: stored.id, code: wrong })).status,
      401,
    );
  assert.equal(
    (await client.request('/auth/otp/verify', { challengeId: stored.id, code: correct.body }))
      .status,
    401,
  );
  assert.notEqual(stored.codeHash, correct.body);
});

test('HTTP onboarding → verification → publish → application → offer → acceptance persists in both dashboards', async () => {
  const employer = await actor('Onboarding employer'),
    candidate = await actor('Onboarding worker');
  const moderator = await actor('Moderator', ['verification.review']);
  const { city, category } = await catalog();
  const org = await employer.request<{ id: string }>('/organizations', {
    name: 'TEST Onboard business',
    contactName: 'Operator',
    stir: '123456789',
    cityId: city.id,
    branchName: 'First branch',
    address: 'Synthetic street',
    area: 'Synthetic district',
  });
  assert.equal(org.status, 201);
  const orgId = org.data.id;
  const branch = await db.branch.findFirstOrThrow({ where: { organizationId: orgId } });
  const startAt = new Date(Date.now() + 5 * 86400_000),
    endAt = new Date(startAt.getTime() + 8 * 3600_000);
  const draft = await employer.request<{ id: string }>(`/organizations/${orgId}/shifts`, {
    branchId: branch.id,
    categoryId: category.id,
    title: 'TEST service shift',
    description: 'Real API integration test flow',
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    headcount: 1,
    amountMinor: '2500000',
    payType: 'HOURLY',
  });
  assert.equal(draft.status, 201);
  assert.equal(
    (await employer.request(`/organizations/${orgId}/shifts/${draft.data.id}/publish`, {})).status,
    403,
  );
  const verifyOrg = await db.verificationRequest.findFirstOrThrow({ where: { subjectId: orgId } });
  assert.equal(
    (
      await moderator.request(`/admin/verification/${verifyOrg.id}`, {
        status: 'VERIFIED',
        reason: 'Synthetic manual verification',
      })
    ).status,
    201,
  );
  assert.equal(
    (await employer.request(`/organizations/${orgId}/shifts/${draft.data.id}/publish`, {})).status,
    201,
  );
  const profile = await candidate.request<{ id: string }>(
    '/worker/profile',
    {
      name: 'TEST Worker',
      cityId: city.id,
      categoryIds: [category.id],
      languages: ['uz', 'ru'],
      experience: 'Synthetic',
      adultConfirmed: true,
      termsAccepted: true,
      skillIds: [],
      submit: true,
    },
    'PUT',
  );
  assert.equal(profile.status, 200);
  const verifyWorker = await db.verificationRequest.findFirstOrThrow({
    where: { subjectId: profile.data.id },
  });
  assert.equal(
    (
      await moderator.request(`/admin/verification/${verifyWorker.id}`, {
        status: 'VERIFIED',
        reason: 'Synthetic worker verified',
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await candidate.request('/worker/availability', {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      })
    ).status,
    201,
  );
  const application = await candidate.request<{ id: string }>(
    `/shifts/${draft.data.id}/applications`,
    { note: 'I can work this shift' },
  );
  assert.equal(application.status, 201);
  const duplicate = await candidate.request<{ id: string }>(
    `/shifts/${draft.data.id}/applications`,
    { note: 'Second click' },
  );
  assert.equal(duplicate.data.id, application.data.id);
  const offer = await employer.request<{ id: string }>(
    `/applications/${application.data.id}/offer`,
    { expiresAt: startAt.toISOString() },
  );
  assert.equal(offer.status, 201);
  assert.equal(await db.activeBooking.count({ where: { shiftId: draft.data.id } }), 0);
  const accepted = await accept(candidate, offer.data.id);
  assert.equal(accepted.status, 201);
  assert.equal(await db.activeBooking.count({ where: { assignmentId: accepted.data.id } }), 1);
  for (const [client, path] of [
    [candidate, '/worker/assignments'],
    [employer, `/organizations/${orgId}/assignments`],
  ] as const) {
    const dashboard = await client.request<{ items: { id: string }[] }>(path);
    assert.equal(dashboard.status, 200);
    assert.ok(dashboard.data.items.some((item) => item.id === accepted.data.id));
  }
});

test('two parallel acceptances for one last place produce exactly one assignment', async () => {
  const employer = await actor('Capacity owner'),
    org = await tenant(employer);
  const [a, b] = await Promise.all([worker('Capacity A'), worker('Capacity B')]);
  const shift = await shiftFixture(employer, org);
  const [first, second] = await Promise.all([
    offerFixture(employer, a, shift),
    offerFixture(employer, b, shift),
  ]);
  const results = await Promise.all([accept(a, first.offer.id), accept(b, second.offer.id)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.equal(await db.assignment.count({ where: { shiftId: shift.id, status: 'CONFIRMED' } }), 1);
  assert.equal(await db.activeBooking.count({ where: { shiftId: shift.id } }), 1);
});

test('cross-tenant overlapping acceptances serialize per worker, adjacent intervals are allowed', async () => {
  const employerA = await actor('Overlap owner A'),
    employerB = await actor('Overlap owner B');
  const [orgA, orgB] = await Promise.all([tenant(employerA), tenant(employerB)]);
  const candidate = await worker('Overlap worker');
  const startAt = new Date(Date.now() + 6 * 86400_000),
    endAt = new Date(startAt.getTime() + 8 * 3600_000);
  const first = await shiftFixture(employerA, orgA, { startAt, endAt }),
    second = await shiftFixture(employerB, orgB, { startAt, endAt });
  const [a, b] = await Promise.all([
    offerFixture(employerA, candidate, first),
    offerFixture(employerB, candidate, second),
  ]);
  assert.deepEqual(
    (await Promise.all([accept(candidate, a.offer.id), accept(candidate, b.offer.id)]))
      .map((result) => result.status)
      .sort(),
    [201, 409],
  );
  const adjacent = await shiftFixture(employerA, orgA, {
    startAt: endAt,
    endAt: new Date(endAt.getTime() + 4 * 3600_000),
  });
  assert.equal(
    (await accept(candidate, (await offerFixture(employerA, candidate, adjacent)).offer.id)).status,
    201,
  );
  assert.equal(await db.activeBooking.count({ where: { workerId: candidate.userId } }), 2);
});

test('acceptance idempotency is durable and same key with other payload is rejected', async () => {
  const owner = await actor('Idempotency owner'),
    org = await tenant(owner),
    candidate = await worker('Idempotency worker');
  const shift = await shiftFixture(owner, org);
  const offer = (await offerFixture(owner, candidate, shift)).offer;
  const key = randomUUID();
  const [first, second] = await Promise.all([
    accept(candidate, offer.id, key),
    accept(candidate, offer.id, key),
  ]);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.data.id, second.data.id);
  assert.equal(await db.assignment.count({ where: { offerId: offer.id } }), 1);
  assert.equal((await accept(candidate, randomUUID(), key)).status, 409);
  const changed = await owner.request(
    `/organizations/${org.organization.id}/shifts/${shift.id}`,
    { version: 1, amountMinor: '9999999' },
    'PATCH',
  );
  assert.equal(changed.status, 409);
});

test('cancel frees capacity; replacement requires separate offer and new consent', async () => {
  const owner = await actor('Cancel owner'),
    org = await tenant(owner),
    a = await worker('Cancel A'),
    b = await worker('Cancel B');
  const shift = await shiftFixture(owner, org),
    offerA = await offerFixture(owner, a, shift),
    offerB = await offerFixture(owner, b, shift);
  const assignment = await accept(a, offerA.offer.id);
  assert.equal(assignment.status, 201);
  assert.equal((await accept(b, offerB.offer.id)).status, 409);
  assert.equal(
    (
      await a.request(`/assignments/${assignment.data.id}/cancel`, {
        reason: 'Cannot attend this shift',
      })
    ).status,
    201,
  );
  assert.equal(await db.activeBooking.count({ where: { shiftId: shift.id } }), 0);
  assert.equal((await accept(b, offerB.offer.id)).status, 201);
  assert.equal(
    (await db.assignment.findUniqueOrThrow({ where: { id: assignment.data.id } })).status,
    'CANCELLED_BY_WORKER',
  );
});

test('parallel publish cannot exceed quota and cancellation does not refund usage', async () => {
  const owner = await actor('Quota owner'),
    org = await tenant(owner, { publishLimit: 1 });
  const [a, b] = await Promise.all([
    shiftFixture(owner, org, { status: 'DRAFT' }),
    shiftFixture(owner, org, { status: 'DRAFT' }),
  ]);
  const publish = (id: string) =>
    owner.request(`/organizations/${org.organization.id}/shifts/${id}/publish`, {});
  const results = await Promise.all([publish(a.id), publish(b.id)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const published = await db.shift.findFirstOrThrow({
    where: { organizationId: org.organization.id, status: 'PUBLISHED' },
  });
  assert.equal((await publish(published.id)).status, 201);
  const usage = await db.usageCounter.findFirstOrThrow({
    where: { organizationId: org.organization.id },
  });
  assert.equal(usage.publishedCount, 1);
  assert.equal(
    (
      await owner.request(`/organizations/${org.organization.id}/shifts/${published.id}/cancel`, {
        reason: 'Synthetic quota test cancellation',
      })
    ).status,
    201,
  );
  assert.equal((await publish(published.id === a.id ? b.id : a.id)).status, 409);
});

test('tenant isolation, branch scopes, stale membership and CSRF reject unauthorized requests', async () => {
  const owner = await actor('Scope owner'),
    outsider = await actor('Scope outsider'),
    org = await tenant(owner);
  const shift = await shiftFixture(owner, org, { status: 'DRAFT' });
  assert.equal((await outsider.request(`/organizations/${org.organization.id}`)).status, 403);
  assert.equal(
    (
      await outsider.request(
        `/organizations/${org.organization.id}/shifts/${shift.id}`,
        { version: 1, title: 'Unauthorized change' },
        'PATCH',
      )
    ).status,
    403,
  );
  const manager = await actor('Scope manager');
  await db.organizationMembership.create({
    data: {
      organizationId: org.organization.id,
      userId: manager.userId,
      role: 'MANAGER',
      branchIds: [org.branch.id],
    },
  });
  assert.equal((await manager.request(`/organizations/${org.organization.id}/shifts`)).status, 200);
  assert.equal(
    (await manager.request(`/organizations/${org.organization.id}/billing`)).status,
    403,
  );
  assert.equal(
    (
      await owner.request(
        `/organizations/${org.organization.id}/shifts/${shift.id}/publish`,
        {},
        'POST',
        { 'x-csrf-token': 'wrong' },
      )
    ).status,
    403,
  );
  await db.organizationMembership.update({
    where: {
      organizationId_userId: { organizationId: org.organization.id, userId: manager.userId },
    },
    data: { status: 'SUSPENDED' },
  });
  assert.equal((await manager.request(`/organizations/${org.organization.id}/shifts`)).status, 403);
  const otherOrg = await tenant(outsider);
  await assert.rejects(
    db.shift.create({
      data: { ...shift, id: randomUUID(), organizationId: otherOrg.organization.id },
    }),
  );
});

test('private files quarantine, scoped release and user-bound expiring URLs', async () => {
  const owner = await actor('File owner'),
    other = await actor('File outsider'),
    moderator = await actor('Document reviewer', ['verification.document.read']);
  const form = new FormData();
  form.append(
    'file',
    new Blob(['%PDF-1.4\nSynthetic document\n%%EOF'], { type: 'application/pdf' }),
    'synthetic.pdf',
  );
  const response = await fetch(`${base}/files`, {
    method: 'POST',
    headers: { cookie: owner.cookie, 'x-csrf-token': owner.csrf, Origin: process.env.WEB_ORIGIN! },
    body: form,
  });
  assert.equal(response.status, 201);
  const file = (await response.json()) as { id: string; status: string };
  assert.equal(file.status, 'QUARANTINED');
  assert.equal((await owner.request(`/files/${file.id}/download`)).status, 403);
  assert.equal((await other.request(`/files/${file.id}/download`)).status, 403);
  assert.equal(
    (
      await moderator.request(`/developer/files/${file.id}/review`, {
        status: 'CLEAN',
        reason: 'LOCAL synthetic fixture manual review',
      })
    ).status,
    201,
  );
  const link = await owner.request<{ url: string }>(`/files/${file.id}/download`);
  assert.equal(link.status, 200);
  const url = `${new URL(base).origin}${link.data.url}`;
  assert.equal((await fetch(url, { headers: { cookie: owner.cookie } })).status, 200);
  assert.equal((await fetch(url, { headers: { cookie: other.cookie } })).status, 403);
  assert.equal(
    (
      await fetch(url.replace(/expires=\d+/, 'expires=1000000000000'), {
        headers: { cookie: owner.cookie },
      })
    ).status,
    403,
  );
});

test('MFA stores encrypted secret, rotates session and consumes recovery once', async () => {
  const admin = await actor('MFA admin', ['verification.review']);
  const enrolled = await admin.request<{ secret: string; recoveryCodes: string[] }>(
    '/auth/mfa/setup',
    {},
  );
  assert.equal(enrolled.status, 201);
  const credential = await db.mfaCredential.findUniqueOrThrow({ where: { userId: admin.userId } });
  assert.notEqual(credential.secretCipherText, enrolled.data.secret);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let value = 0,
    bits = 0;
  const bytes: number[] = [];
  for (const char of enrolled.data.secret) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const code = totp(Buffer.from(bytes), BigInt(Math.floor(Date.now() / 30000)));
  const previousCookie = admin.cookie;
  assert.equal((await admin.request('/auth/mfa/verify', { code })).status, 201);
  assert.notEqual(admin.cookie, previousCookie);
  assert.equal(
    (await new Client().request('/auth/me', undefined, 'GET', { cookie: previousCookie })).status,
    401,
  );
  assert.equal((await admin.request('/auth/mfa/verify', { code })).status, 401);
  assert.equal(
    (await admin.request('/auth/mfa/verify', { code: enrolled.data.recoveryCodes[0] })).status,
    201,
  );
  assert.equal(
    (await admin.request('/auth/mfa/verify', { code: enrolled.data.recoveryCodes[0] })).status,
    401,
  );
  assert.ok(
    !(
      await db.mfaCredential.findUniqueOrThrow({ where: { userId: admin.userId } })
    ).recoveryHashes.includes(digest(`${admin.userId}:${enrolled.data.recoveryCodes[0]}`)),
  );
});
