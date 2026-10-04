import { randomInt } from 'node:crypto';

export function localFixedOtpEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return (
    environment.APP_ENV === 'local' &&
    environment.NODE_ENV !== 'production' &&
    environment.SMS_PROVIDER === 'local' &&
    environment.LOCAL_FIXED_OTP_ENABLED === 'true'
  );
}

export function generateOtpCode(environment: NodeJS.ProcessEnv = process.env): string {
  return localFixedOtpEnabled(environment)
    ? '123456'
    : randomInt(0, 1_000_000).toString().padStart(6, '0');
}
