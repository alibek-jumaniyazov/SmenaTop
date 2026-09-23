import { readFile, writeFile, mkdir } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const check = process.argv.includes('--check');
const source = process.env.OPENAPI_URL ?? 'http://127.0.0.1:3000/api/openapi.json';
const response = await fetch(source);
if (!response.ok) throw new Error(`OpenAPI request failed: ${response.status}`);
const spec = await response.json();
const schema = astToString(await openapiTS(spec));
const file = new URL('../packages/api-client/src/schema.d.ts', import.meta.url);
if (check) {
  if ((await readFile(file, 'utf8')) !== schema)
    throw new Error('OpenAPI client drift. Run pnpm api:generate.');
  console.log('OpenAPI client matches running API.');
} else {
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
  await writeFile(file, schema);
  await writeFile(
    new URL('../docs/openapi.json', import.meta.url),
    `${JSON.stringify(spec, null, 2)}\n`,
  );
  console.log('Generated OpenAPI types and stored API contract.');
}
