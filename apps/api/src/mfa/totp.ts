import { createHmac, timingSafeEqual } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(data: Buffer) {
  let bits = 0,
    value = 0,
    result = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
export function totp(secret: Buffer, counter: bigint, digits = 6) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(counter);
  const hash = createHmac('sha1', secret).update(bytes).digest();
  const offset = hash[hash.length - 1]! & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
export function verifyTotp(
  secret: Buffer,
  code: string,
  lastCounter: bigint,
  now = Date.now(),
): bigint | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = BigInt(Math.floor(now / 30_000));
  for (const counter of [current - 1n, current, current + 1n]) {
    if (
      counter > lastCounter &&
      timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code))
    )
      return counter;
  }
  return null;
}
