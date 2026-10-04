import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { actor, db, tenant } from './helpers';

after(async () => db.$disconnect());

test('branch-scoped team editor cannot remove its scope, expand it or edit global/other-branch members', async () => {
  const owner = await actor('Scope owner');
  const org = await tenant(owner);
  const editor = await actor('Scoped editor');
  const other = await actor('Other branch member');
  const global = await actor('Global member');
  const peer = await actor('Same branch member');
  const role = await db.organizationRole.create({
    data: {
      organizationId: org.organization.id,
      name: 'Scoped team',
      permissions: ['member.invite', 'shift.read'],
    },
  });
  const second = await db.branch.create({
    data: {
      organizationId: org.organization.id,
      cityId: org.branch.cityId,
      name: 'Second branch',
      address: 'Synthetic address',
      area: 'Synthetic area',
    },
  });
  const members = [];
  for (const [client, branchIds] of [
    [editor, [org.branch.id]],
    [other, [second.id]],
    [global, []],
    [peer, [org.branch.id]],
  ] as const) {
    members.push(
      await db.organizationMembership.create({
        data: {
          organizationId: org.organization.id,
          userId: client.userId,
          role: 'CUSTOM',
          customRoleId: role.id,
          branchIds: [...branchIds],
        },
      }),
    );
  }
  const endpoint = (id: string) => `/organizations/${org.organization.id}/members/${id}`;
  for (const branchIds of [[], [second.id], [org.branch.id, second.id]]) {
    assert.equal(
      (
        await editor.request(
          endpoint(members[0]!.id),
          { branchIds, reason: 'Attempt to widen scope' },
          'PATCH',
        )
      ).status,
      403,
    );
  }
  for (const target of [members[1]!, members[2]!]) {
    assert.equal(
      (
        await editor.request(
          endpoint(target.id),
          { status: 'REVOKED', reason: 'Attempt outside current scope' },
          'PATCH',
        )
      ).status,
      403,
    );
  }
  assert.deepEqual(
    (await db.organizationMembership.findUniqueOrThrow({ where: { id: members[0]!.id } }))
      .branchIds,
    [org.branch.id],
  );
  assert.equal(
    (
      await editor.request(
        endpoint(members[3]!.id),
        { status: 'SUSPENDED', reason: 'Authorized branch management' },
        'PATCH',
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await owner.request(
        endpoint(members[0]!.id),
        { branchIds: [], reason: 'Owner grants organization scope' },
        'PATCH',
      )
    ).status,
    200,
  );
  assert.deepEqual(
    (await db.organizationMembership.findUniqueOrThrow({ where: { id: members[0]!.id } }))
      .branchIds,
    [],
  );
});

test('low-privilege custom team roles cannot invite or edit more privileged members', async () => {
  const owner = await actor('Invitation owner');
  const org = await tenant(owner);
  const editor = await actor('Invite-only editor');
  const target = await actor('Privileged target');
  const role = await db.organizationRole.create({
    data: {
      organizationId: org.organization.id,
      name: 'Invite only',
      permissions: ['member.invite'],
    },
  });
  await db.organizationMembership.create({
    data: {
      organizationId: org.organization.id,
      userId: editor.userId,
      role: 'CUSTOM',
      customRoleId: role.id,
      branchIds: [],
    },
  });
  const privileged = await db.organizationMembership.create({
    data: {
      organizationId: org.organization.id,
      userId: target.userId,
      role: 'ADMIN',
      branchIds: [],
    },
  });
  const phone = (await db.user.findUniqueOrThrow({ where: { id: editor.userId } })).phone;
  for (const role of ['ADMIN', 'MANAGER', 'FINANCE']) {
    assert.equal(
      (
        await editor.request(`/organizations/${org.organization.id}/invitations`, {
          phone,
          role,
          branchIds: role === 'MANAGER' ? [org.branch.id] : [],
        })
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await editor.request(
        `/organizations/${org.organization.id}/members/${privileged.id}`,
        { role: 'CUSTOM', customRoleId: role.id, reason: 'Attempt to take over administrator' },
        'PATCH',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await editor.request(`/organizations/${org.organization.id}/roles`, {
        name: 'Attempt elevated custom role',
        permissions: ['api.manage'],
      })
    ).status,
    403,
  );
  assert.equal(
    await db.teamInvitation.count({ where: { organizationId: org.organization.id } }),
    0,
  );
  assert.equal(
    (await db.organizationMembership.findUniqueOrThrow({ where: { id: privileged.id } })).role,
    'ADMIN',
  );
});

test('accepting a built-in role clears previous custom privileges and keeps only the invited branch', async () => {
  const owner = await actor('Replacement owner');
  const org = await tenant(owner);
  const target = await actor('Former custom member');
  const role = await db.organizationRole.create({
    data: {
      organizationId: org.organization.id,
      name: 'Former API administrator',
      permissions: ['api.manage', 'billing.manage'],
    },
  });
  const member = await db.organizationMembership.create({
    data: {
      organizationId: org.organization.id,
      userId: target.userId,
      role: 'CUSTOM',
      customRoleId: role.id,
      branchIds: [],
    },
  });
  const phone = (await db.user.findUniqueOrThrow({ where: { id: target.userId } })).phone;
  const invite = await owner.request<{ token: string }>(
    `/organizations/${org.organization.id}/invitations`,
    { phone, role: 'MANAGER', branchIds: [org.branch.id] },
  );
  assert.equal(invite.status, 201);
  assert.equal(
    (await target.request('/invitations/accept', { token: invite.data.token })).status,
    201,
  );
  const changed = await db.organizationMembership.findUniqueOrThrow({ where: { id: member.id } });
  assert.equal(changed.role, 'MANAGER');
  assert.equal(changed.customRoleId, null);
  assert.deepEqual(changed.branchIds, [org.branch.id]);
  assert.equal((await target.request('/auth/me')).status, 401);
});

test('invitations cannot be redeemed after issuer revocation or demotion, or org suspension', async () => {
  const owner = await actor('Stale invitation owner');
  const org = await tenant(owner);
  const issuer = await actor('Delegated administrator');
  const target = await actor('Pending invitee');
  const membership = await db.organizationMembership.create({
    data: {
      organizationId: org.organization.id,
      userId: issuer.userId,
      role: 'ADMIN',
      branchIds: [],
    },
  });
  const phone = (await db.user.findUniqueOrThrow({ where: { id: target.userId } })).phone;
  const invite = await issuer.request<{ token: string; invitation: { id: string } }>(
    `/organizations/${org.organization.id}/invitations`,
    { phone, role: 'MANAGER', branchIds: [org.branch.id] },
  );
  assert.equal(invite.status, 201);
  for (const update of [{ status: 'REVOKED' }, { status: 'ACTIVE', role: 'FINANCE' }]) {
    await db.organizationMembership.update({ where: { id: membership.id }, data: update });
    assert.equal(
      (await target.request('/invitations/accept', { token: invite.data.token })).status,
      403,
    );
  }
  await db.organizationMembership.update({ where: { id: membership.id }, data: { role: 'ADMIN' } });
  await db.organization.update({
    where: { id: org.organization.id },
    data: { status: 'SUSPENDED' },
  });
  assert.equal(
    (await target.request('/invitations/accept', { token: invite.data.token })).status,
    403,
  );
  assert.equal(
    (await db.teamInvitation.findUniqueOrThrow({ where: { id: invite.data.invitation.id } }))
      .acceptedAt,
    null,
  );
  assert.equal(
    await db.organizationMembership.count({
      where: { organizationId: org.organization.id, userId: target.userId },
    }),
    0,
  );
});

test('invitations cannot revive authority after the issuer user is suspended or branch deactivated', async () => {
  const owner = await actor('Suspended issuer owner');
  const org = await tenant(owner);
  const target = await actor('Waiting branch member');
  const phone = (await db.user.findUniqueOrThrow({ where: { id: target.userId } })).phone;
  const invite = await owner.request<{ token: string }>(
    `/organizations/${org.organization.id}/invitations`,
    { phone, role: 'MANAGER', branchIds: [org.branch.id] },
  );
  assert.equal(invite.status, 201);
  await db.user.update({ where: { id: owner.userId }, data: { status: 'SUSPENDED' } });
  assert.equal(
    (await target.request('/invitations/accept', { token: invite.data.token })).status,
    403,
  );
  await db.user.update({ where: { id: owner.userId }, data: { status: 'ACTIVE' } });
  await db.branch.update({ where: { id: org.branch.id }, data: { active: false } });
  assert.equal(
    (await target.request('/invitations/accept', { token: invite.data.token })).status,
    403,
  );
});
