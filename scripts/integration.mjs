import { spawn } from 'node:child_process';

if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    'Set TEST_DATABASE_URL to an isolated PostgreSQL test database. Never point it at production.',
  );
if (
  process.env.TEST_DATABASE_URL === process.env.DATABASE_URL ||
  process.env.APP_ENV === 'production'
)
  throw new Error('Integration tests require a distinct non-production database.');
const env = {
  ...process.env,
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  PORT: '3001',
  APP_ENV: 'local',
  NODE_ENV: 'test',
  QUEUE_NAMESPACE: 'smenatop-integration-test',
  LOCAL_MOCK_PAYMENTS: 'true',
  SMS_PROVIDER: 'local',
  DEV_TOOLS_ENABLED: 'true',
};
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Command failed: ${args[0]} (${code})`)),
    );
  });
await run([
  'node_modules/prisma/build/index.js',
  'migrate',
  'deploy',
  '--schema',
  'prisma/schema.prisma',
]);
const api = spawn(process.execPath, ['apps/api/dist/main.js'], { env, stdio: 'pipe' });
let output = '';
api.stdout.on('data', (chunk) => {
  output = (output + chunk.toString()).slice(-5000);
});
api.stderr.on('data', (chunk) => {
  output = (output + chunk.toString()).slice(-5000);
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 180; attempt++) {
    if (api.exitCode !== null) throw new Error(`Test API exited: ${output}`);
    try {
      const response = await fetch('http://127.0.0.1:3001/api/v1/health/live');
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    if (attempt > 0 && attempt % 40 === 0)
      console.log(`Waiting for isolated test API startup (${attempt / 2}s)...`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error(`Test API did not become healthy: ${output}`);
  const { readdir } = await import('node:fs/promises');
  const tests = (await readdir('tests/integration'))
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => `tests/integration/${name}`);
  await run(['--import', 'tsx', '--test', '--test-concurrency=1', ...tests]);
} finally {
  api.kill('SIGTERM');
}
