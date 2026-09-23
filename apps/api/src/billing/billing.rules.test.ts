import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calendarMonthEnd,
  constantTimeEquals,
  minorToSum,
  nextPaidPeriod,
  parseMinor,
  preserveSuccess,
  sumToMinor,
} from './billing.rules';

describe('integer money and payment monotonicity', () => {
  it('converts tiyin without floating point, rejects malformed/negative input', () => {
    assert.equal(sumToMinor('499000.01'), 49900001n);
    assert.equal(minorToSum(49900001n), '499000.01');
    assert.equal(parseMinor('999999999999999999'), 999999999999999999n);
    for (const input of ['1.001', '-5', '1e5', 'NaN', '1,000'])
      assert.throws(() => sumToMinor(input));
  });
  it('does not roll paid transactions back on a late failure', () => {
    assert.equal(preserveSuccess('SUCCESS', 'FAILED'), 'SUCCESS');
    assert.equal(preserveSuccess('SUCCESS', 'PENDING'), 'SUCCESS');
    assert.equal(preserveSuccess('FAILED', 'SUCCESS'), 'SUCCESS');
    assert.equal(preserveSuccess('REFUNDED', 'SUCCESS'), 'REFUNDED');
    assert.equal(constantTimeEquals('correct', 'wrong'), false);
    assert.equal(constantTimeEquals('correct', 'correct'), true);
  });
});

describe('calendar billing in Asia/Tashkent', () => {
  it('preserves Jan 31 anchor through leap February and March', () => {
    const jan = new Date('2024-01-31T00:30:00+05:00');
    const feb = calendarMonthEnd(jan, 31);
    assert.equal(feb.toISOString(), '2024-02-28T19:30:00.000Z');
    assert.equal(calendarMonthEnd(feb, 31).toISOString(), '2024-03-30T19:30:00.000Z');
  });
  it('caps non-leap month ends, crosses December', () => {
    assert.equal(
      calendarMonthEnd(new Date('2025-01-31T12:00:00+05:00'), 31).toISOString(),
      '2025-02-28T07:00:00.000Z',
    );
    assert.equal(
      calendarMonthEnd(new Date('2025-12-31T12:00:00+05:00'), 31).toISOString(),
      '2026-01-31T07:00:00.000Z',
    );
  });
  it('starts first paid trial period immediately; expired subscription reanchors', () => {
    const paidAt = new Date('2026-09-22T20:00:00+05:00');
    const trial = nextPaidPeriod(
      { status: 'TRIALING', currentPeriodEnd: new Date('2026-09-29T00:00:00Z'), anchorDay: 15 },
      paidAt,
    );
    assert.equal(trial.start.toISOString(), paidAt.toISOString());
    assert.equal(trial.end.toISOString(), '2026-10-22T15:00:00.000Z');
    const expired = nextPaidPeriod(
      { status: 'ACTIVE', currentPeriodEnd: new Date('2026-08-31T00:00:00Z'), anchorDay: 31 },
      paidAt,
    );
    assert.equal(expired.anchorDay, 22);
  });
  it('prepaid active renewal starts at paid-through end', () => {
    const end = new Date('2026-09-30T19:30:00Z'); // October 1 in Tashkent
    const period = nextPaidPeriod(
      { status: 'ACTIVE', currentPeriodEnd: end, anchorDay: 1 },
      new Date('2026-09-22T00:00:00Z'),
    );
    assert.equal(period.start.toISOString(), end.toISOString());
    assert.equal(period.end.toISOString(), '2026-10-31T19:30:00.000Z');
  });
});
