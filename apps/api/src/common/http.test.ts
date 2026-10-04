import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException, type ArgumentsHost } from '@nestjs/common';
import { ApiExceptionFilter } from './http';

function capture(exception: unknown) {
  let status = 0;
  let body: Record<string, unknown> = {};
  const response = {
    status(value: number) {
      status = value;
      return this;
    },
    json(value: Record<string, unknown>) {
      body = value;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ requestId: 'safe-correlation-id' }),
    }),
  } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  return { status, body };
}

test('all server failures suppress exception messages, codes and internal field metadata', () => {
  const secret = 'postgresql://user:private-password@private-host/database';
  for (const status of [500, 502, 503]) {
    const result = capture(
      new HttpException(
        { message: secret, code: secret, fieldErrors: { database: secret } },
        status,
      ),
    );
    assert.equal(result.status, status);
    assert.equal(result.body.code, status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR');
    assert.deepEqual(result.body.fieldErrors, {});
    assert.equal(result.body.requestId, 'safe-correlation-id');
    assert.ok(!JSON.stringify(result.body).includes(secret));
  }
  const result = capture(new Error(secret));
  assert.equal(result.status, 500);
  assert.ok(!JSON.stringify(result.body).includes(secret));
});

test('user validation errors retain their safe field messages and error contract', () => {
  const result = capture(
    new HttpException(
      {
        code: 'VALIDATION_ERROR',
        message: 'Maydonlarni tekshiring',
        fieldErrors: { name: ['Required'] },
      },
      422,
    ),
  );
  assert.equal(result.status, 422);
  assert.equal(result.body.code, 'VALIDATION_ERROR');
  assert.deepEqual(result.body.fieldErrors, { name: ['Required'] });
});
