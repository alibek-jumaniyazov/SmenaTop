export function validateJobsEnvironment(env: NodeJS.ProcessEnv) {
  if (
    !['local', 'staging', 'production'].includes(env.APP_ENV || '') ||
    !env.DATABASE_URL?.startsWith('postgresql://') ||
    !env.REDIS_URL
  )
    throw new Error('Jobs require explicit environment, database and Redis configuration');
  if (env.APP_ENV === 'production' || env.NODE_ENV === 'production') {
    if (
      env.APP_ENV !== 'production' ||
      env.LOCAL_MOCK_PAYMENTS === 'true' ||
      env.SMS_PROVIDER === 'local' ||
      env.DEV_TOOLS_ENABLED === 'true' ||
      env.LOCAL_DEV_KEY
    )
      throw new Error('Production rejects local adapters');
  }
  const redis = new URL(env.REDIS_URL);
  if (!['redis:', 'rediss:'].includes(redis.protocol))
    throw new Error('Redis URL protocol invalid');
  return redis;
}
