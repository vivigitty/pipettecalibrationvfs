# Spec.md — Pipette Calibration Platform (v1.0)

**Status:** Draft for client sign-off · **Source:** `VFL_Sciences.docx`
Requirement IDs (`FR-`, `NFR-`, `MN-`) are referenced by tasks in `Build_and_Test.md`.

---

## 1. Purpose

An enterprise web application that lets VFL Sciences engineers register customer pipettes, record lab conditions, log gravimetric calibration readings, automatically derive Pass/Fail, and issue a PDF calibration certificate for passed assets.

## 2. Users & Roles

| Role | Capabilities |
|---|---|
| **Technician** (service engineer) | Create customers/assets, enter lab dimensions, damages, run calibrations, generate certificates |
| **Admin** | Everything a technician can do + manage range limits, users, reference data |
| **Executive** | Read-only access to all data, including exec-only fields (device IP, entry location, engineer timings) |

---

## 3. In-Scope

### 3.1 Inventory capture (user flow)
1. **Customer entry** — one-time entry of Customer Name, Address 1/2, e-mail, Phone I/II, Contact, Department. Unique on Customer Name + Department. (FR-01)
2. **Range/Channel/Make/Model lookup** — search for an existing combination; if not found, create it. Derived fields *Number of Times to Test* and *Number of Repeats* are computed automatically. (FR-02, FR-03)
3. **Limits for a new range** — when a new combination is created, the user must capture an Inaccuracy Limit and an Imprecision Limit **for each test volume** (10 %, 50 %, 100 % of the maximum range, e.g. 2, 10, 20 µL for a 2-20 µL pipette) before any calibration. The UI can copy limits from another configuration with the same range. (FR-04)
4. **Asset registration** — choose Customer+Department, choose Range+Channel+Make+Model, enter Serial No., Inventory Number, optional Customer ID No, Invoice Number. An asset is one pipette in one calibration job, so the same serial number may return in later years. Progress is set to *Not Started*. Supports adding multiple pipettes in one sitting (batch grid). (FR-05)

### 3.2 Lab dimensions
5. Capture Process Date (default today), Mode of Service (default Onsite), select the Balance, Air thermometer and Water thermometer from the instrument register (model, serial no., calibration-due date), Calibrated By (auto = logged-in user), DD water temperature (°C), room temperature (°C), humidity (%), air pressure (**hPa**). (FR-06, FR-24)
6. **Z correction** is auto-derived from water temperature + air pressure using the ISO 8655 table (interpolated, rounded to 4 decimals), shown read-only with the table version. (FR-07)

### 3.3 Part damages (optional)
7. Per asset, record Observation Notes, Damaged Part Name, Part Replaced (yes/no), Replaced Part S.No, Part Cost. (FR-08)

### 3.4 Calibration
8. Pick an asset (read from the database) that is *Not Started* or needs re-calibration, press **Start**: status → *In-Progress*, `session_no` defaults to 1, `start_time` recorded. (FR-09)
9. Enter Process Date (default today), **Next Calibration Due (months)**. System derives **Due Date** (process date + N months − 1 day, e.g. 1-Oct-26 + 12 → 30-Sep-27) and **Reminder Date** (Due − 30 days). (FR-10)
10. Checkbox **"One dispensing per channel"** (default **No**). (FR-11)
11. System generates lots and nominal volumes: 10% / 50% / 100% of the upper range value (variable-volume) or the single fixed volume. Lot count follows the lot rule in FR-12. (FR-12)
12. Technician enters **10 mass readings (g) per lot**; system computes volume in µL = `g × Z × 1000` for every reading. (FR-13)
13. System computes mean, SD, **Inaccuracy** and **Imprecision** for each lot. (FR-14)
14. System derives **Final Status** (FR-15): Inaccuracy within limit → Pass else Fail; Imprecision within limit → Pass else Fail; both Pass → Pass else Fail.
15. Executive-only metadata captured silently: device IP and entry location. (FR-16)

### 3.5 Certificate
16. When Final Status = Pass, a **Generate PDF** button is enabled; the PDF follows the existing VFL template (see FR-25). **One** certificate is stored per asset in `asset_certifications`. (FR-17, FR-18, FR-25)

### 3.6 Platform
17. Authentication (SSO/OIDC), role-based access, audit log. (FR-19, FR-20)
18. Searchable asset list with progress filters. (FR-21)

---

## 4. Out-of-Scope (v1)

- **Reporting & dashboards** (monthly calibrated counts, due-by-month, engineer time-taken Exec report) — "For Later" in the source. *The data model is built to support them* (indexes on dates, timestamps captured), but no UI/report is delivered.
- Direct balance/thermometer hardware integration (readings are typed manually).
- Customer portal / customer self-service login.
- E-mail/SMS delivery of reminders or certificates.
- Multi-tenant (multiple calibrating companies) support.
- Native mobile apps (the UI is responsive but web-only).
- Invoicing/billing; the Invoice Number is only a reference string.
- Digital signatures and QR verification on certificates.
- Offline mode.
- Bulk import from Excel (candidate for v1.1).
- Support for non-gravimetric calibration methods.
- Localization beyond English.

---

## 5. Must-Dos

### 5.1 Functional Requirements

| ID | Requirement |
|---|---|
| FR-01 | `customers` unique on (name, department), case-insensitive; duplicate attempt returns a clear conflict error |
| FR-02 | `times_to_test` = 3 if range contains `-`; = 1 if not. Unparseable ranges are rejected (no `-99` stored) |
| FR-03 | `repeats` = 1 if `times_to_test = 1` OR channel = single; 8 if eight; 12 if twelve |
| FR-04 | Limits are stored per test volume in `range_threshold_limits`. A configuration is *ready* only when it has exactly `times_to_test` limit rows matching the planned nominal volumes; calibration cannot start otherwise and the UI directs the user to capture limits |
| FR-05 | Asset creation sets `progress = not_started`; `inventory_number` is typed by the engineer and globally unique; the same serial number may appear in several assets (yearly re-calibration) |
| FR-06 | Lab dimension form defaults: date = today, mode = Onsite, calibrated by = current user; air pressure entered and stored in hPa |
| FR-07 | Z = bilinear interpolation of (water temperature, air pressure ÷ 10 → kPa) in `z_factor_references`, **rounded to 4 dp** and stored; inputs outside 15–30 °C or 80–105 kPa are blocked. Sample check: 29.4 °C, 1008.8 hPa → 1.0052 |
| FR-08 | If `part_replaced = true`, replaced part S.No and part cost are mandatory |
| FR-09 | Start action sets session `in_progress`, `session_no = 1` (or next), asset progress `in_progress`, `start_time = now()`; one active session per asset |
| FR-10 | `due_date = process_date + N calendar months − 1 day`; `reminder_date = due_date − 30 days` |
| FR-11 | "One dispensing per channel" defaults to **No** |
| FR-12 | Nominal volumes: 10%, 50%, 100% of the number after `-` (fixed: the range value). Lots = `times_to_test` when No; `times_to_test × channel_count` when Yes |
| FR-13 | Exactly 10 readings per lot; `volume_ul = mass_g × Z × 1000` computed server-side and stored |
| FR-14 | **Per volume** (all lots at that volume pooled): mean, sample SD, inaccuracy % = (mean − nominal)/nominal × 100, imprecision % = STDEV × 100 / AVERAGE. Stored on `calibration_volume_results` with a **snapshot** of the limits applied. Per-lot figures are informational only |
| FR-15 | Final Status computed server-side only. A volume passes when inaccuracy and imprecision are within limits (inclusive); the session passes only if **every volume** passes. A failed session cannot produce a certificate |
| FR-16 | Device IP and entry location captured server-side and visible only to Executive role |
| FR-17 | "Generate PDF" enabled only if `final_status = pass`, all readings present, limits present |
| FR-18 | PDF stored in object storage; **at most one active** `asset_certifications` row per asset (SHA-256, template version, linked passing session). Re-download serves the stored file; an admin may *void* (reason, audit) and reissue |
| FR-19 | All write endpoints require authentication and role authorization |
| FR-20 | All inserts/updates to business tables are audit-logged with actor and request ID |
| FR-21 | Asset list: filter by customer, progress, due date; text search by serial/inventory/invoice |
| FR-22 | A session that ends in Fail can be followed by a new session (`session_no + 1`) for the same asset |
| FR-23 | Completed sessions are immutable; corrections require an admin-initiated new session with audit trail |
| FR-24 | Balance and thermometers come from an instrument register; an instrument past its calibration-due date cannot be selected |
| FR-25 | The certificate reproduces the sample PDF **exactly** (layout, fonts, positions, borders, logo, footer) using the field map and display formats in `Database_Design.md` §7. Per-channel mode uses the same table with continuous Sl.No. (80 or 120 rows) over continuation pages |
| FR-26 | **No manual text on the certificate except the signature.** Fixed wording is template configuration; every variable value is derived from the database; *Nil* is printed for an empty Cust ID, damaged parts and replaced parts |

### 5.2 Non-Functional Requirements

**Security**
- NFR-S1: OIDC SSO (e.g. Microsoft Entra ID); no local passwords in v1.
- NFR-S2: RBAC enforced on the server for every endpoint and server action (UI hiding is not security).
- NFR-S3: All inputs validated with a shared schema (Zod) on client and server.
- NFR-S4: OWASP ASVS Level 2 as the baseline; CSRF protection, secure/HttpOnly/SameSite cookies, CSP headers.
- NFR-S5: TLS 1.2+ in transit; encryption at rest for database and object storage.
- NFR-S6: Secrets only from environment/secret manager.
- NFR-S7: Exec-only fields stripped server-side from API responses for non-exec roles.
- NFR-S8: Rate limiting on auth and write endpoints.

**Performance**
- NFR-P1: p95 API latency ≤ 300 ms for reads, ≤ 500 ms for writes (excluding PDF).
- NFR-P2: PDF generation ≤ 5 s p95.
- NFR-P3: Largest Contentful Paint ≤ 2.5 s on a mid-range laptop over broadband.
- NFR-P4: Asset list supports 100,000 assets with server-side pagination.

**Accessibility & UX**
- NFR-A1: WCAG 2.2 AA.
- NFR-A2: Full keyboard operation of the reading-entry grid (Tab/Enter advance, paste of 10 values).
- NFR-A3: Unsaved reading data is protected (autosave per lot; warn on navigation).
- NFR-A4: Pass/Fail never conveyed by colour alone (icon + text).

**Reliability & Data Integrity**
- NFR-R1: All multi-row writes inside DB transactions.
- NFR-R2: Daily backups, 30-day retention, tested restore; RPO ≤ 24 h, RTO ≤ 4 h.
- NFR-R3: Calculation module covered by ≥ 95% unit-test branch coverage and golden-dataset tests.
- NFR-R4: Calculations use arbitrary-precision decimals; rounding only at display and certificate output.

**Maintainability / Observability**
- NFR-M1: Structured JSON logs with request ID; health endpoint; error tracking.
- NFR-M2: Database migrations are versioned and reversible.

---

## 6. Must-Not-Dos (Constraints)

| ID | Constraint |
|---|---|
| MN-01 | **No client-side authority for derived values.** Z, volumes, limits comparison, due dates, and final status are computed on the server; client may preview only. |
| MN-02 | **No floating-point math** (`number`) for mass/volume/statistics — use `decimal.js` / `NUMERIC`. |
| MN-03 | **No magic sentinels** (`-99`) persisted to the database. |
| MN-04 | **No hard deletes** of customers, assets, sessions, readings, or certificates. |
| MN-05 | **No editing of completed/passed sessions** or stored certificates. |
| MN-06 | **No raw SQL string concatenation**; only parameterized queries / ORM. |
| MN-07 | **No secrets, IPs, or personal data in logs or client bundles.** |
| MN-08 | **No `any` types,** `@ts-ignore`, or disabled lint rules without a linked justification. |
| MN-09 | **No business logic in UI components or route handlers**; it lives in the domain/service layer. |
| MN-10 | **No localStorage for sensitive data or auth tokens.** |
| MN-11 | **No new runtime dependency** without the dependency policy review (see `Constitution.md`). |
| MN-12 | **No exposure of device IP / location / engineer timings** to non-exec roles via any API, export, or PDF. |
| MN-13 | **No certificate generation for failed or incomplete sessions** — enforced server-side, not just by a disabled button. |
| MN-14 | **No unbounded queries;** all list endpoints paginate. |
| MN-15 | **No GraphQL/second API style** in v1 — REST-style only. |

---

## 7. Acceptance of this Spec
The spec is accepted when VFL resolves the open items in `Database_Design.md` §8 (notably A4–A6, A13–A16, A18) and supplies certificate samples for multi-channel, per-channel and fixed-volume pipettes and for a Fail result. The ISO Z table and the single-channel sample certificate have been received.
