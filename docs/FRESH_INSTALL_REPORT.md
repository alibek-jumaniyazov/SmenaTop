# Isolated native fresh-install smoke

Date: 2026-09-22. This exercise uses native Windows Node.js, PostgreSQL and Redis. Docker was unavailable, so it is not evidence that Docker Compose or production containers were executed.

## Isolation

- Source copy: `.local/fresh-smoke/20260922-212916` (ignored, retained).
- New PostgreSQL database and owner role: `smenatop_smoke_20260922212916` on the existing loopback PostgreSQL 17 server, port 55432.
- The owner role is explicitly `NOSUPERUSER NOCREATEDB NOCREATEROLE`; a new random password was written only to the ignored smoke `.env`. It was not printed.
- Main `smenatop` and integration databases were not used for application writes in this exercise. The existing local administrative connection was used only to create the isolated role and database.
- Smoke API port: 3002. Queue namespace: `smenatop_smoke_20260922212916`. The API and jobs used Redis logical database 14 on the shared local Redis service, with the distinct BullMQ key prefix as an additional boundary.
- Only allowlisted root configuration files and `apps`, `packages`, `prisma`, `scripts` were copied. `.git`, `node_modules`, `dist`, `.env*`, and `.local` were excluded from source copying. Source SHA256 manifests are retained in the ignored copy.
- Shared pnpm cache reuse is allowed: this is a fresh workspace installation, not a cold-cache or network-independence claim.

## Completed migration evidence

1. Installed the frozen dependency graph into a copy that initially had no `node_modules` or `.env`: 536 packages, 7 workspace projects, pnpm 10.34.5; exit 0. The install reused the existing pnpm package cache. Optional `@scarf/scarf` and `msgpackr-extract` build scripts remained disabled by the workspace policy.
2. Created an isolated migration directory containing the copied schema and only `202609220001_initial`, then deployed it successfully as the new non-superuser database owner.
3. Inserted a sentinel `User` row before upgrading. Its identifier is `cba5d032-a6c0-49e9-a2bc-6f7e213d3989`, with name `FRESH_SMOKE_BASELINE_SENTINEL`.
4. Deployed the full copied migration history. Only `202609220002_invariants` was pending and it applied successfully.
5. Queried the sentinel after upgrade: the same identifier and name remained, and the user row count remained 1. PostgreSQL reported the new `worker_no_overlapping_booking` exclusion constraint and `active_booking_valid_interval` check.
6. Repeated the full migration deployment: `No pending migrations to apply.` The sentinel and constraints remained unchanged.

This demonstrates an actual initial-schema → invariant-migration upgrade with retained data. It does not claim compatibility testing against a previous public release that does not yet exist.

## Commands

From the retained source copy, using its private `.env`:

```powershell
npx --yes pnpm@10.34.5 install --frozen-lockfile
node --env-file=.env node_modules/prisma/build/index.js migrate deploy --schema .local/migration-baseline/schema.prisma
# Insert/check the sentinel through the guarded evidence runner below.
node --env-file=.env node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
node --env-file=.env node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
```

Guarded orchestration/evidence scripts are retained under `.local/fresh-smoke/`. These scripts resolve only the smoke path recorded in `latest-path.txt` and enforce the smoke database/port namespace. Run them from the original workspace root:

```powershell
node .local/fresh-smoke/provision.mjs
node .local/fresh-smoke/evidence.mjs baseline
node .local/fresh-smoke/evidence.mjs upgraded
node .local/fresh-smoke/evidence.mjs noop
```

`provision.mjs` and the `baseline` sentinel insertion are one-time steps for this retained smoke database, not idempotent reset commands. Do not rerun them against an existing smoke directory. No database or directory was recursively deleted.

## Final source/build/service verification

The backend/source comparison completed at 21:37:48 Asia/Tashkent, including normal shift lifecycle synchronization, the explicit close endpoint and jobs environment validation. Rechecking `install --frozen-lockfile` returned `Already up to date` with exit 0. A final refresh at 21:41:16 incorporated the subsequently frozen LazyMotion frontend and regenerated API-client declaration. The final snapshot contains 105 allowlisted source/configuration files. The only files changed by that last refresh were the generated API declaration and four frontend files, including the new motion-features module; backend and jobs sources were unchanged from the successful runtime checks.

Final sorted source-manifest SHA256: `6F2BD33BD392105CB75D1CD19997BDFC8E48851CFF95F754809D2D1D518BD7E5`.

| Check                                     | Observed result                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `build` in the isolated copy         | PASS, exit 0. Prisma Client 6.19.3 generation, API TypeScript build, jobs TypeScript build and web TypeScript/Vite production build completed.                                                                                                                                                                        |
| Final web bundle                          | Final LazyMotion frontend rebuild passed: 2,488 modules; main bundle 448.42 kB / 143.82 kB gzip with a separate deferred motion-features chunk. The final HTML references a built `/assets/...woff2` preload rather than a development `node_modules` URL. No browser performance claim is derived from build timing. |
| Synthetic seed into the isolated database | PASS, exit 0. 26 users including the pre-migration sentinel, 3 organizations, 18 workers and 30 shifts.                                                                                                                                                                                                               |
| Sentinel and DB identity after seed       | PASS: the original sentinel identifier/name remained; connections reported the dedicated smoke database and role.                                                                                                                                                                                                     |
| `GET /api/v1/health`                      | HTTP 200; local environment, SMS explicitly `LOCAL_MOCK`.                                                                                                                                                                                                                                                             |
| `GET /api/v1/health/live`                 | HTTP 200.                                                                                                                                                                                                                                                                                                             |
| `GET /api/v1/health/ready`                | HTTP 200; actual PostgreSQL and Redis connections both reported up.                                                                                                                                                                                                                                                   |
| `GET /api/v1/catalog`                     | HTTP 200; 2 cities, 4 job categories and 3 skills from the new database.                                                                                                                                                                                                                                              |
| `GET /api/v1/shifts?page=1&pageSize=50`   | HTTP 200; 25 public shifts. Draft and historical seed shifts are not included in the future public listing.                                                                                                                                                                                                           |
| `GET /api/openapi.json`                   | HTTP 200; 96 documented paths in this snapshot.                                                                                                                                                                                                                                                                       |
| Unauthenticated worker assignment route   | HTTP 401, as required.                                                                                                                                                                                                                                                                                                |
| Separate jobs process                     | PASS, exit 0 from the smoke harness. A newly created persisted Outbox event was consumed in the smoke namespace and produced the expected worker notification.                                                                                                                                                        |
| Post-seed no-op migration                 | PASS: no pending migrations; sentinel and core row counts remained unchanged.                                                                                                                                                                                                                                         |
| Teardown                                  | Smoke API and jobs processes were stopped. Port 3002 had no listener after completion. The source directory, private environment, DB/role and evidence remain available for inspection.                                                                                                                               |

The compiled API was executed directly; no development transpiler supplied missing runtime behavior. The jobs check used the copied workspace's built jobs application and real Redis/BullMQ. It did not call a fake queue implementation. Native Windows process termination is not evidence for Linux production graceful shutdown, which remains a deployment check.

Executed final commands in the source copy:

```powershell
node --env-file=.env node_modules/pnpm/bin/pnpm.cjs build
node --env-file=.env node_modules/pnpm/bin/pnpm.cjs db:seed
node --env-file=.env node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
# Rebuilt after the final LazyMotion/frontend declaration refresh:
node --env-file=.env node_modules/pnpm/bin/pnpm.cjs --filter @smenatop/web build
```

Executed service/evidence harnesses from the original workspace root:

```powershell
node .local/fresh-smoke/evidence.mjs seeded
node .local/fresh-smoke/health-smoke.mjs
node .local/fresh-smoke/jobs-smoke.mjs
node .local/fresh-smoke/evidence.mjs post-seed-noop
```

No blocking smoke failure occurred. The frozen install reported disabled optional package build scripts, and Vite emitted plugin timing diagnostics; both commands still exited 0. This smoke did not rerun the entire acceptance suite, Docker, a real payment/SMS provider, a remote S3 service or browser performance tests. Those results and limitations are tracked separately in [TEST_REPORT.md](TEST_REPORT.md).

## Retained evidence

- `source-manifest.json`: SHA256 hashes of the copied source files.
- `smoke-metadata.json`: database/role/port/namespace and sentinel identity; no password.
- `evidence-baseline.json`, `evidence-upgraded.json`, `evidence-noop.json`: observed database identity, row counts, migration history and ActiveBooking constraints.
- `evidence-seeded.json`, `evidence-post-seed-noop.json`: persisted seed counts and the retained baseline sentinel.
- `evidence-health.json`, `api-smoke-redacted.log`: HTTP status/count evidence and API startup output.
- `evidence-jobs.json`, `jobs-smoke.log`: processed Outbox event and expected notification evidence.
- The isolated database, role and ignored source copy are retained for inspection; they are not production infrastructure.
