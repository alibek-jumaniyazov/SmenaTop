# Mobile usability and API security hardening

Date: **2026-09-23**. This change addresses mobile usability, removal of developer/API details from the product interface, and concrete authorization defects found during a bounded source review. The local preview remains [SmenaTop at 127.0.0.1:5174](http://127.0.0.1:5174/).

## API visibility and product interface

- Removed `/developer/*`, its context/navigation entry, the browser OTP inspector, raw JSON diagnostics, administrative health/audit technical screens, company API-key controls and mock-payment simulation buttons. Administrative queue, support, billing and catalog views remain gated by their respective permissions. Queue search uses user-facing fields and a name-only subject projection; team permissions have readable labels rather than internal API scope names.
- Swagger UI and OpenAPI JSON are no longer registered as public HTTP routes in any environment. `api:generate` and `api:check` now export the compiled server contract to a local temporary file without opening a listening HTTP server. Generated repository contracts are not copied into the public web directory.
- Local technical HTTP tools default to disabled. Explicit opt-in requires `APP_ENV=local`, non-production mode, `DEV_TOOLS_ENABLED=true`, a direct loopback connection, no Origin/Referer/proxy-forwarding headers and the server-only key. Relevant operations still require their existing session, CSRF and permission checks. These are operator tools, not a browser feature.
- The local OTP CLI is retained: request a code on the login page, then run `node --env-file=.env scripts/local-inbox.mjs +998900000001` for the intended local demo phone. It reads the active local challenge directly from the database and does not require enabling HTTP developer tools. There is no universal OTP.
- Shared frontend error displays now use localized messages for failures and actionable statuses; raw backend exception messages are not rendered by the common error panel. All server 5xx responses are sanitized, including explicitly thrown HTTP exceptions, and omit internal field metadata.

Browser application API paths necessarily remain visible to the browser making requests. Secrets, private data and privileged operations are protected by server authentication, authorization and environment controls, rather than treating endpoint names as credentials. Restricting management endpoints and returning bounded error information follows the [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html).

## Concrete authorization defects corrected

| Before                                                                                                                                                                         | Corrected behavior                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| A branch-scoped custom team editor could submit `branchIds: []`, which passed an empty-array subset check and converted branch permissions into organization-wide permissions. | Scoped editors cannot clear their branch scope or add branches outside it. Owner-authorized scope changes remain possible.             |
| An editor could target a global or other-branch member, or downgrade a member whose existing privileges exceeded the editor's privileges.                                      | Both existing target scope and existing privileges must be within the editor's authority, as must the proposed grant.                  |
| A custom role with only `member.invite` could invite a full ADMIN role because the invitation path only singled out FINANCE.                                                   | Every invited role's permissions must be a subset of the issuer's current permissions; the existing FINANCE-owner restriction remains. |
| An old invitation could be accepted after issuer revocation/demotion or branch deactivation.                                                                                   | Acceptance rechecks token state, issuer account and membership, current grant authority, organization status and branch activity.      |
| Replacing an existing custom membership with a built-in role left `customRoleId` attached, preserving the old custom permissions.                                              | Acceptance clears the old custom-role reference and revokes affected sessions.                                                         |

Membership changes and invitation creation/acceptance share the organization lock and recheck issuer authority after acquiring it. These controls implement least privilege and authorization based on current server state, consistent with the [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

The shared constant-time comparison now compares UTF-8 buffer lengths before calling `timingSafeEqual`; different byte lengths with equal JavaScript string lengths no longer produce an exception. This is a malformed-input robustness fix, not evidence that an authentication bypass was demonstrated.

Privileged production sessions without completed MFA continue to be denied. Their response now carries the explicit `MFA_REQUIRED` code, allowing the localized frontend guidance to distinguish the next authentication step without displaying raw server errors.

## Mobile interface

- Inset floating bottom navigation respects device safe areas; `viewport-fit=cover` supports full-screen phone layouts. A 68 px sticky header retains the current page title.
- Main touch actions use 48 px targets. Administrative and application-status tabs scroll horizontally on narrow screens, preserving readable labels.
- Bottom navigation labels retain a 12 px minimum. Verification cards display names in the interface font at 16–17 px, with paired mobile actions; empty live-announcement regions no longer consume action-grid cells.
- Candidate profiles use a mobile bottom sheet with a sticky close/header area. Login controls and context cards are more compact.
- Worker documents use a disclosure section, filenames and file inputs stay within their container, and the profile editor has a compact sticky save bar that returns to normal flow on short viewports.
- The existing violet palette, Uzbek/Russian interface and light/dark themes are retained.

**Final browser verification passed: all 17 tests in one run (1.5 minutes).** Nine public, worker, employer, billing and admin routes were checked at 360, 390, 767, 768, 844, 960, 1024 and 1440 px, including a short landscape viewport. Profile and admin checks also cover 320 px; both profiles were checked in Russian dark mode at 320, 390, 768 and 1440 px. The suite covers real local OTP login, profile persistence, draft retention after rejected saves, the publish/apply/offer/accept workflow, keyboard dialogs, reduced motion, blocked developer routes, restricted development-server files and unauthorized admin access. Mobile screenshots were visually reviewed.

The mobile minimum-font-size regression found during verification was fixed. Transient Windows file-write errors during screenshot updates were addressed by capturing each screenshot once and retrying only the file write up to four times for specific Windows errors. Browser capture and assertions are not retried by this helper; exhausted write errors still fail the test. The final run completed without failed tests.

## Deployment configuration

`infra/Caddyfile` now rejects documentation and developer endpoint paths, caps API request bodies at 6 MB, removes the Server header and declares CSP, `X-Frame-Options: DENY`, HSTS, nosniff, referrer and permissions policies. CSP restricts scripts, fonts and connections to the same origin and disallows object embedding and framing; inline styles remain allowed for the current interface. Production Compose publishes only the web service, with PostgreSQL, Redis and API remaining inside the service network.

The local Vite server now binds to `127.0.0.1` and defaults its API proxy to `http://127.0.0.1:3000`. Its strict filesystem allowlist contains the web workspace and repository dependencies; explicit denies cover server/jobs source, docs, Prisma, `.local`, Git metadata, environment files and certificate/key files. These controls reduce development-server file exposure independently of the production static web build.

These are source configuration changes. **Docker/Caddy deployment, live HTTPS, production proxy behavior and the resulting response headers have not been deployed or validated on a public host in this task.** Existing local Vite responses are not evidence of production Caddy behavior.

## Dependency audit

Known-advisory checks used the npm registry on **2026-09-23**. The initial production dependency audit reported **15 vulnerabilities: 9 high, 5 moderate and 1 low**. After updates, both the production-only check and the complete production/development dependency check reported **0 known vulnerabilities**.

The resolved updates include NestJS **11.1.18**, `path-to-regexp` **8.4.2**, `multer` **2.3.0**, `lodash` **4.18.0** and `js-yaml` **4.3.2**. The `deepmerge-ts` **8.0.0** override is scoped to `@prisma/config`; **Prisma schema validation passed** after that change. Resolutions are pinned in the workspace overrides and lockfile. Advisory results describe the registry's known findings at the time of the check; they do not prove that the application has no vulnerabilities.

## Verification status

| Check                                                     | Current result                                                                                                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency audits, production and complete graph          | **PASS: 0 known advisories** after the updates, 2026-09-23.                                                                                                                                          |
| Prisma schema and migrations                              | **PASS:** schema validation after the scoped override and checks of all three migrations.                                                                                                            |
| Private-file, integration-scope and ingress source review | **Completed, bounded review.** Signed file links remain session-bound and short-lived; quarantine and permissions are rechecked. Integration keys remain tenant/scope/expiry/revocation constrained. |
| Rebuilt frontend artifact scan                            | **PASS:** 39 files inspected, eight actual server-secret values compared in memory, zero matches and zero forbidden files. Secret values were not printed or written to the report.                  |
| Full isolated PostgreSQL/Redis integration suite          | **PASS: 39 tests**, including five new team/invitation security tests and two endpoint-exposure tests.                                                                                               |
| Team/invitation regressions                               | **PASS:** rejected scope escalation, stronger-role grants, stale invitations, custom-role cleanup and allowed owner/in-scope operations. Included in the 39-test integration total.                  |
| API unit tests                                            | **PASS: 27 unique tests covered.** The full 26-test suite passed, followed by a focused two-test auth-guard run containing one existing test and the new MFA-code regression.                        |
| Queue worker unit tests and build                         | **PASS: 2 tests and build.**                                                                                                                                                                         |
| Frontend unit tests and production build                  | **PASS: 24 tests and production build.**                                                                                                                                                             |
| Repository lint                                           | **PASS:** the temporary-directory safety check runs before `try/finally`; ESLint passed.                                                                                                             |
| Browser workflow, responsive and visual checks            | **PASS: all 17 tests in the final run (1.5 minutes).** Includes mobile, role restrictions, actual local OTP login and end-to-end work assignment.                                                    |
| Offline OpenAPI generation/drift check                    | **PASS:** generation and `api:check`.                                                                                                                                                                |
| Public deployment or independent penetration test         | **Not performed.**                                                                                                                                                                                   |

This work reduces identified risks and removes unnecessary technical exposure. It is not a comprehensive penetration test, and no 100% security guarantee is made. Production readiness still depends on deployment configuration, secret handling, operational monitoring and the existing [release checklist](RELEASE_CHECKLIST.md).
