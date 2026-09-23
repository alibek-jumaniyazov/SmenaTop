import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import { validateJobsEnvironment } from './config';

// Fail before constructing Prisma, Queue or Worker; an unsafe boot must not consume jobs.
const redisUrl = validateJobsEnvironment(process.env);
const db = new PrismaClient();
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
  db: Number(redisUrl.pathname.slice(1) || 0),
  ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
};
const prefix = process.env.QUEUE_NAMESPACE ?? `smenatop-${process.env.APP_ENV ?? 'local'}`;
const queue = new Queue('smenatop-events', { connection, prefix });
let shuttingDown = false;

function fields(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), component: 'jobs', event, ...data }));
}

const worker = new Worker<{ eventId: string }>(
  'smenatop-events',
  async (job) => {
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "OutboxEvent" WHERE id = ${job.data.eventId}::uuid FOR UPDATE`;
        const event = await tx.outboxEvent.findUnique({ where: { id: job.data.eventId } });
        if (!event || event.processedAt) return;
        const payload = fields(event.payload);
        if (
          [
            'application.submitted',
            'offer.created',
            'assignment.confirmed',
            'assignment.cancelled',
          ].includes(event.type)
        ) {
          const recipients = new Set<string>();
          if (typeof payload.workerId === 'string') recipients.add(payload.workerId);
          const relatedShift =
            typeof payload.shiftId === 'string'
              ? await tx.shift.findUnique({ where: { id: payload.shiftId } })
              : null;
          if (relatedShift) {
            const members = await tx.organizationMembership.findMany({
              where: {
                organizationId: relatedShift.organizationId,
                status: 'ACTIVE',
                role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
              },
            });
            members
              .filter(
                (member) =>
                  member.role !== 'MANAGER' || member.branchIds.includes(relatedShift.branchId),
              )
              .forEach((member) => recipients.add(member.userId));
          }
          const titles: Record<string, string> = {
            'application.submitted': 'Smenaga ariza yuborildi',
            'offer.created': 'Smena uchun taklif bor',
            'assignment.confirmed': 'Smena tasdiqlandi',
            'assignment.cancelled': 'Smena ishtiroki bekor qilindi',
          };
          for (const userId of recipients) {
            const dedupeKey = `${event.id}-${userId}`;
            await tx.notification.upsert({
              where: { dedupeKey },
              create: {
                userId,
                type: event.type,
                title: titles[event.type]!,
                body: 'Smena tafsilotlari va keyingi amallarni tekshiring.',
                resourceId: event.aggregateId,
                dedupeKey,
              },
              update: {},
            });
          }
        }
        if (event.type === 'assignment.reminder') {
          const assignmentId = String(payload.assignmentId ?? event.aggregateId);
          const assignment = await tx.assignment.findUnique({
            where: { id: assignmentId },
            include: { shift: true },
          });
          // Recheck at delivery time. Old reminders cannot revive a cancelled assignment.
          if (
            assignment?.status === 'CONFIRMED' &&
            assignment.shift.status === 'PUBLISHED' &&
            assignment.startAt > new Date() &&
            assignment.startAt.toISOString() === payload.startAt
          ) {
            await tx.notification.create({
              data: {
                userId: assignment.workerId,
                type: 'REMINDER',
                title: 'Smenangiz yaqinlashmoqda',
                body: 'Tasdiqlangan smena va kelish ma’lumotlarini tekshiring.',
                resourceId: assignmentId,
              },
            });
            const preference = await tx.notificationPreference.findUnique({
              where: { userId: assignment.workerId },
            });
            if (
              preference?.sms &&
              process.env.SMS_PROVIDER === 'local' &&
              process.env.APP_ENV !== 'production'
            ) {
              const recipient = await tx.user.findUniqueOrThrow({
                where: { id: assignment.workerId },
              });
              await tx.localInbox.create({
                data: {
                  phone: recipient.phone,
                  body: 'LOCAL_MOCK: Smenangiz yaqinlashmoqda. Tafsilotlarni kabinetingizda tekshiring.',
                  expiresAt: new Date(Date.now() + 3600_000),
                },
              });
            }
          }
        } else if (event.type === 'assignment.accepted' || event.type === 'assignment.confirmed') {
          const assignment = await tx.assignment.findUnique({ where: { id: event.aggregateId } });
          if (assignment && assignment.startAt > new Date()) {
            const dedupeKey = `reminder-${assignment.id}-${assignment.startAt.getTime()}`;
            await tx.outboxEvent.upsert({
              where: { dedupeKey },
              create: {
                type: 'assignment.reminder',
                aggregateId: assignment.id,
                organizationId: assignment.organizationId,
                dedupeKey,
                payload: { assignmentId: assignment.id, startAt: assignment.startAt.toISOString() },
                availableAt: new Date(
                  Math.max(Date.now(), assignment.startAt.getTime() - 3600_000),
                ),
              },
              update: {},
            });
          }
        }
        // All other domain notifications are created atomically by their originating use case.
        // Outgoing third-party webhooks are deliberately not claimed as implemented.
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date(), lockedAt: null, lastError: null },
        });
      },
      { timeout: 15_000 },
    );
  },
  { connection, prefix, concurrency: 4 },
);

worker.on('completed', (job) => log('event.completed', { jobId: job.id }));
worker.on('failed', (job, error) => {
  log('event.failed', { jobId: job?.id, errorType: error.name });
  if (job)
    void db.outboxEvent
      .update({
        where: { id: job.data.eventId },
        data: { attempts: { increment: 1 }, lockedAt: null, lastError: error.name.slice(0, 100) },
      })
      .catch(() => log('failure-record.unavailable'));
});
worker.on('error', (error) => log('worker.error', { errorType: error.name }));

async function dispatch() {
  const events = await db.outboxEvent.findMany({
    where: { processedAt: null, attempts: { lt: 8 }, availableAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  for (const event of events) {
    await queue.add(
      event.type,
      { eventId: event.id },
      {
        jobId: event.id,
        attempts: 8,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 7 * 86400 },
        removeOnFail: false,
      },
    );
  }
}
async function maintain() {
  const now = new Date();
  await db.$transaction(async (tx) => {
    const expiredOffers = await tx.shiftOffer.findMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      take: 100,
    });
    for (const offer of expiredOffers) {
      const changed = await tx.shiftOffer.updateMany({
        where: { id: offer.id, status: 'PENDING', expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      });
      if (changed.count)
        await tx.shiftApplication.updateMany({
          where: { id: offer.applicationId, status: 'OFFERED' },
          data: { status: 'EXPIRED' },
        });
    }
  });
  const pending = await db.paymentAttempt.findMany({
    where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 15 * 60_000) } },
    take: 100,
  });
  for (const attempt of pending)
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${attempt.invoiceId}::uuid FOR UPDATE`;
      const current = await tx.paymentAttempt.findUnique({ where: { id: attempt.id } });
      if (current?.status !== 'PENDING') return;
      if (
        !(await tx.reconciliationCase.findFirst({
          where: { invoiceId: attempt.invoiceId, kind: 'PENDING_TIMEOUT', status: 'OPEN' },
        }))
      ) {
        await tx.reconciliationCase.create({
          data: {
            invoiceId: attempt.invoiceId,
            organizationId: attempt.organizationId,
            kind: 'PENDING_TIMEOUT',
            details: {
              paymentAttemptId: attempt.id,
              provider: attempt.provider,
              note: 'Provider truth required; no automatic success inferred',
            },
          },
        });
      }
    });
  await db.localInbox.deleteMany({ where: { expiresAt: { lt: now } } });
}

async function main() {
  await db.$connect();
  await queue.waitUntilReady();
  log('ready');
  let ticks = 0;
  while (!shuttingDown) {
    try {
      await dispatch();
      if (ticks++ % 12 === 0) await maintain();
    } catch (error) {
      log('dispatch.error', { errorType: error instanceof Error ? error.name : 'Unknown' });
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await worker.close();
  await queue.close();
  await db.$disconnect();
  log('stopped');
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
void main().catch((error) => {
  log('startup.failed', { errorType: error.name });
  process.exitCode = 1;
  void shutdown();
});
