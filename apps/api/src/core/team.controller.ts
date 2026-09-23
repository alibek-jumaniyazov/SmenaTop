import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService, ROLE_PERMISSIONS } from '../common/permissions.service';
import { SessionGuard } from '../auth/auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user';
import { parse, uuid } from '../common/validation';
@ApiTags('Team permissions')
@UseGuards(SessionGuard)
@Controller('organizations/:org')
export class TeamController {
  constructor(
    private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}
  @Patch('members/:id') async member(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({
          role: z.enum(['ADMIN', 'MANAGER', 'FINANCE', 'CUSTOM']).optional(),
          customRoleId: uuid.optional(),
          branchIds: z.array(uuid).max(30).optional(),
          status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']).optional(),
          reason: z.string().trim().min(3).max(1000),
        })
        .strict(),
      body,
    );
    const issuer = await this.permissions.permissions(user.id, parse(uuid, org));
    if (!issuer.permissions.includes('member.invite')) throw new ForbiddenException();
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${org}::uuid FOR UPDATE`;
      const target = await tx.organizationMembership.findFirstOrThrow({
        where: { id: parse(uuid, id), organizationId: org },
      });
      if (target.role === 'OWNER')
        throw new ForbiddenException('Owner changes require explicit ownership transfer');
      const role = input.role ?? target.role;
      let granted = ROLE_PERMISSIONS[role] ?? [];
      const customRoleId = role === 'CUSTOM' ? (input.customRoleId ?? target.customRoleId) : null;
      if (role === 'CUSTOM') {
        if (!customRoleId) throw new ConflictException('Custom role required');
        const custom = await tx.organizationRole.findFirstOrThrow({
          where: { id: customRoleId, organizationId: org },
        });
        granted = custom.permissions;
      }
      if (granted.some((p) => !issuer.permissions.includes(p)))
        throw new ForbiddenException('Cannot grant privileges above your own');
      const branchIds = input.branchIds ?? target.branchIds;
      if (role === 'MANAGER' && !branchIds.length)
        throw new ConflictException('Manager requires a branch scope');
      if (
        (await tx.branch.count({
          where: { id: { in: branchIds }, organizationId: org, active: true },
        })) !== new Set(branchIds).size
      )
        throw new ForbiddenException('Invalid branch scope');
      if (
        issuer.member.branchIds.length &&
        branchIds.some((b) => !issuer.member.branchIds.includes(b))
      )
        throw new ForbiddenException('Cannot expand branch scope');
      if (input.status === 'ACTIVE' && target.status !== 'ACTIVE') {
        const entitlement = await tx.entitlement.findFirst({
          where: {
            organizationId: org,
            startsAt: { lte: new Date() },
            endsAt: { gt: new Date() },
            revokedAt: null,
          },
          include: { planVersion: true },
          orderBy: { startsAt: 'desc' },
        });
        if (
          !entitlement ||
          (await tx.organizationMembership.count({
            where: { organizationId: org, status: 'ACTIVE' },
          })) >= entitlement.planVersion.memberLimit
        )
          throw new ConflictException('MEMBER_LIMIT');
      }
      const member = await tx.organizationMembership.update({
        where: { id: target.id },
        data: { role, customRoleId, branchIds, status: input.status ?? target.status },
      });
      await tx.session.updateMany({
        where: { userId: target.userId },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          organizationId: org,
          action: 'member.permissions.update',
          resourceId: target.id,
          reason: input.reason,
          metadata: { previousRole: target.role, role, status: member.status, branchIds },
        },
      });
      return { member, reauthenticate: target.userId === user.id };
    });
  }
  @Post('ownership/transfer') async transfer(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({ membershipId: uuid, reason: z.string().trim().min(3).max(1000) }).strict(),
      body,
    );
    const issuer = await this.permissions.permissions(user.id, parse(uuid, org));
    if (issuer.member.role !== 'OWNER') throw new ForbiddenException('Owner permission required');
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${org}::uuid FOR UPDATE`;
      const owner = await tx.organizationMembership.findUniqueOrThrow({
        where: { id: issuer.member.id },
      });
      if (owner.role !== 'OWNER' || owner.status !== 'ACTIVE') throw new ForbiddenException();
      const target = await tx.organizationMembership.findFirstOrThrow({
        where: { id: input.membershipId, organizationId: org, status: 'ACTIVE' },
      });
      if (target.id === owner.id) throw new ConflictException('Select another member');
      await tx.organizationMembership.update({
        where: { id: target.id },
        data: { role: 'OWNER', customRoleId: null, branchIds: [] },
      });
      await tx.organizationMembership.update({
        where: { id: owner.id },
        data: { role: 'ADMIN', customRoleId: null, branchIds: [] },
      });
      await tx.session.updateMany({
        where: { userId: { in: [target.userId, owner.userId] } },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          organizationId: org,
          action: 'organization.ownership.transfer',
          resourceId: org,
          reason: input.reason,
          metadata: { previousOwnerId: owner.userId, newOwnerId: target.userId },
        },
      });
      return { ok: true, reauthenticate: true };
    });
  }
}
