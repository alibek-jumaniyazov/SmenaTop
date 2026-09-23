// Maintainer utility for the first schema only. Never overwrite deployed migrations.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
const destination = 'prisma/migrations/202609220001_initial/migration.sql';
if (existsSync(destination))
  throw new Error('Initial migration already exists. Create an incremental migration instead.');
const sql = execFileSync(
  process.execPath,
  [
    'node_modules/prisma/build/index.js',
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--script',
  ],
  { encoding: 'utf8' },
);
mkdirSync('prisma/migrations/202609220001_initial', { recursive: true });
writeFileSync(destination, sql);
