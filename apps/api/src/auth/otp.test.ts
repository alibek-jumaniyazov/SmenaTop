import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generateOtpCode, localFixedOtpEnabled } from './otp';

const localEnvironment: NodeJS.ProcessEnv = {
  APP_ENV: 'local',
  NODE_ENV: 'development',
  SMS_PROVIDER: 'local',
};

test('fixed local OTP requires explicit opt-in and defaults to disabled', () => {
  assert.equal(localFixedOtpEnabled({}), false);
  for (const flag of [undefined, '', 'false', 'TRUE', '1']) {
    assert.equal(
      localFixedOtpEnabled({ ...localEnvironment, LOCAL_FIXED_OTP_ENABLED: flag }),
      false,
      `Unexpected activation for flag ${String(flag)}`,
    );
  }
  assert.equal(
    localFixedOtpEnabled({ ...localEnvironment, LOCAL_FIXED_OTP_ENABLED: 'true' }),
    true,
  );
});

test('fixed local OTP is disabled outside the local SMS and non-production boundary', () => {
  const enabled = { ...localEnvironment, LOCAL_FIXED_OTP_ENABLED: 'true' };
  for (const override of [
    { APP_ENV: undefined },
    { APP_ENV: 'staging' },
    { APP_ENV: 'production' },
    { NODE_ENV: 'production' },
    { SMS_PROVIDER: undefined },
    { SMS_PROVIDER: 'not-configured' },
    { SMS_PROVIDER: 'external-provider' },
  ]) {
    assert.equal(
      localFixedOtpEnabled({ ...enabled, ...override }),
      false,
      JSON.stringify(override),
    );
  }
});

test('OTP generation uses 123456 only in the explicitly enabled local test mode', (context) => {
  context.mock.method(crypto, 'randomInt', () => 654321);
  assert.equal(generateOtpCode({ ...localEnvironment, LOCAL_FIXED_OTP_ENABLED: 'true' }), '123456');
  for (const environment of [
    {},
    localEnvironment,
    { ...localEnvironment, LOCAL_FIXED_OTP_ENABLED: 'false' },
    { ...localEnvironment, LOCAL_FIXED_OTP_ENABLED: 'true', APP_ENV: 'staging' },
    { ...localEnvironment, LOCAL_FIXED_OTP_ENABLED: 'true', NODE_ENV: 'production' },
    { ...localEnvironment, LOCAL_FIXED_OTP_ENABLED: 'true', SMS_PROVIDER: 'not-configured' },
  ]) {
    // A deterministic crypto stub proves that unsafe environments take the random
    // branch, without a flaky assertion that a real random code cannot be 123456.
    assert.equal(generateOtpCode(environment), '654321');
  }
});

test('normal OTP generation produces six decimal digits', () => {
  assert.match(generateOtpCode(localEnvironment), /^\d{6}$/);
});
