import { createHash, timingSafeEqual } from 'node:crypto';

/** Domain money is integer tiyin. JSON/API money is a decimal integer string. */
export function parseMinor(value: string): bigint {
  if (!/^\d{1,18}$/.test(value)) throw new Error('INVALID_AMOUNT');
  return BigInt(value);
}

export function sumToMinor(value: string): bigint {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) throw new Error('INVALID_AMOUNT');
  const [sum, fraction = ''] = value.split('.');
  return BigInt(sum!) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function minorToSum(value: bigint): string {
  if (value < 0n) throw new Error('INVALID_AMOUNT');
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

/** Calendar anchor uses Asia/Tashkent (UTC+05, no DST); preserve the original day across short months. */
export function calendarMonthEnd(start: Date, anchorDay: number): Date {
  if (anchorDay < 1 || anchorDay > 31 || !Number.isInteger(anchorDay))
    throw new Error('INVALID_ANCHOR');
  const local = new Date(start.getTime() + 5 * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const end = new Date(local);
  end.setUTCDate(1);
  end.setUTCFullYear(year, month, Math.min(anchorDay, last));
  return new Date(end.getTime() - 5 * 60 * 60 * 1000);
}

export function tashkentDay(date: Date): number {
  return new Date(date.getTime() + 5 * 60 * 60 * 1000).getUTCDate();
}

export function nextPaidPeriod(
  subscription: { status: string; currentPeriodEnd: Date; anchorDay: number },
  paidAt: Date,
) {
  const active = subscription.status !== 'TRIALING' && subscription.currentPeriodEnd > paidAt;
  const start = active ? subscription.currentPeriodEnd : paidAt;
  const anchorDay = active ? subscription.anchorDay : tashkentDay(paidAt);
  return { start, end: calendarMonthEnd(start, anchorDay), anchorDay };
}

export function constantTimeEquals(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}

export function payloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function preserveSuccess(current: string, incoming: string): string {
  if (current === 'REFUNDED') return current;
  if (current === 'SUCCESS' && ['FAILED', 'PENDING', 'CANCELLED'].includes(incoming))
    return current;
  return incoming;
}
