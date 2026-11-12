# Constitution.md — Engineering Rules for the Pipette Calibration Platform

These rules are binding for every contributor (human or AI). A PR that violates them is rejected by CI or review. Changes to this file require an ADR (Architecture Decision Record) in `docs/adr/`.

---

## 1. Code Style & Standards

### 1.1 Language & Type Safety
- **TypeScript only** (no `.js` source files). `tsconfig.json` must enable:
  `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`, `"noImplicitOverride": true`, `"noFallthroughCasesInSwitch": true`.
- `any`, `@ts-ignore`, and non-null assertions (`!`) are forbidden. `@ts-expect-error` is allowed only with a comment and ticket link.
- Runtime validation at every trust boundary (HTTP input, env vars, DB JSON) with **Zod**. Types are inferred from schemas (`z.infer`), never duplicated.
- Domain money/measurement values use `Decimal` (decimal.js); never `number`.
- **Rounding policy:** the only rounding in the system is (1) Z to 4 decimals when resolved from the ISO table and (2) display / certificate formatting. Volumes, statistics and limit comparisons use full precision. A rounding call anywhere else fails review.

### 1.2 Linting & Formatting
- **ESLint** (flat config) with `typescript-eslint` strict-type-checked, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import` (no cycles), `eslint-plugin-security`.
- **Prettier** is the sole formatter (`printWidth: 100`, single quotes, trailing commas `all`).
- Pre-commit via **Husky + lint-staged**: format, lint, type-check changed files.
- Commits follow **Conventional Commits** (`feat:`, `fix:`, `test:`, `chore:` …), enforced by commitlint.

### 1.3 Naming Conventions
| Item | Convention | Example |
|---|---|---|
| Files (components) | `PascalCase.tsx` | `ReadingGrid.tsx` |
| Files (other) | `kebab-case.ts` | `calibration-service.ts` |
| Variables / functions | `camelCase` | `computeFinalStatus` |
| Types / interfaces / classes | `PascalCase`, no `I` prefix | `CalibrationLot` |
| Constants | `UPPER_SNAKE_CASE` | `REMINDER_LEAD_DAYS` |
| Zod schemas | `camelCase` + `Schema` | `createAssetSchema` |
| DB tables/columns | `snake_case` (see `Database_Design.md`); mapped with Prisma `@map` so TS stays camelCase |
| React hooks | `useXxx` | `useReadingEntry` |
| Booleans | `is/has/can` prefix | `isPassed` |
| Test files | `*.test.ts(x)` colocated, E2E in `e2e/*.spec.ts` |

### 1.4 General Code Rules
- One exported component or service per file; max **300 lines** per file, **40 lines** per function, cyclomatic complexity ≤ 10.
- Named exports only (default exports only where the framework requires them, e.g. Next.js pages).
- No commented-out code; no `console.log` (use the logger).
- Domain terms in code **must match the Business Glossary** (`lot`, `reading`, `inaccuracy`, `imprecision`, `session`).
- All comments explain *why*, not *what*. Every formula has a doc comment citing its Spec requirement ID (e.g. `// FR-14`).

---

## 2. Architecture & Design Patterns

### 2.1 Layered Architecture (dependency rule: inner layers never import outer ones)

```
UI (React components)  →  Route handlers / Server Actions  →  Services  →  Domain (pure)  →  (nothing)
                                                               ↓
                                                       Repositories → Prisma → PostgreSQL (Supabase-hosted for MVP)
```

| Layer | Responsibility | May import |
|---|---|---|
| `domain/` | **Pure functions & types**: range parsing, lot generation, Z interpolation, statistics, status derivation, date rules. No I/O, no framework imports. | `decimal.js`, `date-fns` only |
| `services/` | Use-case orchestration, transactions, authorization checks, audit | domain, repositories |
| `repositories/` | Database access via Prisma, returns domain-shaped objects | Prisma, domain types |
| `app/api`, server actions | HTTP concerns only: parse → authorize → call service → map errors | services, schemas |
| `components/` | Presentation; no direct fetch to DB, no business rules | hooks, schemas, UI kit |

### 2.2 State Management
- **Server state:** TanStack Query (cache keyed by resource, invalidated after mutations).
- **Form state:** React Hook Form + Zod resolver. Forms hold only draft input.
- **UI-local state:** `useState` / `useReducer`. A global client store (Redux/Zustand) is **not** introduced in v1.
- **URL state** (filters, pagination, tabs) lives in search params.
- The reading-entry grid autosaves each lot via a mutation; derived values shown from the server response, not recomputed as source of truth.

### 2.3 API Design Rules (REST)
- Resource-oriented, plural nouns, versioned: `/api/v1/customers`, `/api/v1/assets/{id}/sessions`.
- Verbs: `GET` read, `POST` create / action (`POST /assets/{id}/sessions`, `POST /sessions/{id}/complete`), `PATCH` partial update, no `PUT`, `DELETE` only for non-business drafts.
- JSON in `camelCase`. Dates ISO-8601 (`YYYY-MM-DD` for dates, UTC for timestamps). Decimals serialized as **strings**.
- Pagination: `?page=&pageSize=` (max 100) with `{ data, meta: { page, pageSize, total } }`.
- Idempotency: `POST` that creates a certificate accepts `Idempotency-Key`.
- Every endpoint: authenticate → authorize (role + resource) → validate → execute → audit.
- OpenAPI document generated from Zod schemas, checked in CI.

### 2.4 Error Handling
- Domain/service code throws typed `AppError` subclasses: `ValidationError (422)`, `NotFoundError (404)`, `ConflictError (409)`, `ForbiddenError (403)`, `UnauthorizedError (401)`, `BusinessRuleError (422)`.
- Responses use **RFC 7807 Problem Details**: `{ type, title, status, detail, code, requestId, errors? }`. Stack traces and SQL are never returned.
- Unexpected errors: logged with request ID + reported to error tracker; user sees a generic message with the request ID.
- UI: error boundaries per route segment; mutation errors surface inline next to the field when `errors[]` is present.

### 2.5 Database Rules
- Schema changes only via Prisma migrations (forward-only in production; each migration reviewed).
- Multi-table writes run inside `prisma.$transaction`.
- Constraints (`CHECK`, `UNIQUE`, FK) are the last line of defence; application validation is the first.
- Seed data (Z table, roles) is applied by versioned seed scripts, never manual SQL.

### 2.6 Directory & Module Rules
- Feature-first inside `src/features/{customers,assets,lab,calibration,certificates}`; shared code in `src/lib`, `src/components/ui`.
- A feature may not import from another feature's internals; use its `index.ts` public surface.
- No circular dependencies (enforced by lint).

---

## 3. Testing Rules
- **Test pyramid:** unit (domain, services) ≫ integration (repositories with isolated PostgreSQL via Testcontainers) > E2E (Playwright critical flows). Do not point automated tests at the shared Supabase MVP database.
- Domain coverage ≥ **95% branch**; services ≥ 85%; overall ≥ 80%. CI fails below.
- Bugs get a failing test first.
- Golden-dataset tests for calculations use hand-verified values from VFL's existing spreadsheets.
- Tests are deterministic: freeze time, seed data explicitly, no network calls.

---

## 4. Limits & Guardrails

### 4.1 Performance & Size Budgets (CI-enforced)
| Metric | Limit |
|---|---|
| Initial JS per route (gzip) | ≤ **170 KB** |
| Total JS for the largest route | ≤ **300 KB** gzip |
| Any single dependency added | ≤ **50 KB** gzip on the client (server-only deps exempt) |
| LCP / CLS / INP | ≤ 2.5 s / ≤ 0.1 / ≤ 200 ms |
| API p95 | Read ≤ 300 ms, write ≤ 500 ms |
| PDF generation p95 | ≤ 5 s; PDF file ≤ 1 MB |
| DB query | No N+1 (checked in integration tests); any query > 100 ms needs an index review |
| Request body | ≤ 1 MB (JSON endpoints) |

### 4.2 Security Boundaries
- Secrets only via environment/secret manager; `.env*` in `.gitignore`; secret scanning in CI (gitleaks).
- Env vars validated at boot by a Zod schema; the app refuses to start if invalid.
- Strict CSP, `X-Content-Type-Options`, `Referrer-Policy`, HSTS in production.
- Authorization is checked in the **service layer** (not only middleware).
- Exec-only fields filtered in the repository/DTO mapper layer.
- Audit log table is append-only (DB grants).
- `npm audit` (high/critical) and Dependabot/Renovate must be clean to merge.

### 4.3 Dependency Policy
- Prefer platform/stdlib features first. New runtime dependency requires: purpose, size, maintenance status (release < 12 months), license (MIT/Apache-2.0/BSD/ISC only), and an ADR entry.
- Lockfile (`package-lock.json`) committed; installs use `npm ci`; versions pinned (no `^` for runtime deps).
- **Banned:** moment.js, lodash (full), jQuery, any UI kit besides the chosen one, CSS-in-JS runtimes, GraphQL clients, `request`, unmaintained packages, GPL/AGPL-licensed packages.

### 4.4 Process Gates
- Trunk-based with short-lived branches; PRs ≤ 400 changed lines where feasible.
- Required for merge: green CI (type-check, lint, unit, integration, build, bundle budget, a11y check), one review, no unresolved comments.
- Definition of Done: code + tests + docs/ADR (if architecture touched) + Spec requirement ID traced in the PR description.
- Releases are tagged semantically; every production deploy is reversible within 15 minutes.
