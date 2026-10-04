import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { SessionGuard, safeEqual } from './auth.guard';
import type { PrismaService } from '../prisma/prisma.service';

test('secret comparison rejects malformed UTF-8-length mismatches without throwing', () => {
  assert.equal(safeEqual('a'.repeat(32), 'a'.repeat(32)), true);
  assert.equal(safeEqual('a'.repeat(32), 'b'.repeat(32)), false);
  assert.equal(safeEqual('é'.repeat(32), 'a'.repeat(32)), false);
  assert.equal(safeEqual('🔒'.repeat(16), 'a'.repeat(32)), false);
  assert.equal(safeEqual('', 'a'), false);
});

test('privileged production sessions expose a stable MFA-required code without granting access', async () => {
  const previous = process.env.APP_ENV;
  process.env.APP_ENV = 'production';
  try {
    const db = {
      session: {
        findUnique: async () => ({
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          mfaVerifiedAt: null,
          user: {
            status: 'ACTIVE',
            platformGrants: [{ revokedAt: null, permissions: ['verification.review'] }],
          },
        }),
      },
    } as unknown as PrismaService;
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ cookies: { smenatop_session: 'synthetic-token' }, method: 'GET' }),
      }),
    } as unknown as ExecutionContext;
    await assert.rejects(new SessionGuard(db).canActivate(context), (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.deepEqual(error.getResponse(), { code: 'MFA_REQUIRED', message: 'MFA_REQUIRED' });
      return true;
    });
  } finally {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  }
});
