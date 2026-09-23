import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { attendanceTransition, calculateWage, wageTransition } from './attendance.rules';

const shift = {
  startedAt: new Date('2026-09-21T22:00:00+05:00'),
  endedAt: new Date('2026-09-22T06:00:00+05:00'),
  scheduledStart: new Date('2026-09-21T22:00:00+05:00'),
  scheduledEnd: new Date('2026-09-22T06:00:00+05:00'),
  rateMinor: 3000000n,
  payType: 'HOURLY',
  breakMinutes: 30,
};
describe('attendance and wage rules', () => {
  it('handles overnight shift with unpaid break in integer tiyin', () => {
    assert.deepEqual(calculateWage(shift), { paidMinutes: 450, amountMinor: 22500000n });
  });
  it('paid break preserves full elapsed time', () => {
    assert.deepEqual(calculateWage({ ...shift, breakMinutes: 0 }), {
      paidMinutes: 480,
      amountMinor: 24000000n,
    });
  });
  it('fixed wage remains agreed amount; hourly caps unapproved overtime', () => {
    assert.equal(calculateWage({ ...shift, payType: 'FIXED' }).amountMinor, 3000000n);
    assert.equal(
      calculateWage({ ...shift, endedAt: new Date('2026-09-22T08:00:00+05:00') }).paidMinutes,
      450,
    );
    assert.equal(
      calculateWage({
        ...shift,
        endedAt: new Date('2026-09-22T08:00:00+05:00'),
        overtimeApproved: true,
      }).paidMinutes,
      570,
    );
  });
  it('rounds fractional hourly wages once to the nearest tiyin', () => {
    const start = new Date('2026-09-22T00:00:00Z'),
      end = new Date('2026-09-22T00:01:00Z');
    assert.equal(
      calculateWage({
        ...shift,
        startedAt: start,
        endedAt: end,
        scheduledStart: start,
        scheduledEnd: end,
        rateMinor: 100n,
        breakMinutes: 0,
      }).amountMinor,
      2n,
    );
  });
  it('rejects replay state transitions and checkout without checkin', () => {
    assert.equal(attendanceTransition('CONFIRMED', 'CHECK_IN'), 'CHECKED_IN');
    assert.equal(attendanceTransition('CHECKED_IN', 'CHECK_OUT'), 'CHECKED_OUT');
    assert.throws(() => attendanceTransition('CHECKED_OUT', 'CHECK_OUT'));
    assert.throws(() => attendanceTransition('CONFIRMED', 'CHECK_OUT'));
  });
  it('keeps employer marked-paid distinct from worker receipt', () => {
    assert.equal(wageTransition('APPROVED', 'mark-paid'), 'EMPLOYER_MARKED_PAID');
    assert.equal(wageTransition('EMPLOYER_MARKED_PAID', 'confirm'), 'WORKER_CONFIRMED');
    assert.throws(() => wageTransition('APPROVED', 'confirm'));
    assert.throws(() => wageTransition('WORKER_CONFIRMED', 'mark-paid'));
  });
});
