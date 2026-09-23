import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hash, safeEqual } from './auth.guard';
import { PermissionsService } from '../common/permissions.service';
import type { AuthUser } from './current-user';
import type { Response } from 'express';
@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}
  async request(phone: string, ip: string) {
    const now = new Date();
    const ipHash = hash(ip);
    const challenge = await this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`otp-ip:${ipHash}`},0))`;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`otp-phone:${phone}`},0))`;
      const latest = await tx.otpChallenge.findFirst({
        where: { phone },
        orderBy: { createdAt: 'desc' },
      });
      const count = await tx.otpChallenge.count({
        where: {
          OR: [{ phone }, { ipHash }],
          createdAt: { gt: new Date(now.getTime() - 3600000) },
        },
      });
      if ((latest && now.getTime() - latest.createdAt.getTime() < 60000) || count >= 10)
        throw new HttpException('OTP_LIMIT', 429);
      const code = randomInt(0, 1000000).toString().padStart(6, '0');
      const expiresAt = new Date(now.getTime() + 300000);
      const row = await tx.otpChallenge.create({
        data: {
          phone,
          ipHash,
          codeHash: hash(`${phone}:${code}:${process.env.OTP_PEPPER}`),
          expiresAt,
        },
      });
      if (process.env.SMS_PROVIDER === 'local' && process.env.APP_ENV !== 'production')
        await tx.localInbox.create({ data: { phone, challengeId: row.id, body: code, expiresAt } });
      else throw new HttpException('SMS_NOT_CONFIGURED', 503);
      return row;
    });
    return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
  }
  async verify(challengeId: string, code: string, res: Response, oldToken?: string) {
    const result = await this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OtpChallenge" WHERE id=${challengeId}::uuid FOR UPDATE`;
      const challenge = await tx.otpChallenge.findUnique({ where: { id: challengeId } });
      if (
        !challenge ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= 5
      )
        return null;
      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      if (
        !safeEqual(challenge.codeHash, hash(`${challenge.phone}:${code}:${process.env.OTP_PEPPER}`))
      )
        return null;
      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      const user = await tx.user.upsert({
        where: { phone: challenge.phone },
        create: { phone: challenge.phone },
        update: {},
      });
      if (user.status !== 'ACTIVE') return null;
      if (oldToken)
        await tx.session.updateMany({
          where: { tokenHash: hash(oldToken) },
          data: { revokedAt: new Date() },
        });
      const token = randomBytes(32).toString('base64url');
      const csrf = randomBytes(32).toString('base64url');
      const session = await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hash(token),
          csrfHash: hash(csrf),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      return { user, session, token, csrf };
    });
    if (!result) throw new UnauthorizedException('OTP_INVALID_OR_EXPIRED');
    const secure = process.env.APP_ENV === 'production';
    res.cookie('smenatop_session', result.token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 86400000,
    });
    res.cookie('smenatop_csrf', result.csrf, {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 86400000,
    });
    const grants = await this.db.platformRoleGrant.findMany({
      where: { userId: result.user.id, revokedAt: null },
    });
    return this.me(
      {
        id: result.user.id,
        phone: result.user.phone,
        name: result.user.name,
        sessionId: result.session.id,
        platformPermissions: grants.flatMap((g) => g.permissions),
      },
      result.csrf,
    );
  }
  async me(user: AuthUser, csrfToken?: string) {
    const [workerProfile, memberships] = await Promise.all([
      this.db.workerProfile.findUnique({
        where: { userId: user.id },
        include: { skills: { include: { skill: true } }, availability: true },
      }),
      this.db.organizationMembership.findMany({
        where: { userId: user.id, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
        include: { organization: true },
      }),
    ]);
    return {
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        platformPermissions: user.platformPermissions,
      },
      workerProfile,
      memberships: await Promise.all(
        memberships.map(async (member) => ({
          ...member,
          permissions: (await this.permissions.permissions(user.id, member.organizationId))
            .permissions,
        })),
      ),
      csrfToken,
    };
  }
  async logout(user: AuthUser, res: Response) {
    await this.db.session.update({
      where: { id: user.sessionId },
      data: { revokedAt: new Date() },
    });
    res.clearCookie('smenatop_session', { path: '/' });
    res.clearCookie('smenatop_csrf', { path: '/' });
    return { ok: true };
  }
  async inbox(key: string | undefined, phone?: string) {
    if (
      process.env.APP_ENV === 'production' ||
      process.env.SMS_PROVIDER !== 'local' ||
      !key ||
      !process.env.LOCAL_DEV_KEY ||
      !safeEqual(key, process.env.LOCAL_DEV_KEY)
    )
      throw new ForbiddenException('LOCAL_INBOX_FORBIDDEN');
    if (!phone) throw new BadRequestException('Phone required');
    const items = await this.db.localInbox.findMany({
      where: { phone, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return { items: items.map((item) => ({ ...item, code: item.body })), mode: 'LOCAL_MOCK' };
  }
}
