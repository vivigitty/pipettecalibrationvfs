# ADR 0001: Generated foundation and unresolved release gates

Status: development foundation; client acceptance pending.

## Decisions

Use the stack families requested in Plan.md, patched within Next.js 15 / React 19 / Prisma 6. Runtime dependencies are pinned. PostgreSQL SQL migrations are authoritative for checks, partial indexes, triggers and composite foreign keys; Prisma models support application queries. Deploy reviewed SQL with `prisma migrate deploy`; do not use `db push` on business databases or generate unattended destructive schema diffs.

Latest data design v1.2 supersedes stale 14-table/per-lot descriptions. There are 15 business tables and one result per nominal volume. Use unscaled NUMERIC for readings/statistics rather than fixed NUMERIC(p,s), since fixed scales silently round persisted values and violate MN-02/NFR-R4. Money retains the prescribed currency scale. Decimal precision is 50 significant digits. Z is resolved and rounded at four decimals; final display/certificate formatting is separate.

Read-only development preview is an explicit mode, not an authentication bypass for live data. It uses isolated fixture records and cannot write or issue PDFs. Production refuses preview and unverified ISO references.

No IP is taken from arbitrary proxy headers and no geolocation is collected without consent. Trusted-proxy and privacy decisions are external gates. Server DTOs omit executive timing/IP/location fields from non-executive responses. Native semantic controls and CSS are used for the initial UI rather than adding another UI kit; Tailwind/shadcn alignment, TanStack Table, observability integration and the full process gates remain follow-up work.

The certificate draft must not be called an exact sample replica. Sample PDF/logo/font/footer and multi-channel approval are missing. Issuance is gated on explicit template approval. UUID idempotency keys are stored to enforce the REST contract. Storage keys include an immutable per-issuance namespace and retain the inventory/range PDF filename. An orphan-object reconciliation process is a deployment prerequisite.

## Dependency Review

| Runtime Dependency | Purpose | License | Placement |
| --- | --- | --- | --- |
| next, react, react-dom | Specified full-stack/UI framework | MIT | Shared/client |
| @prisma/client | Parameterized PostgreSQL access | Apache-2.0 | Server |
| zod | HTTP/env/DB JSON validation | MIT | Shared/client |
| decimal.js, date-fns | Exact measurements/calendar dates | MIT | Domain; decimal form validation |
| next-auth | App sessions after Supabase email/password verification | ISC | Server |
| @tanstack/react-query | Server state and mutation invalidation | MIT | Client |
| react-hook-form, @hookform/resolvers | Draft form state/Zod validation | MIT | Client |
| lucide-react | Consistent accessible tool icons | ISC | Client, tree-shaken |
| @react-pdf/renderer | Versioned certificate draft | MIT | Server only |
| pino | Redacted structured error logging | MIT | Server only |
| csv-parse | Structured ISO CSV parsing | MIT | Server/test/seed |

Pinned versions were checked against npm registry publication metadata. Transitive licenses, release maintenance and installed client gzip sizes still require automated review; no dependency-size or security-audit pass is asserted. Browser dependencies must satisfy Constitution budgets before release. No GPL/AGPL runtime dependency is intentionally introduced. Auth.js remains the explicitly requested v5 beta line.

## Verification Limits

The initial runtime installation was blocked. The user's fnm runtime is now available: Node 26.13.0 / npm 11.20.0. Dependency installation, Prisma client generation, strict typecheck/lint, all 48 unit tests and the Next.js production build passed. The read-only preview started successfully; browser checks and desktop/mobile screenshots passed. Node 22 deployment validation, database migrations/integration, full CLI E2E, coverage and production acceptance remain pending. npm audit reports unresolved high/critical advisories; no forced framework/ORM major updates were made. No commits were created and no original requirements document was altered.