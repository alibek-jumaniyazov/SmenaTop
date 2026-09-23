import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Shift } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions.service';
import type { AuthUser } from '../auth/current-user';
import { hash } from '../auth/auth.guard';
import { iso, uuid } from '../common/validation';
import { synchronizeShiftLifecycle } from '../operations/shift-lifecycle';
export const shiftSchema = z
  .object({
    branchId: uuid,
    categoryId: uuid,
    title: z.string().trim().min(3).max(150),
    description: z.string().min(10).max(5000),
    duties: z.array(z.string().max(300)).max(20).default([]),
    requirements: z.array(z.string().max(300)).max(20).default([]),
    requiredSkillIds: z.array(uuid).max(20).default([]),
    startAt: iso,
    endAt: iso,
    breakMinutes: z.number().int().min(0).max(720).default(0),
    paidBreak: z.boolean().default(false),
    headcount: z.number().int().min(1).max(500),
    amountMinor: z.string().regex(/^\d{1,14}$/),
    payType: z.enum(['HOURLY', 'FIXED']),
    clothing: z.string().max(1000).default(''),
    mealProvided: z.boolean().default(false),
    transportProvided: z.boolean().default(false),
    applyDeadline: iso.optional(),
  })
  .strict();
export const shiftPatchSchema = shiftSchema.partial().extend({
  duties: shiftSchema.shape.duties.removeDefault().optional(),
  requirements: shiftSchema.shape.requirements.removeDefault().optional(),
  requiredSkillIds: shiftSchema.shape.requiredSkillIds.removeDefault().optional(),
  breakMinutes: shiftSchema.shape.breakMinutes.removeDefault().optional(),
  paidBreak: shiftSchema.shape.paidBreak.removeDefault().optional(),
  clothing: shiftSchema.shape.clothing.removeDefault().optional(),
  mealProvided: shiftSchema.shape.mealProvided.removeDefault().optional(),
  transportProvided: shiftSchema.shape.transportProvided.removeDefault().optional(),
  version: z.number().int().positive(),
});
const activeStatuses = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'];
const publicInclude = {
  organization: { select: { id: true, name: true, verificationStatus: true, synthetic: true } },
  branch: { select: { id: true, name: true, area: true } },
  city: true,
  category: true,
  _count: { select: { assignments: { where: { status: { in: activeStatuses } } } } },
} satisfies Prisma.ShiftInclude;
const withStaffing = <T extends Shift & { _count: { assignments: number } }>(shift: T) => ({
  ...shift,
  filledCount: shift._count.assignments,
  staffingStatus:
    shift._count.assignments >= shift.headcount
      ? 'FILLED'
      : shift._count.assignments
        ? 'PARTIALLY_FILLED'
        : 'OPEN',
});
@Injectable()
export class ShiftsService {
  constructor(
    private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}
  async search(input: {
    cityId?: string;
    categoryId?: string;
    q?: string;
    page: number;
    pageSize: number;
    sort?: string;
  }) {
    const where: Prisma.ShiftWhereInput = {
      status: 'PUBLISHED',
      startAt: { gt: new Date() },
      organization: { status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      ...(input.cityId ? { cityId: input.cityId } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.q
        ? {
            OR: [
              { title: { contains: input.q, mode: 'insensitive' } },
              { description: { contains: input.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.shift.findMany({
        where,
        include: publicInclude,
        orderBy: input.sort === 'pay' ? { amountMinor: 'desc' } : { startAt: 'asc' },
        take: input.pageSize,
        skip: (input.page - 1) * input.pageSize,
      }),
      this.db.shift.count({ where }),
    ]);
    return { items: items.map(withStaffing), total, page: input.page, pageSize: input.pageSize };
  }
  async detail(id: string) {
    const shift = await this.db.shift.findFirst({
      where: {
        id,
        status: { in: ['PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'] },
        organization: { status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      },
      include: publicInclude,
    });
    if (!shift) throw new NotFoundException('Smena topilmadi');
    return withStaffing(shift);
  }
  async organizationShifts(user: AuthUser, organizationId: string) {
    const { member, permissions } = await this.permissions.permissions(user.id, organizationId);
    if (!permissions.includes('shift.read')) throw new ForbiddenException();
    const items = await this.db.shift.findMany({
      where: {
        organizationId,
        ...(member.role === 'MANAGER' || member.branchIds.length
          ? { branchId: { in: member.branchIds } }
          : {}),
      },
      include: publicInclude,
      orderBy: { startAt: 'asc' },
      take: 200,
    });
    return { items: items.map(withStaffing), total: items.length };
  }
  validate(
    shift: Pick<
      Shift,
      'startAt' | 'endAt' | 'breakMinutes' | 'headcount' | 'amountMinor' | 'applyDeadline'
    >,
  ) {
    if (
      shift.endAt <= shift.startAt ||
      shift.breakMinutes * 60000 >= shift.endAt.getTime() - shift.startAt.getTime() ||
      shift.headcount < 1 ||
      shift.amountMinor < 0n ||
      shift.applyDeadline > shift.startAt
    )
      throw new ConflictException('SHIFT_INVARIANT');
    if (shift.endAt.getTime() - shift.startAt.getTime() > 86400000)
      throw new ConflictException('Shift must not exceed 24 hours');
  }
  async create(user: AuthUser, organizationId: string, input: z.infer<typeof shiftSchema>) {
    await this.permissions.requireOrg(user.id, organizationId, 'shift.create', input.branchId);
    const branch = await this.db.branch.findFirst({
      where: { id: input.branchId, organizationId, active: true },
    });
    if (!branch) throw new ForbiddenException('Filial topilmadi');
    const data = {
      ...input,
      organizationId,
      cityId: branch.cityId,
      amountMinor: BigInt(input.amountMinor),
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      applyDeadline: new Date(input.applyDeadline ?? input.startAt),
    };
    this.validate(data);
    return this.db.shift.create({ data, include: publicInclude });
  }
  async patch(
    user: AuthUser,
    organizationId: string,
    id: string,
    input: z.infer<typeof shiftPatchSchema>,
  ) {
    const current = await this.db.shift.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException();
    await this.permissions.requireOrg(user.id, organizationId, 'shift.create', current.branchId);
    if (input.branchId && input.branchId !== current.branchId)
      await this.permissions.requireOrg(user.id, organizationId, 'shift.create', input.branchId);
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${id}::uuid FOR UPDATE`;
      const shift = await tx.shift.findUniqueOrThrow({ where: { id } });
      if (shift.version !== input.version) throw new ConflictException('VERSION_CONFLICT');
      if (!['DRAFT', 'PUBLISHED'].includes(shift.status))
        throw new ConflictException('SHIFT_LOCKED');
      const count = await tx.assignment.count({
        where: { shiftId: id, status: { in: activeStatuses } },
      });
      const { version: _version, ...changes } = input;
      const critical = Object.keys(changes).filter((k) => k !== 'headcount');
      if (count && critical.length) throw new ConflictException('CONFIRMED_TERMS_LOCKED');
      if (input.headcount !== undefined && input.headcount < count)
        throw new ConflictException('HEADCOUNT_BELOW_CONFIRMED');
      const branch = input.branchId
        ? await tx.branch.findFirst({ where: { id: input.branchId, organizationId, active: true } })
        : null;
      if (input.branchId && !branch) throw new ForbiddenException('Branch scope');
      const data = {
        ...changes,
        ...(branch ? { cityId: branch.cityId } : {}),
        ...(input.amountMinor !== undefined ? { amountMinor: BigInt(input.amountMinor) } : {}),
        ...(input.startAt ? { startAt: new Date(input.startAt) } : {}),
        ...(input.endAt ? { endAt: new Date(input.endAt) } : {}),
        ...(input.applyDeadline ? { applyDeadline: new Date(input.applyDeadline) } : {}),
      };
      this.validate({ ...shift, ...data } as Shift);
      return tx.shift.update({
        where: { id },
        data: { ...data, version: { increment: 1 } } as Prisma.ShiftUncheckedUpdateInput,
      });
    });
  }
  async publish(user: AuthUser, organizationId: string, id: string) {
    const shift = await this.db.shift.findFirst({ where: { id, organizationId } });
    if (!shift) throw new NotFoundException();
    await this.permissions.requireOrg(user.id, organizationId, 'shift.publish', shift.branchId);
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${organizationId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.shift.findUniqueOrThrow({
        where: { id },
        include: { organization: true },
      });
      if (current.status === 'PUBLISHED') return current;
      if (current.status !== 'DRAFT' || current.startAt <= new Date())
        throw new ConflictException('SHIFT_NOT_PUBLISHABLE');
      if (
        current.organization.verificationStatus !== 'VERIFIED' ||
        current.organization.status !== 'ACTIVE'
      )
        throw new ForbiddenException('ORGANIZATION_VERIFICATION_REQUIRED');
      const entitlement = await tx.entitlement.findFirst({
        where: {
          organizationId,
          startsAt: { lte: new Date() },
          endsAt: { gt: new Date() },
          revokedAt: null,
        },
        include: { planVersion: true },
        orderBy: { startsAt: 'desc' },
      });
      if (!entitlement) throw new ForbiddenException('SUBSCRIPTION_EXPIRED');
      const usage = await tx.usageCounter.upsert({
        where: { organizationId_periodKey: { organizationId, periodKey: entitlement.id } },
        create: { organizationId, periodKey: entitlement.id, entitlementId: entitlement.id },
        update: {},
      });
      if (usage.publishedCount >= entitlement.planVersion.publishLimit)
        throw new ConflictException('PUBLISH_QUOTA_EXCEEDED');
      await tx.usageCounter.update({
        where: { id: usage.id },
        data: { publishedCount: { increment: 1 } },
      });
      const result = await tx.shift.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), version: { increment: 1 } },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'shift.published',
          aggregateId: id,
          organizationId,
          payload: { shiftId: id },
          dedupeKey: `shift.published:${id}`,
        },
      });
      return result;
    });
  }
  async apply(user: AuthUser, shiftId: string, note: string) {
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${shiftId}::uuid FOR UPDATE`;
      const shift = await tx.shift.findUnique({
        where: { id: shiftId },
        include: { organization: true },
      });
      if (
        !shift ||
        shift.status !== 'PUBLISHED' ||
        shift.applyDeadline <= new Date() ||
        shift.startAt <= new Date()
      )
        throw new ConflictException('APPLICATIONS_CLOSED');
      await this.checkWorker(tx, user.id, shift);
      const existing = await tx.shiftApplication.findUnique({
        where: { shiftId_workerId: { shiftId, workerId: user.id } },
      });
      if (existing && ['SUBMITTED', 'SHORTLISTED', 'OFFERED', 'ACCEPTED'].includes(existing.status))
        return existing;
      const application = await tx.shiftApplication.upsert({
        where: { shiftId_workerId: { shiftId, workerId: user.id } },
        create: { shiftId, organizationId: shift.organizationId, workerId: user.id, note },
        update: { status: 'SUBMITTED', note },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'application.submitted',
          aggregateId: application.id,
          organizationId: shift.organizationId,
          payload: { applicationId: application.id, workerId: user.id, shiftId },
        },
      });
      return application;
    });
  }
  private async checkWorker(tx: Prisma.TransactionClient, workerId: string, shift: Shift) {
    const [user, organization] = await Promise.all([
      tx.user.findUnique({
        where: { id: workerId },
        include: { workerProfile: { include: { skills: true } } },
      }),
      tx.organization.findUnique({ where: { id: shift.organizationId } }),
    ]);
    if (
      user?.status !== 'ACTIVE' ||
      !user.workerProfile?.adultConfirmed ||
      user.workerProfile.verificationStatus !== 'VERIFIED' ||
      organization?.status !== 'ACTIVE' ||
      organization.verificationStatus !== 'VERIFIED'
    )
      throw new ForbiddenException('VERIFICATION_REQUIRED');
    if (
      shift.requiredSkillIds.some(
        (id) =>
          !user.workerProfile!.skills.some(
            (skill) => skill.skillId === id && skill.status === 'VERIFIED',
          ),
      )
    )
      throw new ForbiddenException('VERIFIED_SKILLS_REQUIRED');
  }
  async workerApplications(user: AuthUser) {
    return {
      items: await this.db.shiftApplication.findMany({
        where: { workerId: user.id },
        include: { shift: { include: publicInclude }, offers: { orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  }
  async organizationApplications(user: AuthUser, organizationId: string) {
    const { member, permissions } = await this.permissions.permissions(user.id, organizationId);
    if (!permissions.includes('application.review')) throw new ForbiddenException();
    return {
      items: await this.db.shiftApplication.findMany({
        where: {
          organizationId,
          ...(member.role === 'MANAGER' || member.branchIds.length
            ? { shift: { branchId: { in: member.branchIds } } }
            : {}),
        },
        include: {
          shift: { include: publicInclude },
          offers: true,
          worker: {
            select: {
              id: true,
              name: true,
              workerProfile: {
                select: {
                  cityId: true,
                  categoryIds: true,
                  verificationStatus: true,
                  experience: true,
                  languages: true,
                  skills: {
                    select: {
                      id: true,
                      skillId: true,
                      status: true,
                      verifiedAt: true,
                      skill: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    };
  }
  async offer(user: AuthUser, applicationId: string, expiresAt: string) {
    const app = await this.db.shiftApplication.findUnique({
      where: { id: applicationId },
      include: { shift: true },
    });
    if (!app) throw new NotFoundException();
    await this.permissions.requireOrg(
      user.id,
      app.organizationId,
      'application.review',
      app.shift.branchId,
    );
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${app.shiftId}::uuid FOR UPDATE`;
      const current = await tx.shiftApplication.findUniqueOrThrow({
        where: { id: applicationId },
        include: { shift: true },
      });
      if (
        !['SUBMITTED', 'SHORTLISTED', 'OFFERED'].includes(current.status) ||
        current.shift.status !== 'PUBLISHED'
      )
        throw new ConflictException('APPLICATION_NOT_OFFERABLE');
      const expiry = new Date(expiresAt);
      if (expiry <= new Date() || expiry > current.shift.startAt)
        throw new ConflictException('OFFER_EXPIRY_INVALID');
      const existing = await tx.shiftOffer.findFirst({
        where: { applicationId, status: 'PENDING', expiresAt: { gt: new Date() } },
      });
      if (existing) return existing;
      await tx.shiftOffer.updateMany({
        where: { applicationId, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      const offer = await tx.shiftOffer.create({
        data: {
          applicationId,
          organizationId: current.organizationId,
          shiftId: current.shiftId,
          workerId: current.workerId,
          expiresAt: expiry,
          createdById: user.id,
        },
      });
      await tx.shiftApplication.update({
        where: { id: applicationId },
        data: { status: 'OFFERED' },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'offer.created',
          aggregateId: offer.id,
          organizationId: offer.organizationId,
          payload: { workerId: offer.workerId, offerId: offer.id, shiftId: offer.shiftId },
        },
      });
      return offer;
    });
  }
  async accept(user: AuthUser, offerId: string, key: string) {
    if (!key || key.length > 100) throw new ConflictException('IDEMPOTENCY_KEY_REQUIRED');
    const payloadHash = hash(offerId);
    try {
      return await this.db.atomic(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`accept:${user.id}:${key}`},0))`;
        const cached = await tx.idempotencyRecord.findUnique({
          where: { actorId_operation_key: { actorId: user.id, operation: 'offer.accept', key } },
        });
        if (cached) {
          if (cached.payloadHash !== payloadHash)
            throw new ConflictException('IDEMPOTENCY_PAYLOAD_MISMATCH');
          return cached.result;
        }
        const offer = await tx.shiftOffer.findUnique({ where: { id: offerId } });
        if (!offer || offer.workerId !== user.id) throw new NotFoundException();
        await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${offer.shiftId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR UPDATE`;
        const current = await tx.shiftOffer.findUniqueOrThrow({
          where: { id: offerId },
          include: { application: true, shift: true },
        });
        const existing = await tx.assignment.findUnique({ where: { offerId } });
        if (existing && current.status === 'ACCEPTED') {
          await tx.idempotencyRecord.create({
            data: {
              actorId: user.id,
              operation: 'offer.accept',
              key,
              payloadHash,
              result: JSON.parse(JSON.stringify(existing)) as Prisma.InputJsonValue,
            },
          });
          return existing;
        }
        if (
          current.status !== 'PENDING' ||
          current.expiresAt <= new Date() ||
          current.application.status !== 'OFFERED' ||
          current.shift.status !== 'PUBLISHED' ||
          current.shift.startAt <= new Date()
        )
          throw new ConflictException('OFFER_NO_LONGER_ACCEPTABLE');
        await this.checkWorker(tx, user.id, current.shift);
        const count = await tx.assignment.count({
          where: { shiftId: offer.shiftId, status: { in: activeStatuses } },
        });
        if (count >= current.shift.headcount) throw new ConflictException('SHIFT_FULL');
        const overlapping = await tx.activeBooking.findFirst({
          where: {
            workerId: user.id,
            startAt: { lt: current.shift.endAt },
            endAt: { gt: current.shift.startAt },
          },
        });
        if (overlapping) throw new ConflictException('WORKER_TIME_CONFLICT');
        const assignment = await tx.assignment.create({
          data: {
            organizationId: offer.organizationId,
            shiftId: offer.shiftId,
            workerId: user.id,
            offerId,
            status: 'CONFIRMED',
            startAt: current.shift.startAt,
            endAt: current.shift.endAt,
            policySnapshot: {
              version: current.shift.cancellationPolicyVersion,
              amountMinor: current.shift.amountMinor.toString(),
              payType: current.shift.payType,
              noAutomaticPenalty: true,
            },
          },
        });
        await tx.activeBooking.create({
          data: {
            organizationId: offer.organizationId,
            assignmentId: assignment.id,
            shiftId: offer.shiftId,
            workerId: user.id,
            startAt: assignment.startAt,
            endAt: assignment.endAt,
          },
        });
        await tx.shiftOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } });
        await tx.shiftApplication.update({
          where: { id: offer.applicationId },
          data: { status: 'ACCEPTED' },
        });
        const members = await tx.organizationMembership.findMany({
          where: {
            organizationId: offer.organizationId,
            status: 'ACTIVE',
            role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
          },
        });
        await tx.conversation.create({
          data: {
            organizationId: offer.organizationId,
            assignmentId: assignment.id,
            participants: {
              create: [
                { userId: user.id },
                ...members
                  .filter(
                    (m) =>
                      m.userId !== user.id &&
                      (m.role !== 'MANAGER' || m.branchIds.includes(current.shift.branchId)),
                  )
                  .map((m) => ({ userId: m.userId })),
              ],
            },
          },
        });
        await tx.outboxEvent.create({
          data: {
            type: 'assignment.confirmed',
            aggregateId: assignment.id,
            organizationId: offer.organizationId,
            payload: {
              assignmentId: assignment.id,
              workerId: user.id,
              shiftId: offer.shiftId,
              startAt: assignment.startAt.toISOString(),
            },
            dedupeKey: `assignment.confirmed:${assignment.id}`,
          },
        });
        const result = JSON.parse(JSON.stringify(assignment)) as Prisma.InputJsonValue;
        await tx.idempotencyRecord.create({
          data: { actorId: user.id, operation: 'offer.accept', key, payloadHash, result },
        });
        return assignment;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2004', 'P2010'].includes(error.code)
      )
        throw new ConflictException('BOOKING_CONFLICT');
      throw error;
    }
  }
  async withdraw(user: AuthUser, id: string) {
    const app = await this.db.shiftApplication.findFirst({ where: { id, workerId: user.id } });
    if (!app) throw new NotFoundException();
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${app.shiftId}::uuid FOR UPDATE`;
      const current = await tx.shiftApplication.findUniqueOrThrow({ where: { id } });
      if (current.status === 'ACCEPTED') throw new ConflictException('Cancel assignment instead');
      await tx.shiftOffer.updateMany({
        where: { applicationId: id, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });
      return tx.shiftApplication.update({ where: { id }, data: { status: 'WITHDRAWN' } });
    });
  }
  async revoke(user: AuthUser, id: string) {
    const offer = await this.db.shiftOffer.findUnique({ where: { id }, include: { shift: true } });
    if (!offer) throw new NotFoundException();
    await this.permissions.requireOrg(
      user.id,
      offer.organizationId,
      'application.review',
      offer.shift.branchId,
    );
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${offer.shiftId}::uuid FOR UPDATE`;
      const current = await tx.shiftOffer.findUniqueOrThrow({ where: { id } });
      if (current.status !== 'PENDING') throw new ConflictException('OFFER_NOT_PENDING');
      await tx.shiftOffer.update({ where: { id }, data: { status: 'REVOKED' } });
      return tx.shiftApplication.update({
        where: { id: offer.applicationId },
        data: { status: 'SUBMITTED' },
      });
    });
  }
  async reject(user: AuthUser, id: string) {
    const app = await this.db.shiftApplication.findUnique({
      where: { id },
      include: { shift: true },
    });
    if (!app) throw new NotFoundException();
    await this.permissions.requireOrg(
      user.id,
      app.organizationId,
      'application.review',
      app.shift.branchId,
    );
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${app.shiftId}::uuid FOR UPDATE`;
      const current = await tx.shiftApplication.findUniqueOrThrow({ where: { id } });
      if (current.status === 'ACCEPTED') throw new ConflictException('Assignment exists');
      await tx.shiftOffer.updateMany({
        where: { applicationId: id, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });
      return tx.shiftApplication.update({ where: { id }, data: { status: 'REJECTED' } });
    });
  }
  async assignments(user: AuthUser, organizationId?: string) {
    let where: Prisma.AssignmentWhereInput = { workerId: user.id };
    if (organizationId) {
      const { member, permissions } = await this.permissions.permissions(user.id, organizationId);
      if (!permissions.includes('shift.read')) throw new ForbiddenException();
      where = {
        organizationId,
        ...(member.role === 'MANAGER' || member.branchIds.length
          ? { shift: { branchId: { in: member.branchIds } } }
          : {}),
      };
    }
    const items = await this.db.assignment.findMany({
      where,
      include: {
        shift: {
          include: {
            ...publicInclude,
            branch: { select: { id: true, name: true, area: true, address: true } },
          },
        },
        worker: { select: { id: true, name: true } },
        timesheet: true,
        wage: true,
      },
      orderBy: { startAt: 'asc' },
      take: 200,
    });
    return {
      items: items.map((item) => ({
        ...item,
        shift: {
          ...item.shift,
          branch: {
            ...item.shift.branch,
            address:
              organizationId || activeStatuses.includes(item.status)
                ? item.shift.branch.address
                : undefined,
          },
        },
      })),
    };
  }
  async cancelAssignment(user: AuthUser, id: string, reason: string) {
    const assignment = await this.db.assignment.findUnique({
      where: { id },
      include: { shift: true },
    });
    if (!assignment) throw new NotFoundException();
    const worker = assignment.workerId === user.id;
    if (!worker)
      await this.permissions.requireOrg(
        user.id,
        assignment.organizationId,
        'application.review',
        assignment.shift.branchId,
      );
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${assignment.shiftId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${assignment.workerId}::uuid FOR UPDATE`;
      const current = await tx.assignment.findUniqueOrThrow({ where: { id } });
      if (current.status.startsWith('CANCELLED')) return current;
      if (current.status !== 'CONFIRMED')
        throw new ConflictException('Attendance exists: audited early close required');
      await tx.activeBooking.deleteMany({ where: { assignmentId: id } });
      await tx.shiftApplication.updateMany({
        where: { shiftId: assignment.shiftId, workerId: assignment.workerId, status: 'ACCEPTED' },
        data: { status: worker ? 'WITHDRAWN' : 'REJECTED' },
      });
      await tx.attendanceToken.updateMany({
        where: { assignmentId: id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          organizationId: assignment.organizationId,
          action: 'assignment.cancel',
          resourceId: id,
          reason,
          metadata: { policyVersion: assignment.shift.cancellationPolicyVersion },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'assignment.cancelled',
          aggregateId: id,
          organizationId: assignment.organizationId,
          payload: {
            assignmentId: id,
            workerId: assignment.workerId,
            shiftId: assignment.shiftId,
            replacementRequiresConsent: true,
          },
        },
      });
      const result = await tx.assignment.update({
        where: { id },
        data: {
          status: worker ? 'CANCELLED_BY_WORKER' : 'CANCELLED_BY_EMPLOYER',
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancellationReason: reason,
          version: { increment: 1 },
        },
      });
      await synchronizeShiftLifecycle(tx, assignment.shiftId, {
        actorId: user.id,
        trigger: 'assignment.cancel',
        reason,
      });
      return result;
    });
  }
  async cancelShift(user: AuthUser, organizationId: string, id: string, reason: string) {
    const shift = await this.db.shift.findFirst({ where: { id, organizationId } });
    if (!shift) throw new NotFoundException();
    await this.permissions.requireOrg(user.id, organizationId, 'shift.publish', shift.branchId);
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.shift.findUniqueOrThrow({ where: { id } });
      if (current.status === 'CANCELLED') return current;
      if (!['DRAFT', 'PUBLISHED'].includes(current.status) || current.startAt <= new Date())
        throw new ConflictException('EARLY_CLOSE_REQUIRED');
      if (
        await tx.assignment.count({
          where: { shiftId: id, status: { in: ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] } },
        })
      )
        throw new ConflictException('EARLY_CLOSE_REQUIRED');
      const assignments = await tx.assignment.findMany({
        where: { shiftId: id, status: 'CONFIRMED' },
      });
      await tx.activeBooking.deleteMany({ where: { shiftId: id } });
      await tx.assignment.updateMany({
        where: { shiftId: id, status: 'CONFIRMED' },
        data: {
          status: 'CANCELLED_BY_EMPLOYER',
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancellationReason: reason,
          version: { increment: 1 },
        },
      });
      await tx.shiftOffer.updateMany({
        where: { shiftId: id, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });
      await tx.shiftApplication.updateMany({
        where: { shiftId: id, status: { in: ['SUBMITTED', 'SHORTLISTED', 'OFFERED'] } },
        data: { status: 'EXPIRED' },
      });
      for (const a of assignments)
        await tx.outboxEvent.create({
          data: {
            type: 'assignment.cancelled',
            aggregateId: a.id,
            organizationId,
            payload: { assignmentId: a.id, workerId: a.workerId, shiftId: id },
          },
        });
      await tx.auditLog.create({
        data: { actorId: user.id, organizationId, action: 'shift.cancel', resourceId: id, reason },
      });
      return tx.shift.update({
        where: { id },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
    });
  }
  async favorites(user: AuthUser) {
    const saved = await this.db.savedShift.findMany({ where: { userId: user.id } });
    return {
      items: await this.db.shift.findMany({
        where: { id: { in: saved.map((s) => s.shiftId) }, status: 'PUBLISHED' },
        include: publicInclude,
      }),
    };
  }
  async save(user: AuthUser, shiftId: string, remove = false) {
    await this.detail(shiftId);
    if (remove) {
      await this.db.savedShift.deleteMany({ where: { userId: user.id, shiftId } });
      return { ok: true };
    }
    return this.db.savedShift.upsert({
      where: { userId_shiftId: { userId: user.id, shiftId } },
      create: { userId: user.id, shiftId },
      update: {},
    });
  }
}
