import { z } from 'zod';
export function validateEnvironment() {
  const environment = z
    .object({
      APP_ENV: z.enum(['local', 'staging', 'production']),
      DATABASE_URL: z.string().startsWith('postgresql://'),
      REDIS_URL: z.string().min(1),
      OTP_PEPPER: z.string().min(32),
      CORS_ORIGINS: z.string().min(1).optional(),
      WEB_ORIGIN: z.string().optional(),
      SMS_PROVIDER: z.enum(['local', 'not-configured']).default('local'),
      LOCAL_DEV_KEY: z.string().min(24).optional(),
      LOCAL_MOCK_PAYMENTS: z.enum(['true', 'false']).default('false'),
      DEV_TOOLS_ENABLED: z.enum(['true', 'false']).default('false'),
      SESSION_SECRET: z.string().optional(),
      STORAGE_DRIVER: z.string().optional(),
      FILE_SIGNING_SECRET: z.string().min(32),
      MFA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
    })
    .passthrough()
    .parse(process.env);
  if (environment.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
    if (
      environment.APP_ENV !== 'production' ||
      environment.SMS_PROVIDER === 'local' ||
      environment.LOCAL_MOCK_PAYMENTS === 'true' ||
      environment.DEV_TOOLS_ENABLED === 'true' ||
      environment.LOCAL_DEV_KEY
    )
      throw new Error('Unsafe production configuration: local adapters or developer tools enabled');
  }
  return environment;
}
