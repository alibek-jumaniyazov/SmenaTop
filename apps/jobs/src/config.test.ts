import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateJobsEnvironment } from './config';

const safe: NodeJS.ProcessEnv = {
  APP_ENV: 'production',
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://test@localhost/test',
  REDIS_URL: 'rediss://localhost:6379',
  SMS_PROVIDER: 'not-configured',
  LOCAL_MOCK_PAYMENTS: 'false',
  DEV_TOOLS_ENABLED: 'false',
};
test('jobs validate production configuration before creating queue consumers', () => {
  assert.equal(validateJobsEnvironment(safe).protocol, 'rediss:');
  for (const [key, value] of [
    ['APP_ENV', 'local'],
    ['SMS_PROVIDER', 'local'],
    ['LOCAL_MOCK_PAYMENTS', 'true'],
    ['DEV_TOOLS_ENABLED', 'true'],
    ['LOCAL_DEV_KEY', 'must-never-reach-production'],
  ])
    assert.throws(() => validateJobsEnvironment({ ...safe, [key!]: value }), /Production rejects/);
});
test('jobs refuse absent services and non-Redis protocols', () => {
  assert.throws(() => validateJobsEnvironment({}), /explicit environment/);
  assert.throws(
    () => validateJobsEnvironment({ ...safe, REDIS_URL: 'https://localhost' }),
    /protocol invalid/,
  );
});
