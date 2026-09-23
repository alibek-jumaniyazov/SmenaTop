import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateEnvironment } from './config';

test('production fails closed for all local adapters and mixed environment flags', () => {
  const old = { ...process.env };
  try {
    Object.assign(process.env, {
      APP_ENV: 'production',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://test@localhost/test',
      REDIS_URL: 'redis://localhost:6379',
      OTP_PEPPER: 'test-pepper-'.repeat(4),
      FILE_SIGNING_SECRET: 'test-signing-'.repeat(4),
      MFA_ENCRYPTION_KEY: 'a'.repeat(64),
      SMS_PROVIDER: 'not-configured',
      LOCAL_MOCK_PAYMENTS: 'false',
      DEV_TOOLS_ENABLED: 'false',
    });
    delete process.env.LOCAL_DEV_KEY;
    assert.equal(validateEnvironment().APP_ENV, 'production');
    for (const [key, value] of [
      ['SMS_PROVIDER', 'local'],
      ['LOCAL_MOCK_PAYMENTS', 'true'],
      ['DEV_TOOLS_ENABLED', 'true'],
      ['LOCAL_DEV_KEY', 'local-test-key-'.repeat(3)],
      ['APP_ENV', 'local'],
    ]) {
      const previous = process.env[key!];
      process.env[key!] = value;
      assert.throws(() => validateEnvironment(), /Unsafe production configuration/);
      if (previous === undefined) delete process.env[key!];
      else process.env[key!] = previous;
    }
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key];
    Object.assign(process.env, old);
  }
});

test('production module graph does not register local inbox, simulator or file review controllers', () => {
  const script =
    "require('reflect-metadata');const {AppModule}=require('./src/app.module.ts');const visited=new Set();const names=[];function walk(m){if(visited.has(m))return;visited.add(m);for(const c of Reflect.getMetadata('controllers',m)||[])names.push(c.name);for(const child of Reflect.getMetadata('imports',m)||[])walk(child)}walk(AppModule);process.stdout.write(JSON.stringify(names));";
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
    cwd: process.cwd(),
    env: { ...process.env, APP_ENV: 'production', NODE_ENV: 'production' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const names = JSON.parse(result.stdout) as string[];
  assert.ok(names.includes('AuthController'));
  assert.ok(
    !names.some((name) => /LocalInbox|LocalPaymentSimulator|LocalFileReview/.test(name)),
    names.join(','),
  );
});
