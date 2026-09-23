# Verification report

The **2026-09-23 profile/workspace improvements** have a separate [current verification report](PROFILE_UX_REPORT.md), including organization-profile API checks, draft behavior and the final frontend/browser verification status. The current SmenaTop preview uses port **5174**; port 5173 belongs to another local project.

The **2026-09-23 visual redesign** has a separate [verification report](DESIGN_REFRESH_REPORT.md). Screenshots and `performance-lab.json` now describe that refreshed frontend; the checks below record the original implementation baseline.

Date: **2026-09-22**. Windows, Node **22.18.0**, pnpm **10.34.5**, PostgreSQL **17**, local Redis **8.10.2**, installed Chrome through Playwright. All test identities and financial records were synthetic. No real SMS or money transfer occurred.

## Executed checks

| Command / check                                   | Result and scope                                                                                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx pnpm install --frozen-lockfile`              | PASS. A separate source copy also installed 536 packages with no existing node_modules, using the dependency cache.                                                         |
| `npx pnpm db:generate`                            | PASS, Prisma Client 6.19.3. On Windows a running API initially locked the engine DLL; stopping this task's API/jobs allowed generation without resetting data.              |
| `npx pnpm db:migrate`                             | PASS on empty application/test databases. Separate restricted-role smoke verified baseline → invariants upgrade → repeat/no-op while preserving a sentinel row.             |
| `npx pnpm db:seed`                                | PASS, initial 3 synthetic organizations, 18 workers and 30 shifts with varied states. Seed reruns preserve existing records.                                                |
| `npx pnpm lint`                                   | PASS, ESLint.                                                                                                                                                               |
| `npx pnpm typecheck`                              | PASS across API, jobs, web and shared types. The frontend imports generated core HTTP types.                                                                                |
| `npx pnpm test`                                   | PASS: **18 API + 2 jobs + 7 frontend = 27 unit/component tests**. The final frontend optimization also reran its 7 tests successfully.                                      |
| `npx pnpm test:integration`                       | PASS: **25 tests**, **0 failed/skipped**, real isolated PostgreSQL and Redis/BullMQ; final run approximately 19.8 seconds.                                                  |
| `npx pnpm build`                                  | PASS: generated Prisma client, compiled API/jobs and optimized Vite output. Latest frontend build after LazyMotion optimization also passed.                                |
| `npx pnpm api:generate` then `npx pnpm api:check` | PASS: generated contract matches the running API, including close-shift. Swagger remains non-production only.                                                               |
| `npx pnpm test:e2e`                               | PASS: **5 browser tests**, 40.6 seconds; real API/web, persisted consent flow, OTP, keyboard dialog and responsive screens.                                                 |
| Isolated fresh install/service smoke              | PASS; [full evidence](FRESH_INSTALL_REPORT.md) includes a restricted DB owner, migrations, build, seed, HTTP readiness and a separate worker consuming a real outbox event. |

The GitHub Actions workflow is configured but was not executed by GitHub. Docker was unavailable; the native-service smoke does not establish that Docker images or production Compose were executed.

## Unit and integration scope

Unit/component tests exercise integer money, calendar-month anchors including leap years, trial/renewal boundaries, wage rounding and breaks, overnight intervals, invalid attendance transitions, PATCH omission semantics, RFC 6238 TOTP/replay, production guards/controller registration, phone validation/localization and key screen behavior.

The 25 integration tests exercise:

- Opaque OTP, cooldown/attempt limits, one-time consumption, session revocation and protected local inbox.
- HTTP employer onboarding/organization/branch verification, worker profile/availability verification, publish → application → offer → acceptance and persisted results in both cabinets.
- Last-place concurrent acceptances, cross-organization worker overlap, adjacent `[start,end)` intervals, durable idempotency and conflicting payload rejection.
- Cancellation freeing capacity, replacement through fresh consent and concurrent publish quota enforcement without cancellation refunds.
- Cross-tenant access, branch scopes, manager billing denial, stale memberships, CSRF and database foreign-key/overlap constraints.
- Quarantined private files, permissioned local release, finance/worker document separation and user-bound signed downloads.
- Encrypted MFA enrollment, session rotation, TOTP replay rejection and one-use recovery codes.
- Real Redis/BullMQ dispatch, durable deduplication and skipped canceled-assignment reminders.
- API-key tenant/scope/expiry/revoke controls, scoped manager edits, last-owner protection and ownership transfer revoking sessions.
- Normal shift lifecycle, dual timesheets, explicit close gates, unresolved disputes, empty/no-show/canceled participation and independent wage acknowledgment after closure.
- Assignment-bound token replay protection, attendance reasons/events, messaging authorization and duplicate review prevention.
- Payment authentication/amount, parallel success, duplicate/double payment, late/superseded callback, refund replay and entitlement integrity.
- Six Payme Merchant RPC methods against PostgreSQL with local test authentication, including timeout and full cancellation. This is **local protocol evidence**, not Payme sandbox verification.
- Early close preserving actual work, authenticated SSE recovery/revocation, bank evidence requiring independent finance confirmation.

Some tests create synthetic actors/sessions directly in the isolated database to target one invariant. Separate OTP and onboarding tests use the actual HTTP boundary. Assertions inspect persisted records and response status; concurrency and financial tests do not use mocked repositories or SQLite.

## Browser and visual QA

The employer/worker test creates a future shift through the UI, publishes it, applies, offers, accepts, checks both cabinets and reloads the worker page. Cleanup cancels only that synthetic booking/shift through authorized APIs. Screen tests use seeded roles via explicit test-session fixtures; the login test independently performs real OTP in the browser.

Keyboard checks select the interactive time sample with Enter, verify reduced-motion CSS, cycle Tab inside a reason dialog, dismiss with Escape, restore focus and open mobile navigation. Uzbek/Russian switching survives reload. A detected native-dialog focus escape was fixed with an explicit Tab loop and unique accessible labels.

Eight requested routes were captured and visually reviewed at **390px and 1440px**. The expanded responsive test also passed on **360, 390, 768, 1024 and 1440px for all eight routes**, with no page-level overflow (40 route/width combinations). Calendar/table horizontal scrolling stays inside its container. Russian/dark landing and employer calendar passed at 390px/1440px; 20 screenshots are retained. Command: `npx pnpm test:e2e --grep 'responsive visual'`, 1 passed in 19.9 seconds after broadening the original full-suite check.

| Screen                         | Mobile                                                 | Desktop                                                  |
| ------------------------------ | ------------------------------------------------------ | -------------------------------------------------------- |
| Public landing                 | [390px](screenshots/landing-390.png)                   | [1440px](screenshots/landing-1440.png)                   |
| Worker search                  | [390px](screenshots/worker-search-390.png)             | [1440px](screenshots/worker-search-1440.png)             |
| Shift detail                   | [390px](screenshots/shift-detail-390.png)              | [1440px](screenshots/shift-detail-1440.png)              |
| Worker assignment              | [390px](screenshots/worker-assignment-390.png)         | [1440px](screenshots/worker-assignment-1440.png)         |
| Employer calendar              | [390px](screenshots/employer-calendar-390.png)         | [1440px](screenshots/employer-calendar-1440.png)         |
| Billing                        | [390px](screenshots/billing-390.png)                   | [1440px](screenshots/billing-1440.png)                   |
| Admin queue                    | [390px](screenshots/admin-queue-390.png)               | [1440px](screenshots/admin-queue-1440.png)               |
| Developer tools                | [390px](screenshots/developer-390.png)                 | [1440px](screenshots/developer-1440.png)                 |
| Russian/dark landing           | [390px](screenshots/landing-ru-dark-390.png)           | [1440px](screenshots/landing-ru-dark-1440.png)           |
| Russian/dark employer calendar | [390px](screenshots/employer-calendar-ru-dark-390.png) | [1440px](screenshots/employer-calendar-ru-dark-1440.png) |

Visual QA fixed hourly wage basis labeling before a timesheet exists, mobile subscription wrapping, Uzbek ICU date fallback, form label associations and attendance response/date mismatches. These checks do not establish complete accessibility, translation review or every administrative workflow.

## Measured performance

Command: `node scripts/measure-web.mjs http://127.0.0.1:4173`, serving the optimized production build with Vite preview.

Profile: headless Chrome, 390×844, fresh context/cache disabled for each of three runs, 4× CPU throttle, 1.6 Mbps download, 750 Kbps upload, 150 ms latency, local API, reduced motion. Observation ends after network idle, font readiness and a 1.5-second settling window. This is a local lab measurement, not a production-user percentile.

| Metric | Result                                        | Interpretation                                                                      |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| LCP    | **2,664 / 2,404 / 2,444 ms; median 2,444 ms** | Median meets 2.5s; the first run exceeds it. Retest on deployment hardware/network. |
| CLS    | **0.0000196** in each final run               | Below 0.1 in this profile.                                                          |
| INP    | Not measured                                  | Requires real interaction/field evidence; no claim is made.                         |

Evidence: [performance-lab.json](performance-lab.json). Critical font preload and asynchronous motion features reduced initial JavaScript **531.43 → 448.42 KB**, gzip **169.54 → 143.82 KB**. Total page transfer still includes the later motion chunk. Fonts and route assets are self-hosted.

## Resolved failures and remaining evidence

Observed failures fixed during development included missing Express runtime dependency, module resolution, decorator/transpilation metadata, PostgreSQL advisory-lock void decoding, PATCH defaults overwriting omitted fields, form labels, attendance response fields, waiting for network idle on a permanent SSE connection, dialog focus and Windows Prisma DLL locking. No production data was reset to fix them.

Not executed: Docker/Linux shutdown and public HTTPS deployment, GitHub-hosted CI, real provider sandbox/live tests, real SMS/bank transfer, remote S3/MinIO with ClamAV, backup/PITR restore, production-scale load/security review and real-user INP. Full management/analytics/offline-error workflows are not all implemented or exercised.

These verification limits are separate from remaining code and external configuration in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). The deliverable is a tested local implementation with persisted flows, not complete production readiness.
