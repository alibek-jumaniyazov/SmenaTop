# Security and privacy

## Threat model

Protect worker privacy, organization isolation, assignment capacity and subscription entitlement from a malicious authenticated user, guessed resource IDs, stale memberships, replayed tokens, concurrent requests and forged payment callbacks. Frontend route guards are usability controls; every API lookup and mutation requires server authorization.

## Browser authentication

OTP codes are randomly generated and stored as hashes in challenges. The local test inbox is a separate non-production adapter behind a server-only developer key. Responses must not reveal whether a phone already belongs to a user. Challenge expiry, resend cooldown, attempt counts and IP/phone rate limits are enforced server side. Never log OTP values.

Use revocable random session cookies with HttpOnly, SameSite and Secure in production. No browser credential goes into localStorage. The CSRF header must match the session-bound value; origin checking protects authenticated mutations. Reload membership status and permissions for every request so suspension/revocation takes effect immediately. Privileged production sessions fail closed without completed MFA; an initial platform administrator cannot come from public signup.

## Private documents

Files accept up to 5 MB, PDF/PNG/JPEG only, with magic-byte and MIME agreement. Unscanned local files remain `QUARANTINED`; local manual release is explicitly labeled and audited. Production requires the S3 adapter and configured ClamAV scanning. A missing or failed scanner does not silently mark a file clean. This is defense in depth and does not prove arbitrary content is harmless.

Storage keys are random UUIDs. Original filenames are sanitized and never interpreted as paths. The bucket is private; local files are outside the web document root. Download URLs expire after 60 seconds, are signed and bound to the authenticated user, and recheck ownership/permission at download time. Operators need `verification.document.read`, with an audit entry; ordinary finance roles do not receive it. Download responses force attachment, no-store and nosniff.

## Financial integrity

Only server-calculated invoice totals are accepted. Provider authentication is independent of browser authentication. Retain event identity, environment, amount and currency checks. Unique database records prevent double fulfillment. Invalid signatures, conflicting amounts and duplicate payments are tested separately. Keep PAN, CVV, payment OTP and provider credentials out of the database, browser bundle and logs.

## Deployment safeguards

Production must reject local SMS, mock payments, developer mutation controllers and sample secrets. Configure HTTPS/CORS, request limits, correlation IDs, secret rotation, database backups and monitoring before release. Test the built production configuration; hiding frontend links is insufficient. Read-only production diagnostics require separate authorization.

## Retention and operator review

Privacy/terms pages are drafts pending real operator identity and specialist review. Keep financial history and audit evidence according to the approved retention schedule; remove or pseudonymize optional PII separately. Export/deletion requests must be reviewable support cases until the final retention workflow is approved. Do not claim unconditional immediate deletion of accounting records.

Production release requires decisions on lawful labor arrangements, personal-data location/retention, operator registration, tax/fiscal handling and payment merchant terms. These are product release gates; no unverified legal compliance claim is made.

## Recovery

Revoke all sessions for a compromised account, suspend affected memberships, rotate relevant API/provider credentials and review audit records. Privileged MFA recovery must use an out-of-band verified operator procedure; do not add an OTP bypass or let a developer role grant itself admin. Database restore steps are in `DEPLOYMENT.md`.
