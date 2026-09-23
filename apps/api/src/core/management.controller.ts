import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Injectable,
  HttpException,
  OnModuleDestroy,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions.service';
import { SessionGuard, hash } from '../auth/auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user';
import { parse, uuid } from '../common/validation';
import { ProfileService } from './profile.service';
@Injectable()
export class ApiKeysService implements OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  constructor(private readonly db: PrismaService) {
    this.redis.on('error', () => {});
  }
  onModuleDestroy() {
    this.redis.disconnect();
  }
  async authorize(key: string | undefined, organizationId: string, scope: string) {
    if (!key) throw new ForbiddenException('API key required');
    const credential = await this.db.apiCredential.findUnique({ where: { keyHash: hash(key) } });
    if (
      !credential ||
      credential.organizationId !== organizationId ||
      credential.revokedAt ||
      credential.expiresAt <= new Date() ||
      !credential.scopes.includes(scope)
    )
      throw new ForbiddenException('API_KEY_FORBIDDEN');
    const org = await this.db.organization.findUnique({ where: { id: organizationId } });
    if (org?.status !== 'ACTIVE') throw new ForbiddenException();
    const count = await this.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
      1,
      `smenatop:api-rate:${credential.id}`,
    );
    if (Number(count) > 120) throw new HttpException('API_RATE_LIMIT', 429);
    await this.db.apiCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });
    return credential;
  }
}
@ApiTags('Management')
@UseGuards(SessionGuard)
@Controller()
export class ManagementController {
  constructor(
    private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly profiles: ProfileService,
  ) {}
  @Get('organizations/:org/shifts/:id') async shift(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Param('id') id: string,
  ) {
    const shift = await this.db.shift.findFirstOrThrow({
      where: { id: parse(uuid, id), organizationId: parse(uuid, org) },
      include: {
        branch: true,
        category: true,
        organization: { select: { id: true, name: true, verificationStatus: true } },
      },
    });
    await this.permissions.requireOrg(user.id, org, 'shift.read', shift.branchId);
    return shift;
  }
  @Post('organizations/:org/verification') async verify(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
  ) {
    await this.permissions.requireOrg(user.id, parse(uuid, org), 'organization.manage');
    return this.db.atomic(async (tx) => {
      const existing = await tx.verificationRequest.findFirst({
        where: { subjectId: org, subjectType: 'ORGANIZATION', status: 'PENDING' },
      });
      if (existing) return existing;
      await tx.organization.update({ where: { id: org }, data: { verificationStatus: 'PENDING' } });
      return tx.verificationRequest.create({
        data: {
          organizationId: org,
          subjectType: 'ORGANIZATION',
          subjectId: org,
          submittedById: user.id,
        },
      });
    });
  }
  @Get('organizations/:org/analytics') async analytics(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
  ) {
    const { member, permissions } = await this.permissions.permissions(user.id, parse(uuid, org));
    if (!permissions.includes('analytics.read')) throw new ForbiddenException();
    const where = {
      organizationId: org,
      ...(member.role === 'MANAGER' || member.branchIds.length
        ? { branchId: { in: member.branchIds } }
        : {}),
    };
    const shifts = await this.db.shift.findMany({
      where,
      select: { id: true, status: true, headcount: true },
    });
    const shiftIds = shifts.map((s) => s.id);
    const [applications, assignments, noShows, pendingTimesheets] = await Promise.all([
      this.db.shiftApplication.count({
        where: { shiftId: { in: shiftIds }, status: { in: ['SUBMITTED', 'SHORTLISTED'] } },
      }),
      this.db.assignment.count({
        where: {
          shiftId: { in: shiftIds },
          status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] },
        },
      }),
      this.db.assignment.count({ where: { shiftId: { in: shiftIds }, status: 'NO_SHOW' } }),
      this.db.timesheet.count({
        where: {
          organizationId: org,
          assignment: { shiftId: { in: shiftIds } },
          status: { in: ['SUBMITTED', 'PENDING_APPROVAL'] },
        },
      }),
    ]);
    const capacity = shifts
      .filter((s) => s.status !== 'CANCELLED')
      .reduce((n, s) => n + s.headcount, 0);
    return {
      openShifts: shifts.filter((s) => s.status === 'PUBLISHED').length,
      confirmedAssignments: assignments,
      pendingApplications: applications,
      pendingTimesheets,
      noShows,
      capacity,
      fillRate: capacity ? assignments / capacity : 0,
      formula: 'confirmed active assignments / non-cancelled published+draft capacity',
      period: 'all-time',
      denominator: capacity,
    };
  }
  @Get('organizations/:org/api-keys') async keys(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
  ) {
    await this.permissions.requireOrg(user.id, parse(uuid, org), 'api.manage');
    return {
      items: await this.db.apiCredential.findMany({
        where: { organizationId: org },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
          lastUsedAt: true,
        },
      }),
    };
  }
  @Post('organizations/:org/api-keys') async createKey(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Body() body: unknown,
  ) {
    await this.permissions.requireOrg(user.id, parse(uuid, org), 'api.manage');
    const input = parse(
      z
        .object({
          name: z.string().min(2).max(100),
          scopes: z
            .array(z.enum(['shifts:read', 'assignments:read']))
            .min(1)
            .max(2),
          expiresAt: z.string().datetime({ offset: true }),
        })
        .strict(),
      body,
    );
    if (
      new Date(input.expiresAt) <= new Date() ||
      new Date(input.expiresAt).getTime() > Date.now() + 366 * 86400000
    )
      throw new ForbiddenException('Expiry must be within one year');
    const key = `st_live_${randomBytes(32).toString('base64url')}`;
    const credential = await this.db.apiCredential.create({
      data: {
        ...input,
        organizationId: org,
        keyHash: hash(key),
        keyPrefix: key.slice(0, 16),
        createdById: user.id,
      },
    });
    await this.db.auditLog.create({
      data: {
        actorId: user.id,
        organizationId: org,
        action: 'api-key.create',
        resourceId: credential.id,
        metadata: { scopes: input.scopes },
      },
    });
    return {
      id: credential.id,
      key,
      name: credential.name,
      scopes: credential.scopes,
      expiresAt: credential.expiresAt,
    };
  }
  @Delete('organizations/:org/api-keys/:id') async revokeKey(
    @CurrentUser() user: AuthUser,
    @Param('org') org: string,
    @Param('id') id: string,
  ) {
    await this.permissions.requireOrg(user.id, parse(uuid, org), 'api.manage');
    await this.db.apiCredential.updateMany({
      where: { id: parse(uuid, id), organizationId: org },
      data: { revokedAt: new Date() },
    });
    await this.db.auditLog.create({
      data: { actorId: user.id, organizationId: org, action: 'api-key.revoke', resourceId: id },
    });
    return { ok: true };
  }
  @Get('admin/audit') audit(@CurrentUser() user: AuthUser) {
    this.permissions.requirePlatform(user, 'audit.read');
    return this.db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }
  @Get('admin/catalog') catalog(@CurrentUser() user: AuthUser) {
    this.permissions.requirePlatform(user, 'catalog.manage');
    return this.profiles.catalog();
  }
  @Post('admin/catalog/cities') city(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    this.permissions.requirePlatform(user, 'catalog.manage');
    const input = parse(
      z
        .object({
          code: z.string().regex(/^[a-z0-9-]{2,40}$/),
          nameUz: z.string().min(2).max(100),
          nameRu: z.string().min(2).max(100),
          active: z.boolean().default(true),
          reason: z.string().min(3).max(1000),
        })
        .strict(),
      body,
    );
    const { reason, ...data } = input;
    return this.db.atomic(async (tx) => {
      const city = await tx.city.upsert({ where: { code: data.code }, create: data, update: data });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'catalog.city.update', resourceId: city.id, reason },
      });
      return city;
    });
  }
  @Post('account/requests') async accountRequest(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({ type: z.enum(['EXPORT', 'DELETE']), reason: z.string().max(1000).default('') })
        .strict(),
      body,
    );
    return this.db.supportTicket.create({
      data: {
        userId: user.id,
        subject: `ACCOUNT_${input.type}`,
        description: `${input.reason}\nHistorical financial and operational records are retained according to the retention policy.`,
      },
    });
  }
}
@ApiTags('Read-only organization integration API')
@Controller('integration/organizations/:org')
export class IntegrationController {
  constructor(
    private readonly db: PrismaService,
    private readonly keys: ApiKeysService,
  ) {}
  @Get('shifts') async shifts(@Param('org') org: string, @Headers('x-api-key') key?: string) {
    await this.keys.authorize(key, parse(uuid, org), 'shifts:read');
    return {
      items: await this.db.shift.findMany({
        where: { organizationId: org },
        take: 100,
        orderBy: { startAt: 'desc' },
      }),
    };
  }
  @Get('assignments') async assignments(
    @Param('org') org: string,
    @Headers('x-api-key') key?: string,
  ) {
    await this.keys.authorize(key, parse(uuid, org), 'assignments:read');
    return {
      items: await this.db.assignment.findMany({
        where: { organizationId: org },
        select: { id: true, shiftId: true, status: true, startAt: true, endAt: true },
        take: 100,
        orderBy: { startAt: 'desc' },
      }),
    };
  }
}
