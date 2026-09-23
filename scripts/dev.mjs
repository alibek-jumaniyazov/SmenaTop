import 'dotenv/config';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

if (process.env.STORAGE_LOCAL_PATH)
  process.env.STORAGE_LOCAL_PATH = resolve(process.env.STORAGE_LOCAL_PATH);

const runner = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const children = ['@smenatop/api', '@smenatop/web', '@smenatop/jobs'].map((name) =>
  spawn(runner, ['--filter', name, 'dev'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children)
  child.on('exit', (code) => {
    if (!stopping && code) stop(code);
  });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
