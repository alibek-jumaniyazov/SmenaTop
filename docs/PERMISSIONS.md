# Permissions and tenant scope

The server checks identity, current membership, permission, branch scope and resource ownership. Choosing an interface context does not grant a role. Organization membership and platform grants are separate records; signup and invitations cannot create platform permissions.

`SessionGuard` looks up the opaque cookie hash and current user/grants on every request. Revoked/expired sessions and inactive users fail. Mutations require the session's CSRF token. Production platform grants require a session with verified MFA. Long-lived notification streams also check session revocation and user status every five seconds.

## Built-in organization roles

The executable catalog and defaults are in `apps/api/src/common/permissions.service.ts`. An active membership in the target active organization is always required.

| Permission                                              | Owner | Admin |      Manager      | Finance |
| ------------------------------------------------------- | :---: | :---: | :---------------: | :-----: |
| `shift.read`                                            |  Yes  |  Yes  | Assigned branches |   No    |
| `shift.create`, `shift.publish`                         |  Yes  |  Yes  | Assigned branches |   No    |
| `application.review`                                    |  Yes  |  Yes  | Assigned branches |   No    |
| `attendance.approve`                                    |  Yes  |  Yes  | Assigned branches |   No    |
| `wage.read`                                             |  Yes  |  Yes  | Assigned branches |   Yes   |
| `wage.manage`                                           |  Yes  |  No   |        No         |   Yes   |
| `billing.read`                                          |  Yes  |  Yes  |        No         |   Yes   |
| `billing.manage`                                        |  Yes  |  No   |        No         |   Yes   |
| `member.invite`, `branch.manage`, `organization.manage` |  Yes  |  Yes  |        No         |   No    |
| `api.manage`                                            |  Yes  |  No   |        No         |   No    |
| `analytics.read`                                        |  Yes  |  Yes  | Assigned branches |   No    |

Branch-scoped members cannot turn a missing branch parameter into organization-wide permission. List endpoints filter assigned branch IDs; resource mutations pass the resource's branch ID to `requireOrg`. A manager cannot select an arbitrary new branch to bypass the original branch scope.

The wage-list endpoint conservatively denies organization-wide access to branch-scoped memberships; managers can inspect authorized assignment attendance/timesheet records. The table denotes allowed domain scope, not a promise of every possible export endpoint.

Custom organization roles use only the organization permission catalog and only permissions held by the issuer. A target custom role must belong to the same organization. Team updates validate branches, prevent grants above the issuer, and revoke target sessions. Invites bind phone, organization, role, branches and a single-use expiring token. Accepting a privilege change revokes sessions and requires login again.

Ordinary membership updates cannot demote or revoke an owner. Explicit ownership transfer requires the current owner, an active target in the same organization, a reason and a transaction that promotes the target before demoting the previous owner. Both users' sessions are revoked and the transfer is audited. An organization admin is not a platform admin.

## Worker ownership

| Resource/action                         | Boundary                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Profile, skills and availability        | Authenticated user's worker profile only                                                                        |
| Application and offer acceptance        | Application/offer `workerId` must match the session user                                                        |
| Assignment attendance                   | Worker owns assignment; employer uses organization/branch `attendance.approve`                                  |
| Token check-in/out                      | Worker owns assignment and presents an unexpired unused token bound to that assignment and action               |
| Manual attendance, no-show, early close | Organization/branch `attendance.approve`; a reason is required                                                  |
| Timesheet approval                      | Worker and authorized manager approve separately                                                                |
| Employer marked-paid                    | Organization/branch `wage.manage`                                                                               |
| Worker received-payment confirmation    | Assignment's worker only; employer cannot impersonate receipt                                                   |
| Reviews and disputes                    | Real assignment participant or authorized employer scope; reviews require completion and at most one per side   |
| Messages                                | Current assignment participant permission on every read/send; stale conversation membership never grants access |
| Notifications and SSE                   | Personal user ID from the server session; cursor belongs to that same user                                      |
| Account export/deletion request         | Creates the user's own support/retention request; it does not erase financial history automatically             |

Public shift responses omit personal worker phone numbers and private document access. Employer candidate responses expose work-relevant profile fields. API key integration responses are organization-scoped and read-only.

## Explicit platform grants

Platform permissions are an allowlist in `PlatformRoleGrant.permissions`. Human-facing role names alone do not confer rights; a Support account does not automatically inherit Finance or verification-document access. The local synthetic admin is intentionally granted a set of capabilities for demo use and is never seeded in production.

| Permission                   | Implemented capability                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `verification.review`        | Review identity/organization requests; list and individually review pending worker skills with reason, reviewer and timestamp |
| `verification.document.read` | Audited access to clean verification documents and nonproduction manual quarantine review                                     |
| `dispute.resolve`            | See dispute queue and write an audited resolution                                                                             |
| `support.manage`             | See and resolve support tickets; no payment mutation implied                                                                  |
| `billing.reconcile`          | Finance queue, bank evidence access and independently verified bank confirmation                                              |
| `billing.refund`             | Full local mock refund, scoped to synthetic local transactions; no unsupported outbound provider refund                       |
| `billing.plan.manage`        | Create a new immutable plan version with reason; existing invoices retain snapshots                                           |
| `audit.read`                 | Read platform audit records                                                                                                   |
| `catalog.manage`             | Read catalogs and create/update active-city configuration with an audit reason                                                |
| `developer.tools`            | Guarded nonproduction diagnostics and synthetic provider tools; never arbitrary invoice success or role grant                 |

Some local seed permission labels are reserved for future administration screens. A stored permission does not imply an endpoint exists. Production bootstrap grants must be minimal and reviewed; there is no public platform-role assignment API or universal admin login code.

## Private files and finance separation

Uploads remain private and quarantined until the configured scanning/review path marks them clean. Owner checks apply to metadata and every signed-content request. Verification-document access requires its dedicated platform permission and is audited.

Bank evidence submission explicitly attaches the uploader's clean file to the organization and marks the document purpose `BANK_EVIDENCE`. Nonowner access to this purpose requires `billing.reconcile`. This does not grant finance access to a worker's verification documents. Uploading evidence does not mark an invoice paid.

## Provider and developer routes

`POST /api/v1/payments/payme` is not browser-session authenticated; it uses the provider's configured HTTP Basic authentication and validates provider environment, immutable invoice amount, account and transaction ID. It is the only payment callback exempt from browser CSRF. A checkout redirect cannot invoke fulfillment.

The local provider simulator controller is absent from a production module registration and its service rechecks environment. Mock payment attempts require both `synthetic` and `isDemo` on the target organization. A developer cannot use it on a real provider attempt or nonsynthetic tenant. Unknown provider credentials yield `NOT_CONFIGURED`.

Read-only API credentials are shown once, stored hashed, organization-bound, scoped to `shifts:read` and/or `assignments:read`, expiring, rate-limited and revocable. Key creation/revocation requires `api.manage` and writes audit history. A key for one organization does not work by changing the URL's organization ID.

## Database and concurrency protection

Composite foreign keys keep branch/shift/application/assignment tenant relationships consistent. Confirmation serializes a shift and worker and uses PostgreSQL range exclusion to prevent overlapping active assignments across organizations. Attendance/early-close/cancellation share a shift-first lock order. Finance uses subscription-first locks and durable unique fulfillment keys.

Authorization is not delegated to feature flags, localStorage, hidden buttons, client-supplied roles, queue payloads or a stale subscription status. Jobs re-read current domain state before reminders. Critical permission changes, verification, manual attendance, financial transitions, refunds and policy/configuration changes retain audit records without copying private document contents or credentials.

Relevant cross-tenant, API-key, stale session/membership, finance denial, attendance token, message and notification-stream tests are in `tests/integration`. See `docs/TEST_REPORT.md` for actual executed results.
