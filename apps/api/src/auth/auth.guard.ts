import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthRequest } from './current-user';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.smenatop_session;
    if (!token) throw new UnauthorizedException('Kirish talab qilinadi');
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
      throw new UnauthorizedException('Sessiya muddati tugagan');
    const permissions = [
      ...new Set(
        session.user.platformGrants.filter((g) => !g.revokedAt).flatMap((g) => g.permissions),
      ),
    ];
    if (process.env.APP_ENV === 'production' && permissions.length && !session.mfaVerifiedAt)
      throw new ForbiddenException('MFA_REQUIRED');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.header('x-csrf-token');
      if (!csrf || !safeEqual(hash(csrf), session.csrfHash))
        throw new ForbiddenException('CSRF_INVALID');
    }
    req.user = {
      id: session.userId,
      phone: session.user.phone,
      name: session.user.name,
      platformPermissions: permissions,
      sessionId: session.id,
    };
    return true;
  }
}
