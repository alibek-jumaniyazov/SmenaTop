import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32, totp, verifyTotp } from './totp';

test('RFC 6238 SHA1 published vectors including after 2038', () => {
  const secret = Buffer.from('12345678901234567890');
  for (const [seconds, expected] of [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ] as const) {
    assert.equal(totp(secret, BigInt(Math.floor(seconds / 30)), 8), expected);
  }
});
test('TOTP rejects reused counters and malformed input', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.equal(verifyTotp(secret, '287082', 0n, 59_000), 1n);
  assert.equal(verifyTotp(secret, '287082', 1n, 59_000), null);
  assert.equal(verifyTotp(secret, '2870820', 0n, 59_000), null);
  assert.equal(base32(Buffer.from('foobar')), 'MZXW6YTBOI');
});
