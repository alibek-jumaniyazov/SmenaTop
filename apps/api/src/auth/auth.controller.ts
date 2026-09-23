import { Body, Controller, Get, Headers, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { SessionGuard } from './auth.guard';
import { CurrentUser, type AuthUser } from './current-user';
import { parse, uuid } from '../common/validation';
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('otp/request')
  @ApiOperation({ operationId: 'requestOtp' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['phone'],
      properties: { phone: { type: 'string', pattern: '^\\+[1-9][0-9]{7,14}$' } },
    },
  })
  request(@Body() body: unknown, @Req() req: Request) {
    const v = parse(z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) }).strict(), body);
    return this.auth.request(v.phone, req.ip ?? 'unknown');
  }
  @Post('otp/verify')
  @ApiOperation({ operationId: 'verifyOtp' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['challengeId', 'code'],
      properties: {
        challengeId: { type: 'string', format: 'uuid' },
        code: { type: 'string', pattern: '^[0-9]{6}$' },
      },
    },
  })
  verify(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const v = parse(
      z.object({ challengeId: uuid, code: z.string().regex(/^\d{6}$/) }).strict(),
      body,
    );
    return this.auth.verify(
      v.challengeId,
      v.code,
      res,
      (req.cookies as Record<string, string>)?.smenatop_session,
    );
  }
  @Get('me')
  @UseGuards(SessionGuard)
  @ApiOperation({ operationId: 'getCurrentUser' })
  me(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.auth.me(user, (req.cookies as Record<string, string>)?.smenatop_csrf);
  }
  @Post('logout')
  @UseGuards(SessionGuard)
  logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(user, res);
  }
}
@ApiTags('Local developer inbox')
@Controller('developer')
export class LocalInboxController {
  constructor(private readonly auth: AuthService) {}
  @Get('inbox') inbox(
    @Headers('x-dev-key') key: string | undefined,
    @Query('phone') phone?: string,
  ) {
    return this.auth.inbox(key, phone);
  }
}
