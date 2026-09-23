import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { actor, db, tenant, worker, shiftFixture, offerFixture } from './helpers';

after(async () => db.$disconnect());

test('organization profile update requires current tenant-wide management permission', async () => {
  const owner = await actor('Profile owner'),
    org = await tenant(owner),
    outsider = await actor('Other owner');
  const other = await tenant(outsider);
  const manager = await actor('Profile manager'),
    finance = await actor('Profile finance');
  await db.organizationMembership.createMany({
    data: [
      {
        organizationId: org.organization.id,
        userId: manager.userId,
        role: 'MANAGER',
        branchIds: [org.branch.id],
      },
      {
        organizationId: org.organization.id,
        userId: finance.userId,
        role: 'FINANCE',
        branchIds: [],
      },
    ],
  });
  const path = `/organizations/${org.organization.id}`;
  for (const client of [outsider, manager, finance])
    assert.equal(
      (await client.request(path, { version: 1, description: 'Not authorized' }, 'PATCH')).status,
      403,
    );
  assert.equal(
    (
      await owner.request(
        `/organizations/${other.organization.id}`,
        { version: 1, name: 'Wrong tenant' },
        'PATCH',
      )
    ).status,
    403,
  );
  const membership = await db.organizationMembership.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: org.organization.id, userId: owner.userId } },
  });
  await db.organizationMembership.update({
    where: { id: membership.id },
    data: { status: 'SUSPENDED' },
  });
  assert.equal(
    (await owner.request(path, { version: 1, description: 'Revoked membership' }, 'PATCH')).status,
    403,
  );
  assert.equal(
    (await db.organization.findUniqueOrThrow({ where: { id: org.organization.id } })).version,
    1,
  );
});

test('company profile fields persist, omission preserves values, clearing works and audit excludes contact text', async () => {
  const owner = await actor('Profile editor'),
    org = await tenant(owner);
  const path = `/organizations/${org.organization.id}`;
  const updated = await owner.request<{
    version: number;
    verificationStatus: string;
    description: string;
    website: string;
    contactPhone: string;
    branches: { id: string }[];
  }>(
    path,
    {
      version: 1,
      contactName: 'New contact',
      description: 'Workplace and shift information',
      website: 'https://example.org/careers',
      contactPhone: '+998901234567',
    },
    'PATCH',
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.data.version, 2);
  assert.equal(updated.data.verificationStatus, 'VERIFIED');
  assert.equal(updated.data.branches[0]!.id, org.branch.id);
  const reread = await owner.request<typeof updated.data>(path);
  assert.equal(reread.data.description, 'Workplace and shift information');
  assert.equal(reread.data.website, 'https://example.org/careers');
  assert.equal(reread.data.contactPhone, '+998901234567');
  const changed = await owner.request<{ version: number; website: string; description: string }>(
    path,
    { version: 2, description: 'Revised information' },
    'PATCH',
  );
  assert.equal(changed.status, 200);
  assert.equal(changed.data.website, updated.data.website);
  const cleared = await owner.request<{
    version: number;
    website: null;
    contactPhone: null;
    description: null;
  }>(path, { version: 3, website: null, contactPhone: null, description: null }, 'PATCH');
  assert.equal(cleared.status, 200);
  assert.equal(cleared.data.version, 4);
  assert.equal(cleared.data.website, null);
  assert.equal(cleared.data.contactPhone, null);
  assert.equal(cleared.data.description, null);
  const audit = await db.auditLog.findMany({
    where: { organizationId: org.organization.id, action: 'organization.profile.update' },
  });
  assert.equal(audit.length, 3);
  const auditText = JSON.stringify(audit);
  assert.ok(!auditText.includes('+998901234567'));
  assert.ok(!auditText.includes('Workplace and shift information'));
  assert.equal(
    await db.verificationRequest.count({ where: { subjectId: org.organization.id } }),
    0,
  );
});

test('profile validation rejects malformed fields and inactive city without partial writes', async () => {
  const owner = await actor('Invalid profile editor'),
    org = await tenant(owner);
  const path = `/organizations/${org.organization.id}`;
  const inactive = await db.city.create({
    data: {
      code: `inactive-${randomUUID()}`,
      nameUz: 'Inactive',
      nameRu: 'Inactive',
      active: false,
    },
  });
  for (const input of [
    { version: 1, website: 'javascript:alert(1)' },
    { version: 1, website: 'not-a-url' },
    { version: 1, stir: '1234' },
    { version: 1, contactPhone: '901234567' },
    { version: 1, description: 'x'.repeat(3001) },
    { version: 1, verificationStatus: 'VERIFIED' },
  ])
    assert.equal((await owner.request(path, input, 'PATCH')).status, 422);
  assert.equal(
    (
      await owner.request(
        path,
        { version: 1, cityId: inactive.id, description: 'Must not persist' },
        'PATCH',
      )
    ).status,
    404,
  );
  assert.equal(
    (await owner.request(path, { version: 1, cityId: randomUUID() }, 'PATCH')).status,
    404,
  );
  const current = await db.organization.findUniqueOrThrow({ where: { id: org.organization.id } });
  assert.equal(current.version, 1);
  assert.equal(current.description, null);
  assert.equal(current.verificationStatus, 'VERIFIED');
});

test('parallel company edits with the same version have one winner and a visible conflict', async () => {
  const owner = await actor('Concurrent profile editor'),
    org = await tenant(owner);
  const path = `/organizations/${org.organization.id}`;
  const outcomes = await Promise.all([
    owner.request<{ code?: string }>(
      path,
      { version: 1, description: 'First editor value' },
      'PATCH',
    ),
    owner.request<{ code?: string }>(
      path,
      { version: 1, description: 'Second editor value' },
      'PATCH',
    ),
  ]);
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 409]);
  assert.equal(outcomes.find((r) => r.status === 409)?.data.code, 'VERSION_CONFLICT');
  const stored = await db.organization.findUniqueOrThrow({ where: { id: org.organization.id } });
  assert.equal(stored.version, 2);
  assert.ok(['First editor value', 'Second editor value'].includes(stored.description!));
  assert.equal(
    await db.auditLog.count({
      where: { organizationId: stored.id, action: 'organization.profile.update' },
    }),
    1,
  );
});

test('identity changes reopen verification and old reviews cannot approve the changed company', async () => {
  const owner = await actor('Identity editor'),
    org = await tenant(owner);
  const moderator = await actor('Identity moderator', ['verification.review']);
  const oldRequest = await db.verificationRequest.create({
    data: {
      organizationId: org.organization.id,
      subjectId: org.organization.id,
      subjectType: 'ORGANIZATION',
      submittedById: owner.userId,
    },
  });
  const city = await db.city.create({
    data: { code: `new-city-${randomUUID()}`, nameUz: 'New city', nameRu: 'New city' },
  });
  const result = await owner.request<{
    version: number;
    verificationStatus: string;
    cityId: string;
    stir: string;
  }>(
    `/organizations/${org.organization.id}`,
    {
      version: 1,
      name: 'Changed legal-facing name',
      stir: '123456789',
      cityId: city.id,
    },
    'PATCH',
  );
  assert.equal(result.status, 200);
  assert.equal(result.data.verificationStatus, 'PENDING');
  assert.equal(result.data.cityId, city.id);
  assert.equal(result.data.stir, '123456789');
  assert.equal(
    (await db.verificationRequest.findUniqueOrThrow({ where: { id: oldRequest.id } })).status,
    'SUPERSEDED',
  );
  assert.equal(
    (
      await moderator.request(`/admin/verification/${oldRequest.id}`, {
        status: 'VERIFIED',
        reason: 'Outdated request must not approve new identity',
      })
    ).status,
    409,
  );
  const fresh = await db.verificationRequest.findFirstOrThrow({
    where: { subjectId: org.organization.id, status: 'PENDING' },
  });
  assert.notEqual(fresh.id, oldRequest.id);
  assert.equal(
    (
      await moderator.request(`/admin/verification/${fresh.id}`, {
        status: 'VERIFIED',
        reason: 'Updated identity reviewed',
      })
    ).status,
    201,
  );
  assert.equal(
    (await db.organization.findUniqueOrThrow({ where: { id: org.organization.id } }))
      .verificationStatus,
    'VERIFIED',
  );
  assert.equal(
    (await db.branch.findUniqueOrThrow({ where: { id: org.branch.id } })).cityId,
    org.branch.cityId,
  );
  await db.organization.update({
    where: { id: org.organization.id },
    data: { verificationStatus: 'SUSPENDED' },
  });
  assert.equal(
    (
      await owner.request(
        `/organizations/${org.organization.id}`,
        { version: result.data.version, description: 'Cannot bypass suspension' },
        'PATCH',
      )
    ).status,
    403,
  );
});

test('employer candidate projections add city and categories without exposing private worker fields', async () => {
  const owner = await actor('Candidate reviewer'),
    org = await tenant(owner),
    candidate = await worker('Private candidate');
  const shift = await shiftFixture(owner, org);
  await offerFixture(owner, candidate, shift);
  const result = await owner.request<{
    items: {
      worker: {
        id: string;
        phone?: string;
        workerProfile: {
          cityId: string;
          categoryIds: string[];
          adultConfirmed?: boolean;
          availability?: unknown;
          privateDocuments?: unknown;
        };
      };
    }[];
  }>(`/organizations/${org.organization.id}/applications`);
  assert.equal(result.status, 200);
  const profile = result.data.items[0]!.worker.workerProfile;
  assert.equal(profile.cityId, org.branch.cityId);
  assert.deepEqual(profile.categoryIds, [shift.categoryId]);
  assert.equal(result.data.items[0]!.worker.phone, undefined);
  assert.equal(profile.adultConfirmed, undefined);
  assert.equal(profile.availability, undefined);
  assert.equal(profile.privateDocuments, undefined);
});

test('a moderator waiting on an identity edit rereads the superseded verification request', async () => {
  const owner = await actor('Verification race owner'),
    org = await tenant(owner);
  const moderator = await actor('Verification race moderator', ['verification.review']);
  const request = await db.verificationRequest.create({
    data: {
      organizationId: org.organization.id,
      subjectId: org.organization.id,
      subjectType: 'ORGANIZATION',
      submittedById: owner.userId,
    },
  });
  let review: ReturnType<typeof moderator.request> | undefined;
  await db.$transaction(
    async (tx) => {
      // Hold the same row lock as the profile edit, then wait for the real HTTP review to block.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${org.organization.id}::uuid FOR UPDATE`;
      review = moderator.request(`/admin/verification/${request.id}`, {
        status: 'VERIFIED',
        reason: 'Concurrent old request',
      });
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const rows = await db.$queryRaw<{ waiting: boolean }[]>`
        SELECT EXISTS(SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock' AND query LIKE '%"Organization"%') AS waiting`;
        if (rows[0]?.waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(waiting, 'HTTP review should wait for the organization identity lock');
      await tx.organization.update({
        where: { id: org.organization.id },
        data: {
          name: 'Revised while review waits',
          verificationStatus: 'PENDING',
          version: { increment: 1 },
        },
      });
      await tx.verificationRequest.update({
        where: { id: request.id },
        data: { status: 'SUPERSEDED' },
      });
    },
    { timeout: 10000 },
  );
  assert.ok(review);
  assert.equal((await review).status, 409);
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: org.organization.id },
  });
  assert.equal(organization.verificationStatus, 'PENDING');
  assert.equal(
    (await db.verificationRequest.findUniqueOrThrow({ where: { id: request.id } })).status,
    'SUPERSEDED',
  );
});
