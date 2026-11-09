# Deliverable 1 — Database Design & Business Glossary (v1.2)

**System:** VFL Sciences Pipette Calibration Platform · **Database:** PostgreSQL (Supabase-managed for MVP; PostgreSQL 16 for local tests)
**Sources:** `VFL_Sciences.docx`, sample certificate `2026090843_2-20ul.pdf`, ISO 8655 Table A.1 (Z factors).

---

## 0. Change Log (v1.0 → v1.1)

| # | Change | Why |
|---|---|---|
| C1 | **Limits moved to a child table `range_threshold_limits`** (one row per test volume). Limit columns removed from `range_thresholds`. | ISO limits differ per test volume. Sample: 2 µL ±10.0 % / 5.0 %, 10 µL ±2.0 % / 1.0 %, 20 µL ±1.0 % / 0.5 %. |
| C2 | **Readings stay in long format (one row per reading)**; lots carry `nominal_volume_ul` and an FK to the limit row. See §5 for the reasoning. | Best practice for aggregation, constraints and flexibility. |
| C3 | **Traceability FKs added** with composite FKs, plus views (§6). | Asset → customer → readings → lab dimensions → results → certificate in one join. |
| C4 | **One certificate per asset** (`UNIQUE (asset_id) WHERE voided_at IS NULL`); `version` and `certificate_number` removed. | Per your point 4; sample shows **Inventory No.** as the document identifier. |
| C5 | **Formulas confirmed and verified** against the sample: inaccuracy = (mean − nominal)/nominal × 100; imprecision = STDEV(readings) × 100 / AVERAGE(readings) (sample SD). | All 6 printed results reproduce exactly (see Build_and_Test Task 11). |
| C6 | **New `instruments` table**; `lab_dimensions` references balance, air meter and water thermometer. | Certificate prints model, serial and **calibration-due date** for each. |
| C7 | `air_pressure_kpa` → **`air_pressure_hpa`**; Z stored **rounded to 4 dp**. | Certificate shows 1008.8 hPa and Z = 1.0052. |
| C8 | **`due_date` = process_date + N months − 1 day.** | Sample: 1-Oct-26 + 12 months → **30-Sep-27**. |
| C9 | **`assets` = one pipette in one calibration job.** `UNIQUE (customer_id, serial_number)` **dropped**; `inventory_number` is globally unique; `customer_asset_id` ("Cust ID No") added. | The same pipette returns yearly; the old unique key would have blocked it. |
| C10 | Z table **seeded from the ISO image** (217 values, 15–30 °C × 80–105 kPa). | Received. |
| C11 | **Pass/fail is one per volume, not per lot.** New table `calibration_volume_results`: all lots at a nominal volume are **pooled** into one mean / SD / inaccuracy / imprecision and one result. Limits and their snapshot move here from the lot. | Sample certificate has exactly one inaccuracy and one imprecision per volume, whatever the number of lots (1 single-channel, 8 or 12 per-channel). |
| C12 | **Certificate must follow the sample PDF exactly**; every variable value is derived from the database, every fixed value is template text, only the signature is manual. Field map and formats in §7. | Per VFL. |

---

## 1. Naming & Structural Conventions

| Concern | Standard |
|---|---|
| Table names | `snake_case`, **plural** |
| Primary key | `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` on every table |
| Timestamps | `created_at`, `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`, trigger-maintained) |
| Foreign keys | `{table_singular}_id`; constraint `fk_{child}_{parent}` |
| Constraint / index names | `uq_…`, `ck_…`, `ix_…` |
| Numerics | `NUMERIC` for all measurements (never float); money `NUMERIC(12,2)` |
| Deletes | No hard deletes on business data (`is_active` / `voided_at`) |
| Sentinels | `-99` is never persisted; invalid input is rejected |
| Rounding | **Only two places:** Z → 4 dp when resolved, and display/certificate output. Everything else is full precision. |

**Composite FKs for consistency.** Where a child repeats an ancestor's id (e.g. `asset_id` on a reading), a *composite* FK to the parent's `(id, asset_id)` guarantees the copy can never disagree with the parent. Parents therefore carry extra `UNIQUE (id, …)` constraints.

### Source-name → Table mapping
| Source name | Table |
|---|---|
| Customer_Dim | `customers` |
| Range_Threshold_Dim | `range_thresholds` + `range_threshold_limits` |
| Asset_Dim | `assets` |
| Lab_Dimensions | `lab_dimensions` (+ `instruments`) |
| Any Part Damages | `asset_damages` |
| Asset_Fact | `calibration_sessions`, `calibration_lots`, `calibration_readings` |
| ASSET_CERTIFICATION | `asset_certifications` |
| ISO Z table | `z_factor_references` |

## 2. Enumerations
`channel_type`: single, eight, twelve · `service_mode`: onsite, offsite · `asset_progress`: not_started, in_progress, completed · `session_status`: in_progress, completed, abandoned · `result_status`: pending, pass, fail · `user_role`: technician, admin, executive · `instrument_type`: balance, air_thermometer, water_thermometer

## 3. Entity-Relationship Overview

```
customers 1──< assets >──1 range_thresholds 1──< range_threshold_limits
              │ │                                        ▲
              │ └──< asset_damages                       │ (FK + nominal volume)
              │                                          │
              ├──< calibration_sessions >──1 lab_dimensions >── instruments (3 FKs)
              │        │ (asset_id, customer_id, range_threshold_id)
              │        └──< calibration_volume_results ──┘ (one per test volume: limits + result)
              │                  └──< calibration_lots (1, or 8/12 per volume)
              │                            └──< calibration_readings
              └──0..1 asset_certifications  (active, i.e. not voided)
z_factor_references (lookup) · users · audit_logs
```

| Relationship | Cardinality |
|---|---|
| customers → assets | One-to-Many |
| range_thresholds → range_threshold_limits | One-to-Many (1 or 3 rows, = `times_to_test`) |
| range_thresholds → assets | One-to-Many |
| assets → asset_damages | One-to-Many (optional) |
| assets → calibration_sessions | One-to-Many (retry after fail = session 2…) |
| lab_dimensions → calibration_sessions | One-to-Many |
| instruments → lab_dimensions | One-to-Many (×3 roles) |
| calibration_sessions → calibration_volume_results → calibration_lots → calibration_readings | One-to-Many ×3 (10 readings/lot; 1, 8 or 12 lots per volume) |
| range_threshold_limits → calibration_volume_results | One-to-Many |
| assets → asset_certifications | **One-to-One (active)**; voided history allowed |

---

## 4. Table Specifications
All tables also carry `id`, `created_at`, `updated_at`. **PK** primary key · **NN** not null · **UQ** unique.

### 4.1 `users`
`email citext NN UQ` · `display_name varchar(120) NN` (printed as "Serviced by") · `role user_role NN` · `external_subject varchar(255) NN UQ` · `is_active boolean NN default true`

### 4.2 `customers`
| Column | Type | Null | Notes |
|---|---|---|---|
| customer_name | varchar(200) | NN | Printed as first header line |
| department | varchar(150) | NN | Prints as "In Use at" (e.g. *GEL Room*) — confirmed |
| address_1, address_2 | varchar(250) | NN / NULL | Printed in certificate header |
| email | citext | NN | |
| phone_1 / phone_2 | varchar(30) | NN / NULL | |
| contact_name | varchar(150) | NN | |
| is_active | boolean | NN | default true |
| created_by | uuid | NN | FK → users |

`UNIQUE (lower(customer_name), lower(department))`.

### 4.3 `range_thresholds`
One row per **Range + Channel + Make + Model**. *Limits no longer live here.*

| Column | Type | Null | Notes |
|---|---|---|---|
| range_label | varchar(30) | NN | e.g. `2-20`, `10-100`, `50`; regex `^\d+(\.\d+)?(-\d+(\.\d+)?)?$` |
| range_min_ul | numeric(10,3) | NULL | NULL for fixed volume |
| range_max_ul | numeric(10,3) | NN | Value after `-` (or the fixed volume) |
| channel / channel_count | channel_type / smallint | NN | 1 / 8 / 12, CHECK consistent |
| make | varchar(100) | NN | Certificate: "Pipette Manufacturer" (Gilson) |
| model | varchar(100) | NN | Certificate: "Pipette Details" (Pipetmann P20) |
| times_to_test | smallint | NN | Derived: `-` in range → 3 else 1; CHECK IN (1,3) |
| repeats | smallint | NN | Derived: 1 / 8 / 12 rule; CHECK IN (1,8,12) |
| is_active | boolean | NN | |

`UNIQUE (range_label, channel, make, model)`.

### 4.4 `range_threshold_limits` *(new — answers your point 1)*
One row per test volume of a configuration.

| Column | Type | Null | Notes |
|---|---|---|---|
| range_threshold_id | uuid | NN | FK → range_thresholds |
| test_point_pct | smallint | NN | 10, 50 or 100 (fixed-volume pipettes: 100) |
| nominal_volume_ul | numeric(10,3) | NN | Absolute µL = pct × range_max (2-20 → 2, 10, 20) |
| inaccuracy_limit_pct | numeric(8,4) | NN | ±; CHECK > 0 |
| imprecision_limit_pct | numeric(8,4) | NN | CHECK > 0 |
| captured_by / captured_at | uuid / timestamptz | NN | |

Constraints: `UNIQUE (range_threshold_id, nominal_volume_ul)`, `UNIQUE (range_threshold_id, test_point_pct)`, **`UNIQUE (id, nominal_volume_ul)`** (target of the volume result's composite FK).
**Readiness rule:** a configuration is usable only when it has exactly `times_to_test` limit rows whose nominal volumes equal the planned test points (view `v_range_threshold_readiness`; checked again when a session starts).
**Why a child table (not a wider key):** `range_thresholds` stays one row per physical configuration, so Make/Model/Channel aren't repeated 3×, and `times_to_test` stays a single, consistent fact. UI offers **"copy limits from another configuration with the same range"** since ISO limits depend on the volume, not the make.

### 4.5 `instruments` *(new)*
| Column | Type | Null | Notes |
|---|---|---|---|
| instrument_type | instrument_type | NN | |
| make_model | varchar(150) | NN | e.g. `Sartorius BCE224-1OIN`, `Testo 622`, `Testo 108` |
| serial_number | varchar(100) | NN | |
| calibration_due_date | date | NN | Printed as "Cal due" |
| is_active | boolean | NN | |

`UNIQUE (serial_number, calibration_due_date)` — a recalibrated instrument gets a **new row**, so old certificates keep their original due dates. Service rule: an instrument whose `calibration_due_date < process_date` cannot be selected (A17).

### 4.6 `assets` (one pipette in one calibration job)
| Column | Type | Null | Notes |
|---|---|---|---|
| customer_id | uuid | NN | FK → customers |
| range_threshold_id | uuid | NN | FK → range_thresholds |
| serial_number | varchar(100) | NN | Pipette S.No (e.g. LK20869) |
| inventory_number | varchar(100) | NN | **UQ globally.** Typed by the engineer; printed as "Inventory No." (2026090843) |
| customer_asset_id | varchar(100) | NULL | "Cust ID No" (printed *Nil* if empty) |
| invoice_number | varchar(100) | NN | |
| progress | asset_progress | NN | default `not_started` |
| created_by | uuid | NN | |

Unique: `UQ (inventory_number)`, `UQ (id, customer_id, range_threshold_id)` (composite-FK target). Index (non-unique): `ix_assets_customer_id_serial_number` to find a pipette's history across years.

### 4.7 `z_factor_references`
`temperature_c numeric(4,1) NN` · `pressure_kpa numeric(6,2) NN` · `z_value numeric(6,4) NN` (µL/mg) · `source_version varchar(80) NN` · `UNIQUE (temperature_c, pressure_kpa, source_version)`.
Seed: `seed/z_factors_iso8655.csv` (31 temperatures × 7 pressures: 80, 85, 90, 95, 100, 101.3, 105 kPa).

### 4.8 `lab_dimensions`
| Column | Type | Null | Notes |
|---|---|---|---|
| process_date | date | NN | default today |
| service_mode | service_mode | NN | default onsite |
| calibrated_by_user_id | uuid | NN | FK → users |
| balance_instrument_id | uuid | NN | FK → instruments (type balance) |
| air_instrument_id | uuid | NN | FK → instruments (air_thermometer) |
| water_thermometer_instrument_id | uuid | NN | FK → instruments (water_thermometer) |
| dd_water_temp_c | numeric(4,1) | NN | CHECK 15–30 (Z table range) |
| room_temp_c | numeric(4,1) | NN | CHECK 15–30 |
| humidity_pct | numeric(4,1) | NN | CHECK 0–100 (UI warns < 50) |
| air_pressure_hpa | numeric(7,1) | NN | CHECK 800–1050; entered/printed in **hPa** |
| z_correction_value | numeric(6,4) | NN | Server-resolved, **rounded to 4 dp** |
| z_source_version | varchar(80) | NN | Snapshot of table version |

### 4.9 `asset_damages`
`asset_id uuid NN` · `calibration_session_id uuid NULL` (damage found during a session; composite FK `(calibration_session_id, asset_id)`) · `observation_notes text NN` · `damaged_part_name varchar(150) NN` · `part_replaced boolean NN default false` · `replaced_part_serial_number varchar(100)` · `part_cost numeric(12,2)` (both required if `part_replaced`; **cost is internal and never printed**) · `created_by uuid NN`.
Certificate prints "Damaged/Missing parts identified" and "Parts Replaced" from these rows, or **Nil**.

### 4.10 `calibration_sessions`
| Column | Type | Null | Notes |
|---|---|---|---|
| asset_id | uuid | NN | |
| customer_id | uuid | NN | Denormalized for reporting |
| range_threshold_id | uuid | NN | Denormalized for reporting |
| lab_dimension_id | uuid | NN | FK → lab_dimensions |
| session_no | smallint | NN | default 1; `UQ (asset_id, session_no)` |
| status | session_status | NN | |
| process_date | date | NN | Certificate "Date of Calibration" |
| next_calibration_months | smallint | NN | 1–60 |
| due_date | date | NN | **process_date + N months − 1 day** |
| reminder_date | date | NN | due_date − 30 days |
| start_time / end_time | timestamptz | NN / NULL | |
| one_dispensing_per_channel | boolean | NN | default false |
| device_ip / entry_location | inet / varchar(200) | NULL | Executive-only |
| inaccuracy_status, imprecision_status, final_status | result_status | NN | default pending |
| created_by | uuid | NN | |

FKs: **composite `(asset_id, customer_id, range_threshold_id)` → assets**. Unique: `UQ (id, asset_id)`, `UQ (id, asset_id, customer_id)`. Partial unique: one `in_progress` per asset. CHECK: `final_status='pass'` ⇒ both statuses `pass`. `inaccuracy_status` / `imprecision_status` are `pass` only when **every volume result** passes that test.

### 4.10a `calibration_volume_results` *(new — one row per test volume of a session)*
This is what the certificate's Inaccuracy and Imprecision tables print: **one row per volume, regardless of how many lots (channels) were measured.** Rows are created when the session starts.

| Column | Type | Null | Notes |
|---|---|---|---|
| calibration_session_id | uuid | NN | |
| asset_id | uuid | NN | Composite FK `(calibration_session_id, asset_id)` → sessions |
| range_threshold_limit_id | uuid | NN | FK to the limit row |
| nominal_volume_ul | numeric(10,3) | NN | **Composite FK `(range_threshold_limit_id, nominal_volume_ul)` → limits**; `UQ (calibration_session_id, nominal_volume_ul)` |
| inaccuracy_limit_pct, imprecision_limit_pct | numeric(8,4) | NN | **Snapshot** of the limits applied |
| reading_count | smallint | NULL | 10 × number of lots |
| mean_volume_ul | numeric(14,6) | NULL | Mean of **all** readings at this volume |
| std_dev_ul | numeric(14,6) | NULL | Sample SD of all readings |
| inaccuracy_actual_pct | numeric(10,6) | NULL | (mean − nominal) / nominal × 100 |
| imprecision_actual_pct | numeric(10,6) | NULL | STDEV × 100 / AVERAGE |
| inaccuracy_result, imprecision_result | result_status | NN | pass if `abs(actual) ≤ limit` (inclusive) |

Unique: `UQ (id, nominal_volume_ul)` (target of the lot's composite FK), `UQ (id, calibration_session_id, asset_id)`.
**Pooling rule (A21):** statistics use every reading at that volume across all lots (10 for single-channel, 80 for 8-channel, 120 for 12-channel). A lot that looks bad on its own does not fail the volume if the pooled values are within limits.

### 4.11 `calibration_lots`
A lot = 10 readings at one nominal volume (and one channel in per-channel mode).

| Column | Type | Null | Notes |
|---|---|---|---|
| calibration_volume_result_id | uuid | NN | FK → volume results |
| calibration_session_id | uuid | NN | |
| asset_id | uuid | NN | Composite FK `(calibration_session_id, asset_id)` → sessions |
| nominal_volume_ul | numeric(10,3) | NN | **Composite FK `(calibration_volume_result_id, nominal_volume_ul)` → volume results** (a lot can't disagree with its volume) |
| lot_no | smallint | NN | `UQ (calibration_session_id, lot_no)` |
| channel_no | smallint | NULL | Per-channel mode: 1–8 or 1–12 |
| mean_volume_ul, std_dev_ul, inaccuracy_actual_pct, imprecision_actual_pct | numeric | NULL | **Informational only** (helps diagnose a bad channel); they do **not** decide pass/fail |

Unique: `UQ (id, calibration_session_id, asset_id)` (target for readings).

### 4.12 `calibration_readings` *(answers your point 2)*
| Column | Type | Null | Notes |
|---|---|---|---|
| calibration_lot_id | uuid | NN | |
| calibration_session_id | uuid | NN | |
| asset_id | uuid | NN | **Composite FK `(calibration_lot_id, calibration_session_id, asset_id)` → lots** |
| reading_no | smallint | NN | 1–10; `UQ (calibration_lot_id, reading_no)` |
| mass_g | numeric(12,6) | NN | > 0; certificate prints 4 dp as entered |
| volume_ul | numeric(14,6) | NN | `mass_g × Z × 1000` (Z from the session's lab dimension) |

No `nominal_volume_ul` here: a reading reaches its limits through its lot (`reading → lot → volume result → limit row`), so storing it again would only create a second copy that could drift. A view flattens it when needed (§6).

### 4.13 `asset_certifications` *(answers your point 4)*
| Column | Type | Null | Notes |
|---|---|---|---|
| asset_id | uuid | NN | |
| customer_id | uuid | NN | |
| calibration_session_id | uuid | NN | **Composite FK `(calibration_session_id, asset_id, customer_id)` → sessions**; trigger requires session `final_status = 'pass'` |
| storage_key | varchar(500) | NN | Object-store key; file named `{inventory_number}_{range_label}ul.pdf` (as in your sample) |
| sha256 | char(64) | NN | |
| template_version | varchar(30) | NN | |
| generated_by / generated_at | uuid / timestamptz | NN | |
| voided_at / voided_by / void_reason | timestamptz / uuid / text | NULL | Admin-only void-and-reissue |

**`UNIQUE (asset_id) WHERE voided_at IS NULL`** → exactly one active certificate per asset; a void keeps history.

### 4.14 `audit_logs` (append-only)
`actor_user_id`, `action`, `entity_type`, `entity_id`, `before_data jsonb`, `after_data jsonb`, `request_id`. App role has INSERT/SELECT only.

### 4.15 Indexes
`ix_assets_customer_id_progress`, `ix_assets_range_threshold_id`, `ix_calibration_sessions_asset_id`, `ix_calibration_sessions_customer_id_process_date`, `ix_calibration_sessions_due_date`, `ix_calibration_lots_calibration_session_id`, `ix_calibration_lots_asset_id`, `ix_calibration_readings_calibration_lot_id`, `ix_calibration_readings_asset_id`, `ix_range_threshold_limits_range_threshold_id`, `ix_audit_logs_entity_type_entity_id`.

---

## 5. Readings: rows vs columns (your question 2)

**Recommendation: rows — one row per reading, 10 rows per lot.**

| Criterion | Rows (chosen) | 10 columns (`reading_1…reading_10`) |
|---|---|---|
| Average / SD | `AVG(volume_ul)`, `STDDEV_SAMP(volume_ul)` — plain `GROUP BY` | Must hand-write `(r1+…+r10)/10`, and SD is awkward |
| Constraints | `UQ (lot, reading_no)`, `CHECK reading_no BETWEEN 1 AND 10` | 10 repeated columns, 10 CHECKs |
| Change in reading count | Data change only | Schema migration |
| Partial entry (autosave) | Natural (rows appear as typed) | Many NULL columns |
| Reporting | Standard SQL over any lot, volume, customer | Needs unpivot first |

**Cost is small:** 10 rows/lot × 3 lots = 30 rows for a single-channel pipette; worst case (12-channel, per-channel, 3 volumes) 36 lots = 360 rows per session. Even 100 000 jobs is well within normal PostgreSQL range with an index on `calibration_lot_id`.

**For "frequently computing the average per lot":** the aggregates are computed **once on save** and stored on `calibration_volume_results` (and informationally on each lot), so reports read one row per volume rather than re-aggregating readings. `v_lot_results` re-computes from the raw rows and is used in tests to prove the stored values match. The certificate's 10 × 3 grid is a simple pivot done in the PDF layer.

## 6. Traceability Views (your question 3)

| View | Purpose |
|---|---|
| `v_asset_trace` | One row per asset-session: customer, department, configuration (range/channel/make/model), session, lab dimensions + instruments, statuses, due/reminder dates, active certificate key |
| `v_reading_detail` | One row per reading with asset, customer, session, lot, nominal volume, limits, mass, volume |
| `v_volume_results` | Live `AVG`, `STDDEV_SAMP`, inaccuracy and imprecision recomputed over **all readings of a volume**, next to the stored values |
| `v_lot_results` | Same per lot (informational) |
| `v_range_threshold_readiness` | Configuration → expected vs. captured limit rows |

Example: *all readings for an asset, with customer and certificate*
```sql
SELECT c.customer_name, a.inventory_number, s.session_no, l.nominal_volume_ul,
       r.reading_no, r.mass_g, r.volume_ul, ac.storage_key
FROM calibration_readings r
JOIN calibration_lots l      ON l.id = r.calibration_lot_id
JOIN calibration_sessions s  ON s.id = r.calibration_session_id
JOIN assets a                ON a.id = r.asset_id
JOIN customers c             ON c.id = a.customer_id
LEFT JOIN asset_certifications ac ON ac.asset_id = a.id AND ac.voided_at IS NULL
WHERE a.inventory_number = '2026090843'
ORDER BY s.session_no, l.lot_no, r.reading_no;
```

---

## 7. Certificate Field Map (exact format of the sample PDF)

**Principle:** the certificate is the sample (`2026090843_2-20ul.pdf`: US Letter, Arial, VFL logo top-right) reproduced exactly. **Fixed text** is typed into the template; **every variable value is derived from the database**; **only the signature is manual**. In the mockup every variable value carries a `data-src` attribute naming its source.

### Fixed (template) text
Labels: *Calibration Certificate, Inventory No., Pipette Manufacturer, Pipette Details, In Use at, No of Channel :, S.No:-, Cust ID No, Volume Set, Sl.No., Mass (gm), Actual Volume (µL), Inaccuracy Actual(%), Inaccuracy Limit, Imprecision Actual(%), Imprecision Limit, Volume (µl), Actual Volume (µl) = Mass Read * Z Factor * 1000, DD waterTemperature: (°C), Room temp: (°C), Humidity: (%), "Z" Correction Value :, µl/mg, Air pressure:, hPa, Balance Used :, Thermometer Used :, Damaged /Missing parts identified, Parts Replaced, Status, Serviced by, Date of Calibration, Next Calibration Due, Authorised Signatory*; the logo; and the footer (VFL Sciences Private Limited, address, e-mail, website, CIN). Held in template configuration and versioned in `template_version`.

### Variable (database) values
| Certificate field | Source |
|---|---|
| Header lines 1–3 | `customers.customer_name`, `address_1`, `address_2` |
| Inventory No. | `assets.inventory_number` |
| Pipette Manufacturer / Details / S.No | `range_thresholds.make`, `model` / `assets.serial_number` |
| No of Channel (*Single / Eight / Twelve Channel*) | `range_thresholds.channel` |
| Range (e.g. `2-20 µl`) | `range_thresholds.range_label` |
| In Use at | `customers.department` |
| Cust ID No | `assets.customer_asset_id`, or *Nil* |
| Volume set headings (`2 µL`, `10 µL`, `20 µL`) | `calibration_volume_results.nominal_volume_ul` |
| Sl.No. / Mass / Actual Volume rows | `calibration_readings` (`reading_no`, `mass_g`, `volume_ul`) |
| Inaccuracy / Imprecision tables | `calibration_volume_results` — **one row per volume**; limits are the snapshot, printed `± x.x%` |
| DD water temp, room temp, humidity, Z, air pressure | `lab_dimensions` |
| Balance Used / Thermometer Used | `instruments` via `lab_dimensions` |
| Damaged /Missing parts, Parts Replaced | `asset_damages`, or *Nil* |
| Status | `calibration_sessions.final_status` (certificates exist only for *Pass*) |
| Serviced by | `users.display_name` of the calibrating user |
| Date of Calibration / Next Calibration Due | `process_date` / `due_date` |

### Display formats (read from the sample)
| Item | Format | Example |
|---|---|---|
| Mass | 4 dp, as entered | `0.0099` |
| Actual volume | 2 dp, rounded from the full-precision value | `9.95` |
| Inaccuracy / imprecision actual | 4 dp | `0.2184` |
| Limits | 1 dp with ± and % | `± 10.0%` |
| Volume labels | number without trailing zeros | `2`, `10`, `20` |
| Z | 4 dp | `1.0052` |
| Temperatures | 1 dp | `29.4` |
| Humidity | whole number | `74` |
| Air pressure | 1 dp, hPa | `1008.8` |
| Date of calibration / next due | `d-MMM-yy` | `1-Oct-26`, `30-Sep-27` |
| Instrument calibration due | `dd-MM-yyyy` | `04-01-2027` |
| Balance line | `{make_model} / S.No: {serial} / Cal due : {date}` | `Sartorius BCE224 - 10IN / S.No: 0047004152 / Cal due : 04-01-2027` |
| Thermometer line | `Air - {make_model} S.No:{serial} / Water - {make_model} S.No:{serial} / Cal due : {date}` | as in the sample |

### Per-channel mode (8 or 12 lots per volume)
The **same table** is used: Sl.No. runs 1–80 (8-channel) or 1–120 (12-channel) in each volume group, channel 1's 10 readings first, then channel 2's, and so on; **no extra column**. The table flows onto continuation pages with its two header rows repeated; the inaccuracy/imprecision tables and everything below start on a new page if they do not fit. Because results are per volume, those tables stay at **three rows**. In the 8-channel mockup: 35 rows on page 1, 45 on page 2, results block on page 3. Continuation pages carry one added line (*Inventory No. … Page n of N*), the only addition to the sample.

---

## 8. Assumptions & Open Questions

| # | Item | Status |
|---|---|---|
| A1 | Limits per test volume, in % | **Resolved** (C1) |
| A2, A3 | Inaccuracy / imprecision formulas | **Resolved & verified** (C5) |
| A4 | Limits are **inclusive** (`≤`); inaccuracy compared as absolute value (limits are "±") | **Resolved** |
| A5 | Lots: "No" → one lot per test volume; "Yes" → **one lot per channel per volume** (8 or 12 lots for the same volume; `times_to_test × channel_count`) | **Resolved** |
| A6 | **Pass/fail is one per volume**, regardless of the number of lots; the session passes only if every volume passes both tests. A failed session produces **no certificate** (retry = session 2) | **Resolved** |
| A7 | Z table | **Resolved** — seeded; transcription checked (monotonic; sample Z reproduced). Needs one human spot-check against the ISO original |
| A8 | PDF template | **Mostly resolved** — real single-channel sample + mockups for per-channel and fail screens. Validate against real samples when available |
| A9 | Fixed-volume pipettes test one volume (= range) | Confirm |
| A10 | Exec-only fields (IP, location, engineer timings); location needs consent/legal review | Open |
| A11 | Invalid range → reject (no `-99`) | Confirm |
| A12 | Lab dimensions entered once per sitting, shared by sessions | Confirm |
| **A13** | Due date = process date + N months − 1 day | **Resolved** |
| **A14** | **Asset = pipette per job.** Next year's calibration of the same pipette creates a new asset row (new inventory no./invoice) | Confirm; alternative is a `pipettes` master table |
| **A15** | Inventory No. is **typed by the engineer** (trimmed, 1–100 chars, globally unique); the app never generates it | **Resolved** |
| **A16** | Z = bilinear interpolation, rounded to 4 dp | **Resolved** |
| **A17** | Block use of an instrument past its calibration-due date | Confirm |
| **A18** | Certificate = exact sample format; per-channel layout in §7 (continuous Sl.No., repeated header rows) | **Resolved** (mockup pages 1–3) |
| **A19** | "In Use at" = customer `department` | **Resolved** |
| **A20** | Voiding a certificate (admin, reason, audit) is allowed; otherwise strictly one and final | Confirm |
| **A21** | **Per-volume statistics pool all readings across lots** (mean and sample SD over 10 / 80 / 120 readings) | Confirm: my reading of "one per volume irrespective of lots" |
| **A22** | The Thermometer line prints one "Cal due" after both thermometers. Which date: the earlier of the two, or the water thermometer's? | Open |
| **A23** | Inaccuracy printed **signed** (e.g. −0.2184) or as an absolute value? The sample only has positives | Open |
| **A24** | Continuation pages carry one added line: *Inventory No. · Page n of N* | Confirm |

---

## 9. Business Glossary

| Term | Definition |
|---|---|
| **Pipette / Asset** | Handheld volumetric instrument; "asset" = one pipette in one calibration job |
| **Inventory No.** | Document/job identifier printed at the top of the certificate |
| **Cust ID No** | The customer's own tag for the pipette (optional) |
| **Customer + Department** | Unique business identity of a client unit |
| **µL ("ul")** | Microlitre |
| **Range** | Volume span of the pipette in µL (`2-20`); no `-` means fixed-volume |
| **Channel** | Single (1), Eight (8), Twelve (12) |
| **Make / Model** | Manufacturer / product name (Gilson / Pipetmann P20) |
| **Test Point / Test Volume** | One of 10 %, 50 %, 100 % of the maximum range (2, 10, 20 µL for 2-20) |
| **Number of Times to Test** | Count of test points: 3 variable-volume, 1 fixed |
| **Number of Repeats** | Channels exercised: 1 / 8 / 12 per the derivation rule |
| **Nominal Volume** | Target volume of a test point |
| **Lot** | 10 consecutive readings at one nominal volume (and one channel, in per-channel mode) |
| **Volume Result** | The single pooled result (mean, inaccuracy, imprecision, pass/fail) for one test volume, whatever the number of lots |
| **Reading** | One weighing of dispensed water, in grams |
| **Gravimetric method** | Converting the mass of dispensed water to volume |
| **DD Water** | Double-distilled water used for testing |
| **Balance / Thermometer** | Calibrated instruments whose model, serial and calibration-due date are printed |
| **Z Correction (Z)** | µL/mg conversion depending on water temperature and air pressure (ISO 8655 Table A.1); applied rounded to 4 dp |
| **Actual Volume** | `mass(g) × Z × 1000` in µL |
| **Inaccuracy (systematic error)** | (mean − nominal) ÷ nominal × 100 |
| **Imprecision (CV)** | STDEV(readings) × 100 ÷ AVERAGE(readings), sample SD |
| **Inaccuracy / Imprecision Limit** | Maximum permitted value (±%) per configuration and test volume |
| **Final Status** | Pass/Fail of a session |
| **Session** | One calibration attempt for an asset (1, then 2… after a fail) |
| **Process Date / Date of Calibration** | Day calibration was performed |
| **Next Calibration Due** | Process date + N months − 1 day |
| **Reminder Date** | Due date − 30 days |
| **Mode of Service** | Onsite or Offsite |
| **Calibration Certificate** | One PDF per asset whose session passed |
| **Serviced by** | The calibrating engineer (logged-in user) |
| **ISO 8655** | International standard for piston-operated volumetric apparatus |
| **Executive View** | Role-restricted data: engineer timings, device IP, entry location |
| **Dim / Fact** | Reference data vs. measured transactional data |
