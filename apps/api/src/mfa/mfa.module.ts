import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  HttpException,
  Injectable,
  Module,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user';
import type { AuthRequest, AuthUser } from '../auth/current-user';
import { hash, safeEqual } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { base32, verifyTotp } from './totp';

@Injectable()
class MfaIdentityGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.smenatop_session;
    if (!token) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: { include: { platformGrants: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    )
      throw new UnauthorizedException();
    const permissions = session.user.platformGrants
      .filter((grant) => !grant.revokedAt)
      .flatMap((grant) => grant.permissions);
    if (!permissions.length)
      throw new ForbiddenException('Platforma MFA faqat vakolat berilgan hisoblar uchun');
    if (
      !['GET', 'HEAD'].includes(req.method) &&
      !safeEqual(hash(req.header('x-csrf-token') ?? ''), session.csrfHash)
    )
      throw new ForbiddenException('CSRF_INVALID');
    req.user = {
      id: session.userId,
      name: session.user.name,
      phone: session.user.phone,
      sessionId: session.id,
      platformPermissions: permissions,
    };
    return true;
  }
}
@Injectable()
class MfaService {
  private encryptionKey() {
    if (!/^[a-f\d]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY ?? ''))
      throw new HttpException('MFA_NOT_CONFIGURED', 503);
    return Buffer.from(process.env.MFA_ENCRYPTION_KEY!, 'hex');
  }
  constructor(private readonly db: PrismaService) {}
  async status(user: AuthUser) {
    const [credential, session] = await Promise.all([
      this.db.mfaCredential.findUnique({ where: { userId: user.id } }),
      this.db.session.findUnique({ where: { id: user.sessionId } }),
    ]);
    return {
      enabled: Boolean(credential?.enabledAt),
      verified: Boolean(session?.mfaVerifiedAt),
      required: process.env.APP_ENV === 'production',
    };
  }
  async setup(user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR UPDATE`;
      const session = await tx.session.findUniqueOrThrow({ where: { id: user.sessionId } });
      if (Date.now() - session.createdAt.getTime() > 600_000)
        throw new ForbiddenException('MFA sozlash uchun qayta kiring');
      const existing = await tx.mfaCredential.findUnique({ where: { userId: user.id } });
      if (existing?.enabledAt) throw new ForbiddenException('MFA allaqachon yoqilgan');
      const secret = randomBytes(20),
        iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
      cipher.setAAD(Buffer.from(user.id));
      const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
      const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(12).toString('hex'));
      const data = {
        secretCipherText: encrypted.toString('base64'),
        secretIv: iv.toString('base64'),
        secretTag: cipher.getAuthTag().toString('base64'),
        recoveryHashes: recoveryCodes.map((code) => hash(`${user.id}:${code}`)),
        lastCounter: 0n,
      };
      await tx.mfaCredential.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'mfa.enrollment.started', resourceId: user.id },
      });
      const encoded = base32(secret);
      return {
        secret: encoded,
        uri: `otpauth://totp/SmenaTop:${encodeURIComponent(user.phone)}?secret=${encoded}&issuer=SmenaTop&algorithm=SHA1&digits=6&period=30`,
        recoveryCodes,
      };
    });
  }
  async verify(user: AuthUser, code: string, res: Response) {
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR UPDATE`;
      if (
        (await tx.auditLog.count({
          where: {
            actorId: user.id,
            action: 'mfa.attempt',
            createdAt: { gt: new Date(Date.now() - 60_000) },
          },
        })) >= 5
      )
        return { limited: true };
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'mfa.attempt', resourceId: user.id },
      });
      const credential = await tx.mfaCredential.findUnique({ where: { userId: user.id } });
      if (!credential) return null;
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        Buffer.from(credential.secretIv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(credential.secretTag, 'base64'));
      decipher.setAAD(Buffer.from(user.id));
      const secret = Buffer.concat([
        decipher.update(Buffer.from(credential.secretCipherText, 'base64')),
        decipher.final(),
      ]);
      const counter = verifyTotp(secret, code, credential.lastCounter);
      const recoveryHash = hash(`${user.id}:${code}`);
      const recovery = Boolean(
        credential.enabledAt && credential.recoveryHashes.includes(recoveryHash),
      );
      if (counter === null && !recovery) return null;
      await tx.mfaCredential.update({
        where: { userId: user.id },
        data: {
          enabledAt: credential.enabledAt ?? new Date(),
          ...(counter !== null ? { lastCounter: counter } : {}),
          ...(recovery
            ? { recoveryHashes: credential.recoveryHashes.filter((item) => item !== recoveryHash) }
            : {}),
        },
      });
      await tx.session.update({ where: { id: user.sessionId }, data: { revokedAt: new Date() } });
      const token = randomBytes(32).toString('base64url'),
        csrf = randomBytes(32).toString('base64url');
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hash(token),
          csrfHash: hash(csrf),
          expiresAt: new Date(Date.now() + 8 * 3600_000),
          mfaVerifiedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: recovery ? 'mfa.recovery.used' : 'mfa.verified',
          resourceId: user.id,
        },
      });
      return { token, csrf };
    });
    if (result && 'limited' in result) throw new HttpException('MFA_LIMIT', 429);
    if (!result) throw new UnauthorizedException('MFA_INVALID');
    const options = {
      secure: process.env.APP_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 8 * 3600_000,
    };
    res.cookie('smenatop_session', result.token, { ...options, httpOnly: true });
    res.cookie('smenatop_csrf', result.csrf, { ...options, httpOnly: false });
    return { verified: true, csrfToken: result.csrf };
  }
}
class MfaCodeDto {
  @ApiProperty() @IsString() @Length(6, 24) code!: string;
}
@ApiTags('Multi-factor authentication')
@ApiCookieAuth()
@UseGuards(MfaIdentityGuard)
@Controller('auth/mfa')
class MfaController {
  constructor(private readonly mfa: MfaService) {}
  @Get() status(@CurrentUser() user: AuthUser) {
    return this.mfa.status(user);
  }
  @Post('setup') setup(@CurrentUser() user: AuthUser) {
    return this.mfa.setup(user);
  }
  @Post('verify') verify(
    @CurrentUser() user: AuthUser,
    @Body() input: MfaCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.mfa.verify(user, input.code, res);
  }
}
@Module({ controllers: [MfaController], providers: [MfaService, MfaIdentityGuard] })
export class MfaModule {}
