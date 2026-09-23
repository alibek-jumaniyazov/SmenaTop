# State machines

## Shift and booking

`DRAFT → PUBLISHED → IN_PROGRESS → COMPLETED → CLOSED`; draft or not-yet-started published shifts may become `CANCELLED`. Staffing `OPEN/PARTIALLY_FILLED/FILLED` is derived from active assignments, independently of lifecycle. Started work requires preserved attendance and an audited close path; never silently delete its worked time.

The lifecycle is driven transactionally by attendance, no-show, assignment cancellation, approvals and the employer's close action:

| Transition                | Trigger and conditions                                                                                                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLISHED → IN_PROGRESS` | First actual check-in, or a lifecycle action after scheduled start. Early check-in is actual operational start; it closes new application/acceptance under the active-shift policy.                                                                                                       |
| `IN_PROGRESS → COMPLETED` | Every assignment is resolved for attendance: none remains `CONFIRMED` or `CHECKED_IN`. A checked-out worker may still have a pending timesheet. An empty shift can complete after scheduled end when the employer closes it. No-show and cancellation never create fictitious timesheets. |
| `COMPLETED → CLOSED`      | Authorized employer `POST /api/v1/organizations/:org/shifts/:id/close` with a reason. Every worked assignment has both timesheet approvals, an approved wage calculation and no open dispute. The request is idempotent.                                                                  |

`CHECKED_OUT` records ended attendance; it becomes assignment `COMPLETED` only after both worker and manager approve the timesheet. Operational closure does not mark wages paid. `APPROVED`, `EMPLOYER_MARKED_PAID` and `WORKER_CONFIRMED` remain distinct and payment attestations remain available after the shift is closed. Later disputes remain possible without silently reopening or rewriting the recorded shift history.

These changes hold the shift row lock and persist state, version, audit and an outbox event together. Concurrent checkout/close cannot duplicate lifecycle events. `synchronizeShiftLifecycle` is reusable by a future time-based sweep, but no periodic lifecycle scheduler is registered in v1: an untouched shift does not change stored status merely because a wall-clock minute passed. Its start/end dates still independently prevent late applications/acceptance. The explicit employer close handles an unattended expired empty shift; unresolved checked-in/confirmed workers require checkout, no-show or audited early close.

Applications: `SUBMITTED → SHORTLISTED → OFFERED → ACCEPTED`, with `REJECTED`, `WITHDRAWN` and `EXPIRED` terminal paths. Offers: `PENDING → ACCEPTED/REVOKED/EXPIRED`. Offers reserve no capacity; acceptance can return 409 if the last place was just taken. Revocation must recompute application state.

Assignments: `CONFIRMED → CHECKED_IN → CHECKED_OUT → COMPLETED`; cancellation records which party acted and why. `NO_SHOW` is a disputed operational fact, not an automatic permanent ban. Replacements always require a new offer and consent. ActiveBooking exists only while capacity/time must remain reserved; it is changed in the same transaction as assignment cancellation.

## Attendance and worker wages

A timesheet starts `OPEN`, then `PENDING_APPROVAL`, and becomes `APPROVED` once both manager and worker approve. Corrections before final approval reset both approvals and retain the previous values in audit. Approved records require a dispute workflow.

Wages: `CALCULATED → APPROVED → EMPLOYER_MARKED_PAID → WORKER_CONFIRMED`, with `DISPUTED` separately represented. Employer marking is not bank confirmation. An organization cannot perform the worker's acknowledgment. Platform subscription revenue excludes every wage record.

Amounts are integer tiyin; paid minutes use documented rounding and unpaid breaks. Do not infer hourly wages with floating-point decimal money. Overtime needs explicit audited agreement. Midnight crossing is a normal timestamp interval, not a same-day special case.

## Subscription and payments

Subscriptions: `TRIALING`, `ACTIVE`, `PAST_DUE`, `EXPIRED`, `CANCELLED`. `cancelAtPeriodEnd` does not immediately erase paid entitlement. Effective dates are checked on each publish, independent of cron status. Previously confirmed work remains accessible after expiry.

Invoice attempts progress independently from invoice fulfillment. An authenticated successful provider event may fulfill an invoice once; redirects never do. A duplicate callback is idempotent; a later ordinary failure does not overwrite success. Full refund is a separately authorized and audited transition and revokes the associated entitlement according to the documented policy.

The first paid trial period starts at successful payment time. An active renewal starts at the existing paid end; an expired renewal starts at payment time. Month boundaries use the original calendar anchor, with clamping in short months. Prepaid future plan versions do not replace the current effective plan before their start.

## Verification

`UNVERIFIED → PENDING → VERIFIED/REJECTED`; `SUSPENDED` blocks eligibility. Phone OTP verification is separate from identity/skill/organization review. Only an explicit platform verification grant permits a review. Private-document access is a separate permission.
