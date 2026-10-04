# Security and privacy

## Threat model

Protect worker privacy, organization isolation, assignment capacity and subscription entitlement from a malicious authenticated user, guessed resource IDs, stale memberships, replayed tokens, concurrent requests and forged payment callbacks. Frontend route guards are usability controls; every API lookup and mutation requires server authorization.

## Browser authentication

Temporary local demo exception: `LOCAL_FIXED_OTP_ENABLED=true` generates `123456` only with `APP_ENV=local`, `SMS_PROVIDER=local` and non-production `NODE_ENV`. The default is `false`; enabling it in any other environment prevents API startup. Verification still requires a freshly requested challenge and checks its hash, expiry, attempts and consumption. This option changes challenge generation only, not the verification rules or existing random challenges. Disable the flag and restart the API to restore random codes for subsequent requests.

By default, OTP codes are randomly generated and stored as hashes in challenges. Local SMS messages are available to an operator through `node --env-file=.env scripts/local-inbox.mjs <phone>`, which reads only the selected phone's unexpired, unconsumed challenge from the local database. This CLI requires `APP_ENV=local`, `SMS_PROVIDER=local` and non-production mode; it does not need an HTTP inbox or a developer key in the browser. Never copy its OTP output into shared logs. The developer browser page has been removed. Responses must not reveal whether a phone already belongs to a user. Challenge expiry, resend cooldown, attempt counts and IP/phone rate limits are enforced server side.

Use revocable random session cookies with HttpOnly, SameSite and Secure in production. No browser credential goes into localStorage. The CSRF header must match the session-bound value; origin checking protects authenticated mutations. Reload membership status and permissions for every request so suspension/revocation takes effect immediately. Privileged production sessions fail closed without completed MFA; an initial platform administrator cannot come from public signup.

## Organization delegation

Team membership changes acquire the organization lock before rechecking the issuer's current authority. A scoped editor cannot turn a branch scope into global access, add another branch, or modify an existing global/out-of-scope member. Both the target's current permissions and proposed permissions must fit within the issuer's permissions; ownership transfer remains a separate explicit operation.

Invitations cannot grant a role above the issuer's authority. Acceptance rechecks the invitation, issuer account/membership, organization status and active branches. A revoked or demoted issuer cannot revive old authority through an outstanding token. Replacing a custom role with a built-in role clears `customRoleId`, and changed-member sessions are revoked.

## Private documents

Files accept up to 5 MB, PDF/PNG/JPEG only, with magic-byte and MIME agreement. Unscanned local files remain `QUARANTINED`; an explicitly enabled local manual release requires the restricted server-tool guard, a permitted session, a reason and an audit entry. No manual-release button is exposed in the product UI. Production requires the S3 adapter and configured ClamAV scanning. A missing or failed scanner does not silently mark a file clean. This is defense in depth and does not prove arbitrary content is harmless.

Storage keys are random UUIDs. Original filenames are sanitized and never interpreted as paths. The bucket is private; local files are outside the web document root. Download URLs expire after 60 seconds, are signed and bound to the authenticated user, and recheck ownership/permission at download time. Operators need `verification.document.read`, with an audit entry; ordinary finance roles do not receive it. Download responses force attachment, no-store and nosniff.

## Financial integrity

Only server-calculated invoice totals are accepted. Provider authentication is independent of browser authentication. Retain event identity, environment, amount and currency checks. Unique database records prevent double fulfillment. Invalid signatures, conflicting amounts and duplicate payments are tested separately. Keep PAN, CVV, payment OTP and provider credentials out of the database, browser bundle and logs.

## Deployment safeguards

Swagger UI and OpenAPI JSON are not registered as HTTP routes in any environment. The contract generator exports the compiled server contract to a local file without listening on a port. Repository contract files are development artifacts and must not be published to the web document root. Normal browser requests still expose the public application API paths in developer tools; authorization and secret handling protect data independently of whether a path is known.

Local technical HTTP endpoints default to disabled. Explicit opt-in additionally requires local/non-production mode, a direct loopback connection, no browser/proxy forwarding headers, and a constant-time-checked server key; relevant endpoints retain session, CSRF and role checks. Production rejects these tools, local SMS, mock payments and sample secrets. The local OTP CLI remains separate from that HTTP opt-in.

Shared frontend errors use localized, bounded messages; server 5xx responses do not return exception details, SQL, provider configuration or field metadata. Constant-time token comparisons check UTF-8 buffer lengths so mismatched Unicode input cannot throw due to unequal buffer sizes.

The checked-in Caddy configuration denies documentation/developer paths, limits API request bodies to 6 MB, removes the Server header and adds CSP, anti-framing, HSTS, nosniff, referrer and permissions policies. Browser assets are served separately from private files; production database, Redis and API services have no published host ports. This configuration still needs validation on the actual deployment: TLS, reverse-proxy behavior and production headers have not been verified on a live host by the local source review.

Configure HTTPS/CORS, secret rotation, database backups and monitoring before release. Test the built production configuration; hiding frontend links is insufficient. Read-only production diagnostics require separate authorization. See [MOBILE_SECURITY_REPORT.md](MOBILE_SECURITY_REPORT.md) for the dated dependency audit and test status. A clean known-advisory audit is not a guarantee against unknown vulnerabilities or deployment misconfiguration.

## Retention and operator review

Privacy/terms pages are drafts pending real operator identity and specialist review. Keep financial history and audit evidence according to the approved retention schedule; remove or pseudonymize optional PII separately. Export/deletion requests must be reviewable support cases until the final retention workflow is approved. Do not claim unconditional immediate deletion of accounting records.

Production release requires decisions on lawful labor arrangements, personal-data location/retention, operator registration, tax/fiscal handling and payment merchant terms. These are product release gates; no unverified legal compliance claim is made.

## Recovery

Revoke all sessions for a compromised account, suspend affected memberships, rotate relevant API/provider credentials and review audit records. Privileged MFA recovery must use an out-of-band verified operator procedure; do not add an OTP bypass or let a developer role grant itself admin. Database restore steps are in `DEPLOYMENT.md`.
