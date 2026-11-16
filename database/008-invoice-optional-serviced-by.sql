BEGIN;
ALTER TABLE assets ALTER COLUMN invoice_number DROP NOT NULL;
ALTER TABLE calibration_sessions ADD COLUMN serviced_by varchar(120);
ALTER TABLE calibration_sessions ADD CONSTRAINT ck_serviced_by
  CHECK (serviced_by IS NULL OR length(trim(serviced_by))>0);
COMMIT;