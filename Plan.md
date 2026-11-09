# Plan.md — Architecture & Design Plan

Traces to `Spec.md` (FR/NFR/MN) and obeys `Constitution.md`.

---

## 1. Tech Stack & Rationale

| Concern | Choice | Rationale |
|---|---|---|
| **Language** | TypeScript 5.x (strict) | One language end-to-end; shared Zod schemas between client and server; strong typing for calculation code |
| **Runtime** | Node.js 22 LTS | Long-term support, native `fetch`, stable |
| **Full-stack framework** | **Next.js 15 (App Router)** + React 19 | Single deployable for UI + API; server components keep client JS small (bundle budget); built-in routing, middleware, and server actions |
| **Database** | **PostgreSQL** (Supabase-managed for MVP; PostgreSQL 16 for local tests) | Strong relational integrity, `CHECK` constraints, partial unique indexes, `NUMERIC`, `inet`, `citext`; fits the Dim/Fact model and later reporting |
| **ORM / migrations** | **Prisma 6** | Type-safe client, reviewable SQL migrations, `@map` allows snake_case DB with camelCase TS. Raw SQL migrations are used for `CHECK`s/triggers/partial indexes Prisma can't express |
| **Validation** | **Zod** | Shared schemas; infers types; generates OpenAPI via `zod-to-openapi` |
| **Numerics / dates** | `decimal.js`, `date-fns` | Exact arithmetic (MN-02); proven calendar-month math (`addMonths`) |
| **Auth** | **Auth.js (NextAuth v5)** with OIDC provider (Microsoft Entra ID) | SSO for enterprise; roles mapped from IdP groups into the `users` table |
| **Styling / UI kit** | **Tailwind CSS 4 + shadcn/ui (Radix primitives)** | Accessible primitives (WCAG), zero runtime CSS cost, copy-in components keep bundle small |
| **Forms** | React Hook Form + `@hookform/resolvers/zod` | Performance on large grids; shared validation |
| **Server state** | TanStack Query v5 | Caching, invalidation, optimistic autosave |
| **Tables** | TanStack Table v8 | Headless, small, server-side pagination |
| **PDF generation** | **`@react-pdf/renderer`** (server-side) | No headless browser to operate; deterministic output; template is code (versioned). *Fallback:* Playwright→HTML-to-PDF if the existing template is too complex to reproduce (the sample is a one-page A4 layout of tables and text, so this is expected to work; confirm at Task 26 once multi-channel samples arrive) |
| **Object storage** | S3-compatible (AWS S3 / MinIO locally) | Certificates stored immutably; DB keeps key + checksum |
| **Logging / errors** | `pino` (JSON) + Sentry | Structured logs with request IDs; error tracking |
| **Unit / integration tests** | **Vitest** + **Testcontainers (Postgres)** | Fast; real DB for repository tests |
| **Component tests** | Testing Library + `jest-axe` | Behavior & accessibility |
| **E2E tests** | **Playwright** + `@axe-core/playwright` | Critical flows across browsers |
| **CI/CD** | GitHub Actions | Type-check, lint, tests, bundle budget, migration check, container build |
| **Deployment** | MVP: app hosting + Supabase-managed PostgreSQL + S3-compatible object storage; later container hosting remains an option | No local database installation for MVP; keep migration and runtime credentials separate |
| **Local dev** | Supabase for application data; Docker Compose Postgres + MinIO remain optional for isolated integration tests | Avoid requiring a local PostgreSQL installation for normal MVP development |

---

## 2. Component Architecture

### 2.1 Screens (routes)

| Route | Purpose | Spec |
|---|---|---|
| `/login` | SSO sign-in | FR-19 |
| `/customers`, `/customers/new` | List + create customer | FR-01 |
| `/ranges`, `/ranges/new` | Search/create Range+Channel+Make+Model; capture limits | FR-02–04 |
| `/assets`, `/assets/new` | Asset list/filter; batch registration grid | FR-05, FR-21 |
| `/assets/[assetId]` | Asset detail: info, damages, sessions, certificates | FR-08 |
| `/lab-dimensions/new` | Lab conditions entry with live Z display | FR-06, 07 |
| `/calibrations/[sessionId]` | Calibration workspace (start, readings, results, final status, PDF) | FR-09–18 |
| `/admin/users` | Role management | FR-19 |

### 2.2 Component Hierarchy (key parts)

```
AppShell (nav, user menu, role-aware links)
├─ CustomerForm
├─ RangeThresholdForm
│   ├─ DerivedFieldsPreview   (times_to_test, repeats — read-only)
│   └─ LimitsGrid             (one row per test volume: nominal µL, inaccuracy %, imprecision %; "copy from…")
├─ AssetBatchGrid
│   ├─ CustomerPicker (customer+department)
│   └─ RangeConfigPicker (Range+Channel+Make+Model)
├─ LabDimensionsForm
│   ├─ InstrumentPickers      (balance, air thermometer, water thermometer; expired ones disabled)
│   └─ ZFactorBadge           (read-only, 4 dp, shows table version)
├─ DamageForm                 (conditionally required fields)
└─ CalibrationWorkspace
    ├─ SessionHeader          (asset info, status chip, Start button)
    ├─ SessionSettingsForm    (process date, next due months → due/reminder preview, per-channel checkbox)
    ├─ LotTabs
    │   └─ ReadingGrid        (10 mass inputs → computed µL column, paste support)
    │       └─ LotSummary     (mean, SD, inaccuracy, imprecision, pass/fail chips)
    ├─ FinalStatusPanel       (derived status, reasons)
    ├─ CertificatePanel       (Generate PDF, version list, download)
    └─ ExecMetaPanel          (IP, location — executive role only)
```

### 2.3 State-Sharing Approach
- **Server is the source of truth.** Pages load data in server components and pass it as props; interactive islands use TanStack Query with keys like `['session', id]`.
- Mutations (`start`, `saveLot`, `generateCertificate`) invalidate `['session', id]` and `['asset', id]`.
- Form drafts live in React Hook Form; no global client store. Cross-component coordination in the workspace uses a small `CalibrationWorkspaceContext` that exposes only `sessionId`, `activeLotNo`, and `isReadOnly`.
- Derived numbers displayed in the UI come from the server response; a client-side `previewLot()` uses the **same pure domain functions** (shared import) for instant feedback but never writes.

---

## 3. File & Directory Structure

```
pipette-calibration/
├── .github/workflows/ci.yml
├── .husky/                         # pre-commit hooks
├── docker-compose.yml              # optional local postgres + minio
├── Dockerfile
├── Constitution.md  Spec.md  Plan.md  Build_and_Test.md  Database_Design.md
├── docs/
│   └── adr/                        # architecture decision records
├── prisma/
│   ├── schema.prisma
│   ├── migrations/                 # SQL migrations (incl. CHECKs, triggers, partial indexes)
│   └── seed/
│       ├── roles-and-users.ts
│       └── z-factors-iso8655.csv   # ISO 8655 Table A.1, 217 rows (seed/z_factors_iso8655.csv)
├── e2e/
│   ├── inventory-flow.spec.ts
│   ├── calibration-pass-flow.spec.ts
│   ├── calibration-fail-flow.spec.ts
│   └── rbac.spec.ts
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx
│   │   │   ├── customers/ …
│   │   │   ├── ranges/ …
│   │   │   ├── assets/ [assetId]/ …
│   │   │   ├── lab-dimensions/ …
│   │   │   ├── calibrations/[sessionId]/page.tsx
│   │   │   └── admin/users/page.tsx
│   │   ├── api/v1/
│   │   │   ├── customers/route.ts
│   │   │   ├── range-thresholds/route.ts
│   │   │   ├── assets/route.ts
│   │   │   ├── assets/[assetId]/damages/route.ts
│   │   │   ├── lab-dimensions/route.ts
│   │   │   ├── sessions/route.ts
│   │   │   ├── sessions/[sessionId]/start/route.ts
│   │   │   ├── sessions/[sessionId]/lots/[lotNo]/route.ts
│   │   │   ├── sessions/[sessionId]/complete/route.ts
│   │   │   ├── sessions/[sessionId]/certificates/route.ts
│   │   │   └── health/route.ts
│   │   └── middleware.ts           # auth gate + security headers
│   ├── domain/                     # PURE, no I/O
│   │   ├── range.ts                # parseRange, deriveTimesToTest, deriveRepeats
│   │   ├── lots.ts                 # nominal volumes, lot plan
│   │   ├── z-factor.ts             # bilinear interpolation + 4-dp rounding (hPa → kPa)
│   │   ├── statistics.ts           # mean, sample SD, inaccuracy, imprecision
│   │   ├── status.ts               # lot + session pass/fail derivation
│   │   ├── dates.ts                # dueDate, reminderDate
│   │   └── *.test.ts
│   ├── services/
│   │   ├── customer-service.ts
│   │   ├── range-threshold-service.ts
│   │   ├── asset-service.ts
│   │   ├── lab-dimension-service.ts
│   │   ├── damage-service.ts
│   │   ├── calibration-service.ts
│   │   ├── certificate-service.ts
│   │   └── audit-service.ts
│   ├── repositories/               # Prisma access
│   ├── features/                   # UI by feature
│   │   ├── customers/ ranges/ assets/ lab/ calibration/ certificates/
│   ├── pdf/
│   │   ├── CertificateDocument.tsx # the template
│   │   └── template-version.ts
│   ├── lib/
│   │   ├── auth.ts  rbac.ts  db.ts  env.ts  logger.ts  errors.ts  storage.ts  request-context.ts
│   ├── schemas/                    # Zod schemas (shared client/server)
│   └── components/ui/              # shadcn primitives
├── package.json  tsconfig.json  eslint.config.mjs  vitest.config.ts  playwright.config.ts
└── .env.example
```

---

## 4. Key Design Decisions

| Decision | Detail |
|---|---|
| **Derived fields stored, not just computed** | `times_to_test`, `repeats`, `due_date`, `reminder_date`, `volume_ul`, statistics are persisted so that historical certificates stay reproducible even if rules change; recomputed and compared in tests |
| **Z snapshot** | `lab_dimensions` stores the resolved Z (rounded to 4 dp, as on the sample certificate) and table version, so later edits to the reference table don't alter past results |
| **Limits per test volume + snapshot** | Limits live in `range_threshold_limits`; each lot copies the limit values it was judged against, so editing limits later never changes a past result |
| **Readings in long format** | One row per reading; per-lot statistics computed once on save and stored; `v_lot_results` recomputes from raw rows for verification |
| **Composite FKs for traceability** | Readings/lots/sessions/certificates carry `asset_id` (and `customer_id` where needed) with composite FKs, so any asset's full history is one join and can't be inconsistent |
| **Domain-first** | All calculations live in `src/domain` and are unit-tested against hand-calculated golden data before any UI exists |
| **Lot plan generation** | `lots.ts` returns a deterministic plan `[ {lotNo, nominalVolumeUl, channelNo?} ]`; the service inserts the lots on Start |
| **Server enforces state machine** | `not_started → in_progress → completed`; certificate endpoint re-checks `final_status = pass` (MN-13) |
| **Exec-only data** | IP taken from trusted proxy header (`x-forwarded-for` validated); location resolved from IP geo lookup or consented browser geolocation; DTO mappers strip for non-exec (MN-12) |
| **One certificate per asset** | Stored PDF is re-served, never regenerated silently; admin void-and-reissue is audited; partial unique index enforces one active certificate |
| **Reporting-ready** | `due_date`, `process_date`, `start_time/end_time`, customer/range/channel FKs are indexed so v1.1 reports are plain SQL |

---

## 5. Implementation Approach (Technical Strategy)

1. **Bootstrap** — scaffold Next.js + TypeScript strict, ESLint/Prettier/Husky, Vitest, Playwright, optional Docker Compose (Postgres + MinIO) for isolated local tests, CI pipeline with bundle-size check. *Why first:* quality gates exist before any feature code.
2. **Database foundation** — write Prisma schema + raw-SQL migration for constraints/triggers; seed roles and Z table; integration tests assert each constraint rejects bad data.
3. **Domain core (no UI)** — implement and fully unit-test range parsing, lot planning, Z interpolation, statistics, status, dates. Validate against VFL golden spreadsheet.
4. **Cross-cutting infrastructure** — env validation, logger, error types + RFC 7807 mapper, request context (request ID), auth + RBAC helper, audit service.
5. **Vertical slices, in order of the business flow** (each slice = repository → service → API route → UI → tests):
   1. Customers
   2. Range thresholds + limits
   3. Assets (batch grid)
   4. Lab dimensions with Z derivation
   5. Part damages
   6. Calibration session (start → settings → lots → readings → results → final status)
   7. Certificate PDF + storage
6. **Hardening** — RBAC tests, exec-field masking, accessibility audit, performance checks, error handling polish, backup/restore drill.
7. **Release** — container build, staging deploy, UAT against `Spec.md` traceability matrix, production deploy with rollback plan.

### Request lifecycle example — saving a lot of readings

```
ReadingGrid (client) → PATCH /api/v1/sessions/{id}/lots/{lotNo}
  → route handler: authenticate, parse Zod body (10 mass values)
  → calibration-service.saveLot():
        authorize(technician|admin) → load session + lab_dimension (Z) + range limits
        → domain.volumes = mass × Z × 1000 (Decimal)
        → domain.stats(mean, SD, inaccuracy, imprecision)
        → domain.lotStatus(limits)
        → transaction: upsert 10 readings + update lot + (if last lot) update session status/final_status + asset progress
        → audit-service.record()
  → 200 { lot, session summary } → TanStack Query invalidates ['session', id]
```

---

## 6. Environments & Operations

| Env | Purpose | Data |
|---|---|---|
| local | Developer machine using Supabase for app data; Docker Compose is optional for isolated tests | Seed only |
| ci | Ephemeral Postgres via Testcontainers | Test fixtures |
| staging | UAT with VFL | Anonymized sample data |
| production | Live | Real; daily backups, 30-day retention |

Observability: `/api/v1/health` (liveness/readiness), JSON logs, Sentry, uptime alert; DB slow-query log. Rollback: redeploy previous image tag; DB migrations are expand/contract so previous app version remains compatible for one release.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Z table transcription error (seeded from an image) | Automated monotonic checks + sample-Z test; one human spot-check against the ISO original; `UNVERIFIED` flag blocks production until signed off |
| Template only seen for single-channel variable-volume | PDF behind an adapter; request multi-channel, per-channel, fixed-volume and Fail samples before Task 26 |
| Ambiguity in lot rules, due-date and Z-rounding conventions (A5, A13, A16) | Confirm in a 30-min workshop before Tasks 9, 10, 12 and 13; isolate rules in `domain/lots.ts` and `domain/status.ts` |
| Calculation mismatch vs. VFL's current spreadsheets | Golden-dataset tests; parallel run on 10 real pipettes before go-live |
| Location capture privacy | Make it consent-based, exec-only, documented in privacy notice |
| Data-entry errors on 10-reading grids | Keyboard-first grid, paste support, plausibility warnings (e.g., reading deviates > 50% from nominal) |
