# Deployment and recovery

The portable target is Docker Compose on a Linux host behind Caddy HTTPS. No paid cloud resource or public deployment was created. Docker is absent from the development workstation, so the files below require a Docker smoke run before deployment. Production login is blocked until the real SMS adapter is implemented and configured; setting credentials alone cannot enable it. See `RELEASE_CHECKLIST.md`.

## Configuration

Create `.env.production` outside source control using an approved secret store. Do not copy the demo `.env` wholesale. Required configuration:

| Variables                                                                             | Rule                                                                                                                   |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`, `NODE_ENV`                                                                 | Both `production`                                                                                                      |
| `DATABASE_URL`                                                                        | Dedicated PostgreSQL database and restricted runtime account, host `postgres` in Compose                               |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                                   | Unique deployment credentials; no sample password                                                                      |
| `REDIS_URL`                                                                           | Dedicated private Redis, host `redis`; no public port                                                                  |
| `WEB_ORIGIN` or `CORS_ORIGINS`                                                        | Exact approved HTTPS origin; comma separated if multiple                                                               |
| `SITE_HOST`                                                                           | Approved DNS name for Caddy; configure DNS before certificates                                                         |
| `OTP_PEPPER`, `FILE_SIGNING_SECRET`                                                   | Independent random secrets, at least 32 characters                                                                     |
| `MFA_ENCRYPTION_KEY`                                                                  | Exactly 64 hexadecimal characters, independent encryption key                                                          |
| `SMS_PROVIDER`                                                                        | Currently `not-configured` is the only production-safe option; login remains unavailable until a real adapter is added |
| `LOCAL_MOCK_PAYMENTS`, `DEV_TOOLS_ENABLED`                                            | `false`; omit `LOCAL_DEV_KEY` entirely                                                                                 |
| `STORAGE_PROVIDER`                                                                    | `s3`                                                                                                                   |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`             | Private S3-compatible bucket and least-privilege credentials                                                           |
| `CLAMAV_HOST`, `CLAMAV_PORT`                                                          | Reachable private ClamAV INSTREAM service, default port 3310                                                           |
| `PAYME_ENABLED`, `PAYME_ENVIRONMENT`, `PAYME_MERCHANT_ID`, `PAYME_LOGIN`, `PAYME_KEY` | Configure only after merchant onboarding and recorded sandbox tests; default disabled                                  |
| `BANK_ACCOUNT_REFERENCE`, `BANK_BENEFICIARY`                                          | Real approved recipient; otherwise bank-transfer checkout stays disabled                                               |

`VITE_*` values are public compile-time settings, never secrets. Build web with the correct environment label. API and jobs use independent credentials/database/queue namespace per environment. The provided Compose file does not provision S3 or ClamAV in production: these are operator-managed services. Access to their ports must remain private.

## Build and release

From repository root, after the checklist blockers are resolved:

```sh
docker compose --env-file .env.production -f infra/compose.production.yml build
docker compose --env-file .env.production -f infra/compose.production.yml up -d --wait postgres redis
docker compose --env-file .env.production -f infra/compose.production.yml --profile release run --rm migrate
docker compose --env-file .env.production -f infra/compose.production.yml up -d api jobs web
```

Migration is a separate release step. API replicas never migrate automatically. The API/jobs image runs as the non-root `node` user, drops capabilities and uses a read-only root filesystem. Caddy owns TLS termination and persistent certificate data. Database and Redis have persistent private volumes.

On the first deployment only, use `scripts/bootstrap-admin.mjs` in a secured operator session. Supply `BOOTSTRAP_CONFIRM=CREATE_INITIAL_PLATFORM_ADMIN` and a verified `BOOTSTRAP_ADMIN_PHONE` in E.164 format, with the target `DATABASE_URL` and MFA key. Example after loading these from the secret store:

```sh
node scripts/bootstrap-admin.mjs
```

The script refuses an existing active platform grant, takes a database lock, creates a narrowly defined initial admin, audits the operation and revokes old sessions. Remove bootstrap settings afterward. Do not seed production. The administrator must complete OTP and TOTP enrollment; recovery codes are shown once. Bootstrap does not bypass the missing SMS adapter.

## Health and shutdown

- `/api/v1/health/live`: process liveness.
- `/api/v1/health/ready`: PostgreSQL and Redis readiness. Use this for rollout readiness, not merely a TCP check.
- Requests have `x-request-id`; use the ID when correlating client errors.
- Nest shutdown hooks disconnect database resources. Jobs close the worker/queue and database on SIGTERM. Allow ongoing transactions to finish before force-killing containers.
- Failed jobs keep Redis evidence and update `OutboxEvent.attempts/lastError`. Maximum retry is eight with exponential backoff. `processedAt` is the durable completion marker.

After release, check health, real OTP delivery, MFA, worker/employer login, tenant isolation, safe file upload/download, one synthetic booking and provider sandbox callback. Do not turn on live payments until merchant-side status agrees with local immutable records.

## Backup and restore runbook

Use encrypted backups in a separate failure domain, retention approved by the operator, and regular restore drills. For PITR, configure PostgreSQL continuous WAL archiving with a managed backup system. File storage needs versioning/backup under the same retention policy; a database backup alone cannot restore uploaded documents. Redis is a recoverable queue, not the source of financial truth.

For a logical backup, with `PGSERVICE` configured through the operator's secure PostgreSQL service file:

```sh
pg_dump --format=custom --file=smenatop-backup.dump
```

Record the application revision, migration state, backup timestamp and storage snapshot identifier. Never put database passwords into shell history. To restore:

1. Stop writes and jobs, keep evidence of the incident, and provision an isolated empty restore database.
2. Point a restricted `PGSERVICE` at that database and run `pg_restore --exit-on-error --no-owner --dbname=smenatop_restore smenatop-backup.dump`.
3. Restore the matching private object snapshot. Validate row counts, schema migrations, booking constraints, invoice/transaction totals and attachment ownership.
4. Run read-only smoke checks, then point a synthetic staging API/jobs pair at the restore. Reconcile provider transactions from the backup cut-off before accepting payments.
5. Record measured recovery time/data loss. Switch production traffic only through the approved incident process. Preserve the prior database until reconciliation is complete.

No restore drill or PITR recovery was executed in this session; these remain release gates.

## Rollback and schema change

Prefer expand/contract: add nullable compatible fields/indexes, deploy readers/writers, backfill in bounded batches, and remove old fields only after all old code is retired. Take a verified backup before irreversible migrations. Do not edit an already applied migration or run `migrate reset` in a persistent environment.

Rollback application images to the prior compatible revision while retaining forward-compatible schema. A destructive schema change needs a reviewed repair migration or a restore-and-reconcile plan; Prisma down migrations are not fabricated. The first release contains a baseline plus explicit PostgreSQL invariants. Both were applied on empty databases; applying them again leaves data in place.

## Monitoring and alerts to configure

Alert on readiness failures, sustained 5xx responses, disk/WAL growth, backup age/restore failure, OTP rate spikes, failed provider authentication, unreconciled payments, oldest unprocessed outbox age and exhausted retries. Treat booking conflicts as domain signals, separated from unexpected database faults. Logs intentionally avoid request bodies, cookies, tokens and document content. Centralized metrics exporters, a redaction audit and operational dashboards remain release work; this repository does not claim an already active monitoring service.

For retry recovery, investigate the specific immutable outbox event and current domain state before requeueing the same event ID. Do not invent a new finance event or mark an invoice paid to clear a queue alert. No public SQL console or unrestricted developer reset is exposed.
