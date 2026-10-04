import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const check = process.argv.includes('--check');
let spec;
if (process.env.OPENAPI_FILE) spec = JSON.parse(await readFile(process.env.OPENAPI_FILE, 'utf8'));
else {
  const temporary = await mkdtemp(join(tmpdir(), 'smenatop-contract-'));
  const cleanupPath = resolve(temporary);
  if (
    dirname(cleanupPath) !== resolve(tmpdir()) ||
    !basename(cleanupPath).startsWith('smenatop-contract-')
  )
    throw new Error('Unexpected contract export cleanup directory');
  const output = join(temporary, 'openapi.json');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--env-file-if-exists=.env', 'apps/api/dist/main.js'],
        {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          env: {
            ...process.env,
            DEV_TOOLS_ENABLED: 'false',
            OPENAPI_OUTPUT: output,
            OPENAPI_EXPORT_ONLY: 'true',
          },
          stdio: 'ignore',
          windowsHide: true,
        },
      );
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                'Offline contract export failed. Build @smenatop/api and check server environment configuration.',
              ),
            ),
      );
    });
    spec = JSON.parse(await readFile(output, 'utf8'));
  } finally {
    await rm(cleanupPath, { recursive: true, force: true });
  }
}
const schema = astToString(await openapiTS(spec));
const file = new URL('../packages/api-client/src/schema.d.ts', import.meta.url);
if (check) {
  if ((await readFile(file, 'utf8')) !== schema)
    throw new Error('OpenAPI client drift. Run pnpm api:generate.');
  console.log('OpenAPI client matches the offline API contract.');
} else {
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
  await writeFile(file, schema);
  await writeFile(
    new URL('../docs/openapi.json', import.meta.url),
    `${JSON.stringify(spec, null, 2)}\n`,
  );
  console.log('Generated OpenAPI types and stored API contract.');
}
