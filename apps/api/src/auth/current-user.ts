import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
export interface AuthUser {
  id: string;
  phone: string;
  name: string;
  platformPermissions: string[];
  sessionId: string;
}
export type AuthRequest = Request & { user: AuthUser; requestId: string };
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthRequest>().user,
);
