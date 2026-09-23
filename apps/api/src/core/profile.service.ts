import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService, ORG_PERMISSIONS } from '../common/permissions.service';
import type { AuthUser } from '../auth/current-user';
import { randomBytes } from 'node:crypto';
import { hash } from '../auth/auth.guard';
import { z } from 'zod';
import { uuid, iso } from '../common/validation';
export const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    cityId: uuid,
    categoryIds: z.array(uuid).min(1).max(10),
    languages: z.array(z.string().min(2).max(30)).max(10),
    experience: z.string().max(2000).default(''),
    adultConfirmed: z.literal(true),
    termsAccepted: z.literal(true),
    skillIds: z.array(uuid).max(20).default([]),
    submit: z.boolean().default(false),
  })
  .strict();
export const orgSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    contactName: z.string().min(2).max(100),
    stir: z
      .string()
      .regex(/^\d{9}$/)
      .optional(),
    cityId: uuid,
    branchName: z.string().min(2).max(100),
    address: z.string().min(3).max(300),
    area: z.string().min(2).max(100),
  })
  .strict();
export const organizationPatchSchema = z
  .object({
    version: z.number().int().positive(),
    name: z.string().trim().min(2).max(150).optional(),
    contactName: z.string().trim().min(2).max(100).optional(),
    stir: z
      .string()
      .trim()
      .regex(/^\d{9}$/)
      .nullable()
      .optional(),
    cityId: uuid.optional(),
    description: z.string().trim().max(3000).nullable().optional(),
    website: z
      .string()
      .trim()
      .max(500)
      .url()
      .refine((value) => {
        if (!URL.canParse(value)) return false;
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
      }, 'HTTP(S) URL without embedded credentials required')
      .nullable()
      .optional(),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).some((key) => key !== 'version'), {
    message: 'At least one profile field is required',
  });

const organizationInclude = {
  branches: true,
  memberships: { include: { user: { select: { id: true, name: true } } } },
  roles: true,
} as const;
@Injectable()
export class ProfileService {
  constructor(
    private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}
  async catalog() {
    const [cities, categories, skills] = await Promise.all([
      this.db.city.findMany({ where: { active: true }, orderBy: { nameUz: 'asc' } }),
      this.db.jobCategory.findMany({ where: { active: true }, orderBy: { nameUz: 'asc' } }),
      this.db.skill.findMany(),
    ]);
    return { cities, categories, skills };
  }
  profile(user: AuthUser) {
    return this.db.workerProfile.findUnique({
      where: { userId: user.id },
      include: { skills: { include: { skill: true } }, availability: true },
    });
  }
  async saveProfile(user: AuthUser, input: z.infer<typeof profileSchema>) {
    return this.db.atomic(async (tx) => {
      if (!(await tx.city.findFirst({ where: { id: input.cityId, active: true } })))
        throw new NotFoundException('Shahar topilmadi');
      if (
        (await tx.jobCategory.count({ where: { id: { in: input.categoryIds }, active: true } })) !==
        new Set(input.categoryIds).size
      )
        throw new NotFoundException('Kasb topilmadi');
      if (
        (await tx.skill.count({ where: { id: { in: input.skillIds } } })) !==
        new Set(input.skillIds).size
      )
        throw new NotFoundException('Ko‘nikma topilmadi');
      await tx.user.update({ where: { id: user.id }, data: { name: input.name } });
      const existing = await tx.workerProfile.findUnique({ where: { userId: user.id } });
      if (existing?.verificationStatus === 'SUSPENDED')
        throw new ForbiddenException('Profil cheklangan');
      const data = {
        cityId: input.cityId,
        categoryIds: input.categoryIds,
        languages: input.languages,
        experience: input.experience,
        adultConfirmed: true,
        ...(input.submit ? { verificationStatus: 'PENDING' } : {}),
      };
      const profile = await tx.workerProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...data },
        update: data,
      });
      await tx.workerSkill.deleteMany({
        where: { workerProfileId: profile.id, skillId: { notIn: input.skillIds } },
      });
      for (const skillId of input.skillIds)
        await tx.workerSkill.upsert({
          where: { workerProfileId_skillId: { workerProfileId: profile.id, skillId } },
          create: { workerProfileId: profile.id, skillId },
          update: {},
        });
      await tx.consentRecord.upsert({
        where: {
          userId_type_version: {
            userId: user.id,
            type: 'TERMS_AND_18_PLUS',
            version: '2026-09-draft',
          },
        },
        create: { userId: user.id, type: 'TERMS_AND_18_PLUS', version: '2026-09-draft' },
        update: {},
      });
      if (
        input.submit &&
        !(await tx.verificationRequest.findFirst({
          where: { subjectId: profile.id, subjectType: 'WORKER', status: 'PENDING' },
        }))
      )
        await tx.verificationRequest.create({
          data: { subjectType: 'WORKER', subjectId: profile.id, submittedById: user.id },
        });
      return tx.workerProfile.findUnique({
        where: { id: profile.id },
        include: { skills: { include: { skill: true } }, availability: true },
      });
    });
  }
  async availability(user: AuthUser, input: { startAt: string; endAt: string }) {
    const profile = await this.db.workerProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new NotFoundException('Profil yarating');
    if (new Date(input.endAt) <= new Date(input.startAt))
      throw new ConflictException('INVALID_INTERVAL');
    return this.db.availability.create({
      data: { workerProfileId: profile.id, startAt: input.startAt, endAt: input.endAt },
    });
  }
  async deleteAvailability(user: AuthUser, id: string) {
    const result = await this.db.availability.deleteMany({
      where: { id, workerProfile: { userId: user.id } },
    });
    if (!result.count) throw new NotFoundException();
    return { ok: true };
  }
  async createOrganization(user: AuthUser, input: z.infer<typeof orgSchema>) {
    return this.db.atomic(async (tx) => {
      const trial = await tx.planVersion.findFirst({
        where: { plan: { code: 'TRIAL' } },
        orderBy: { version: 'desc' },
      });
      if (!trial) throw new ConflictException('Trial tarif sozlanmagan');
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR UPDATE`;
      const prior = await tx.organizationMembership.count({
        where: { userId: user.id, role: 'OWNER' },
      });
      if (prior >= 3) throw new ForbiddenException('Organization onboarding limit reached');
      const org = await tx.organization.create({
        data: {
          name: input.name,
          contactName: input.contactName,
          stir: input.stir,
          cityId: input.cityId,
          verificationStatus: 'PENDING',
          branches: {
            create: {
              name: input.branchName,
              address: input.address,
              area: input.area,
              cityId: input.cityId,
            },
          },
          memberships: { create: { userId: user.id, role: 'OWNER', branchIds: [] } },
        },
      });
      const start = new Date();
      const end = new Date(start.getTime() + (prior ? 0 : 7 * 86400000));
      const sub = await tx.subscription.create({
        data: {
          organizationId: org.id,
          planVersionId: trial.id,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          anchorDay: start.getUTCDate(),
          status: prior ? 'EXPIRED' : 'TRIALING',
        },
      });
      if (!prior)
        await tx.entitlement.create({
          data: {
            organizationId: org.id,
            subscriptionId: sub.id,
            planVersionId: trial.id,
            renewalSequence: 0,
            startsAt: start,
            endsAt: end,
          },
        });
      await tx.verificationRequest.create({
        data: {
          subjectType: 'ORGANIZATION',
          subjectId: org.id,
          organizationId: org.id,
          submittedById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          organizationId: org.id,
          action: 'organization.create',
          resourceId: org.id,
        },
      });
      return org;
    });
  }
  async organization(user: AuthUser, id: string) {
    await this.permissions.permissions(user.id, id);
    return this.db.organization.findUnique({
      where: { id },
      include: organizationInclude,
    });
  }
  async updateOrganization(
    user: AuthUser,
    id: string,
    input: z.infer<typeof organizationPatchSchema>,
  ) {
    await this.permissions.requireOrg(user.id, id, 'organization.manage');
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${id}::uuid FOR UPDATE`;
      await this.permissions.requireOrg(user.id, id, 'organization.manage');
      const current = await tx.organization.findUniqueOrThrow({ where: { id } });
      if (current.status !== 'ACTIVE' || current.verificationStatus === 'SUSPENDED')
        throw new ForbiddenException('Tashkilot profili cheklangan');
      if (current.version !== input.version)
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Profil yangilangan. Qayta yuklang.',
        });
      if (input.cityId && !(await tx.city.findFirst({ where: { id: input.cityId, active: true } })))
        throw new NotFoundException('Faol shahar topilmadi');
      const { version: _version, ...patch } = input;
      const changedFields = (Object.keys(patch) as (keyof typeof patch)[]).filter(
        (key) => patch[key] !== undefined && patch[key] !== current[key],
      );
      if (!changedFields.length)
        return tx.organization.findUniqueOrThrow({ where: { id }, include: organizationInclude });
      const identityChanged = changedFields.some((key) => ['name', 'stir', 'cityId'].includes(key));
      const updated = await tx.organization.update({
        where: { id, version: input.version },
        data: {
          ...patch,
          version: { increment: 1 },
          ...(identityChanged ? { verificationStatus: 'PENDING' } : {}),
        },
        include: organizationInclude,
      });
      if (identityChanged) {
        await tx.verificationRequest.updateMany({
          where: { subjectType: 'ORGANIZATION', subjectId: id, status: 'PENDING' },
          data: {
            status: 'SUPERSEDED',
            notes: 'Organization identity changed; replaced by a new verification request.',
          },
        });
        await tx.verificationRequest.create({
          data: {
            organizationId: id,
            subjectType: 'ORGANIZATION',
            subjectId: id,
            submittedById: user.id,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          organizationId: id,
          action: 'organization.profile.update',
          resourceType: 'Organization',
          resourceId: id,
          metadata: {
            changedFields,
            previousVersion: current.version,
            version: updated.version,
            verificationReopened: identityChanged,
          },
        },
      });
      return updated;
    });
  }
  async addBranch(
    user: AuthUser,
    organizationId: string,
    input: { cityId: string; name: string; address: string; area: string },
  ) {
    await this.permissions.requireOrg(user.id, organizationId, 'branch.manage');
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${organizationId}::uuid FOR UPDATE`;
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
      if (
        !entitlement ||
        (await tx.branch.count({ where: { organizationId, active: true } })) >=
          entitlement.planVersion.branchLimit
      )
        throw new ConflictException('BRANCH_LIMIT');
      return tx.branch.create({ data: { organizationId, ...input } });
    });
  }
  async invite(
    user: AuthUser,
    organizationId: string,
    input: { phone: string; role: string; branchIds: string[] },
  ) {
    await this.permissions.requireOrg(user.id, organizationId, 'member.invite');
    if (!['ADMIN', 'MANAGER', 'FINANCE'].includes(input.role))
      throw new ForbiddenException('Role is not invitable');
    const issuer = await this.permissions.permissions(user.id, organizationId);
    if (issuer.member.role !== 'OWNER' && input.role === 'FINANCE')
      throw new ForbiddenException('Financial permission grant requires owner');
    if (
      (await this.db.branch.count({ where: { id: { in: input.branchIds }, organizationId } })) !==
      input.branchIds.length
    )
      throw new ForbiddenException('Branch scope');
    if (input.role === 'MANAGER' && !input.branchIds.length)
      throw new ConflictException('Manager branch required');
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.db.teamInvitation.create({
      data: {
        organizationId,
        ...input,
        tokenHash: hash(token),
        createdById: user.id,
        expiresAt: new Date(Date.now() + 3 * 86400000),
      },
    });
    await this.db.auditLog.create({
      data: {
        actorId: user.id,
        organizationId,
        action: 'member.invite',
        resourceId: invitation.id,
      },
    });
    return {
      invitation: { id: invitation.id, role: invitation.role, expiresAt: invitation.expiresAt },
      token,
    };
  }
  async acceptInvite(user: AuthUser, token: string) {
    return this.db.atomic(async (tx) => {
      const invite = await tx.teamInvitation.findUnique({ where: { tokenHash: hash(token) } });
      if (
        !invite ||
        invite.phone !== user.phone ||
        invite.acceptedAt ||
        invite.revokedAt ||
        invite.expiresAt <= new Date()
      )
        throw new ForbiddenException('Invitation invalid');
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${invite.organizationId}::uuid FOR UPDATE`;
      const current = await tx.teamInvitation.findUniqueOrThrow({ where: { id: invite.id } });
      if (current.acceptedAt) throw new ConflictException('Already accepted');
      const currentMembership = await tx.organizationMembership.findUnique({
        where: {
          organizationId_userId: { organizationId: invite.organizationId, userId: user.id },
        },
      });
      if (currentMembership?.role === 'OWNER')
        throw new ForbiddenException('Owner role changes require ownership transfer');
      const ent = await tx.entitlement.findFirst({
        where: {
          organizationId: invite.organizationId,
          startsAt: { lte: new Date() },
          endsAt: { gt: new Date() },
          revokedAt: null,
        },
        include: { planVersion: true },
      });
      if (
        !ent ||
        (await tx.organizationMembership.count({
          where: { organizationId: invite.organizationId, status: 'ACTIVE' },
        })) >= ent.planVersion.memberLimit
      )
        throw new ConflictException('MEMBER_LIMIT');
      await tx.teamInvitation.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      const membership = await tx.organizationMembership.upsert({
        where: {
          organizationId_userId: { organizationId: invite.organizationId, userId: user.id },
        },
        create: {
          organizationId: invite.organizationId,
          userId: user.id,
          role: invite.role,
          branchIds: invite.branchIds,
        },
        update: { status: 'ACTIVE', role: invite.role, branchIds: invite.branchIds },
      });
      await tx.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
      return { membership, reauthenticate: true };
    });
  }
  async customRole(
    user: AuthUser,
    organizationId: string,
    input: { name: string; permissions: string[] },
  ) {
    const issuer = await this.permissions.permissions(user.id, organizationId);
    if (
      !issuer.permissions.includes('member.invite') ||
      input.permissions.some((p) => !ORG_PERMISSIONS.includes(p) || !issuer.permissions.includes(p))
    )
      throw new ForbiddenException('Permission grant exceeds authority');
    return this.db.organizationRole.create({ data: { organizationId, ...input } });
  }
}
export const availabilitySchema = z.object({ startAt: iso, endAt: iso }).strict();
