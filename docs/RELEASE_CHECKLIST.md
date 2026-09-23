# Release checklist and remaining implementation

Reviewed against `SmenaTop_Master_Prompt.md` and the repository on 2026-09-22. This is a working local implementation, not a claim that every master-prompt requirement or production release gate is complete. The final commands, counts and browser evidence belong in [TEST_REPORT.md](TEST_REPORT.md).

## Implemented and exercised locally

| Area                         | Current implementation and evidence                                                                                                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace and persistence    | React/Vite, NestJS, PostgreSQL/Prisma, separate BullMQ jobs, pnpm workspace, lockfile, migration history and synthetic seed. Local PostgreSQL and Redis were actually used.                                                                                 |
| Browser identity             | Random, hashed, expiring OTP challenges; protected local inbox; cooldown and attempt limits; opaque HttpOnly sessions; session-bound CSRF; origin checking and revocation. HTTP tests cover login, replay and revoked sessions.                             |
| Privileged identity          | Encrypted TOTP secrets, counter replay prevention, one-use hashed recovery codes and session rotation. Production privileged routes require completed MFA. Tests include RFC vectors and the actual HTTP enrollment flow.                                   |
| Organization isolation       | Current membership, organization permission, branch scope and resource ownership checks. Tests cover other-tenant access, stale membership, scoped manager edits and foreign-key isolation.                                                                 |
| Core consent flow            | Organization onboarding and verification, worker profile and availability, draft/publish, application, offer, worker acceptance and persisted dashboards. Offers do not reserve capacity.                                                                   |
| Booking integrity            | Shift/user locks, durable acceptance idempotency, PostgreSQL range exclusion and capacity constraints. Actual PostgreSQL tests exercise last-place races, cross-organization overlap, adjacent intervals and duplicate requests.                            |
| Subscription limits          | Current entitlement dates, transactional publish quota, member/branch limits, calendar billing periods, trial-to-paid transition and immutable invoice snapshots. Cancellation does not refund publish quota.                                               |
| Attendance and wages         | Assignment-bound one-use tokens, manual attendance with reason, timesheets, distinct worker/manager approvals, integer wage calculation and separate employer-paid/worker-received states.                                                                  |
| Cancellation and early close | Cancellation releases bookings and keeps an audit record. Audited early close preserves work already performed. Replacement requires another offer and acceptance.                                                                                          |
| Local subscription payments  | Synthetic mock success/failure/replay cases, durable fulfillment, duplicate-payment reconciliation and local full refund. Payme Merchant API protocol implementation is exercised by local authenticated protocol tests, not a provider sandbox.            |
| Documents                    | Private storage abstraction, PDF/PNG/JPEG checks, quarantine, owner/operator permission checks and user-bound signed download links. Local quarantine/release and foreign-user download denial are tested.                                                  |
| Communication                | Assignment-scoped messages, reports, persisted notifications, authenticated SSE with cursor recovery and polling fallback. Stream ownership and session revocation are tested.                                                                              |
| Team administration          | Invitations, custom permission sets, scoped member updates and explicit ownership transfer. Target sessions are revoked after privilege changes. Last-owner/transfer behavior is tested.                                                                    |
| Integration keys             | One-time displayed keys, hashes, read scopes, expiry, revocation, organization isolation, Redis rate limit and audit. Tests cover scope, tenant, expiry and revoke behavior.                                                                                |
| Production safeguards        | Tests verify that unsafe local adapter flags fail production validation and that local inbox/payment/file-review controllers are absent from the production module graph.                                                                                   |
| Frontend                     | Public, auth, worker, employer, administration and developer routes use the real API. Uzbek/Russian resources, theme tokens and accessible controls are present. Browser coverage and viewport evidence are limited to what is recorded in the test report. |

The seed contains three synthetic organizations, eighteen workers and thirty shifts, plus examples of applications, assignments, timesheets, wage states, subscriptions, invoices and a dispute. Synthetic accounts and payments must never be treated as actual customers, labor payments or revenue.

## CODE_IMPLEMENTATION — work still required for the full master prompt

These are implementation gaps, not problems that credentials alone resolve. Do not enable or advertise the corresponding capability until its acceptance criteria are implemented and tested.

- [x] **Normal shift lifecycle:** attendance/cancellation/no-show drive `PUBLISHED → IN_PROGRESS → COMPLETED`; authorized employer close requires dual timesheet approvals and no open disputes before `CLOSED`. Wage payment attestations remain separate. Tests cover multiple workers, pending approvals/disputes, duplicate close, empty/no-show cases and final cancellation. Transitions are event/request-driven; an autonomous clock-based lifecycle sweep remains an optional jobs enhancement, not an implemented scheduler. See `STATE_MACHINES.md` and executed evidence in `TEST_REPORT.md`.
- [ ] **Production SMS transport:** implement a real provider adapter, delivery/error handling and queue integration for authentication SMS. The current executable SMS adapter is the protected local inbox; production intentionally cannot use it.
- [ ] **Click Shop API:** implement verified prepare/complete authentication, transaction/error mapping and amount conversion after the authoritative protocol can be validated. There is no working Click checkout or callback adapter today.
- [ ] **Provider reconciliation:** extend pending-payment timeout cases into provider-specific reconciliation/status acquisition and an operator resolution workflow. The jobs process flags unresolved pending attempts; it does not independently discover bank/provider truth.
- [ ] **Platform-initiated refund coverage:** the local full-refund flow and authenticated Payme cancellation handling exist. A platform-initiated live refund integration and full operator UI must be completed for each provider that actually supports it. Partial refunds remain unavailable.
- [ ] **Subscription downgrade management:** finish the owner workflow to select active branches/members when moving below current usage. Existing records are retained and new additions are limited, but the complete selection/warning workflow is not implemented.
- [ ] **Team management UI:** invitations, branch creation, custom-role creation and API-key administration have screens. Surface and test member permission assignment/revocation, custom-role assignment, owner transfer and credential rotation as complete user flows; some actions currently have API coverage only. API-key replacement is currently create-new then revoke-old, not an atomic rotate action.
- [ ] **Replacement and re-invitation:** add an explicit waitlist/rematching dispatcher and employer re-invitation interface. A released place can already be filled through a separate offer and fresh worker consent; no automatic replacement assignment exists.
- [ ] **Full administration:** complete account restriction/recovery tooling, complete job-category/skill catalog mutation screens, review moderation decisions/appeals and complete plan-version/bank-evidence/reconciliation operator screens. City configuration, verification, individual skill review, dispute/support resolution and finance APIs cover only part of the requested administration surface.
- [ ] **Developer tooling:** implement scoped feature-flag management, queue/dead-letter inspection, redacted-log diagnostics and a synthetic scenario runner/reset with explicit confirmation. Health, Swagger, protected SMS inbox and local payment scenarios exist. No unrestricted SQL or role-switch bypass is provided.
- [ ] **Matching presentation and ranking iteration:** the deterministic matching API applies city/category, skill, verification and overlap filters with versioned score explanations. Finish its full recommendation UI and acceptance coverage. Optional consented distance ranking is not implemented.
- [ ] **Analytics:** current employer statistics are simple, scoped all-time counts with an explicit denominator. Complete date-filtered publish-to-completion funnel, time-to-fill, no-show cohort reporting, subscription conversion and provider-verified MRR. Mock payments and worker wages must never enter real subscription revenue.
- [ ] **Communication preferences:** wire persisted notification channel preferences and supported delivery channels into a full settings workflow. Email/Telegram are future adapters. Continue message/report moderation and unread-state UX coverage.
- [ ] **Privacy fulfillment:** account export/deletion requests create reviewable support cases. Implement approved data export, deletion/pseudonymization and retention execution; a submitted request does not automatically fulfill these operations.
- [ ] **Historical records and audit breadth:** expand immutable/versioned history for every important state transition and complete reason/audit coverage for role/policy configuration actions. Existing finance snapshots, verification decisions and critical operation audit records do not constitute complete history for every entity.
- [ ] **Pagination and API completeness:** public shift search is paginated; several internal lists use bounded result limits rather than a full pagination/export UI. Extend DTO/response documentation and generated-client use to all endpoints, including SSE and provider-specific errors; core typed contracts alone do not cover every response shape.
- [ ] **Frontend completeness and polish:** finish any API-only workflows above, verify every required route/error/offline state and complete all Uzbek/Russian content review. Do not infer full accessibility/localization coverage from a few passing browser flows.

## EXTERNAL_CONFIGURATION — credentials, operating decisions and release approvals

- [ ] Identify the real service operator and replace placeholder contact, privacy and terms text. Obtain specialist review of labor relationships, age eligibility, personal-data handling/location/retention, tax/fiscal treatment and payment agreements. No legal-compliance guarantee is made.
- [ ] Choose and contract an SMS provider, obtain production credentials and approved templates/sender identity. This does not remove the SMS implementation task above.
- [ ] Complete Payme merchant onboarding and obtain sandbox credentials, then perform the real provider sandbox acceptance suite. Merchant IDs/secrets and a locally simulated callback are not sandbox verification.
- [ ] Obtain authoritative Click protocol access, merchant onboarding and sandbox credentials. Keep Click unavailable until both implementation and provider verification are complete.
- [ ] Configure actual beneficiary/bank references and a finance process that independently verifies incoming funds. Uploaded evidence alone must never mark an invoice paid.
- [ ] Configure a private S3-compatible bucket, least-privilege credentials, encryption/lifecycle policy and a reachable ClamAV service. Verify real storage/scanner failure modes before allowing production document uploads.
- [ ] Choose a hosting target, domain, HTTPS termination and exact CORS origins. No cloud resources, public deployment or paid domain was created during implementation.
- [ ] Provision independent local/staging/production databases, Redis, storage and secrets. Set strong unique OTP, file-signing, MFA-encryption and provider secrets; disable local adapters and remove local inbox credentials from production.
- [ ] Bootstrap the initial platform administrator through the documented controlled process, enroll MFA and approve least-privilege permissions and recovery procedures. Never run the synthetic seed in production.
- [ ] Configure backups/PITR, off-host retention, monitoring/alerts, abuse response, incident ownership and queue failure handling. Agree on RPO/RTO and execute a restore drill.
- [ ] Confirm merchant/provider capabilities before enabling cards, recurring charging, bank refunds or new payment methods. Default billing requires a user-confirmed payment for each invoice.

## VERIFICATION — outstanding evidence before a public release

- [ ] Run the portable Docker Compose path and production images on a Docker-capable host, including non-root execution, health checks, proxy routing and graceful shutdown. Docker configuration is provided, but Docker was unavailable on the development workstation.
- [x] Fresh PostgreSQL database, baseline-to-invariants upgrade and repeat/no-op migrations passed with a dedicated non-superuser owner and preserved sentinel row; see `FRESH_INSTALL_REPORT.md`. There is no prior production release in this new repository. Future released-schema upgrades require their own rehearsal.
- [ ] Run the final CI sequence from a clean checkout with the lockfile, an isolated integration database and real Redis. Record exact failures/skips rather than treating configured CI as executed CI.
- [ ] Execute provider sandbox scenarios for invalid authentication, wrong amount, duplicates, out-of-order and late callbacks, timeout, double invoice payment, cancellation and refund. Local HTTP protocol tests remain separate evidence.
- [ ] Verify S3/MinIO with ClamAV integration and expiry/authorization using the deployment configuration, not only the local filesystem adapter.
- [x] The eight requested visual routes passed overflow checks at 360, 390, 768, 1024 and 1440px. Keyboard dialog/navigation, reduced motion, Uzbek/Russian persistence and Russian/dark landing/calendar were exercised; 20 screenshots retained. This is the coverage in `TEST_REPORT.md`, not full accessibility certification of all unfinished screens.
- [ ] Measure LCP and CLS under a documented lab device/network profile. Validate the INP target using real-user monitoring; do not claim an INP measurement without RUM evidence.
- [ ] Perform capacity/load, queue recovery/redelivery, database deadlock retry and security review beyond the current functional acceptance suite.
- [ ] Review public/synthetic data separation and deployment configuration so demo organizations, test providers and local inbox access cannot appear as a live production service.

## Intentionally outside v1

The following are future capabilities, not unfinished advertised v1 buttons: a platform wallet, escrow, automatic worker payouts, an outgoing webhook delivery service, automatic recurring debits without provider/merchant capability and consent, agency/multi-country products, and machine-learned matching. Worker payment records are employer/worker attestations; they are not bank-verified payroll.

## Release decision

- [x] Local persisted product flows and meaningful database/security tests exist.
- [ ] All master-prompt implementation requirements complete.
- [ ] All external configuration/operating gates closed.
- [ ] All deployment, provider and performance verification complete.
- [ ] Public production launch approved.

Until these gates are closed, describe the deliverable as a tested local foundation with implemented product flows and explicit remaining scope, not as “100% production-ready.”
