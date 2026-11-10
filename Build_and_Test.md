# Build_and_Test.md — Atomic Build Tasks & Validation Strategy

**Rules for every task**
1. A task is *done* only when its **Success Criterion** is true (binary: pass/fail, no judgement).
2. Each task ends with `npm run verify` (type-check + lint + unit tests) green and a commit.
3. Do not start Task *N+1* until Task *N* is done. Tasks with a ⛔ need an external input first.
4. Spec IDs in brackets show what each task covers.

---

## Phase 0 — Foundation

### Task 1 — Scaffold the project
Create Next.js 15 + TypeScript project, `tsconfig` with all strict flags from `Constitution.md` §1.1, folder skeleton from `Plan.md` §3.
**Success:** `npm run build` exits 0 **and** `npx tsc --noEmit` exits 0 **and** `tsconfig.json` contains `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` = true.

### Task 2 — Lint, format, hooks
Add ESLint (strict-type-checked + a11y + security + import-cycle rules), Prettier, Husky, lint-staged, commitlint.
**Success:** Committing a file containing `const x: any = 1` is **rejected** by the pre-commit hook; committing a clean file with message `feat: x` succeeds; message `bad message` is rejected.

### Task 3 — Hosted database and env validation
Supabase-managed PostgreSQL for MVP, Prisma runtime and migration URLs (`DATABASE_URL`, `DIRECT_URL`), optional `docker-compose.yml` PostgreSQL 16/MinIO for isolated tests, `src/lib/env.ts` Zod-validated env, `.env.example`.
**Success:** the app connects to the configured Supabase project; Prisma migrations succeed using `DIRECT_URL` while application queries use `DATABASE_URL`; starting live mode with `DATABASE_URL` removed exits non-zero with a message naming `DATABASE_URL`. Integration tests use an isolated PostgreSQL container, never the shared Supabase project.

### Task 4 — CI pipeline and budgets
GitHub Actions: install (`npm ci`), type-check, lint, unit tests, build, bundle-size check (≤170 KB gzip initial JS/route), gitleaks, `npm audit --audit-level=high`.
**Success:** A PR with a deliberate type error fails CI; a clean PR passes CI; adding a 200 KB client import in a test branch fails the bundle check.

---

## Phase 1 — Database

### Task 5 — Base schema and migration
Prisma schema for all tables/enums in `Database_Design.md` §2–4 with `@map` to snake_case names.
**Success:** `prisma migrate dev` applies cleanly to an empty DB; `\dt` lists exactly the 14 tables (`users, customers, range_thresholds, range_threshold_limits, instruments, assets, z_factor_references, lab_dimensions, asset_damages, calibration_sessions, calibration_lots, calibration_readings, asset_certifications, audit_logs`); every table has `id`, `created_at`, `updated_at`.
### Task 6 — Constraint migration (CHECKs, composite FKs, partial indexes, triggers)
Raw-SQL migration: case-insensitive customer unique; `times_to_test IN (1,3)`; `repeats IN (1,8,12)`; reading_no 1–10; limit uniques; **composite FKs** (session→asset/customer/range, lot→session/asset, lot→limit row + nominal, reading→lot/session/asset, certificate→session/asset/customer); one `in_progress` session per asset; pass-status consistency; `UNIQUE (asset_id) WHERE voided_at IS NULL` on certificates; certificate-requires-passing-session trigger; `updated_at` trigger; audit_logs insert-only grant.
**Success (integration tests, Testcontainers):** each insert **fails** with the expected constraint: duplicate customer differing only by case; `times_to_test = 2`; `reading_no = 11`; second `in_progress` session for the same asset; `final_status='pass'` with `inaccuracy_status='fail'`; `UPDATE audit_logs` by the app role; a reading whose `asset_id` differs from its lot's; a lot whose `nominal_volume_ul` differs from its limit row; two assets with the same `inventory_number`; a second active certificate for one asset; a certificate for a failed session. And these **succeed**: two assets with the same customer + serial number; a new certificate after the first is voided.
### Task 7 — Seed data
Seed script for roles/admin user and the Z loader for `seed/z_factors_iso8655.csv` (ISO 8655 Table A.1: 31 temperatures 15.0–30.0 °C × 7 pressures 80, 85, 90, 95, 100, 101.3, 105 kPa). Rows carry `source_version = '…-UNVERIFIED'` until a VFL reviewer spot-checks them against the ISO original and flips the flag.
**Success:** `npm run db:seed` twice leaves `z_factor_references` at exactly **217** rows (idempotent); a data test proves Z is non-decreasing in both temperature and pressure; the app refuses to boot with `NODE_ENV=production` while any `UNVERIFIED` source version exists.
---

## Phase 2 — Domain Core (pure functions, no I/O)

> ⛔ **Workshop gate:** confirm assumptions A6, A13 and A16 (`Database_Design.md` §8) with VFL before Tasks 9, 12, 13 and 10.

### Task 8 — Range parsing and derived test counts [FR-02, FR-03]
`parseRange`, `deriveTimesToTest`, `deriveRepeats`.
**Success (table-driven unit test passes):**
| Input | Output |
|---|---|
| `"10-100"`, single | times 3, repeats 1 |
| `"10-100"`, eight | 3, 8 |
| `"10-100"`, twelve | 3, 12 |
| `"50"`, eight | 1, 1 |
| `"100-1000"`, twelve | 3, 12 |
| `"abc"`, `"10-"`, `""`, `"10-5"` | throws `ValidationError` (no `-99` returned anywhere) |

### Task 9 — Lot planning [FR-11, FR-12]
`planLots(range, channel, onePerChannel)`.
**Success (unit tests):** `"10-100"`, eight, No → 3 lots with nominal volumes **10, 50, 100**; `"100-1000"` single, No → **100, 500, 1000**; `"10-100"`, eight, Yes → **24** lots (3 volumes × 8 channels, `channel_no` 1–8); `"50"`, single → 1 lot at 50; `"10-100"`, twelve, Yes → 36 lots; lot numbers are consecutive starting at 1.

### Task 10 — Z-factor lookup [FR-07]
Bilinear interpolation over (temperature °C, pressure kPa), accepting hPa input (÷ 10), result **rounded to 4 dp**; throws if outside the table.
**Success:** exact grid points return exact table values (e.g. 20.0 °C / 100 kPa → **1.0028**; 15.0 °C / 80 kPa → **1.0017**; 30.0 °C / 105 kPa → **1.0054**); **29.4 °C at 1008.8 hPa → 1.0052** (unrounded 1.00518, matching the sample certificate); a synthetic 2×2 grid midpoint returns the corner average; 14.9 °C, 30.1 °C, 79 kPa or 106 kPa throws `BusinessRuleError` `Z_OUT_OF_RANGE`.
### Task 11 — Volume and statistics [FR-13, FR-14]
`toVolumeUl(massG, z) = g × z × 1000`, `mean`, `sampleSd`, `inaccuracyPct`, `imprecisionPct = STDEV × 100 / AVERAGE` using `Decimal`.
**Success — golden dataset from the sample certificate (Z = 1.0052), all six must match to the printed 4 dp:**
| Nominal | 10 masses (g) | Inaccuracy % | Imprecision % |
|---|---|---|---|
| 2 µL | 0.0020 ×10 | **0.5200** | **0.0000** |
| 10 µL | 0.0100 ×7, 0.0099 ×3 (positions 2, 6, 9) | **0.2184** | **0.4845** |
| 20 µL | 0.0200 ×7, 0.0199 ×3 (positions 3, 6, 10) | **0.3692** | **0.2419** |

Plus: `toVolumeUl(0.0020, 1.0052)` = 2.0104 (prints 2.01); mean actual volumes = **2.0104, 10.021844, 20.073844**; volumes `[98,99,99,100,100,100,100,101,101,102]` → mean 100, SD 1.154701; ten readings of `0.1` sum to exactly `1` (no float use).
### Task 12 — Status derivation [FR-15] ⛔ needs A6 ("every lot") confirmed
`lotStatus`, `sessionStatus` (compare against the lot's **snapshotted** limits).
**Success (unit tests):** limit 1.0 %: inaccuracy +1.0 → pass (inclusive); +1.0001 → fail; −1.5 → fail (absolute value). Imprecision exactly equal to limit → pass. Inaccuracy pass + imprecision fail → lot **fail**. Session with 3 passing lots and 1 failing lot → **fail**; all lots pass → **pass**; any lot without 10 readings → `pending`.

### Task 13 — Date rules [FR-10] ⛔ needs A13 confirmed
`dueDate = addMonths(process, N) − 1 day`, `reminderDate = due − 30 days`.
**Success:** process `2026-10-01` + 12 months → due **2027-09-30** (the sample certificate), reminder **2027-08-31**; process `2026-11-06` + 12 → due **2027-11-05**, reminder **2027-10-06**; process `2026-01-31` + 1 → due **2026-02-27**, reminder **2026-01-28**; months `0` or `61` throws `ValidationError`.
---

## Phase 3 — Cross-cutting Infrastructure

### Task 14 — Errors, logging, request context
`AppError` hierarchy, RFC 7807 mapper, pino logger with request ID.
**Success:** A route that throws `ConflictError` returns HTTP 409 with JSON containing `type, title, status, detail, code, requestId`; a route throwing a plain `Error` returns 500 with **no stack trace** in the body; every log line in a test run contains `requestId`.

### Task 15 — Authentication and RBAC [FR-19, NFR-S1, S2]
Supabase Auth email/password signup and verification with Auth.js app sessions, active app-user allowlist linked by Supabase Auth UUID, authorization helper, middleware. Test invalid passwords, unconfirmed accounts, inactive request creation only after verified sign-in, no self-assigned privileges, admin approval/role assignment, suspended users remaining blocked, and successful approved sign-in. Enable signup with email confirmation and configure custom SMTP for arbitrary email recipients. No signup grants access automatically.
**Success:** Unauthenticated `GET /api/v1/customers` → 401; `executive` calling `POST /api/v1/customers` → 403; `technician` → 201 (valid body); session cookie has `HttpOnly`, `Secure`, `SameSite=Lax`.

### Task 16 — Audit service [FR-20]
`auditService.record()` called inside the same transaction as writes.
**Success:** Creating a customer yields exactly 1 `audit_logs` row with correct actor, action `create`, entity type/id and `after_data`; if the business write rolls back, **0** audit rows exist.

---

## Phase 4 — Vertical Slices (repository → service → API → UI → tests)

### Task 17 — Customers [FR-01]
Create/list/search customers; form with all 8 fields.
**Success:** Creating "Acme Labs / QC" succeeds (201); creating "ACME LABS / qc" returns **409** with code `CUSTOMER_DUPLICATE`; creating "Acme Labs / R&D" succeeds; invalid e-mail returns 422 with a field-level error on `email`; component test shows labels bound to inputs (a11y).

### Task 18 — Range thresholds and per-volume limits [FR-02–04]
Search-or-create Range+Channel+Make+Model; derived fields read-only; **limits grid** with one row per planned test volume; "copy limits from another configuration with the same range".
**Success:** creating `2-20` / single / Gilson / Pipetmann P20 pre-fills three limit rows with nominal volumes **2, 10, 20**; saving limits 10.0/5.0, 2.0/1.0, 1.0/0.5 (inaccuracy/imprecision %) stores 3 `range_threshold_limits` rows and the configuration becomes *ready*; a configuration with 2 of 3 rows shows "Limits incomplete" and `v_range_threshold_readiness` reports 2 of 3; a nominal volume that is not 10/50/100 % of the range → 422; `0` or negative limit → 422; the API refuses to modify `times_to_test` / `repeats`; a fixed-volume `50` configuration requires exactly **1** limit row; "copy limits" from another make with the same range reproduces the 3 rows.
### Task 19 — Assets and batch registration [FR-05]
Choose customer+dept, choose configuration, enter serial/inventory/optional Cust ID/invoice per row.
**Success:** Submitting 5 valid rows creates 5 assets, each `progress = not_started`, in **one transaction** (inject a failure on row 5 → 0 rows saved); a duplicate `inventory_number` → 409; an empty or > 100-character inventory number → 422 (it is always typed, never generated); the **same serial number for the same customer in a second job → 201** (yearly re-calibration); Cust ID left blank is stored as NULL and printed as *Nil*.
### Task 20 — Lab dimensions, instruments and Z [FR-06, FR-07, FR-24]
Instrument register (balance, air thermometer, water thermometer with cal-due dates); lab dimensions form with defaults; server resolves and snapshots Z.
**Success:** New form shows today's date, "Onsite" and the current user's name; entering water 29.4 °C and pressure **1008.8 hPa** stores `z_correction_value = 1.0052`; an instrument with `calibration_due_date` before the process date cannot be selected (422 `INSTRUMENT_EXPIRED`); a thermometer chosen in the balance slot → 422; recalibrating an instrument adds a new row and leaves old lab dimensions pointing at the old due date; temperature 40 → 422; pressure outside 800–1050 hPa → 422; the client cannot supply `z_correction_value`.
### Task 21 — Part damages [FR-08]
Optional damage form on the asset page.
**Success:** `part_replaced = false` saves with no serial/cost; `part_replaced = true` without serial number **or** without cost → 422; negative cost → 422; asset with no damages shows the "No damage recorded" state and the flow continues unaffected.

### Task 22 — Start calibration session [FR-09, FR-10, FR-11, FR-16 (capture), FR-22]
Start action, session settings form, lot plan generation.
**Success:** Starting an asset whose configuration is not *ready* → 422 `LIMITS_REQUIRED`; a valid start sets session `in_progress`, `session_no = 1`, `start_time` ≈ now, asset `progress = in_progress`, copies `customer_id` / `range_threshold_id` onto the session, and inserts the planned lots (count per Task 9 table), each with its `range_threshold_limit_id` and **snapshotted limit values**; the "one dispensing per channel" checkbox is **unchecked** by default; entering 12 months shows due/reminder equal to Task 13 results; a second Start on the same asset → 409; after a failed session, a new session gets `session_no = 2`.
### Task 23 — Reading entry and lot results [FR-13, FR-14]
Reading grid (10 inputs per lot), server-side volume + statistics, autosave per lot.
**Success:** Entering the **sample certificate's 3 lots** (Task 11 table, Z 1.0052) returns inaccuracy **0.5200 / 0.2184 / 0.3692** and imprecision **0.0000 / 0.4845 / 0.2419** at 4 dp and result `pass` for each; saving 9 or 11 values → 422; mass ≤ 0 or non-numeric → 422; re-saving a lot replaces (not duplicates) readings (always exactly 10 rows per lot); every saved reading row carries the correct `asset_id` and `calibration_session_id`; `v_lot_results` live recomputation equals the stored values; pasting a column of 10 values fills the grid (component test).
### Task 24 — Final status and completion [FR-15, FR-23]
Complete action, final status panel, immutability.
**Success:** Completing with an incomplete lot → 422; with all lots passing → `final_status = pass`, session `completed`, asset `progress = completed`, `end_time` set; with one failing lot → `fail`; `PATCH` of any lot/reading of a completed session → 409; the DB check from Task 6 prevents `pass` with a failing component.

### Task 25 — Executive-only metadata [FR-16, MN-12, NFR-S7]
Capture IP/location server-side; DTO masking; exec panel.
**Success:** API response for a `technician` contains **no** `deviceIp` / `entryLocation` keys (asserted by JSON key scan); for `executive` both are present; a spoofed `x-forwarded-for` from an untrusted client is ignored; the keys never appear in application logs (log-scan test) or the PDF.

### Task 26 — Certificate template rendering [FR-17, FR-25] (mockups approved, A18)
`CertificateDocument` reproducing the VFL template; confirm `@react-pdf/renderer` vs. HTML→PDF fallback.
**Success:** Rendering the golden fixture (the NUCSER / Gilson Pipetmann P20 data) produces a one-page PDF ≤ 1 MB in ≤ 5 s whose extracted text contains: inventory no. 2026090843, S.No LK20869, `2-20`, all 30 masses (4 dp) and volumes (2 dp), the six inaccuracy/imprecision actuals and limits, Z 1.0052, 1008.8 hPa, both instruments with cal-due dates, "Pass", "Surendar R", `1-Oct-26`, `30-Sep-27`; "Nil" appears for damaged and replaced parts; an 8-channel per-channel session renders page 1 (24-lot result matrix) and a page 2 raw-readings annexure; a Fail session renders no certificate; **visual-regression** against VFL's approved sample is within the agreed tolerance and signed off by VFL.
### Task 27 — Certificate gate, storage, one-per-asset [FR-17, FR-18, MN-13]
`POST /sessions/{id}/certificates`, object storage, `asset_certifications`.
**Success:** Calling it for a `fail` or `in_progress` session → 422 even if called directly via API; a `pass` session → 201, the object exists in storage as `{inventory_number}_{range}ul.pdf`, SHA-256 equals the stored file's hash, and `asset_id`, `customer_id`, `calibration_session_id` are set; a second call for the same asset → **409** `CERTIFICATE_EXISTS` (the stored copy is served instead); an admin void (with reason) then reissue succeeds and leaves exactly **1** active row plus 1 voided row; `executive` and `technician` cannot void (403); the voided file remains retrievable by admin.
---

## Phase 5 — Completion & Hardening

### Task 28 — Asset list, filters, search [FR-21, NFR-P4]
Server-side pagination; filters (customer, progress, due date); text search.
**Success:** With 100,000 seeded assets the list endpoint responds p95 ≤ 300 ms (k6/autocannon run in CI nightly); `pageSize=101` → 422; filter by `progress=in_progress` returns only those; the query plan (`EXPLAIN`) uses an index for each filter.

### Task 29 — Accessibility and keyboard operation [NFR-A1–A4]
Audit forms and the reading grid.
**Success:** `axe` reports **0** serious/critical violations on every route (Playwright run); a Playwright test completes a full 10-reading lot using only the keyboard; Pass/Fail chips include text/icon (test asserts visible text "Pass"/"Fail").

### Task 30 — End-to-end flows [all FR]
Playwright suites listed in `Plan.md` §3.
**Success:** All 4 suites green in CI on Chromium and WebKit: (1) inventory flow (customer → range → asset), (2) full passing calibration → PDF download, (3) failing calibration → no PDF → session 2 → pass → PDF, (4) RBAC matrix.

### Task 31 — Security and performance hardening [NFR-S3–S8, NFR-P1–P3]
Headers, rate limits, dependency audit, load test.
**Success:** Response headers include CSP, HSTS, `X-Content-Type-Options: nosniff`; 100 rapid failed requests to a write endpoint yield HTTP 429 after the configured limit; `npm audit --audit-level=high` reports 0; OWASP ZAP baseline scan shows 0 high alerts; Lighthouse CI LCP ≤ 2.5 s on the calibration page; bundle check passes.

### Task 32 — Operations and release [NFR-R2, NFR-M1–M2]
Dockerfile, deploy pipeline, backups, rollback.
**Success:** Docker image builds and `/api/v1/health` returns 200 with DB + storage checks; a backup is restored into an empty database in a drill and a row-count comparison matches; redeploying the previous image tag restores service within 15 minutes (timed); migrations apply from an empty DB **and** from the previous release's schema.

---

## Integration & Validation

### How the tasks combine
```
Tasks 1–4   → quality gates & tooling (nothing ships without them)
Tasks 5–7   → data layer that rejects bad data on its own
Tasks 8–13  → pure, proven calculation engine (the "business logic")
Tasks 14–16 → errors, auth, audit used by every slice
Tasks 17–21 → inventory & lab data capture   ─┐
Tasks 22–24 → calibration → final status      ├→ Task 27 certificate → end-to-end flow
Tasks 25–27 → exec metadata & certificates   ─┘
Tasks 28–32 → scale, accessibility, security, operability
```
The engine (8–13) is consumed by the services in 22–24; the UI preview and the server use the **same functions**, so a preview can't disagree with stored results.

### Test layers
| Layer | Tooling | Scope | Gate |
|---|---|---|---|
| Unit | Vitest | `domain/`, services with mocked repos | ≥95% branch in `domain/`, ≥85% services |
| Integration | Vitest + Testcontainers | repositories, constraints, transactions, audit | All constraint tests from Task 6 pass |
| Component | Testing Library + jest-axe | forms, reading grid | 0 a11y violations |
| E2E | Playwright | Critical flows (Task 30) | Green on Chromium + WebKit |
| Non-functional | k6, Lighthouse CI, ZAP | perf, security | Budgets in `Constitution.md` §4 |

### Spec traceability matrix (every requirement must have at least one passing test)

| Requirement | Covered by |
|---|---|
| FR-01 | T17 |
| FR-02, FR-03 | T8, T18 |
| FR-04 | T6, T18, T22 |
| FR-05 | T19 |
| FR-06, FR-07, FR-24 | T7, T10, T20 |
| FR-08 | T21 |
| FR-09 | T22 |
| FR-10 | T13, T22 |
| FR-11, FR-12 | T9, T22 |
| FR-13, FR-14 | T11, T23 (sample-certificate golden data) |
| FR-15 | T12, T24 |
| FR-16 | T22, T25 |
| FR-17, FR-18, FR-25 | T26, T27 |
| FR-19, FR-20 | T15, T16 |
| FR-21 | T28 |
| FR-22 | T22, T30 |
| FR-23 | T24 |
| NFR-S1–S8 | T15, T25, T31 |
| NFR-P1–P4 | T28, T31 |
| NFR-A1–A4 | T29 |
| NFR-R1–R4 | T6, T11, T19, T32 |
| MN-01–MN-15 | Lint rules (T2), T6, T11, T15, T20, T24, T25, T27, T28 |

CI includes a script that fails if any `FR-`/`NFR-` ID in `Spec.md` is not referenced by at least one test name or this matrix.

### Final acceptance (UAT) before go-live
1. **Parallel run:** re-enter the sample certificate end-to-end (must reproduce every printed value), then calibrate 10 real pipettes (mix of single/eight/twelve, fixed/variable) in the app and in VFL's current process; all derived numbers (Z, volumes, inaccuracy, imprecision, status) agree to **6 decimal places**.
2. **Certificate sign-off:** VFL quality owner approves one certificate per pipette type against the existing template.
3. **Negative tests witnessed:** attempt certificate generation on a failed asset, edit a completed session, and view exec fields as a technician — all must be blocked.
4. **Spec review:** every FR/NFR/MN row in the traceability matrix is ticked with a link to its passing test run.
5. **Operational readiness:** restore drill and rollback drill (Task 32) recorded.

Release is approved only when all five items are signed off and all 32 tasks meet their Success Criteria.
