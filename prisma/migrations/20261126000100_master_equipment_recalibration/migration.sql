BEGIN;
-- Calibration validity is now assigned from the calibration jobs list, not at registration.
ALTER TABLE assets ALTER COLUMN calibration_validity_months DROP DEFAULT;
ALTER TABLE assets ALTER COLUMN calibration_validity_months DROP NOT NULL;
-- Planned date for a re-calibration of an already calibrated pipette.
ALTER TABLE assets ADD COLUMN scheduled_calibration_date date;

-- One master instrument per measurement-device type.
CREATE TABLE master_instruments (
  instrument_type instrument_type PRIMARY KEY,
  instrument_id uuid NOT NULL REFERENCES instruments(id),
  assigned_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON master_instruments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER no_hard_delete BEFORE DELETE ON master_instruments FOR EACH ROW EXECUTE FUNCTION reject_delete();

-- Default certificate signature per login.
CREATE TABLE user_signatures (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  image_data_url text NOT NULL CHECK (image_data_url LIKE 'data:image/%' AND length(image_data_url)<=1500000),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON user_signatures FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER no_hard_delete BEFORE DELETE ON user_signatures FOR EACH ROW EXECUTE FUNCTION reject_delete();

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vfl_app') THEN
  GRANT SELECT,INSERT,UPDATE ON master_instruments,user_signatures TO vfl_app;
 END IF;
END $$;
COMMIT;
