# PostgreSQL schema setup

## Supabase MVP (recommended)

Supabase hosts PostgreSQL, so no local PostgreSQL installation is needed for the app. In the Supabase project **Connect** panel, copy a transaction-pooler URL for `DATABASE_URL` and a direct URL for `DIRECT_URL` in `.env`. If your network cannot reach the direct database host, use the session pooler for `DIRECT_URL`. Do not use the transaction pooler for Prisma migrations. If the pooler URL does not include it, add `pgbouncer=true` to `DATABASE_URL` for Prisma. Keep the migration-owner URL separate from the app's runtime URL.

### Vercel connection limits

`EMAXCONNSESSION: max clients reached in session mode` means Supabase's session pooler has exhausted its client connections. Session-mode connections remain assigned while application clients stay connected, so Vercel instances and local development can exhaust the same shared project's pool even with few users. Shorter calibration transactions alone do not fix this limit.

In Vercel **Settings > Environment Variables**, set the runtime `DATABASE_URL` to the **Transaction pooler** URL copied from Supabase Connect (normally port **6543** on a `*.pooler.supabase.com` host). For this Prisma 6 client, include `pgbouncer=true&connection_limit=1`, retaining any existing SSL options. Example with placeholders only:

```dotenv
DATABASE_URL=postgresql://APP-ROLE.PROJECT-REF:ENCODED-PASSWORD@POOLER-HOST:6543/postgres?pgbouncer=true&connection_limit=1
```

Do not merely change the port on a direct `db.PROJECT-REF.supabase.co` host; copy the correct transaction-pooler host and username, retaining the restricted app role. Keep `DIRECT_URL` on a direct or session-pooler connection for migrations. Update every Vercel environment used for testing, then redeploy; existing deployments retain their old environment settings. Use the transaction pooler for local live development too when sharing the project, and restart the local app after changing its URL.

The app reuses one Prisma client per process, including production, and defaults its connection limit to **1** unless the URL explicitly supplies a different value. This is a per-process limit, not a global limit across Vercel instances. It does not change `DIRECT_URL` or Prisma CLI migration connections. No database migration is needed. If capacity errors persist after the pooler change, inspect Supabase connection metrics and other clients using the project; do not blindly increase pool size or terminate unrelated sessions. Retest resuming a session, starting calibration and saving readings after deployment.

From the workspace root, apply the schema and reference data with:

```powershell
npm run db:generate
npm run db:deploy
```

Prisma uses `DIRECT_URL` for migration deployment and `DATABASE_URL` for application queries. Never use `db push` on this database, and do not also run the standalone SQL schema scripts below.

For least privilege, run `005-app-grants.sql` as the Supabase database owner (for example, in the Supabase SQL Editor). Create a separate login role in the Supabase project, grant it membership in `vfl_app`, and set `DATABASE_URL` to that role's connection URL. Confirm the project permits the role creation and grants; do not put role passwords in SQL files or source control. Keep `DIRECT_URL` restricted to deployment and administration.

After the app role is configured, follow the account setup below and run `npm run db:seed` using the app's `DATABASE_URL`.

## Email/password accounts (Supabase Auth)

1. In Supabase Authentication, enable the Email provider, allow new users to sign up, and keep email confirmation enabled. Configure custom SMTP to send confirmation messages to arbitrary email addresses; Supabase's default email service has restricted recipients and limits. Set Site URL to `http://127.0.0.1:3000` and allow `http://127.0.0.1:3000/login` in Authentication URL Configuration. For hosted trials, replace these with the actual HTTPS app origin and set `AUTH_URL` accordingly. Set a strong Supabase password policy (the signup form requires at least 12 characters).
2. In Authentication > Users, use Add user > Create new user for your first administrator. Enter the email and a strong password directly in Supabase. Mark the email confirmed only after independently verifying the user's email ownership. Never put passwords in the app database, seed variables, or chat.
3. Copy the new Auth user's UUID from its detail screen. This is not a database role, email address, or Entra ID.
4. In the local `.env`, add the following settings using the project API URL and publishable key from Supabase project settings (the legacy anon key is also supported):

```dotenv
APP_MODE=live
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-OR-ANON-KEY
AUTH_URL=http://127.0.0.1:3000
AUTH_SECRET=YOUR-RANDOM-SECRET-AT-LEAST-32-CHARACTERS
SEED_ADMIN_EMAIL=your.name@example.com
SEED_ADMIN_NAME="Your Name"
SEED_ADMIN_SUBJECT=UUID-COPIED-FROM-SUPABASE-AUTH
```

5. Keep `DATABASE_URL` and `DIRECT_URL` as already configured. Remove unused `AUTH_MICROSOFT_ENTRA_ID_*` settings. Never use a Supabase secret/service-role API key in place of the publishable key.
6. Run `npm run db:seed` BEFORE the first sign-in, restart with `npm run dev`, then sign in at `http://127.0.0.1:3000/login` using the email and password created in Supabase. The seed loads the reference grid and creates an active admin linked by Auth UUID. An existing app user is not promoted or relinked automatically. If this account already has an inactive request, an existing app admin must approve/promote it, or the database administrator must explicitly provision the first admin after checking the matching Auth UUID and email; rerunning the seed will not grant privileges.
7. Additional users open `/signup`, register with any email provider and a password, confirm their email, then attempt sign-in. Only after successful email/password verification does the app create an inactive access request. Users do not need Supabase dashboard access. Unconfirmed accounts and invalid passwords never create requests or receive an app session.
8. As an app administrator, open User access (`/users`). Inactive accounts appear first, and the search matches email or display name. Choose technician, executive, or admin using the role selector; wait for it to save, then click Approve access. The user can then sign in. Approvals and role changes use the existing audited admin-only API. Use Suspend access to block an approved account on its next request. To decline a request, leave it inactive; subsequent sign-ins never reactivate it.

New requests default to inactive with the executive role (read-only if eventually approved). No self-service input can set a role or approval flag. Inactive is shared by pending, declined, and suspended accounts; this MVP does not maintain separate review-state labels or send approval emails. Inform approved users through your normal communication channel. A user who signs up but never confirms and attempts sign-in appears only in Supabase Authentication, not the app's review list. Existing accounts are never automatically relinked by email.

The signup page explains all four steps: register, confirm email, attempt sign-in to submit the request, and sign in again after administrator approval. Verified inactive users see an approval-required message rather than a generic credentials failure. Approval does not send another confirmation link: the user's email is already verified, and their existing password remains valid. Administrators review requests in User access only; no administrator-notification emails are sent.

Passwords are verified by Supabase over its Auth API; Auth.js issues the app's HTTP-only session cookie. Passwords and Supabase access/refresh tokens are not stored in app sessions or business tables. App sessions last up to eight hours. Disable the user in the app's User access screen for immediate blocking on subsequent requests; a password reset or Supabase-only account deletion does not immediately revoke an existing Auth.js app session. Self-service signup and password recovery are implemented. Recovery uses a separate temporary HttpOnly cookie, not an Auth.js app session; see the required setup below.

For this server-only database integration, disable Supabase's Data API if unused (Supabase Auth remains required). The business tables have no browser-facing RLS policy model; do not expose them through the Data API without a separate security review. Before production, add application-level shared-store signup/login throttling and abuse protection in addition to Supabase's Auth rate limits, and test email delivery, account recovery, and access revocation. Automated and browser testing of this signup flow remains required before public deployment.

## Password recovery setup

No new API keys, service-role credentials or database migration are needed. Recovery uses the existing Supabase publishable key and Supabase's email-delivery/rate-limit configuration.

1. In Vercel, set `AUTH_URL` to the actual HTTPS app origin, such as `https://YOUR-APP.vercel.app`, and deploy the new reset pages before testing emailed links.
2. Development and production share the same Supabase project. In Supabase **Authentication > URL Configuration**, keep **Site URL** set to the live app origin. Add the exact **Redirect URL** `https://YOUR-APP.vercel.app/reset-password/confirm` and retain the existing signup `/login` URL. Recovery emails from either environment open the live app; do not add a local recovery redirect. Keep the local app's `AUTH_URL` set to its own local origin because it is also used for request-origin checks.
3. In **Authentication > Email Templates > Reset password**, replace the recovery link with:

   ```html
   <h2>Reset your password</h2>
   <p>If you requested a password reset, use this link to continue:</p>
   <p><a href="{{ .SiteURL }}/reset-password/confirm?token_hash={{ .TokenHash }}">Reset password</a></p>
   <p>If you did not request this, you can ignore this email.</p>
   ```

   Change only the **Reset password** template, not **Confirm signup**. This flow deliberately uses the shared `{{ .SiteURL }}`, not an environment-specific `{{ .RedirectTo }}` or `{{ .ConfirmationURL }}`. The default confirmation URL would consume the recovery token before the app can verify it. The app does not supply a local redirect URL when requesting recovery emails.
4. Verify Supabase custom SMTP, email rate limits, recovery-link expiry and any email-provider link tracking. Test the latest email on another browser/device. Supabase recovery links are single-use; old, expired or already-used links require a fresh request.

Because both environments use the same Supabase Auth project, resetting an account's password changes its credentials for both environments. Use a dedicated test account; opening a reset page locally does not make an emailed link local or isolate the account change from production.

The email request uses a generic acknowledgement, without looking up app approval or exposing whether an account exists. Merely opening the callback page does not consume the link; the user presses Continue to verify it server-side as a recovery token. GET-only email scanners therefore do not consume it through this app. An expired or invalid link displays a new-link prompt. Provider/delivery failures are reported explicitly and logged without passwords, emails or token payloads.

After verification, only the recovery access token is stored in a path-scoped, SameSite=Strict, HttpOnly cookie, Secure in production, for at most 15 minutes (or the shorter Supabase token lifetime). It is never exposed in form fields or local storage; refresh tokens are discarded. Recovery pages use `no-store` and `no-referrer`. The app updates only the authenticated Supabase user's password and clears the recovery cookie after success or expired authorization, then sends the user to login. Pending, suspended and approved app users retain their existing roles and approval status; recovery never creates or activates an app user.

This flow does not revoke Auth.js sessions already open on other devices; those remain subject to the existing eight-hour lifetime and database activation checks. If an account may be compromised, suspend it in User access while the administrator investigates.

## Standalone SQL path

This alternative is for an empty PostgreSQL database when `psql` is available. You can also run the scripts individually in the Supabase SQL Editor as the database owner. Do not mix this path with Prisma migrations on the same database.

```powershell
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/001-create-tables.sql
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/002-integrity.sql
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/003-views.sql
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/004-seed-z-factors.sql
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/005-app-grants.sql
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/006-snapshot-guards.sql
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/007-instrument-type-identity.sql
```

Tables/enums/migrations are intentionally not repeatable; seeds and grants are repeatable. If starting with these standalone scripts and later switching to Prisma deployment, baseline the matching migrations with `prisma migrate resolve --applied <migration-name>` first. Grants are applied separately for either path.

For an existing standalone-managed database, apply `007-instrument-type-identity.sql` once as the database owner. For a Prisma-managed database, use `npm run db:deploy` instead. Instrument versions are unique by `(serial_number, instrument_type, calibration_due_date)`, allowing an air and water thermometer to share a serial number and due date. UUID references and the immutable snapshots of used instruments are unchanged; each version may be reused across multiple lab sittings and pipette calibrations.

There are **15 business tables**, including `calibration_volume_results`, as required by database design v1.2. Prisma adds its own migration history table. Measurements and statistics use unscaled NUMERIC to avoid implicit storage rounding. Z alone is stored at four decimal places. Certificate idempotency adds `idempotency_key`.

`vfl_app` is a non-login privilege role. Create a separate login with a secret managed outside source control, grant it `vfl_app`, and use that login for the app. Never run the app as the schema owner or a superuser. The app's `external_subject` column now stores the Supabase Auth user UUID. Existing Entra-linked accounts require deliberate administrator relinking; identities are never automatically linked by email.

The CSV remains UNVERIFIED. Human review against ISO is required before production. The audit table is append-only, and closed sessions/readings/results and stored certificates are protected by triggers. Database-owner accounts can still bypass privileges; keep migration credentials separate.