import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions.service';
import type { AuthUser } from '../auth/current-user';
import { attendanceTransition, calculateWage, wageTransition } from './attendance.rules';
import { synchronizeShiftLifecycle, transitionShift } from './shift-lifecycle';
import type {
  AttendanceDto,
  CorrectionDto,
  DisputeDto,
  ReviewDto,
  SupportDto,
  VerificationReviewDto,
} from './operations.dto';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class OperationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async accessibleAssignment(user: AuthUser, id: string, permission = 'attendance.approve') {
    const assignment = await this.db.assignment.findUnique({
      where: { id },
      include: {
        shift: {
          include: {
            organization: {
              select: { id: true, name: true, verificationStatus: true, synthetic: true },
            },
            branch: { select: { id: true, name: true, area: true } },
          },
        },
      },
    });
    if (!assignment) throw new NotFoundException('Assignment topilmadi');
    if (assignment.workerId !== user.id)
      await this.permissions.requireOrg(
        user.id,
        assignment.organizationId,
        permission,
        assignment.shift.branchId,
      );
    return assignment;
  }

  async attendance(user: AuthUser, id: string) {
    const assignment = await this.accessibleAssignment(user, id);
    const [timesheet, wage, events] = await Promise.all([
      this.db.timesheet.findUnique({ where: { assignmentId: id } }),
      this.db.wageRecord.findUnique({ where: { assignmentId: id } }),
      this.db.attendanceEvent.findMany({
        where: { assignmentId: id },
        orderBy: { recordedAt: 'asc' },
        take: 100,
      }),
    ]);
    return { assignment, timesheet, wage, events };
  }

  async issueToken(user: AuthUser, assignmentId: string, kind: string) {
    const assignment = await this.accessibleAssignment(user, assignmentId);
    await this.permissions.requireOrg(
      user.id,
      assignment.organizationId,
      'attendance.approve',
      assignment.shift.branchId,
    );
    try {
      attendanceTransition(assignment.status, kind);
    } catch {
      throw new ConflictException('Davomat holati mos emas');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 120_000);
    await this.db.attendanceToken.create({
      data: {
        assignmentId,
        organizationId: assignment.organizationId,
        tokenHash: digest(token),
        kind,
        expiresAt,
        createdById: user.id,
      },
    });
    return { token, expiresAt, assignmentId, kind };
  }

  async recordAttendance(user: AuthUser, id: string, input: AttendanceDto) {
    const access = await this.accessibleAssignment(user, id);
    const worker = access.workerId === user.id;
    if (worker && !input.token) throw new ForbiddenException('Bir martalik token talab qilinadi');
    if (!worker && !input.reason)
      throw new BadRequestException('Manual tasdiq sababi talab qilinadi');
    await this.db.$transaction(async (tx) => {
      await this.lockAssignment(tx, id);
      const assignment = await tx.assignment.findUniqueOrThrow({
        where: { id },
        include: { shift: true },
      });
      const now = new Date();
      let status: string;
      if (!['PUBLISHED', 'IN_PROGRESS'].includes(assignment.shift.status))
        throw new ConflictException('Smena davomat uchun yopiq');
      try {
        status = attendanceTransition(assignment.status, input.kind);
      } catch {
        throw new ConflictException('Davomat allaqachon yozilgan yoki holat mos emas');
      }
      if (
        input.kind === 'CHECK_IN' &&
        (now.getTime() < assignment.startAt.getTime() - 30 * 60_000 || now >= assignment.endAt)
      ) {
        throw new ConflictException(
          'Check-in smenadan 30 daqiqa oldin ochiladi va smena tugaganda yopiladi',
        );
      }
      if (worker) {
        const claimed = await tx.attendanceToken.updateMany({
          where: {
            assignmentId: id,
            tokenHash: digest(input.token!),
            kind: input.kind,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: { usedAt: now },
        });
        if (claimed.count !== 1)
          throw new ForbiddenException('Token noto‘g‘ri, ishlatilgan yoki muddati tugagan');
      }
      await tx.attendanceEvent.create({
        data: {
          organizationId: assignment.organizationId,
          assignmentId: id,
          actorId: user.id,
          kind: input.kind,
          method: worker ? 'TOKEN' : 'MANUAL',
          recordedAt: now,
          reason: input.reason,
        },
      });
      await tx.assignment.update({ where: { id }, data: { status, version: { increment: 1 } } });
      if (input.kind === 'CHECK_IN') {
        await tx.timesheet.create({
          data: {
            organizationId: assignment.organizationId,
            assignmentId: id,
            startedAt: now,
            breakMinutes: assignment.shift.paidBreak ? 0 : assignment.shift.breakMinutes,
            paidMinutes: 0,
            status: 'OPEN',
            rateMinor: assignment.shift.amountMinor,
            payType: assignment.shift.payType,
            snapshot: {
              paidBreak: assignment.shift.paidBreak,
              scheduledBreakMinutes: assignment.shift.breakMinutes,
            },
          },
        });
      } else {
        const current = await tx.timesheet.findUniqueOrThrow({ where: { assignmentId: id } });
        const calculation = calculateWage({
          startedAt: current.startedAt,
          endedAt: now,
          breakMinutes: current.breakMinutes,
          scheduledStart: assignment.startAt,
          scheduledEnd: assignment.endAt,
          payType: current.payType,
          rateMinor: current.rateMinor,
        });
        const sheet = await tx.timesheet.update({
          where: { id: current.id },
          data: {
            endedAt: now,
            paidMinutes: calculation.paidMinutes,
            status: 'PENDING_APPROVAL',
            version: { increment: 1 },
          },
        });
        await tx.wageRecord.create({
          data: {
            organizationId: assignment.organizationId,
            assignmentId: id,
            timesheetId: sheet.id,
            amountMinor: calculation.amountMinor,
            currency: 'UZS',
            status: 'CALCULATED',
            snapshot: {
              payType: assignment.shift.payType,
              rateMinor: assignment.shift.amountMinor.toString(),
              startedAt: sheet.startedAt.toISOString(),
              endedAt: now.toISOString(),
              breakMinutes: sheet.breakMinutes,
              paidMinutes: sheet.paidMinutes,
              rounding: 'half-up-tiyin',
              overtime: false,
            },
          },
        });
      }
      await this.audit(
        tx,
        user.id,
        assignment.organizationId,
        'attendance.record',
        id,
        { kind: input.kind, method: worker ? 'TOKEN' : 'MANUAL' },
        input.reason,
      );
      await this.notify(
        tx,
        assignment.workerId,
        'ATTENDANCE',
        input.kind === 'CHECK_IN' ? 'Kelishingiz qayd etildi' : 'Smena vaqti hisoblandi',
        'Davomat va hisobni tekshiring.',
        id,
      );
      await synchronizeShiftLifecycle(tx, assignment.shiftId, {
        actorId: user.id,
        trigger: `attendance.${input.kind.toLowerCase()}`,
        now,
      });
    });
    return this.attendance(user, id);
  }

  async approveTimesheet(user: AuthUser, id: string) {
    const access = await this.accessibleAssignment(user, id);
    return this.db.$transaction(async (tx) => {
      await this.lockAssignment(tx, id);
      if (await tx.dispute.count({ where: { assignmentId: id, status: 'OPEN' } }))
        throw new ConflictException('Avval ochiq nizo ko‘rib chiqilsin');
      const sheet = await tx.timesheet.findUnique({ where: { assignmentId: id } });
      if (!sheet?.endedAt || !['PENDING_APPROVAL', 'APPROVED'].includes(sheet.status))
        throw new ConflictException('Tasdiqlanadigan timesheet yo‘q');
      const now = new Date();
      const workerApprovedAt =
        access.workerId === user.id ? (sheet.workerApprovedAt ?? now) : sheet.workerApprovedAt;
      const managerApprovedAt =
        access.workerId !== user.id ? (sheet.managerApprovedAt ?? now) : sheet.managerApprovedAt;
      const approved = Boolean(workerApprovedAt && managerApprovedAt);
      const result = await tx.timesheet.update({
        where: { id: sheet.id },
        data: {
          workerApprovedAt,
          managerApprovedAt,
          status: approved ? 'APPROVED' : 'PENDING_APPROVAL',
          version: { increment: 1 },
        },
      });
      if (approved) {
        await tx.wageRecord.updateMany({
          where: { assignmentId: id, status: 'CALCULATED' },
          data: { status: 'APPROVED' },
        });
        await tx.assignment.update({
          where: { id },
          data: { status: 'COMPLETED', version: { increment: 1 } },
        });
      }
      await this.audit(tx, user.id, access.organizationId, 'timesheet.approve', id, {
        approved,
        side: access.workerId === user.id ? 'WORKER' : 'MANAGER',
      });
      await synchronizeShiftLifecycle(tx, access.shiftId, {
        actorId: user.id,
        trigger: 'timesheet.approve',
      });
      return result;
    });
  }

  async correctTimesheet(user: AuthUser, id: string, input: CorrectionDto) {
    const assignment = await this.accessibleAssignment(user, id);
    await this.permissions.requireOrg(
      user.id,
      assignment.organizationId,
      'attendance.approve',
      assignment.shift.branchId,
    );
    const startedAt = new Date(input.startedAt),
      endedAt = new Date(input.endedAt);
    if (
      !Number.isFinite(startedAt.getTime()) ||
      !Number.isFinite(endedAt.getTime()) ||
      endedAt <= startedAt ||
      endedAt.getTime() - startedAt.getTime() > 24 * 3600_000 ||
      endedAt > new Date()
    )
      throw new BadRequestException('Vaqt oralig‘i noto‘g‘ri');
    return this.db.$transaction(async (tx) => {
      await this.lockAssignment(tx, id);
      const sheet = await tx.timesheet.findUniqueOrThrow({ where: { assignmentId: id } });
      if (sheet.status === 'APPROVED')
        throw new ConflictException('Tasdiqlangan hisob uchun nizo oching');
      const calculation = calculateWage({
        startedAt,
        endedAt,
        breakMinutes: input.breakMinutes,
        scheduledStart: assignment.startAt,
        scheduledEnd: assignment.endAt,
        payType: assignment.shift.payType,
        rateMinor: assignment.shift.amountMinor,
        overtimeApproved: true,
      });
      await this.audit(
        tx,
        user.id,
        assignment.organizationId,
        'timesheet.correct',
        id,
        {
          previous: {
            startedAt: sheet.startedAt.toISOString(),
            endedAt: sheet.endedAt?.toISOString() ?? null,
            breakMinutes: sheet.breakMinutes,
          },
          next: {
            startedAt: input.startedAt,
            endedAt: input.endedAt,
            breakMinutes: input.breakMinutes,
          },
        },
        input.reason,
      );
      await tx.wageRecord.update({
        where: { assignmentId: id },
        data: {
          amountMinor: calculation.amountMinor,
          snapshot: {
            rateMinor: assignment.shift.amountMinor.toString(),
            payType: assignment.shift.payType,
            startedAt: input.startedAt,
            endedAt: input.endedAt,
            paidMinutes: calculation.paidMinutes,
            breakMinutes: input.breakMinutes,
            overtime: true,
            reason: input.reason,
          },
        },
      });
      return tx.timesheet.update({
        where: { id: sheet.id },
        data: {
          startedAt,
          endedAt,
          breakMinutes: input.breakMinutes,
          paidMinutes: calculation.paidMinutes,
          workerApprovedAt: null,
          managerApprovedAt: null,
          correction: { reason: input.reason, proposedById: user.id },
          version: { increment: 1 },
        },
      });
    });
  }

  async wageAction(user: AuthUser, id: string, action: 'mark-paid' | 'confirm', reason?: string) {
    const assignment = await this.accessibleAssignment(
      user,
      id,
      action === 'mark-paid' ? 'wage.manage' : 'attendance.approve',
    );
    if (action === 'confirm' && assignment.workerId !== user.id)
      throw new ForbiddenException('Faqat ishchi qabulni tasdiqlaydi');
    if (action === 'mark-paid')
      await this.permissions.requireOrg(
        user.id,
        assignment.organizationId,
        'wage.manage',
        assignment.shift.branchId,
      );
    return this.db.$transaction(async (tx) => {
      await this.lockAssignment(tx, id);
      const wage = await tx.wageRecord.findUniqueOrThrow({ where: { assignmentId: id } });
      const expected = action === 'mark-paid' ? 'EMPLOYER_MARKED_PAID' : 'WORKER_CONFIRMED';
      if (wage.status === expected) return wage;
      let status: string;
      try {
        status = wageTransition(wage.status, action);
      } catch {
        throw new ConflictException('Ish haqi holati mos emas');
      }
      const result = await tx.wageRecord.update({
        where: { id: wage.id },
        data: {
          status,
          ...(action === 'mark-paid'
            ? { employerMarkedPaidAt: new Date() }
            : { workerConfirmedAt: new Date() }),
        },
      });
      await this.audit(
        tx,
        user.id,
        assignment.organizationId,
        `wage.${action}`,
        id,
        { previousStatus: wage.status, status, amountMinor: wage.amountMinor.toString() },
        reason,
      );
      await this.notify(
        tx,
        assignment.workerId,
        'WAGE',
        action === 'mark-paid'
          ? 'Ish beruvchi to‘langan deb belgiladi'
          : 'To‘lovni olganingiz tasdiqlandi',
        'Bu belgi bank tasdig‘i emas.',
        id,
      );
      return result;
    });
  }

  async wages(user: AuthUser, organizationId?: string) {
    if (organizationId) await this.permissions.requireOrg(user.id, organizationId, 'wage.read');
    return this.db.wageRecord.findMany({
      where: organizationId ? { organizationId } : { assignment: { workerId: user.id } },
      include: { assignment: { include: { shift: true } } },
      take: 100,
      orderBy: { id: 'desc' },
    });
  }

  async dispute(user: AuthUser, id: string, input: DisputeDto) {
    const assignment = await this.accessibleAssignment(user, id);
    return this.db.$transaction(async (tx) => {
      await this.lockAssignment(tx, id);
      const dispute = await tx.dispute.create({
        data: {
          organizationId: assignment.organizationId,
          assignmentId: id,
          createdById: user.id,
          ...input,
          status: 'OPEN',
        },
      });
      await tx.wageRecord.updateMany({ where: { assignmentId: id }, data: { status: 'DISPUTED' } });
      await this.audit(tx, user.id, assignment.organizationId, 'dispute.open', id, {
        disputeId: dispute.id,
        category: input.category,
      });
      return dispute;
    });
  }

  async assignmentDisputes(user: AuthUser, id: string) {
    await this.accessibleAssignment(user, id);
    return this.db.dispute.findMany({
      where: { assignmentId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async noShow(user: AuthUser, id: string, reason: string) {
    const assignment = await this.accessibleAssignment(user, id);
    await this.permissions.requireOrg(
      user.id,
      assignment.organizationId,
      'attendance.approve',
      assignment.shift.branchId,
    );
    const grace = Number(process.env.NO_SHOW_GRACE_MINUTES ?? 15);
    if (!Number.isFinite(grace) || grace < 0 || grace > 180)
      throw new BadRequestException('No-show siyosati noto‘g‘ri');
    return this.db.$transaction(async (tx) => {
      await this.lockAssignment(tx, id);
      const current = await tx.assignment.findUniqueOrThrow({ where: { id } });
      if (current.status !== 'CONFIRMED' || Date.now() < current.startAt.getTime() + grace * 60_000)
        throw new ConflictException('No-show grace muddati yoki assignment holati mos emas');
      const result = await tx.assignment.update({
        where: { id },
        data: { status: 'NO_SHOW', version: { increment: 1 } },
      });
      await tx.activeBooking.deleteMany({ where: { assignmentId: id } });
      await tx.attendanceEvent.create({
        data: {
          organizationId: current.organizationId,
          assignmentId: id,
          actorId: user.id,
          kind: 'NO_SHOW',
          method: 'MANUAL',
          reason,
        },
      });
      await this.audit(
        tx,
        user.id,
        current.organizationId,
        'attendance.no-show',
        id,
        { graceMinutes: grace },
        reason,
      );
      await this.notify(
        tx,
        current.workerId,
        'NO_SHOW',
        'Kelmagan deb belgilandingiz',
        'Nizo ochish orqali e’tiroz bildirishingiz mumkin.',
        id,
      );
      await synchronizeShiftLifecycle(tx, current.shiftId, {
        actorId: user.id,
        trigger: 'attendance.no-show',
        reason,
      });
      return result;
    });
  }

  async earlyCloseShift(user: AuthUser, organizationId: string, shiftId: string, reason: string) {
    const shift = await this.db.shift.findFirst({ where: { id: shiftId, organizationId } });
    if (!shift) throw new NotFoundException();
    await this.permissions.requireOrg(
      user.id,
      organizationId,
      'attendance.approve',
      shift.branchId,
    );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id = ${shiftId}::uuid FOR UPDATE`;
      const current = await tx.shift.findUniqueOrThrow({ where: { id: shiftId } });
      if (!['PUBLISHED', 'IN_PROGRESS'].includes(current.status) || current.startAt > new Date())
        throw new ConflictException('Boshlangan faol smena talab qilinadi');
      const assignments = await tx.assignment.findMany({
        where: { shiftId, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
        orderBy: { id: 'asc' },
      });
      const now = new Date();
      for (const assignment of assignments) {
        if (assignment.status === 'CHECKED_IN') {
          const sheet = await tx.timesheet.findUniqueOrThrow({
            where: { assignmentId: assignment.id },
          });
          const calculation = calculateWage({
            startedAt: sheet.startedAt,
            endedAt: now,
            breakMinutes: sheet.breakMinutes,
            scheduledStart: assignment.startAt,
            scheduledEnd: assignment.endAt,
            payType: sheet.payType,
            rateMinor: sheet.rateMinor,
          });
          await tx.attendanceEvent.create({
            data: {
              organizationId,
              assignmentId: assignment.id,
              actorId: user.id,
              kind: 'CHECK_OUT',
              method: 'MANUAL',
              recordedAt: now,
              reason,
            },
          });
          await tx.timesheet.update({
            where: { id: sheet.id },
            data: {
              endedAt: now,
              paidMinutes: calculation.paidMinutes,
              status: 'PENDING_APPROVAL',
              version: { increment: 1 },
            },
          });
          await tx.wageRecord.create({
            data: {
              organizationId,
              assignmentId: assignment.id,
              timesheetId: sheet.id,
              amountMinor: calculation.amountMinor,
              status: 'CALCULATED',
              snapshot: {
                startedAt: sheet.startedAt.toISOString(),
                endedAt: now.toISOString(),
                rateMinor: sheet.rateMinor.toString(),
                payType: sheet.payType,
                paidMinutes: calculation.paidMinutes,
                breakMinutes: sheet.breakMinutes,
                earlyClose: true,
                reason,
              },
            },
          });
          await tx.assignment.update({
            where: { id: assignment.id },
            data: { status: 'CHECKED_OUT', version: { increment: 1 } },
          });
        } else {
          await tx.assignment.update({
            where: { id: assignment.id },
            data: {
              status: 'CANCELLED_BY_EMPLOYER',
              cancelledAt: now,
              cancelledById: user.id,
              cancellationReason: reason,
              version: { increment: 1 },
            },
          });
        }
        await tx.attendanceToken.updateMany({
          where: { assignmentId: assignment.id, usedAt: null },
          data: { usedAt: now },
        });
        await this.notify(
          tx,
          assignment.workerId,
          'SHIFT_EARLY_CLOSED',
          'Smena muddatidan oldin yopildi',
          'Davomat va hisobni tekshiring. E’tirozingiz bo‘lsa nizo oching.',
          assignment.id,
        );
      }
      await tx.activeBooking.deleteMany({ where: { shiftId } });
      await tx.shiftOffer.updateMany({
        where: { shiftId, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });
      await tx.shiftApplication.updateMany({
        where: { shiftId, status: { in: ['SUBMITTED', 'SHORTLISTED', 'OFFERED'] } },
        data: { status: 'EXPIRED' },
      });
      await this.audit(
        tx,
        user.id,
        organizationId,
        'shift.early-close',
        shiftId,
        {
          actualClosedAt: now.toISOString(),
          originalStartAt: current.startAt.toISOString(),
          originalEndAt: current.endAt.toISOString(),
          affectedAssignments: assignments.length,
        },
        reason,
      );
      let lifecycle = await synchronizeShiftLifecycle(tx, shiftId, {
        actorId: user.id,
        trigger: 'shift.early-close',
        reason,
        now,
      });
      // The audited early-close decision also resolves an empty shift before its scheduled end.
      if (lifecycle.status === 'IN_PROGRESS')
        lifecycle = await transitionShift(tx, lifecycle, 'COMPLETED', {
          actorId: user.id,
          trigger: 'shift.early-close',
          reason,
          now,
        });
      return lifecycle;
    });
  }

  async closeShift(user: AuthUser, organizationId: string, shiftId: string, reason: string) {
    const shift = await this.db.shift.findFirst({ where: { id: shiftId, organizationId } });
    if (!shift) throw new NotFoundException();
    await this.permissions.requireOrg(
      user.id,
      organizationId,
      'attendance.approve',
      shift.branchId,
    );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id = ${shiftId}::uuid FOR UPDATE`;
      const current = await synchronizeShiftLifecycle(tx, shiftId, {
        actorId: user.id,
        trigger: 'shift.close',
        reason,
      });
      if (current.status === 'CLOSED') return current;
      if (current.status !== 'COMPLETED')
        throw new ConflictException('Davomat yakunlanmagan yoki smena hali boshlanmagan');
      const assignments = await tx.assignment.findMany({
        where: { shiftId },
        include: { timesheet: true, wage: true },
      });
      const pending = assignments.some(
        (assignment) =>
          ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(assignment.status) ||
          (assignment.timesheet && assignment.timesheet.status !== 'APPROVED') ||
          (assignment.status === 'COMPLETED' &&
            (!assignment.timesheet ||
              !assignment.wage ||
              ['CALCULATED', 'DISPUTED'].includes(assignment.wage.status))),
      );
      if (pending)
        throw new ConflictException(
          'Barcha ishlangan timesheetlar ishchi va menejer tomonidan tasdiqlanishi kerak',
        );
      if (
        await tx.dispute.count({
          where: {
            organizationId,
            assignmentId: { in: assignments.map((assignment) => assignment.id) },
            status: 'OPEN',
          },
        })
      )
        throw new ConflictException('Avval ochiq nizolar ko‘rib chiqilsin');
      await tx.activeBooking.deleteMany({ where: { shiftId } });
      await tx.attendanceToken.updateMany({
        where: {
          assignmentId: { in: assignments.map((assignment) => assignment.id) },
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      return transitionShift(tx, current, 'CLOSED', {
        actorId: user.id,
        trigger: 'shift.close',
        reason,
      });
    });
  }

  async review(user: AuthUser, id: string, input: ReviewDto) {
    const assignment = await this.accessibleAssignment(user, id, 'application.review');
    if (assignment.status !== 'COMPLETED')
      throw new ConflictException('Sharh faqat yakunlangan smena uchun');
    const side = assignment.workerId === user.id ? 'WORKER' : 'EMPLOYER';
    const existing = await this.db.review.findUnique({
      where: { assignmentId_side: { assignmentId: id, side } },
    });
    if (existing) throw new ConflictException('Sharh allaqachon qoldirilgan');
    return this.db.review.create({
      data: {
        organizationId: assignment.organizationId,
        assignmentId: id,
        authorId: user.id,
        side,
        ...input,
        status: 'PUBLISHED',
      },
    });
  }

  async reportReview(user: AuthUser, id: string, reason: string) {
    const review = await this.db.review.findUniqueOrThrow({ where: { id } });
    await this.accessibleAssignment(user, review.assignmentId, 'application.review');
    return this.db.$transaction(async (tx) => {
      await this.audit(tx, user.id, review.organizationId, 'review.report', id, {}, reason);
      return tx.review.update({ where: { id }, data: { status: 'REPORTED' } });
    });
  }

  async reportMessage(user: AuthUser, id: string, reason: string) {
    const message = await this.db.message.findUniqueOrThrow({
      where: { id },
      include: { conversation: true },
    });
    await this.accessibleAssignment(user, message.conversation.assignmentId, 'application.review');
    return this.db.$transaction(async (tx) => {
      await this.audit(tx, user.id, message.organizationId, 'message.report', id, {}, reason);
      return tx.message.update({ where: { id }, data: { reportedAt: new Date() } });
    });
  }

  private async conversation(user: AuthUser, id: string) {
    const assignment = await this.accessibleAssignment(user, id, 'application.review');
    const conversation = await this.db.conversation.upsert({
      where: { assignmentId: id },
      create: { organizationId: assignment.organizationId, assignmentId: id },
      update: {},
    });
    await this.db.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: conversation.id, userId: user.id } },
      create: { conversationId: conversation.id, userId: user.id },
      update: {},
    });
    return { assignment, conversation };
  }

  async messages(user: AuthUser, id: string) {
    const { conversation } = await this.conversation(user, id);
    await this.db.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: conversation.id, userId: user.id } },
      data: { lastReadAt: new Date() },
    });
    return this.db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  async sendMessage(user: AuthUser, id: string, text: string) {
    const { assignment, conversation } = await this.conversation(user, id);
    const count = await this.db.message.count({
      where: { senderId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } },
    });
    if (count >= 20) throw new ConflictException('Bir daqiqada 20 ta xabar chegarasi');
    const clean = [...text]
      .filter(
        (character) =>
          character.charCodeAt(0) >= 32 || [9, 10, 13].includes(character.charCodeAt(0)),
      )
      .join('')
      .trim();
    if (!clean) throw new BadRequestException('Xabar bo‘sh');
    return this.db.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          organizationId: assignment.organizationId,
          conversationId: conversation.id,
          senderId: user.id,
          text: clean,
        },
      });
      const participants = await tx.conversationParticipant.findMany({
        where: { conversationId: conversation.id, userId: { not: user.id } },
      });
      for (const participant of participants)
        await this.notify(
          tx,
          participant.userId,
          'MESSAGE',
          'Yangi xabar',
          'Smena suhbatida yangi xabar bor.',
          id,
        );
      if (
        assignment.workerId !== user.id &&
        !participants.some((p) => p.userId === assignment.workerId)
      )
        await this.notify(
          tx,
          assignment.workerId,
          'MESSAGE',
          'Yangi xabar',
          'Smena suhbatida yangi xabar bor.',
          id,
        );
      return message;
    });
  }

  notifications(user: AuthUser) {
    return this.db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async readNotification(user: AuthUser, id: string) {
    const result = await this.db.notification.updateMany({
      where: { id, userId: user.id },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException();
    return { ok: true };
  }
  support(user: AuthUser) {
    return this.db.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  createSupport(user: AuthUser, input: SupportDto) {
    return this.db.supportTicket.create({ data: { userId: user.id, ...input, status: 'OPEN' } });
  }

  async adminQueue(user: AuthUser) {
    const [verifications, disputes, tickets] = await Promise.all([
      user.platformPermissions.includes('verification.review')
        ? this.db.verificationRequest.findMany({
            where: { status: 'PENDING' },
            take: 100,
            orderBy: { createdAt: 'asc' },
          })
        : [],
      user.platformPermissions.includes('dispute.resolve')
        ? this.db.dispute.findMany({
            where: { status: 'OPEN' },
            take: 100,
            orderBy: { createdAt: 'asc' },
          })
        : [],
      user.platformPermissions.includes('support.manage')
        ? this.db.supportTicket.findMany({
            where: { status: 'OPEN' },
            take: 100,
            orderBy: { createdAt: 'asc' },
          })
        : [],
    ]);
    if (
      !user.platformPermissions.some((p) =>
        ['verification.review', 'dispute.resolve', 'support.manage'].includes(p),
      )
    )
      throw new ForbiddenException();
    return { verifications, disputes, tickets };
  }

  async verify(user: AuthUser, id: string, input: VerificationReviewDto) {
    this.permissions.requirePlatform(user, 'verification.review');
    return this.db.$transaction(async (tx) => {
      let request = await tx.verificationRequest.findUniqueOrThrow({ where: { id } });
      if (request.subjectType === 'ORGANIZATION') {
        // Identity edits and review share this lock; an old request cannot approve edited data.
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${request.subjectId}::uuid FOR UPDATE`;
        request = await tx.verificationRequest.findUniqueOrThrow({ where: { id } });
      }
      if (request.status !== 'PENDING') throw new ConflictException('So‘rov ko‘rib chiqilgan');
      if (request.subjectType === 'WORKER')
        await tx.workerProfile.update({
          where: { id: request.subjectId },
          data: { verificationStatus: input.status },
        });
      else if (request.subjectType === 'ORGANIZATION')
        await tx.organization.update({
          where: { id: request.subjectId },
          data: { verificationStatus: input.status },
        });
      else throw new BadRequestException('Verifikatsiya turi qo‘llanmaydi');
      const result = await tx.verificationRequest.update({
        where: { id },
        data: {
          status: input.status,
          notes: input.reason,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });
      await this.audit(
        tx,
        user.id,
        request.organizationId,
        'verification.review',
        id,
        { subjectType: request.subjectType, status: input.status },
        input.reason,
      );
      await this.notify(
        tx,
        request.submittedById,
        'VERIFICATION',
        'Verifikatsiya ko‘rib chiqildi',
        input.status === 'VERIFIED'
          ? 'Tekshiruv tasdiqlandi.'
          : 'Tekshiruv rad etildi. Izohni ko‘ring.',
        id,
      );
      return result;
    });
  }

  async pendingSkills(user: AuthUser) {
    this.permissions.requirePlatform(user, 'verification.review');
    return this.db.workerSkill.findMany({
      where: { status: 'PENDING' },
      include: {
        skill: true,
        workerProfile: {
          select: { id: true, userId: true, user: { select: { id: true, name: true } } },
        },
      },
      take: 100,
    });
  }

  async verifySkill(user: AuthUser, id: string, input: VerificationReviewDto) {
    this.permissions.requirePlatform(user, 'verification.review');
    return this.db.$transaction(async (tx) => {
      const skill = await tx.workerSkill.update({
        where: { id },
        data: { status: input.status, verifiedById: user.id, verifiedAt: new Date() },
        include: { workerProfile: { select: { userId: true } } },
      });
      await tx.verificationRequest.create({
        data: {
          subjectType: 'WORKER_SKILL',
          subjectId: id,
          submittedById: skill.workerProfile.userId,
          status: input.status,
          notes: input.reason,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });
      await this.audit(
        tx,
        user.id,
        null,
        'worker-skill.verify',
        id,
        { skillId: skill.skillId, status: input.status },
        input.reason,
      );
      await this.notify(
        tx,
        skill.workerProfile.userId,
        'VERIFICATION',
        'Ko‘nikma tekshiruvi yakunlandi',
        'Profilingizda ko‘nikma holatini ko‘ring.',
        id,
      );
      return skill;
    });
  }

  async resolveDispute(user: AuthUser, id: string, resolution: string) {
    this.permissions.requirePlatform(user, 'dispute.resolve');
    return this.db.$transaction(async (tx) => {
      const original = await tx.dispute.findUniqueOrThrow({ where: { id } });
      await this.lockAssignment(tx, original.assignmentId);
      const dispute = await tx.dispute.update({
        where: { id },
        data: { status: 'RESOLVED', resolution, resolvedById: user.id },
      });
      if (
        !(await tx.dispute.count({ where: { assignmentId: dispute.assignmentId, status: 'OPEN' } }))
      ) {
        const wage = await tx.wageRecord.findUnique({
          where: { assignmentId: dispute.assignmentId },
        });
        const sheet = await tx.timesheet.findUnique({
          where: { assignmentId: dispute.assignmentId },
        });
        if (wage?.status === 'DISPUTED')
          await tx.wageRecord.update({
            where: { id: wage.id },
            data: {
              status: wage.workerConfirmedAt
                ? 'WORKER_CONFIRMED'
                : wage.employerMarkedPaidAt
                  ? 'EMPLOYER_MARKED_PAID'
                  : sheet?.status === 'APPROVED'
                    ? 'APPROVED'
                    : 'CALCULATED',
            },
          });
      }
      await this.audit(tx, user.id, dispute.organizationId, 'dispute.resolve', id, {}, resolution);
      return dispute;
    });
  }

  async resolveSupport(user: AuthUser, id: string, resolution: string) {
    this.permissions.requirePlatform(user, 'support.manage');
    return this.db.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.update({
        where: { id },
        data: { status: 'RESOLVED', resolution },
      });
      await this.audit(tx, user.id, ticket.organizationId, 'support.resolve', id, {}, resolution);
      return ticket;
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    organizationId: string | null,
    action: string,
    resourceId: string,
    metadata: Prisma.InputJsonValue,
    reason?: string,
  ) {
    return tx.auditLog.create({
      data: { actorId, organizationId, action, resourceId, metadata, reason },
    });
  }
  private async lockAssignment(tx: Prisma.TransactionClient, id: string) {
    const assignment = await tx.assignment.findUniqueOrThrow({
      where: { id },
      select: { shiftId: true },
    });
    // Same lock order as booking/cancellation: shift before assignment.
    await tx.$queryRaw`SELECT id FROM "Shift" WHERE id = ${assignment.shiftId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Assignment" WHERE id = ${id}::uuid FOR UPDATE`;
  }
  private async notify(
    tx: Prisma.TransactionClient,
    userId: string,
    type: string,
    title: string,
    body: string,
    resourceId: string,
  ) {
    const notification = await tx.notification.create({
      data: { userId, type, title, body, resourceId },
    });
    await tx.outboxEvent.create({
      data: {
        type: 'notification.created',
        aggregateId: notification.id,
        dedupeKey: `notification:${notification.id}`,
        payload: { notificationId: notification.id, userId, type, resourceId },
      },
    });
  }
}
