import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base } from './helpers';

test('API documentation is unavailable over HTTP and public health reveals only readiness', async () => {
  const origin = new URL(base).origin;
  for (const path of ['/api/docs', '/api/docs-json', '/api/openapi.json', '/docs/openapi.json']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404, path);
    assert.ok(!(await response.text()).includes('"openapi"'));
  }
  for (const [path, status] of [
    ['/health', 'ok'],
    ['/health/live', 'ok'],
    ['/health/ready', 'ready'],
  ]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('local developer endpoints reject browser, proxy and missing-secret access', async () => {
  const key = process.env.LOCAL_DEV_KEY!;
  const path = `${base}/developer/inbox?phone=%2B998900000000`;
  for (const headers of [
    {},
    { 'x-dev-key': 'invalid-local-key' },
    { 'x-dev-key': key, origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' },
    { 'x-dev-key': key, 'x-forwarded-for': '127.0.0.1' },
    { 'x-dev-key': key, forwarded: 'for=127.0.0.1' },
  ]) {
    const response = await fetch(path, { headers: headers as Record<string, string> });
    assert.equal(response.status, 404);
  }
  const direct = await fetch(path, { headers: { 'x-dev-key': key } });
  assert.equal(direct.status, 200);
  for (const route of [
    'payments/00000000-0000-4000-8000-000000000000/simulate',
    'files/00000000-0000-4000-8000-000000000000/review',
  ]) {
    const denied = await fetch(`${base}/developer/${route}`, { method: 'POST' });
    assert.equal(denied.status, 404);
    const unauthenticated = await fetch(`${base}/developer/${route}`, {
      method: 'POST',
      headers: { 'x-dev-key': key },
    });
    assert.equal(unauthenticated.status, 401);
  }
});
