import { access, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const destination = new URL('../.env', import.meta.url);
try {
  await access(destination);
  console.log('.env already exists; preserved.');
} catch {
  let text = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  const databasePassword = randomBytes(24).toString('hex');
  text = text
    .replaceAll('smenatop:GENERATE_ME@', `smenatop:${databasePassword}@`)
    .replace('POSTGRES_PASSWORD=GENERATE_ME', `POSTGRES_PASSWORD=${databasePassword}`);
  const accessKey = randomBytes(16).toString('hex');
  const secretKey = randomBytes(32).toString('hex');
  text = text
    .replace('S3_ACCESS_KEY=GENERATE_ME', `S3_ACCESS_KEY=${accessKey}`)
    .replace('MINIO_ROOT_USER=GENERATE_ME', `MINIO_ROOT_USER=${accessKey}`)
    .replace('S3_SECRET_KEY=GENERATE_ME', `S3_SECRET_KEY=${secretKey}`)
    .replace('MINIO_ROOT_PASSWORD=GENERATE_ME', `MINIO_ROOT_PASSWORD=${secretKey}`);
  text = text.replaceAll('GENERATE_ME', () => randomBytes(32).toString('hex'));
  await writeFile(destination, text, { mode: 0o600 });
  console.log('Created local .env with random secrets. Never commit this file.');
}
