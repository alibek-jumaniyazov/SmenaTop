import type { Prisma, Shift } from '@prisma/client';
import { ConflictException } from '@nestjs/common';

export interface ShiftTransitionContext {
  actorId: string | null;
  trigger: string;
  reason?: string;
  now?: Date;
}

/** Caller must hold the Shift row lock. Date passage never fabricates worker attendance. */
export async function transitionShift(
  tx: Prisma.TransactionClient,
  shift: Shift,
  target: 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED',
  context: ShiftTransitionContext,
) {
  const expected =
    target === 'IN_PROGRESS' ? 'PUBLISHED' : target === 'COMPLETED' ? 'IN_PROGRESS' : 'COMPLETED';
  if (shift.status !== expected) throw new ConflictException('SHIFT_LIFECYCLE_TRANSITION_INVALID');
  const result = await tx.shift.update({
    where: { id: shift.id },
    data: { status: target, version: { increment: 1 } },
  });
  await tx.auditLog.create({
    data: {
      actorId: context.actorId,
      organizationId: shift.organizationId,
      action: 'shift.lifecycle.transition',
      resourceId: shift.id,
      reason: context.reason,
      metadata: { from: shift.status, to: target, trigger: context.trigger },
    },
  });
  const type =
    target === 'IN_PROGRESS'
      ? 'shift.started'
      : target === 'COMPLETED'
        ? 'shift.completed'
        : 'shift.closed';
  await tx.outboxEvent.create({
    data: {
      type,
      aggregateId: shift.id,
      organizationId: shift.organizationId,
      dedupeKey: `${type}:${shift.id}`,
      payload: { shiftId: shift.id, previousStatus: shift.status, status: target },
    },
  });
  return result;
}

/**
 * Call in the same transaction as attendance/cancellation, after its assignment mutation.
 * A scheduled job may hold the Shift lock and call this with actorId:null.
 * No-show remains a reasoned manual decision; clocks do not create worked time.
 */
export async function synchronizeShiftLifecycle(
  tx: Prisma.TransactionClient,
  shiftId: string,
  context: ShiftTransitionContext,
) {
  let shift = await tx.shift.findUniqueOrThrow({ where: { id: shiftId } });
  if (!['PUBLISHED', 'IN_PROGRESS'].includes(shift.status)) return shift;
  const assignments = await tx.assignment.findMany({
    where: { shiftId },
    select: { status: true },
  });
  const now = context.now ?? new Date();
  const actualAttendance = assignments.some((assignment) =>
    ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(assignment.status),
  );
  if (shift.status === 'PUBLISHED' && (actualAttendance || shift.startAt <= now))
    shift = await transitionShift(tx, shift, 'IN_PROGRESS', context);
  const unresolved = assignments.some((assignment) =>
    ['CONFIRMED', 'CHECKED_IN'].includes(assignment.status),
  );
  if (
    shift.status === 'IN_PROGRESS' &&
    ((assignments.length > 0 && !unresolved) || (assignments.length === 0 && shift.endAt <= now))
  ) {
    shift = await transitionShift(tx, shift, 'COMPLETED', context);
    await tx.shiftOffer.updateMany({
      where: { shiftId, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    await tx.shiftApplication.updateMany({
      where: { shiftId, status: { in: ['SUBMITTED', 'SHORTLISTED', 'OFFERED'] } },
      data: { status: 'EXPIRED' },
    });
  }
  return shift;
}
