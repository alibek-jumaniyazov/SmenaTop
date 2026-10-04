import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export function localToolsEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return (
    environment.APP_ENV === 'local' &&
    environment.NODE_ENV !== 'production' &&
    environment.DEV_TOOLS_ENABLED === 'true'
  );
}

/** Local server tooling is never accessible through browsers or reverse proxies. */
@Injectable()
export class LocalToolsGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const address = req.socket.remoteAddress;
    const key = req.header('x-dev-key');
    const secret = process.env.LOCAL_DEV_KEY;
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (
      !localToolsEnabled() ||
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '') ||
      ['origin', 'referer', 'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip'].some(
        (header) => req.header(header) !== undefined,
      ) ||
      !secret ||
      secret.length < 24 ||
      !key ||
      !timingSafeEqual(digest(key), digest(secret))
    )
      throw new NotFoundException();
    return true;
  }
}
