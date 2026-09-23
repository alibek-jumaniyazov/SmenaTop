export function calculateWage(input: {
  startedAt: Date;
  endedAt: Date;
  breakMinutes: number;
  scheduledStart: Date;
  scheduledEnd: Date;
  payType: string;
  rateMinor: bigint;
  overtimeApproved?: boolean;
}) {
  if (
    input.endedAt <= input.startedAt ||
    input.rateMinor < 0n ||
    !Number.isInteger(input.breakMinutes) ||
    input.breakMinutes < 0
  ) {
    throw new Error('INVALID_TIMESHEET');
  }
  // Full elapsed minutes, capped at the agreed shift window unless an audited correction approves overtime.
  const start = input.overtimeApproved
    ? input.startedAt
    : new Date(Math.max(input.startedAt.getTime(), input.scheduledStart.getTime()));
  const end = input.overtimeApproved
    ? input.endedAt
    : new Date(Math.min(input.endedAt.getTime(), input.scheduledEnd.getTime()));
  const minutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
  const paidMinutes = Math.max(0, minutes - input.breakMinutes);
  // Half-up rounding to one tiyin. No floating point money arithmetic.
  const amountMinor =
    input.payType === 'FIXED'
      ? input.rateMinor
      : (input.rateMinor * BigInt(paidMinutes) + 30n) / 60n;
  return { paidMinutes, amountMinor };
}

export function attendanceTransition(status: string, kind: string): string {
  if (kind === 'CHECK_IN' && status === 'CONFIRMED') return 'CHECKED_IN';
  if (kind === 'CHECK_OUT' && status === 'CHECKED_IN') return 'CHECKED_OUT';
  throw new Error('INVALID_ATTENDANCE_TRANSITION');
}

export function wageTransition(
  status: string,
  action: 'approve' | 'mark-paid' | 'confirm' | 'dispute',
): string {
  if (action === 'approve' && status === 'CALCULATED') return 'APPROVED';
  if (action === 'mark-paid' && status === 'APPROVED') return 'EMPLOYER_MARKED_PAID';
  if (action === 'confirm' && status === 'EMPLOYER_MARKED_PAID') return 'WORKER_CONFIRMED';
  if (action === 'dispute' && status !== 'DISPUTED') return 'DISPUTED';
  throw new Error('INVALID_WAGE_TRANSITION');
}
