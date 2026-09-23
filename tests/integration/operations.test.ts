import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { actor, base, Client, db, offerFixture, shiftFixture, tenant, worker } from './helpers';
import { BillingService } from '../../apps/api/src/billing/billing.service';
import { PaymeService } from '../../apps/api/src/billing/payme.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { PermissionsService } from '../../apps/api/src/common/permissions.service';
import type { AuthUser } from '../../apps/api/src/auth/current-user';

after(async () => {
  await db.$disconnect();
});

describe('Normal shift lifecycle with independent timesheet and wage states', () => {
  it('starts on attendance, completes after every checkout, and closes only after both approvals and dispute resolution', async () => {
    const { owner, person, org, assignment, shift } = await assignmentFixture();
    await db.shift.update({ where: { id: shift.id }, data: { headcount: 2 } });
    const second = await worker('lifecycle second worker');
    const { offer } = await offerFixture(owner, second, { ...shift, headcount: 2 });
    const other = await db.assignment.create({
      data: {
        organizationId: org.organization.id,
        shiftId: shift.id,
        workerId: second.userId,
        offerId: offer.id,
        startAt: shift.startAt,
        endAt: shift.endAt,
      },
    });
    const status = async () =>
      (await db.shift.findUniqueOrThrow({ where: { id: shift.id } })).status;
    const closePath = `/organizations/${org.organization.id}/shifts/${shift.id}/close`;
    for (const id of [assignment.id, other.id])
      assert.equal(
        (
          await owner.request(`/assignments/${id}/attendance`, {
            kind: 'CHECK_IN',
            reason: 'Manager witnessed scheduled arrival',
          })
        ).status,
        201,
      );
    assert.equal(await status(), 'IN_PROGRESS');
    assert.equal(
      (await owner.request(closePath, { reason: 'Cannot close unfinished attendance' })).status,
      409,
    );
    assert.equal(
      (
        await owner.request(`/assignments/${assignment.id}/attendance`, {
          kind: 'CHECK_OUT',
          reason: 'First worker finished',
        })
      ).status,
      201,
    );
    assert.equal(await status(), 'IN_PROGRESS');
    assert.equal(
      (
        await owner.request(`/assignments/${other.id}/attendance`, {
          kind: 'CHECK_OUT',
          reason: 'Second worker finished',
        })
      ).status,
      201,
    );
    assert.equal(await status(), 'COMPLETED');
    assert.equal(
      (await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).status,
      'CHECKED_OUT',
    );
    assert.equal(
      (await db.wageRecord.findUniqueOrThrow({ where: { assignmentId: assignment.id } })).status,
      'CALCULATED',
    );
    assert.equal(
      (await owner.request(closePath, { reason: 'Approvals still pending' })).status,
      409,
    );
    for (const [id, workerClient] of [
      [assignment.id, person],
      [other.id, second],
    ] as const) {
      assert.equal((await owner.request(`/assignments/${id}/timesheet/approve`, {})).status, 201);
      assert.equal(
        (await workerClient.request(`/assignments/${id}/timesheet/approve`, {})).status,
        201,
      );
    }
    assert.equal(
      (await db.wageRecord.findUniqueOrThrow({ where: { assignmentId: assignment.id } })).status,
      'APPROVED',
    );
    const dispute = await person.request<{ id: string }>(`/assignments/${assignment.id}/disputes`, {
      category: 'ATTENDANCE',
      description: 'Please review the recorded attendance notes.',
    });
    assert.equal(dispute.status, 201);
    assert.equal((await owner.request(closePath, { reason: 'Dispute still pending' })).status, 409);
    const moderator = await actor('lifecycle moderator', ['dispute.resolve']);
    assert.equal(
      (
        await moderator.request(`/admin/disputes/${dispute.data.id}/resolve`, {
          resolution: 'Both participants agree the recorded time is correct.',
        })
      ).status,
      201,
    );
    const stranger = await actor('lifecycle other tenant');
    await tenant(stranger);
    assert.equal(
      (await stranger.request(closePath, { reason: 'Unauthorized closure' })).status,
      403,
    );
    const closed = await Promise.all([
      owner.request(closePath, { reason: 'Attendance and approvals complete' }),
      owner.request(closePath, { reason: 'Attendance and approvals complete' }),
    ]);
    closed.forEach((result) => assert.equal(result.status, 201));
    assert.equal(await status(), 'CLOSED');
    for (const type of ['shift.started', 'shift.completed', 'shift.closed'])
      assert.equal(await db.outboxEvent.count({ where: { aggregateId: shift.id, type } }), 1);
    assert.equal(
      (await db.wageRecord.findUniqueOrThrow({ where: { assignmentId: assignment.id } })).status,
      'APPROVED',
      'Closing operations must not invent a paid wage',
    );
    assert.equal(
      (
        await owner.request(`/assignments/${assignment.id}/wage/mark-paid`, {
          reason: 'Employer paid after operational close',
        })
      ).status,
      201,
    );
    assert.equal(
      (await person.request(`/assignments/${assignment.id}/wage/confirm`, {})).status,
      201,
    );
    assert.equal(await status(), 'CLOSED');
  });

  it('does not invent attendance for empty or no-show shifts and reconciles final cancellation', async () => {
    const owner = await actor('lifecycle empty owner'),
      org = await tenant(owner);
    const future = await shiftFixture(owner, org);
    assert.equal(
      (
        await owner.request(`/organizations/${org.organization.id}/shifts/${future.id}/close`, {
          reason: 'Too early to close',
        })
      ).status,
      409,
    );
    const empty = await shiftFixture(owner, org, {
      startAt: new Date(Date.now() - 3 * 3600_000),
      endAt: new Date(Date.now() - 2 * 3600_000),
    });
    assert.equal(
      (
        await owner.request(`/organizations/${org.organization.id}/shifts/${empty.id}/close`, {
          reason: 'Expired shift had no assignments',
        })
      ).status,
      201,
    );
    assert.equal(await db.timesheet.count({ where: { organizationId: org.organization.id } }), 0);
    const absent = await assignmentFixture();
    assert.equal(
      (
        await absent.owner.request(`/assignments/${absent.assignment.id}/no-show`, {
          reason: 'Worker absent after grace; manager checked entrance',
        })
      ).status,
      201,
    );
    assert.equal(
      (await db.shift.findUniqueOrThrow({ where: { id: absent.shift.id } })).status,
      'COMPLETED',
    );
    assert.equal(await db.timesheet.count({ where: { assignmentId: absent.assignment.id } }), 0);
    assert.equal(
      (
        await absent.owner.request(
          `/organizations/${absent.org.organization.id}/shifts/${absent.shift.id}/close`,
          { reason: 'No-show reviewed; no work occurred' },
        )
      ).status,
      201,
    );
    const cancelled = await assignmentFixture();
    assert.equal(
      (
        await cancelled.person.request(`/assignments/${cancelled.assignment.id}/cancel`, {
          reason: 'Unable to attend; no work performed',
        })
      ).status,
      201,
    );
    assert.equal(
      (await db.shift.findUniqueOrThrow({ where: { id: cancelled.shift.id } })).status,
      'COMPLETED',
    );
    assert.equal(await db.timesheet.count({ where: { assignmentId: cancelled.assignment.id } }), 0);
  });
});

async function assignmentFixture() {
  const owner = await actor('operations owner'),
    person = await worker('operations worker'),
    org = await tenant(owner);
  const shift = await shiftFixture(owner, org, {
    startAt: new Date(Date.now() - 4 * 3600_000),
    endAt: new Date(Date.now() + 4 * 3600_000),
  });
  const { offer } = await offerFixture(owner, person, shift);
  const assignment = await db.assignment.create({
    data: {
      organizationId: org.organization.id,
      shiftId: shift.id,
      workerId: person.userId,
      offerId: offer.id,
      startAt: shift.startAt,
      endAt: shift.endAt,
    },
  });
  return { owner, person, org, shift, assignment };
}

describe('PostgreSQL attendance, wages, and participant authorization', () => {
  it('rejects QR replay and another assignment token; records dual wage confirmations', async () => {
    const { owner, person, assignment, shift } = await assignmentFixture();
    const outsider = await worker('other worker');
    assert.equal((await outsider.request(`/assignments/${assignment.id}/attendance`)).status, 403);
    const token = await owner.request<{ token: string }>(
      `/assignments/${assignment.id}/attendance-token`,
      { kind: 'CHECK_IN' },
    );
    assert.equal(token.status, 201);
    const other = await assignmentFixture();
    assert.equal(
      (
        await other.person.request(`/assignments/${other.assignment.id}/attendance`, {
          kind: 'CHECK_IN',
          token: token.data.token,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await person.request(`/assignments/${assignment.id}/attendance`, {
          kind: 'CHECK_IN',
          token: token.data.token,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await person.request(`/assignments/${assignment.id}/attendance`, {
          kind: 'CHECK_IN',
          token: token.data.token,
        })
      ).status,
      409,
    );
    assert.equal(
      await db.attendanceEvent.count({ where: { assignmentId: assignment.id, kind: 'CHECK_IN' } }),
      1,
    );
    const detail = await person.request<{
      assignment: {
        shift: {
          organization: { id: string; name: string };
          branch: { id: string; name: string; area: string; address?: string };
        };
      };
      events: { recordedAt: string; method: string }[];
    }>(`/assignments/${assignment.id}/attendance`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.assignment.shift.organization.id, assignment.organizationId);
    assert.ok(detail.data.assignment.shift.organization.name);
    assert.ok(detail.data.assignment.shift.branch.name);
    assert.equal(detail.data.assignment.shift.branch.address, undefined);
    assert.ok(Number.isFinite(Date.parse(detail.data.events[0]!.recordedAt)));
    assert.equal(detail.data.events[0]!.method, 'TOKEN');
    // Move the fixture clock back to produce a four-hour timesheet without real waiting.
    await db.timesheet.update({
      where: { assignmentId: assignment.id },
      data: { startedAt: shift.startAt, breakMinutes: 30 },
    });
    assert.equal(
      (
        await owner.request(`/assignments/${assignment.id}/attendance`, {
          kind: 'CHECK_OUT',
          reason: 'Integration manager witnessed checkout',
        })
      ).status,
      201,
    );
    const calculated = await db.wageRecord.findUniqueOrThrow({
      where: { assignmentId: assignment.id },
    });
    assert.equal(calculated.status, 'CALCULATED');
    assert.ok(calculated.amountMinor > 0n);
    assert.equal(
      (await owner.request(`/assignments/${assignment.id}/timesheet/approve`, {})).status,
      201,
    );
    assert.equal(
      (await db.wageRecord.findUniqueOrThrow({ where: { assignmentId: assignment.id } })).status,
      'CALCULATED',
    );
    assert.equal(
      (await person.request(`/assignments/${assignment.id}/timesheet/approve`, {})).status,
      201,
    );
    assert.equal(
      (await person.request(`/assignments/${assignment.id}/wage/confirm`, {})).status,
      409,
    );
    assert.equal(
      (
        await owner.request(`/assignments/${assignment.id}/wage/mark-paid`, {
          reason: 'Cash paid directly to worker',
        })
      ).status,
      201,
    );
    let wage = await db.wageRecord.findUniqueOrThrow({ where: { assignmentId: assignment.id } });
    assert.equal(wage.status, 'EMPLOYER_MARKED_PAID');
    assert.equal(wage.workerConfirmedAt, null);
    assert.equal(
      (await owner.request(`/assignments/${assignment.id}/wage/confirm`, {})).status,
      403,
    );
    assert.equal(
      (await person.request(`/assignments/${assignment.id}/wage/confirm`, {})).status,
      201,
    );
    wage = await db.wageRecord.findUniqueOrThrow({ where: { assignmentId: assignment.id } });
    assert.equal(wage.status, 'WORKER_CONFIRMED');
    assert.ok(wage.workerConfirmedAt);
    assert.equal(
      await db.invoice.count({ where: { organizationId: assignment.organizationId } }),
      0,
      'Worker wage must not create subscription invoices',
    );
  });

  it('persists messaging and disputes; bans unrelated users and duplicate employer-side reviews', async () => {
    const { owner, person, org, assignment } = await assignmentFixture();
    const stranger = await actor('stranger');
    assert.equal(
      (
        await owner.request(`/assignments/${assignment.id}/messages`, {
          text: 'Please meet at the staff entrance.',
        })
      ).status,
      201,
    );
    const messages = await person.request<unknown[]>(`/assignments/${assignment.id}/messages`);
    assert.equal(messages.status, 200);
    assert.equal(messages.data.length, 1);
    assert.equal((await stranger.request(`/assignments/${assignment.id}/messages`)).status, 403);
    assert.equal(
      (await stranger.request(`/assignments/${assignment.id}/messages`, { text: 'Unauthorized' }))
        .status,
      403,
    );
    assert.equal(
      (
        await person.request(`/assignments/${assignment.id}/reviews`, {
          rating: 5,
          text: 'Helpful colleagues',
        })
      ).status,
      409,
    );
    await db.assignment.update({ where: { id: assignment.id }, data: { status: 'COMPLETED' } });
    assert.equal(
      (
        await person.request(`/assignments/${assignment.id}/reviews`, {
          rating: 5,
          text: 'Helpful colleagues',
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await owner.request(`/assignments/${assignment.id}/reviews`, {
          rating: 5,
          text: 'Arrived on time',
        })
      ).status,
      201,
    );
    const admin = await actor('second employer reviewer');
    await db.organizationMembership.create({
      data: {
        organizationId: org.organization.id,
        userId: admin.userId,
        role: 'ADMIN',
        branchIds: [],
      },
    });
    assert.equal(
      (
        await admin.request(`/assignments/${assignment.id}/reviews`, {
          rating: 3,
          text: 'Second employer review',
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await person.request(`/assignments/${assignment.id}/disputes`, {
          category: 'PAYMENT',
          description: 'Payment amount differs from the agreement.',
        })
      ).status,
      201,
    );
    assert.equal(await db.dispute.count({ where: { assignmentId: assignment.id } }), 1);
    const notifications = await person.request<{ id: string }[]>('/notifications');
    assert.ok(notifications.data.length >= 1);
    const first = notifications.data[0]!;
    assert.equal((await stranger.request(`/notifications/${first.id}/read`, {})).status, 404);
    assert.equal((await person.request(`/notifications/${first.id}/read`, {})).status, 201);
  });
});

describe('PostgreSQL billing idempotency and finance scopes', () => {
  it('validates auth/amount then fulfills parallel attempts exactly once and reconciles overpayment', async () => {
    const owner = await actor('billing owner'),
      org = await tenant(owner);
    const path = `/organizations/${org.organization.id}/billing/checkout`;
    const first = await owner.request<{ invoice: { id: string }; attempt: { id: string } }>(path, {
      planVersionId: org.planVersion.id,
      provider: 'MOCK',
    });
    const second = await owner.request<{ invoice: { id: string }; attempt: { id: string } }>(path, {
      planVersionId: org.planVersion.id,
      provider: 'MOCK',
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.data.invoice.id, second.data.invoice.id);
    for (const scenario of ['wrong_amount', 'invalid_auth']) {
      const result = await owner.request(`/developer/payments/${first.data.attempt.id}/simulate`, {
        scenario,
      });
      assert.equal(result.status, scenario === 'wrong_amount' ? 400 : 403);
    }
    assert.equal(
      (await db.invoice.findUniqueOrThrow({ where: { id: first.data.invoice.id } })).status,
      'PENDING',
    );
    const results = await Promise.all(
      [first, second].map((payment) =>
        owner.request(`/developer/payments/${payment.data.attempt.id}/simulate`, {
          scenario: 'success',
        }),
      ),
    );
    for (const result of results) assert.equal(result.status, 201);
    assert.equal(
      await db.entitlement.count({
        where: { subscriptionId: org.subscription.id, renewalSequence: 1 },
      }),
      1,
    );
    assert.equal(
      await db.providerTransaction.count({
        where: { invoiceId: first.data.invoice.id, status: 'SUCCESS' },
      }),
      2,
    );
    assert.equal(
      await db.reconciliationCase.count({
        where: { invoiceId: first.data.invoice.id, status: 'OPEN' },
      }),
      1,
    );
    const end = (await db.subscription.findUniqueOrThrow({ where: { id: org.subscription.id } }))
      .currentPeriodEnd;
    assert.equal(
      (
        await owner.request(`/developer/payments/${first.data.attempt.id}/simulate`, {
          scenario: 'duplicate',
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await owner.request(`/developer/payments/${first.data.attempt.id}/simulate`, {
          scenario: 'failure',
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await db.subscription.findUniqueOrThrow({ where: { id: org.subscription.id } })
      ).currentPeriodEnd.toISOString(),
      end.toISOString(),
    );
    assert.equal(
      (await db.invoice.findUniqueOrThrow({ where: { id: first.data.invoice.id } })).status,
      'PAID',
    );
    const attacker = await actor('other tenant');
    await tenant(attacker);
    assert.equal(
      (await attacker.request(`/organizations/${org.organization.id}/billing`)).status,
      403,
    );
    assert.equal(
      (
        await attacker.request(`/developer/payments/${first.data.attempt.id}/simulate`, {
          scenario: 'success',
        })
      ).status,
      403,
    );
  });

  it('converts trial immediately, handles late superseded payment, and does not replay refunded entitlement', async () => {
    const owner = await actor('trial owner'),
      org = await tenant(owner);
    await db.subscription.update({
      where: { id: org.subscription.id },
      data: { status: 'TRIALING' },
    });
    const newVersion = await db.planVersion.create({
      data: {
        planId: org.planVersion.planId,
        version: 2,
        priceMinor: 99_900_000n,
        branchLimit: 5,
        memberLimit: 10,
        publishLimit: 100,
      },
    });
    const oldPlan = await db.plan.create({
      data: {
        code: `old-${randomBytes(8).toString('hex')}`,
        name: 'Old selectable plan',
        versions: {
          create: {
            version: 1,
            priceMinor: 39_900_000n,
            branchLimit: 1,
            memberLimit: 3,
            publishLimit: 10,
          },
        },
      },
      include: { versions: true },
    });
    const path = `/organizations/${org.organization.id}/billing/checkout`;
    const old = await owner.request<{ invoice: { id: string }; attempt: { id: string } }>(path, {
      planVersionId: oldPlan.versions[0]!.id,
      provider: 'MOCK',
    });
    const selected = await owner.request<{ invoice: { id: string }; attempt: { id: string } }>(
      path,
      { planVersionId: newVersion.id, provider: 'MOCK' },
    );
    assert.equal(
      (
        await owner.request(`/developer/payments/${old.data.attempt.id}/simulate`, {
          scenario: 'late',
        })
      ).status,
      201,
    );
    assert.equal(
      await db.entitlement.count({
        where: { subscriptionId: org.subscription.id, renewalSequence: 1 },
      }),
      0,
    );
    const before = Date.now();
    assert.equal(
      (
        await owner.request(`/developer/payments/${selected.data.attempt.id}/simulate`, {
          scenario: 'success',
        })
      ).status,
      201,
    );
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: selected.data.invoice.id } });
    assert.ok(invoice.periodStart!.getTime() >= before - 1000);
    assert.ok(invoice.periodStart!.getTime() <= Date.now());
    assert.ok(
      (
        await db.entitlement.findUniqueOrThrow({
          where: {
            subscriptionId_renewalSequence: {
              subscriptionId: org.subscription.id,
              renewalSequence: 0,
            },
          },
        })
      ).revokedAt,
    );
    const support = await actor('support only', ['support.manage']);
    assert.equal(
      (
        await support.request(`/admin/payments/${invoice.fulfilledTransactionId}/refund`, {
          reason: 'Requested full refund',
        })
      ).status,
      403,
    );
    const finance = await actor('finance', ['billing.refund', 'billing.reconcile']);
    const refund = await finance.request(
      `/admin/payments/${invoice.fulfilledTransactionId}/refund`,
      { reason: 'Requested full refund' },
    );
    assert.equal(refund.status, 201);
    assert.equal(
      (
        await finance.request(`/admin/payments/${invoice.fulfilledTransactionId}/refund`, {
          reason: 'Retry full refund',
        })
      ).status,
      201,
    );
    assert.equal(
      await db.refund.count({ where: { transactionId: invoice.fulfilledTransactionId! } }),
      1,
    );
    assert.equal(
      (
        await owner.request(`/developer/payments/${selected.data.attempt.id}/simulate`, {
          scenario: 'duplicate',
        })
      ).status,
      201,
    );
    assert.equal(
      (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
      'REFUNDED',
    );
    assert.equal(
      await db.entitlement.count({
        where: { subscriptionId: org.subscription.id, renewalSequence: 1 },
      }),
      1,
    );
  });
});

describe('Payme Merchant adapter against PostgreSQL (local protocol tests, not provider sandbox)', () => {
  it('implements auth, create/replay/perform/statement/full-cancel and timeout', async () => {
    const keys = [
      'PAYME_ENABLED',
      'PAYME_ENVIRONMENT',
      'PAYME_MERCHANT_ID',
      'PAYME_LOGIN',
      'PAYME_KEY',
    ] as const;
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      PAYME_ENABLED: 'true',
      PAYME_ENVIRONMENT: 'SANDBOX',
      PAYME_MERCHANT_ID: 'synthetic-local-id',
      PAYME_LOGIN: 'test-merchant',
      PAYME_KEY: 'synthetic-local-secret',
    });
    try {
      const prisma = db as unknown as PrismaService;
      const billing = new BillingService(prisma, new PermissionsService(prisma));
      const payme = new PaymeService(prisma, billing);
      const owner = await actor('Payme owner'),
        org = await tenant(owner);
      const invoice = await db.invoice.create({
        data: {
          organizationId: org.organization.id,
          subscriptionId: org.subscription.id,
          planVersionId: org.planVersion.id,
          renewalSequence: 1,
          amountMinor: org.planVersion.priceMinor,
          currency: 'UZS',
          snapshot: { test: true },
        },
      });
      const attempt = await db.paymentAttempt.create({
        data: {
          organizationId: org.organization.id,
          invoiceId: invoice.id,
          provider: 'PAYME',
          environment: 'SANDBOX',
        },
      });
      const auth = `Basic ${Buffer.from('test-merchant:synthetic-local-secret').toString('base64')}`;
      const id = randomBytes(12).toString('hex');
      const params = {
        id,
        time: Date.now(),
        amount: Number(invoice.amountMinor),
        account: { order_id: attempt.id },
      };
      const rpc = (method: string, input: unknown = params, authorization = auth) =>
        payme.rpc(authorization, { id: 1, method, params: input });
      assert.equal((await rpc('CheckPerformTransaction', params, 'bad')).error?.code, -32504);
      assert.equal(
        (await rpc('CheckPerformTransaction', { ...params, amount: 1 })).error?.code,
        -31001,
      );
      assert.ok((await rpc('CheckPerformTransaction')).result);
      const create = await rpc('CreateTransaction');
      assert.ok(create.result);
      assert.deepEqual((await rpc('CreateTransaction')).result, create.result);
      assert.equal(
        (await rpc('CreateTransaction', { ...params, id: randomBytes(12).toString('hex') })).error
          ?.code,
        -31008,
      );
      const paid = await rpc('PerformTransaction', { id });
      assert.ok(paid.result);
      assert.deepEqual((await rpc('PerformTransaction', { id })).result, paid.result);
      assert.ok(
        (await rpc('GetStatement', { from: params.time - 1000, to: Date.now() + 1000 })).result,
      );
      const cancel = await rpc('CancelTransaction', { id, reason: 5 });
      assert.ok(cancel.result);
      assert.deepEqual((await rpc('CancelTransaction', { id, reason: 5 })).result, cancel.result);
      assert.equal((await rpc('PerformTransaction', { id })).error?.code, -31008);
      assert.equal(
        (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
        'REFUNDED',
      );
      const next = await db.invoice.create({
        data: {
          organizationId: org.organization.id,
          subscriptionId: org.subscription.id,
          planVersionId: org.planVersion.id,
          renewalSequence: 2,
          amountMinor: invoice.amountMinor,
          snapshot: { test: true },
        },
      });
      const nextAttempt = await db.paymentAttempt.create({
        data: {
          organizationId: org.organization.id,
          invoiceId: next.id,
          provider: 'PAYME',
          environment: 'SANDBOX',
        },
      });
      const expired = {
        ...params,
        id: randomBytes(12).toString('hex'),
        time: Date.now() - 43_200_001,
        account: { order_id: nextAttempt.id },
      };
      assert.equal((await rpc('CreateTransaction', expired)).error?.code, -31008);
      assert.equal(
        (
          await db.providerTransaction.findUniqueOrThrow({
            where: {
              provider_environment_providerTransactionId: {
                provider: 'PAYME',
                environment: 'SANDBOX',
                providerTransactionId: expired.id,
              },
            },
          })
        ).cancelReason,
        4,
      );
    } finally {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  });
});

describe('Operational lifecycle and bank evidence', () => {
  it('early close preserves actual worked times and pending wage approvals', async () => {
    const { owner, person, org, assignment, shift } = await assignmentFixture();
    assert.equal(
      (
        await owner.request(`/assignments/${assignment.id}/attendance`, {
          kind: 'CHECK_IN',
          reason: 'Manager observed arrival',
        })
      ).status,
      201,
    );
    await db.timesheet.update({
      where: { assignmentId: assignment.id },
      data: { startedAt: shift.startAt },
    });
    const original = await db.timesheet.findUniqueOrThrow({
      where: { assignmentId: assignment.id },
    });
    assert.equal(
      (
        await owner.request(
          `/organizations/${org.organization.id}/shifts/${shift.id}/early-close`,
          { reason: 'Venue closed early; retain worked time' },
        )
      ).status,
      201,
    );
    const sheet = await db.timesheet.findUniqueOrThrow({ where: { assignmentId: assignment.id } });
    assert.equal(sheet.startedAt.toISOString(), original.startedAt.toISOString());
    assert.ok(sheet.endedAt);
    assert.ok(sheet.paidMinutes >= 239);
    assert.equal(sheet.status, 'PENDING_APPROVAL');
    assert.equal(
      (await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).status,
      'CHECKED_OUT',
    );
    assert.equal(
      (await db.wageRecord.findUniqueOrThrow({ where: { assignmentId: assignment.id } })).status,
      'CALCULATED',
    );
    assert.equal(await db.activeBooking.count({ where: { shiftId: shift.id } }), 0);
    assert.equal(
      (await person.request(`/assignments/${assignment.id}/timesheet/approve`, {})).status,
      201,
    );
    assert.equal(
      (await owner.request(`/assignments/${assignment.id}/timesheet/approve`, {})).status,
      201,
    );
  });

  it('SSE resumes from a personal cursor and closes after session revocation', async () => {
    const client = await actor('stream owner'),
      other = await actor('stream outsider');
    const first = await db.notification.create({
      data: { userId: client.userId, type: 'TEST', title: 'First', body: 'First cursor' },
    });
    const second = await db.notification.create({
      data: {
        userId: client.userId,
        type: 'TEST',
        title: 'Second',
        body: 'Resume event',
        createdAt: new Date(first.createdAt.getTime() + 10),
      },
    });
    const privateOther = await db.notification.create({
      data: { userId: other.userId, type: 'TEST', title: 'Private', body: 'Another account' },
    });
    const abort = new AbortController();
    const deadline = setTimeout(() => abort.abort(), 15_000);
    try {
      const response = await fetch(`${base}/notifications/stream`, {
        headers: { cookie: client.cookie, 'last-event-id': first.id },
        signal: abort.signal,
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (!text.includes(second.id)) {
        const chunk = await reader.read();
        assert.equal(chunk.done, false);
        text += decoder.decode(chunk.value);
      }
      assert.ok(!text.includes(privateOther.id));
      assert.ok(!text.includes(`id: ${first.id}`));
      await db.session.updateMany({
        where: { userId: client.userId },
        data: { revokedAt: new Date() },
      });
      let ended = false;
      while (!ended) {
        ended = (await reader.read()).done;
      }
      assert.equal(ended, true);
    } finally {
      clearTimeout(deadline);
      abort.abort();
    }
  });

  it('bank evidence alone never pays; independent finance confirmation uses exact amount and durable reference', async () => {
    const previousBeneficiary = process.env.BANK_BENEFICIARY,
      previousAccount = process.env.BANK_ACCOUNT_REFERENCE;
    process.env.BANK_BENEFICIARY = 'SYNTHETIC TEST OPERATOR';
    process.env.BANK_ACCOUNT_REFERENCE = 'SYNTHETIC TEST ACCOUNT';
    try {
      const prisma = db as unknown as PrismaService;
      const billing = new BillingService(prisma, new PermissionsService(prisma));
      const owner = await actor('bank owner'),
        finance = await actor('bank finance', ['billing.reconcile']),
        org = await tenant(owner);
      const trusted = (client: Client, permissions: string[] = []): AuthUser => ({
        id: client.userId,
        phone: '',
        name: 'Test',
        sessionId: '',
        platformPermissions: permissions,
      });
      const checkout = await billing.checkout(trusted(owner), org.organization.id, {
        provider: 'BANK',
        planVersionId: org.planVersion.id,
      });
      const file = await db.fileAsset.create({
        data: {
          ownerId: owner.userId,
          storageKey: randomBytes(16).toString('hex'),
          mimeType: 'application/pdf',
          originalName: 'synthetic-bank-proof.pdf',
          sizeBytes: 100,
          status: 'CLEAN',
          sha256: 'synthetic-test-digest',
        },
      });
      const evidence = {
        bankReference: `TEST-BANK-${randomBytes(8).toString('hex')}`,
        evidenceFileId: file.id,
      };
      await billing.submitBankEvidence(trusted(owner), checkout.attempt.id, evidence);
      assert.equal(
        (await db.invoice.findUniqueOrThrow({ where: { id: checkout.invoice.id } })).status,
        'PENDING',
      );
      const input = {
        ...evidence,
        amountMinor: checkout.invoice.amountMinor.toString(),
        reason: 'Synthetic bank statement independently compared',
        independentlyVerified: true,
      };
      await assert.rejects(() => billing.confirmBank(trusted(owner), checkout.attempt.id, input));
      await assert.rejects(() =>
        billing.confirmBank(trusted(finance, ['billing.reconcile']), checkout.attempt.id, {
          ...input,
          amountMinor: '1',
        }),
      );
      await billing.confirmBank(
        trusted(finance, ['billing.reconcile']),
        checkout.attempt.id,
        input,
      );
      await billing.confirmBank(
        trusted(finance, ['billing.reconcile']),
        checkout.attempt.id,
        input,
      );
      assert.equal(
        (await db.invoice.findUniqueOrThrow({ where: { id: checkout.invoice.id } })).status,
        'PAID',
      );
      assert.equal(await db.entitlement.count({ where: { invoiceId: checkout.invoice.id } }), 1);
      assert.equal(
        await db.providerTransaction.count({ where: { invoiceId: checkout.invoice.id } }),
        1,
      );
      assert.equal(
        (await db.privateDocument.findUniqueOrThrow({ where: { fileId: file.id } })).purpose,
        'BANK_EVIDENCE',
      );
    } finally {
      if (previousBeneficiary === undefined) delete process.env.BANK_BENEFICIARY;
      else process.env.BANK_BENEFICIARY = previousBeneficiary;
      if (previousAccount === undefined) delete process.env.BANK_ACCOUNT_REFERENCE;
      else process.env.BANK_ACCOUNT_REFERENCE = previousAccount;
    }
  });
});
