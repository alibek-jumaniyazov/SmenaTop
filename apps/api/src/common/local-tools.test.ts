import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { localToolsEnabled, LocalToolsGuard } from './local-tools';

test('local developer controllers require an explicit local-only enable flag', () => {
  for (const APP_ENV of ['staging', 'production', undefined])
    assert.equal(localToolsEnabled({ APP_ENV, DEV_TOOLS_ENABLED: 'true' }), false);
  for (const DEV_TOOLS_ENABLED of ['false', undefined])
    assert.equal(localToolsEnabled({ APP_ENV: 'local', DEV_TOOLS_ENABLED }), false);
  assert.equal(
    localToolsEnabled({ APP_ENV: 'local', DEV_TOOLS_ENABLED: 'true', NODE_ENV: 'production' }),
    false,
  );
  assert.equal(localToolsEnabled({ APP_ENV: 'local', DEV_TOOLS_ENABLED: 'true' }), true);
});

test('local tools reject remote peers, browser/proxy requests and missing or malformed secrets', () => {
  const previous = { ...process.env };
  const key = 'isolated-local-tools-test-secret';
  Object.assign(process.env, {
    APP_ENV: 'local',
    NODE_ENV: 'test',
    DEV_TOOLS_ENABLED: 'true',
    LOCAL_DEV_KEY: key,
  });
  const guard = new LocalToolsGuard();
  const context = (address: string, headers: Record<string, string> = {}) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          socket: { remoteAddress: address },
          header: (name: string) => headers[name],
        }),
      }),
    }) as unknown as ExecutionContext;
  try {
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1'])
      assert.equal(guard.canActivate(context(address, { 'x-dev-key': key })), true);
    for (const address of ['203.0.113.20', '192.168.1.10', ''])
      assert.throws(
        () => guard.canActivate(context(address, { 'x-dev-key': key })),
        NotFoundException,
      );
    for (const value of ['', 'wrong', 'é'.repeat(key.length)])
      assert.throws(
        () => guard.canActivate(context('127.0.0.1', { 'x-dev-key': value })),
        NotFoundException,
      );
    for (const header of [
      'origin',
      'referer',
      'forwarded',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-real-ip',
    ])
      assert.throws(
        () => guard.canActivate(context('127.0.0.1', { 'x-dev-key': key, [header]: '127.0.0.1' })),
        NotFoundException,
      );
    process.env.DEV_TOOLS_ENABLED = 'false';
    assert.throws(
      () => guard.canActivate(context('127.0.0.1', { 'x-dev-key': key })),
      NotFoundException,
    );
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in previous)) delete process.env[name];
    Object.assign(process.env, previous);
  }
});
