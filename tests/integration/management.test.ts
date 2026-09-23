import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { actor, Client, db, shiftFixture, tenant, worker, offerFixture } from './helpers';
import { randomUUID } from 'node:crypto';
after(async () => db.$disconnect());

test('organization API keys enforce tenant, read scopes, expiry and immediate revocation', async () => {
  const ownerA = await actor('API owner A'),
    ownerB = await actor('API owner B');
  const a = await tenant(ownerA),
    b = await tenant(ownerB);
  await shiftFixture(ownerA, a);
  await shiftFixture(ownerB, b);
  const create = await ownerA.request<{ id: string; key: string; keyHash?: string }>(
    `/organizations/${a.organization.id}/api-keys`,
    {
      name: 'Read shift integration',
      scopes: ['shifts:read'],
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  );
  assert.equal(create.status, 201);
  assert.equal(create.data.keyHash, undefined);
  assert.ok(create.data.key.startsWith('st_live_'));
  const stored = await db.apiCredential.findUniqueOrThrow({ where: { id: create.data.id } });
  assert.notEqual(stored.keyHash, create.data.key);
  const client = new Client();
  const headers = { 'x-api-key': create.data.key };
  const shifts = await client.request<{ items: { organizationId: string }[] }>(
    `/integration/organizations/${a.organization.id}/shifts`,
    undefined,
    'GET',
    headers,
  );
  assert.equal(shifts.status, 200);
  assert.ok(shifts.data.items.every((s) => s.organizationId === a.organization.id));
  assert.equal(
    (
      await client.request(
        `/integration/organizations/${b.organization.id}/shifts`,
        undefined,
        'GET',
        headers,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await client.request(
        `/integration/organizations/${a.organization.id}/assignments`,
        undefined,
        'GET',
        headers,
      )
    ).status,
    403,
  );
  assert.equal((await ownerB.request(`/organizations/${a.organization.id}/api-keys`)).status, 403);
  await db.apiCredential.update({
    where: { id: stored.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  assert.equal(
    (
      await client.request(
        `/integration/organizations/${a.organization.id}/shifts`,
        undefined,
        'GET',
        headers,
      )
    ).status,
    403,
  );
  await db.apiCredential.update({
    where: { id: stored.id },
    data: { expiresAt: new Date(Date.now() + 86400000) },
  });
  assert.equal(
    (
      await ownerA.request(
        `/organizations/${a.organization.id}/api-keys/${stored.id}`,
        undefined,
        'DELETE',
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await client.request(
        `/integration/organizations/${a.organization.id}/shifts`,
        undefined,
        'GET',
        headers,
      )
    ).status,
    403,
  );
  assert.ok((await db.auditLog.count({ where: { resourceId: stored.id } })) >= 2);
});

test('scoped manager cannot move a draft to another branch and headcount-only patch preserves terms', async () => {
  const owner = await actor('Patch owner'),
    org = await tenant(owner),
    manager = await actor('Patch manager');
  await db.organizationMembership.create({
    data: {
      organizationId: org.organization.id,
      userId: manager.userId,
      role: 'MANAGER',
      branchIds: [org.branch.id],
    },
  });
  const other = await db.branch.create({
    data: {
      organizationId: org.organization.id,
      cityId: org.branch.cityId,
      name: 'Other',
      address: 'Synthetic',
      area: 'Synthetic',
    },
  });
  const draft = await shiftFixture(owner, org, { status: 'DRAFT' });
  assert.equal(
    (
      await manager.request(
        `/organizations/${org.organization.id}/shifts/${draft.id}`,
        { version: 1, branchId: other.id },
        'PATCH',
      )
    ).status,
    403,
  );
  const changed = await owner.request<{
    headcount: number;
    duties: string[];
    breakMinutes: number;
  }>(
    `/organizations/${org.organization.id}/shifts/${draft.id}`,
    { version: 1, headcount: 2 },
    'PATCH',
  );
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.data.duties, draft.duties);
  assert.equal(changed.data.breakMinutes, draft.breakMinutes);
});

test('last owner cannot be demoted; ownership transfer and role changes revoke affected sessions', async () => {
  const owner = await actor('Transfer owner'),
    org = await tenant(owner),
    target = await actor('Transfer target');
  const ownerMembership = await db.organizationMembership.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: org.organization.id, userId: owner.userId } },
  });
  const targetMembership = await db.organizationMembership.create({
    data: {
      organizationId: org.organization.id,
      userId: target.userId,
      role: 'MANAGER',
      branchIds: [org.branch.id],
    },
  });
  assert.equal(
    (
      await owner.request(
        `/organizations/${org.organization.id}/members/${ownerMembership.id}`,
        { role: 'ADMIN', reason: 'Forbidden self demotion' },
        'PATCH',
      )
    ).status,
    403,
  );
  const moved = await owner.request(`/organizations/${org.organization.id}/ownership/transfer`, {
    membershipId: targetMembership.id,
    reason: 'Synthetic explicit ownership transfer',
  });
  assert.equal(moved.status, 201);
  assert.equal(
    (await db.organizationMembership.findUniqueOrThrow({ where: { id: targetMembership.id } }))
      .role,
    'OWNER',
  );
  assert.equal(
    (await db.organizationMembership.findUniqueOrThrow({ where: { id: ownerMembership.id } })).role,
    'ADMIN',
  );
  assert.equal((await owner.request('/auth/me')).status, 401);
  assert.equal((await target.request('/auth/me')).status, 401);
});

test('accepted offer reused with a new idempotency key still binds that key to the original payload', async () => {
  const owner = await actor('Replay owner'),
    org = await tenant(owner),
    candidate = await worker('Replay worker'),
    shift = await shiftFixture(owner, org);
  const offer = (await offerFixture(owner, candidate, shift)).offer;
  const first = await candidate.request(`/offers/${offer.id}/accept`, {}, 'POST', {
    'idempotency-key': randomUUID(),
  });
  assert.equal(first.status, 201);
  const key = randomUUID();
  assert.equal(
    (await candidate.request(`/offers/${offer.id}/accept`, {}, 'POST', { 'idempotency-key': key }))
      .status,
    201,
  );
  assert.equal(
    (
      await candidate.request(`/offers/${randomUUID()}/accept`, {}, 'POST', {
        'idempotency-key': key,
      })
    ).status,
    409,
  );
});
