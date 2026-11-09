# PostgreSQL schema setup

## Supabase MVP (recommended)

Supabase hosts PostgreSQL, so no local PostgreSQL installation is needed for the app. In the Supabase project **Connect** panel, copy a transaction-pooler URL for `DATABASE_URL` and a direct URL for `DIRECT_URL` in `.env`. If your network cannot reach the direct database host, use the session pooler for `DIRECT_URL`. Do not use the transaction pooler for Prisma migrations. If the pooler URL does not include it, add `pgbouncer=true` to `DATABASE_URL` for Prisma. Keep the migration-owner URL separate from the app's runtime URL.

From the workspace root, apply the schema and reference data with:

```powershell
npm run db:generate
npm run db:deploy
```

Prisma uses `DIRECT_URL` for migration deployment and `DATABASE_URL` for application queries. Never use `db push` on this database, and do not also run the standalone SQL schema scripts below.

For least privilege, run `005-app-grants.sql` as the Supabase database owner (for example, in the Supabase SQL Editor). Create a separate login role in the Supabase project, grant it membership in `vfl_app`, and set `DATABASE_URL` to that role's connection URL. Confirm the project permits the role creation and grants; do not put role passwords in SQL files or source control. Keep `DIRECT_URL` restricted to deployment and administration.

After the app role is configured, set `SEED_ADMIN_EMAIL`, `SEED_ADMIN_SUBJECT`, and `SEED_ADMIN_NAME`, then run `npm run db:seed` using the app's `DATABASE_URL`.

## Standalone SQL path

This alternative is for an empty PostgreSQL database when `psql` is available. You can also run the scripts individually in the Supabase SQL Editor as the database owner. Do not mix this path with Prisma migrations on the same database.

```powershell
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/001-create-tables.sql
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/002-integrity.sql
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/003-views.sql
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/004-seed-z-factors.sql
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/005-app-grants.sql
psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1 -f database/006-snapshot-guards.sql
```

Tables/enums/migrations are intentionally not repeatable; seeds and grants are repeatable. If starting with these standalone scripts and later switching to Prisma deployment, baseline the matching migrations with `prisma migrate resolve --applied <migration-name>` first. Grants are applied separately for either path.

There are **15 business tables**, including `calibration_volume_results`, as required by database design v1.2. Prisma adds its own migration history table. Measurements and statistics use unscaled NUMERIC to avoid implicit storage rounding. Z alone is stored at four decimal places. Certificate idempotency adds `idempotency_key`.

`vfl_app` is a non-login privilege role. Create a separate login with a secret managed outside source control, grant it `vfl_app`, and use that login for the app. Never run the app as the schema owner or a superuser. Create a first admin using their actual OIDC `sub` and verified email; no default passwords or invented administrator identities are seeded.

The CSV remains UNVERIFIED. Human review against ISO is required before production. The audit table is append-only, and closed sessions/readings/results and stored certificates are protected by triggers. Database-owner accounts can still bypass privileges; keep migration credentials separate.