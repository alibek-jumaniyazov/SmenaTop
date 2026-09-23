# Architecture decisions

Status: implementation in progress, 2026-09-22.

## ADR-001 — modular monolith

React/Vite SPA, one NestJS REST API and a separately started BullMQ worker share a PostgreSQL schema. No microservices or alternative managed backend. Public browser code never imports Prisma. Server state lives in TanStack Query; databases remain authoritative. All business writes go through the API.

## ADR-002 — runtime and local verification

Node 22 LTS is installed (22.18.0) and satisfies the current Vite requirement of 22.12+. Pin tested dependency versions and pnpm 10.34.5 in the lockfile. Prisma 6.19.3 and TypeScript 5.9.3 provide the traditional Nest decorator and Prisma client pipeline; a major ORM migration is not part of this first implementation. Production runtime patch updates require rebuilding and rerunning acceptance tests.

Docker is absent on this workstation. Actual PostgreSQL 17 binaries were used to create a separate cluster under ignored `.local/postgres` on loopback port 55432. Local Redis 8.10.2 runs on loopback 56379 using the redis-windows development distribution. Its archive SHA256 is `6DE5CC7F5ADBF97B5928B13766383D4AD424626EF3D8B313FFFF12D820EC6FC1`. This distribution is a local test dependency, never the production server. Portable Linux Compose configuration is provided separately.

## ADR-003 — booking as a database invariant

All intervals are `[start,end)` with `timestamptz` columns and Asia/Tashkent rendering. Accept locks a shift and the worker, revalidates eligibility and creates assignment plus active booking atomically. A PostgreSQL GiST range exclusion constraint is the final defense against a worker accepting overlapping shifts across employers. Headcount and publish quota updates are serialized in database transactions; an offer itself does not reserve a place. SQL migrations remain authoritative for Prisma-unsupported constraints.

## ADR-004 — identity and access

A user is a global identity. Organization memberships and optional branch scopes grant organizational permissions independently of worker profiles and platform grants. Context changes in the UI never grant access. Browser sessions use random opaque cookies, stored only as hashes in PostgreSQL, with double-submit CSRF bound to the session. Every protected request reloads current grants.

## ADR-005 — finance boundaries

Subscription billing and worker wages are separate domains. Store integer tiyin as BigInt; API serialization uses decimal strings. Invoice fulfillment has durable transaction identity and renewal identity. A worker wage marked paid by an employer is an attestation, and the worker acknowledgment is a separate transition. Neither is bank verification. V1 has no wallet, escrow, withdrawal button or automatic worker payout. A future payroll adapter requires legal, provider and product decisions before implementation.

## ADR-006 — local adapters and production gates

SMS and mock checkout are explicitly local adapters. Random local credentials are generated in ignored `.env`. No universal OTP, automatic admin signup or frontend secret is permitted. Payme/Click status is tied to documentary and sandbox evidence; absent credentials cannot be represented as a live integration. Production fails closed for local adapter configuration.

## ADR-007 — event processing

Outbox rows are committed with domain changes. Queue delivery is at least once. A deterministic event ID prevents duplicate queue insertion, and handlers recheck domain state before reminders. A durable completed marker protects handlers from redelivery. The database is retained if Redis loses its queue. Worker restart re-enqueues unprocessed rows with bounded retry; failed rows are visible for operations.

## ADR-008 — company profile edits and verification

The organization profile is member-only data, separate from the public shift projection and from branch addresses. Its optional description, HTTP(S) website and E.164 contact phone are stored on Organization. This change does not publish private contacts or create a public company directory. Editing requires active, tenant-wide `organization.manage` permission; a branch-scoped membership does not gain company-wide editing rights.

`PATCH /organizations/:org` requires the current positive `version`. The organization row is locked and a stale version returns `409 VERSION_CONFLICT`; omitted fields remain unchanged and explicit null clears optional fields. Exact no-op edits preserve the version. Changed field names and versions are audited without copying profile text, phone numbers or other contact values into the audit payload.

Changing name, STIR or headquarters city is treated as a material identity edit: the organization becomes PENDING, older pending verification requests become SUPERSEDED, and a new request is created atomically. Changing description, website, contact person or contact phone leaves verification unchanged. This is an internal review policy, not a claim of government verification. Suspended organizations cannot use profile editing to restore themselves. Moderator review acquires the same organization lock and rereads the request, so an old request cannot approve a newly edited identity. Existing assignments, wage records, branches and subscriptions remain intact; the existing verification gates continue to control publish and new acceptance.

Employer candidate data stays application- and branch-scoped. It exposes name, city/category identifiers, languages, self-described experience and skill review status/date. It omits private phone numbers, documents, birth/adult-consent details, exact availability and internal verifier identifiers. A free-text experience description is not presented as verified employment history.

## Primary references checked

- [React from scratch](https://react.dev/learn/build-a-react-app-from-scratch)
- [Vite runtime requirements](https://vite.dev/guide/)
- [Nest authorization](https://docs.nestjs.com/security/authorization)
- [PostgreSQL range exclusion](https://www.postgresql.org/docs/current/rangetypes.html)
- [Node release lifecycle](https://nodejs.org/en/about/previous-releases)
- [Redis Windows local-development distribution](https://github.com/redis-windows/redis-windows)

Payment references and evidence are recorded in `PAYMENTS.md`.
