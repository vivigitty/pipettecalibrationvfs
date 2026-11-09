BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TYPE channel_type AS ENUM ('single','eight','twelve');
CREATE TYPE service_mode AS ENUM ('onsite','offsite');
CREATE TYPE asset_progress AS ENUM ('not_started','in_progress','completed');
CREATE TYPE session_status AS ENUM ('in_progress','completed','abandoned');
CREATE TYPE result_status AS ENUM ('pending','pass','fail');
CREATE TYPE user_role AS ENUM ('technician','admin','executive');
CREATE TYPE instrument_type AS ENUM ('balance','air_thermometer','water_thermometer');

CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email citext NOT NULL UNIQUE,
 display_name varchar(120) NOT NULL, role user_role NOT NULL,
 external_subject varchar(255) NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_name varchar(200) NOT NULL,
 department varchar(150) NOT NULL, address_1 varchar(250) NOT NULL, address_2 varchar(250),
 email citext NOT NULL, phone_1 varchar(30) NOT NULL, phone_2 varchar(30),
 contact_name varchar(150) NOT NULL, is_active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE range_thresholds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), range_label varchar(30) NOT NULL,
 range_min_ul numeric, range_max_ul numeric NOT NULL, channel channel_type NOT NULL,
 channel_count smallint NOT NULL, make varchar(100) NOT NULL, model varchar(100) NOT NULL,
 times_to_test smallint NOT NULL, repeats smallint NOT NULL, is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_range_configuration UNIQUE(range_label,channel,make,model)
);
CREATE TABLE range_threshold_limits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), range_threshold_id uuid NOT NULL REFERENCES range_thresholds(id),
 test_point_pct smallint NOT NULL, nominal_volume_ul numeric NOT NULL,
 inaccuracy_limit_pct numeric NOT NULL, imprecision_limit_pct numeric NOT NULL,
 captured_by uuid NOT NULL REFERENCES users(id), captured_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_limit_volume UNIQUE(range_threshold_id,nominal_volume_ul),
 CONSTRAINT uq_limit_point UNIQUE(range_threshold_id,test_point_pct),
 CONSTRAINT uq_limit_id_volume UNIQUE(id,nominal_volume_ul)
);
CREATE TABLE instruments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instrument_type instrument_type NOT NULL,
 make_model varchar(150) NOT NULL, serial_number varchar(100) NOT NULL,
 calibration_due_date date NOT NULL, is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_instrument_version UNIQUE(serial_number,calibration_due_date)
);
CREATE TABLE assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES customers(id),
 range_threshold_id uuid NOT NULL REFERENCES range_thresholds(id), serial_number varchar(100) NOT NULL,
 inventory_number varchar(100) NOT NULL UNIQUE, customer_asset_id varchar(100), invoice_number varchar(100) NOT NULL,
 progress asset_progress NOT NULL DEFAULT 'not_started', created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_asset_ancestry UNIQUE(id,customer_id,range_threshold_id)
);
CREATE TABLE z_factor_references (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), temperature_c numeric NOT NULL,
 pressure_kpa numeric NOT NULL, z_value numeric(6,4) NOT NULL, source_version varchar(80) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_z_grid UNIQUE(temperature_c,pressure_kpa,source_version)
);
CREATE TABLE lab_dimensions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), process_date date NOT NULL DEFAULT CURRENT_DATE,
 service_mode service_mode NOT NULL DEFAULT 'onsite', calibrated_by_user_id uuid NOT NULL REFERENCES users(id),
 balance_instrument_id uuid NOT NULL REFERENCES instruments(id), air_instrument_id uuid NOT NULL REFERENCES instruments(id),
 water_thermometer_instrument_id uuid NOT NULL REFERENCES instruments(id), dd_water_temp_c numeric NOT NULL,
 room_temp_c numeric NOT NULL, humidity_pct numeric NOT NULL, air_pressure_hpa numeric NOT NULL,
 z_correction_value numeric(6,4) NOT NULL, z_source_version varchar(80) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE calibration_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL, customer_id uuid NOT NULL,
 range_threshold_id uuid NOT NULL, lab_dimension_id uuid NOT NULL REFERENCES lab_dimensions(id),
 session_no smallint NOT NULL DEFAULT 1, status session_status NOT NULL DEFAULT 'in_progress',
 process_date date NOT NULL, next_calibration_months smallint NOT NULL, due_date date NOT NULL,
 reminder_date date NOT NULL, start_time timestamptz NOT NULL DEFAULT now(), end_time timestamptz,
 one_dispensing_per_channel boolean NOT NULL DEFAULT false, device_ip inet, entry_location varchar(200),
 inaccuracy_status result_status NOT NULL DEFAULT 'pending', imprecision_status result_status NOT NULL DEFAULT 'pending',
 final_status result_status NOT NULL DEFAULT 'pending', created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_session_asset FOREIGN KEY(asset_id,customer_id,range_threshold_id) REFERENCES assets(id,customer_id,range_threshold_id),
 CONSTRAINT uq_session_number UNIQUE(asset_id,session_no), CONSTRAINT uq_session_asset UNIQUE(id,asset_id),
 CONSTRAINT uq_session_customer UNIQUE(id,asset_id,customer_id)
);
CREATE TABLE calibration_volume_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), calibration_session_id uuid NOT NULL, asset_id uuid NOT NULL,
 range_threshold_limit_id uuid NOT NULL, nominal_volume_ul numeric NOT NULL,
 inaccuracy_limit_pct numeric NOT NULL, imprecision_limit_pct numeric NOT NULL, reading_count smallint,
 mean_volume_ul numeric, std_dev_ul numeric, inaccuracy_actual_pct numeric, imprecision_actual_pct numeric,
 inaccuracy_result result_status NOT NULL DEFAULT 'pending', imprecision_result result_status NOT NULL DEFAULT 'pending',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_volume_session FOREIGN KEY(calibration_session_id,asset_id) REFERENCES calibration_sessions(id,asset_id),
 CONSTRAINT fk_volume_limit FOREIGN KEY(range_threshold_limit_id,nominal_volume_ul) REFERENCES range_threshold_limits(id,nominal_volume_ul),
 CONSTRAINT uq_volume_session UNIQUE(calibration_session_id,nominal_volume_ul),
 CONSTRAINT uq_volume_nominal UNIQUE(id,nominal_volume_ul),
 CONSTRAINT uq_volume_ancestry UNIQUE(id,calibration_session_id,asset_id)
);
CREATE TABLE calibration_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), calibration_volume_result_id uuid NOT NULL,
 calibration_session_id uuid NOT NULL, asset_id uuid NOT NULL, nominal_volume_ul numeric NOT NULL,
 lot_no smallint NOT NULL, channel_no smallint, mean_volume_ul numeric, std_dev_ul numeric,
 inaccuracy_actual_pct numeric, imprecision_actual_pct numeric,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_lot_session FOREIGN KEY(calibration_session_id,asset_id) REFERENCES calibration_sessions(id,asset_id),
 CONSTRAINT fk_lot_volume FOREIGN KEY(calibration_volume_result_id,nominal_volume_ul) REFERENCES calibration_volume_results(id,nominal_volume_ul),
 CONSTRAINT fk_lot_volume_ancestry FOREIGN KEY(calibration_volume_result_id,calibration_session_id,asset_id) REFERENCES calibration_volume_results(id,calibration_session_id,asset_id),
 CONSTRAINT uq_lot_number UNIQUE(calibration_session_id,lot_no),
 CONSTRAINT uq_lot_ancestry UNIQUE(id,calibration_session_id,asset_id)
);
CREATE TABLE calibration_readings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), calibration_lot_id uuid NOT NULL,
 calibration_session_id uuid NOT NULL, asset_id uuid NOT NULL, reading_no smallint NOT NULL,
 mass_g numeric NOT NULL, volume_ul numeric NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_reading_lot FOREIGN KEY(calibration_lot_id,calibration_session_id,asset_id) REFERENCES calibration_lots(id,calibration_session_id,asset_id),
 CONSTRAINT uq_reading_number UNIQUE(calibration_lot_id,reading_no)
);
CREATE TABLE asset_damages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES assets(id),
 calibration_session_id uuid, observation_notes text NOT NULL, damaged_part_name varchar(150) NOT NULL,
 part_replaced boolean NOT NULL DEFAULT false, replaced_part_serial_number varchar(100), part_cost numeric(12,2),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_damage_session FOREIGN KEY(calibration_session_id,asset_id) REFERENCES calibration_sessions(id,asset_id)
);
CREATE TABLE asset_certifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL, customer_id uuid NOT NULL,
 calibration_session_id uuid NOT NULL, storage_key varchar(500) NOT NULL, sha256 char(64) NOT NULL,
 template_version varchar(30) NOT NULL, generated_by uuid NOT NULL REFERENCES users(id),
 generated_at timestamptz NOT NULL DEFAULT now(), voided_at timestamptz, voided_by uuid REFERENCES users(id), void_reason text,
 idempotency_key uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_certificate_session FOREIGN KEY(calibration_session_id,asset_id,customer_id) REFERENCES calibration_sessions(id,asset_id,customer_id)
);
CREATE TABLE audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid NOT NULL REFERENCES users(id),
 action varchar(80) NOT NULL, entity_type varchar(80) NOT NULL, entity_id uuid NOT NULL,
 before_data jsonb, after_data jsonb, request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;