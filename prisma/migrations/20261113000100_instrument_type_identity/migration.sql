BEGIN;
ALTER TABLE instruments DROP CONSTRAINT uq_instrument_version;
ALTER TABLE instruments ADD CONSTRAINT uq_instrument_version UNIQUE (serial_number,instrument_type,calibration_due_date);
COMMIT;
