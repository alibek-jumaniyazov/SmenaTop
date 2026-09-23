import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { actor, db, offerFixture, shiftFixture, tenant, worker } from './helpers';

after(async () => db.$disconnect());
test(
  'real Redis/BullMQ dispatch deduplicates events and skips cancelled reminders',
  { timeout: 35_000 },
  async () => {
    const owner = await actor('Outbox owner'),
      org = await tenant(owner),
      person = await worker('Outbox worker');
    const shift = await shiftFixture(owner, org);
    const { offer } = await offerFixture(owner, person, shift);
    const assignment = await db.assignment.create({
      data: {
        organizationId: org.organization.id,
        shiftId: shift.id,
        workerId: person.userId,
        offerId: offer.id,
        startAt: shift.startAt,
        endAt: shift.endAt,
        status: 'CANCELLED_BY_WORKER',
      },
    });
    const event = await db.outboxEvent.create({
      data: {
        type: 'offer.created',
        aggregateId: offer.id,
        organizationId: org.organization.id,
        dedupeKey: `test-${randomUUID()}`,
        payload: { workerId: person.userId, shiftId: shift.id },
      },
    });
    const reminder = await db.outboxEvent.create({
      data: {
        type: 'assignment.reminder',
        aggregateId: assignment.id,
        payload: { assignmentId: assignment.id, startAt: shift.startAt.toISOString() },
      },
    });
    const processWorker = spawn(process.execPath, ['apps/jobs/dist/main.js'], {
      env: process.env,
      stdio: 'pipe',
    });
    let logs = '';
    processWorker.stdout.on('data', (chunk) => {
      logs += chunk.toString();
    });
    processWorker.stderr.on('data', (chunk) => {
      logs += chunk.toString();
    });
    try {
      for (let n = 0; n < 50; n++) {
        if (
          (await db.outboxEvent.findUniqueOrThrow({ where: { id: reminder.id } })).processedAt &&
          (await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).processedAt
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      assert.ok(
        (await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).processedAt,
        logs,
      );
      assert.ok(
        (await db.outboxEvent.findUniqueOrThrow({ where: { id: reminder.id } })).processedAt,
        logs,
      );
      assert.equal(
        await db.notification.count({ where: { dedupeKey: `${event.id}-${person.userId}` } }),
        1,
      );
      assert.equal(
        await db.notification.count({
          where: { userId: person.userId, resourceId: assignment.id, type: 'REMINDER' },
        }),
        0,
      );
      assert.ok(!logs.includes(person.cookie));
    } finally {
      processWorker.kill('SIGTERM');
    }
  },
);
