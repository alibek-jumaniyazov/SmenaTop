# Payments and worker wages

Documentation checked: **2026-09-22**. Integration status describes observed verification, not a marketing claim. No real money was moved while building this repository.

## Provider status and activation

| Provider           | Default state                                                | Implemented                                                                                                                                                               | External release gate                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local mock         | `LOCAL_MOCK` only when explicitly enabled outside production | Authenticated simulator, pending, success, failure, cancel, duplicate, late callback, invalid authentication/amount, full refund                                          | None for synthetic local tests; never a substitute for merchant sandbox tests                                                                                            |
| Payme Merchant API | `NOT_CONFIGURED`                                             | Hosted checkout URL, six documented JSON-RPC methods, Basic authentication, amount/account/environment checks, timeout, refund/cancellation, durable status and statement | Merchant onboarding, separate test key, configured endpoint/account field, actual Payme sandbox acceptance, fiscal configuration, then live approval                     |
| Click Shop API     | `NOT_CONFIGURED` / protocol verification `BLOCKED`           | Capability boundary and explicit disabled reason                                                                                                                          | The official requests route returned only the overview in the available retrieval, so its signature formula and prepare/complete fields are not implemented by guesswork |
| Bank transfer      | `NOT_CONFIGURED` until bank details are supplied             | Invoice instructions, private evidence submission, separate finance confirmation with a bank reference, common atomic fulfillment                                         | Operator bank details, process for independently checking the bank statement, authorized finance staff                                                                   |

Configured Payme is reported `UNVERIFIED` until external testing is documented. Enabling credentials does not make it `SANDBOX_VERIFIED` or `LIVE_VERIFIED`. Bank's configured state is `MANUAL_VERIFICATION`, not an online gateway claim.

### Local test setup

Use `APP_ENV=local`, `NODE_ENV=development`, `LOCAL_MOCK_PAYMENTS=true` and a random server-only `MOCK_PAYMENT_SECRET` of at least 32 characters. Both `Organization.synthetic` and `Organization.isDemo` must be true. A member with `billing.manage` can operate their synthetic organization's mock attempt; a developer with `developer.tools` can operate only synthetic mock attempts. Production does not register the simulator controller, and the service also denies it.

1. Read `GET /api/v1/billing/plans` and `GET /api/v1/organizations/:id/billing`.
2. `POST /api/v1/organizations/:id/billing/checkout` with `planVersionId` and `provider: "MOCK"`.
3. On the returned attempt, `POST /api/v1/developer/payments/:attemptId/simulate` with `scenario` set to `success`, `failure`, `pending`, `cancel`, `duplicate`, `late`, `wrong_amount`, or `invalid_auth`.
4. Inspect the persisted invoice, entitlement, provider transactions, outbox and reconciliation queue. `late` sends failure before authenticated success. Repeating checkout before payment reuses the pending invoice and adds an attempt.
5. Platform Finance with `billing.refund` can use `POST /api/v1/admin/payments/:transactionId/refund` with a reason to test full mock refund. Refund has a unique transaction key; replay never issues another refund.

## Payme Merchant API

Primary sources:

- [Merchant methods](https://developer.help.paycom.uz/metody-merchant-api/), [request format](https://developer.help.paycom.uz/protokol-merchant-api/format-zaprosa/), [common errors](https://developer.help.paycom.uz/protokol-merchant-api/obschie-oshibki/).
- [CreateTransaction and the 12-hour timeout](https://developer.help.paycom.uz/metody-merchant-api/createtransaction/), [PerformTransaction](https://developer.help.paycom.uz/metody-merchant-api/performtransaction/), [CancelTransaction](https://developer.help.paycom.uz/metody-merchant-api/canceltransaction/).
- [Types and states](https://developer.help.paycom.uz/metody-merchant-api/tipy-dannykh/), [checkout GET encoding](https://developer.help.paycom.uz/initsializatsiya-platezhey/otpravka-cheka-po-metodu-get/), [merchant sandbox instructions](https://developer.help.paycom.uz/pesochnitsa/).

The callback endpoint is `POST /api/v1/payments/payme`. JSON-RPC replies use HTTP 200. Authentication is the documented HTTP Basic header; the merchant login and key come from server configuration and comparison is constant-time. It is not an invented HMAC protocol. The one-time account field configured in the merchant portal must be `order_id`, containing the SmenaTop **payment attempt UUID**. The attempt links to one immutable-price invoice and its organization.

Set `PAYME_ENABLED=true`, `PAYME_ENVIRONMENT=SANDBOX`, `PAYME_MERCHANT_ID`, `PAYME_LOGIN`, and `PAYME_KEY` only after creating the merchant test configuration. Use the merchant-issued test key. Configure the public HTTPS billing endpoint in the portal. Sandbox Merchant checkout uses `https://test.paycom.uz`; live checkout uses `https://checkout.paycom.uz`. These are different from Subscribe API endpoints. The adapter rejects a LIVE provider in a nonproduction app, and a SANDBOX provider in production.

The hosted URL contains base64-encoded `m`, `ac.order_id`, `a` and `l` parameters. `a` is integer tiyin. The backend rejects nonpositive or unsafe JavaScript integer amounts before creating the provider URL. No card input, PAN, CVV or card OTP enters SmenaTop. The redirect never marks an invoice paid.

| RPC method                | Behavior                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CheckPerformTransaction` | Validates one-time order, provider environment, UZS and exact amount; returns `allow` only while payable                                                                                                   |
| `CreateTransaction`       | Persists provider ID and provider creation time, rejects another active Payme transaction for the invoice, returns the same transaction on replay, expires pending transactions after 43,200,000 ms        |
| `PerformTransaction`      | Requires a created nonexpired transaction; locks the subscription and fulfills exactly once                                                                                                                |
| `CancelTransaction`       | Persists reason/time and returns a stable replay result; pending cancellation maps to -1, cancellation after success maps to -2 and records a full refund; fully consumed periods return documented -31007 |
| `CheckTransaction`        | Returns the durable create/perform/cancel times, merchant transaction ID, state and cancellation reason                                                                                                    |
| `GetStatement`            | Returns the merchant's durable Payme transactions for the requested provider-time interval, scoped to the configured environment                                                                           |

Raw Payme states are retained separately from internal status: 1 → `PENDING`, 2 → `SUCCESS`, -1 → `CANCELLED`, -2 → `REFUNDED`. Merchant API is provider-initiated: a local status lookup or `GetStatement` response is not an independently queried bank confirmation. The platform cannot initiate a Payme refund with a made-up outbound API; finance initiates it in the merchant portal and the authenticated `CancelTransaction` callback performs local reversal. The unsupported outbound refund button stays disabled.

The [Subscribe API protocol](https://developer.help.paycom.uz/protokol-subscribe-api/) was also read. It documents a separate request direction and X-Auth mechanism. It is not used by this implementation. Recurring charging remains disabled; merchant capabilities, explicit consent, and a separate design review are required before adding it.

## Click verification block

The [official homepage](https://docs.click.uz/) describes Shop API prepare/complete. The [official requests route](https://docs.click.uz/shop-api/requests), legacy route and payment-link route returned the same overview to the available retrieval on the date above. This did not establish the signature formula, exact amount serialization, field ordering or response semantics. The adapter is disabled and no successful Click test is claimed. Obtain readable current Shop API documentation and merchant sandbox credentials, implement contract tests, then run actual provider tests before activation.

## Atomic fulfillment and calendar rules

All domain amounts are `BigInt` integer **tiyin**; API serialization emits decimal strings. Display formatting can divide by 100 for UZS. Money calculation never uses decimal floating point. Provider-specific conversion is explicit, rather than treating all gateways identically.

The database protects `(provider, environment, providerTransactionId)`, `(provider, environment, eventKey)`, and `(subscriptionId, renewalSequence)` with unique constraints. A subscription row lock serializes fulfillment and refund. A payment event key with different payload conflicts. `Invoice.fulfilledTransactionId` identifies the exact payment that granted access, so refunding an overpayment does not revoke the original entitlement.

Invoice, payment status, entitlement, subscription and outbox commit together. A second successful transaction remains visible and creates a reconciliation case; it cannot grant a second period. A paid transaction ignores late ordinary failure/pending messages. Refund is a separate irreversible domain transition, and replay cannot resurrect the refunded period.

Invoices snapshot price, plan version, limits and fiscal-configuration state. Choosing another plan before payment supersedes the old pending invoice while retaining the renewal sequence. A late payment to the superseded invoice goes to reconciliation. Successful fulfillment sets actual period dates once. Trial payment starts now and revokes the remaining trial; expired payment reanchors now; an active prepayment starts at the paid-through period end. Months use the original Asia/Tashkent calendar day (31 → February 28/29 → March 31), not 30-day arithmetic. Future entitlement rows do not replace the currently effective plan. Access checks must find a nonrevoked interval containing server time; a stale subscription status alone cannot grant access.

Cancellation at period end retains paid access. Full refund revokes only the purchased entitlement and recomputes paid-through end without deleting historical invoices, worker accounts or ongoing assignments. No partial refund UI is offered.

## Reconciliation and bank transfer

The jobs process inspects pending attempts and emits durable finance cases rather than guessing success. A pending timeout is not payment failure proof. Inspect `GET /api/v1/admin/billing` with `billing.reconcile`; provider transport failures, retry/backoff and dead-letter handling belong to jobs. Resolve duplicate/late payment cases through verified provider cancellation/refund or documented bank review. Financial evidence and audit records are retained.

For bank transfer, set `BANK_BENEFICIARY` and `BANK_ACCOUNT_REFERENCE`. Checkout returns the invoice payment reference and exact amount. `POST /api/v1/payments/:attemptId/bank-evidence` accepts a clean private evidence-file ID and bank reference from the organization finance member. Submission leaves payment pending. `POST /api/v1/admin/payments/:attemptId/bank-confirm` requires `billing.reconcile`, matching evidence, exact amount, bank reference, reason and `independentlyVerified: true`; the operator must independently compare against the actual bank statement. Provider transaction IDs derive from the bank reference, preventing the same reference from paying multiple invoices. Bank refunds are not automated or advertised as supported.

## Worker wage policy — separate domain

Attendance records use server time and assignment-specific single-use two-minute tokens. Manual recording requires organization/branch permission and a reason. Check-in opens 30 minutes before the shift and closes at scheduled end. No-show requires the configured grace period and an audited reason; a worker can dispute it.

Timesheet records retain the rate/pay basis snapshot. Hourly calculation counts complete elapsed minutes, subtracts unpaid break minutes, caps unapproved overtime at the shift boundaries and rounds half-up once to one tiyin. Paid breaks have zero deducted minutes. Fixed pay retains the agreed fixed amount; a manager can propose an audited correction before approval, resetting both approvals. Worker and manager approvals are separate. Approved financial history cannot be edited through ordinary correction.

Wage states are `CALCULATED` → `APPROVED` → `EMPLOYER_MARKED_PAID` → `WORKER_CONFIRMED`; dispute is separate. The employer mark does not imply receipt by the worker or bank confirmation. No wage money is added to subscription revenue, and no wallet, escrow or payout is implemented. A future payroll adapter needs its own legal/contract/provider design and explicit activation.

## Verification evidence

Unit coverage is in `apps/api/src/billing/billing.rules.test.ts` and `apps/api/src/operations/attendance.rules.test.ts`; database/API coverage is in `tests/integration/operations.test.ts`. The latter includes local Payme-protocol calls against PostgreSQL. Those are **local implementation tests, not Payme sandbox verification**. Exact executed commands and results are recorded in `docs/TEST_REPORT.md`.

| Integration                | Code state                                                                        | Local evidence                                                                                                                                                                                                          | External status                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Mock subscription payments | Implemented, explicitly guarded                                                   | Real PostgreSQL/API tests cover auth/amount rejection, concurrent double payment, replay, superseded late payment, trial conversion and full refund                                                                     | `LOCAL_MOCK`; no external gateway involved                                                                                                    |
| Payme Merchant API         | Six RPC methods and hosted checkout implemented from the sources above            | Real PostgreSQL protocol test uses synthetic local credentials; checks authentication, exact amount, transaction replay, pending-transaction conflict, perform, statement, cancellation, timeout and refund persistence | `NOT_CONFIGURED` in the delivered default environment; neither `SANDBOX_VERIFIED` nor `LIVE_VERIFIED`                                         |
| Click Shop API             | **Code implementation blocked**, except the explicit disabled capability boundary | No Click prepare/complete/signature test has been executed                                                                                                                                                              | `BLOCKED` protocol implementation; default UI/API `NOT_CONFIGURED`. This is an unfinished code integration, separate from missing credentials |
| Bank transfer              | Evidence and independently attested finance confirmation implemented              | Synthetic database fixtures exercise evidence-pending and idempotent confirmation; no bank statement or real transfer was checked                                                                                       | `NOT_CONFIGURED` without operator bank details; no external bank verification claim                                                           |

The newly added SSE, early-close and bank tests are listed as executed only when their result appears in the final test report. Do not infer that merely finding a test file establishes a passing run.
