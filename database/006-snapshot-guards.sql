BEGIN;
CREATE FUNCTION validate_reading_volume() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resolved_z numeric; BEGIN
 SELECT d.z_correction_value INTO resolved_z FROM calibration_sessions s
 JOIN lab_dimensions d ON d.id=s.lab_dimension_id WHERE s.id=NEW.calibration_session_id;
 IF NEW.volume_ul IS DISTINCT FROM NEW.mass_g*resolved_z*1000 THEN
  RAISE EXCEPTION 'Reading volume must equal mass * Z * 1000' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reading_volume_consistent BEFORE INSERT OR UPDATE ON calibration_readings FOR EACH ROW EXECUTE FUNCTION validate_reading_volume();

CREATE FUNCTION protect_lab_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM calibration_sessions WHERE lab_dimension_id=OLD.id) THEN
  RAISE EXCEPTION 'Lab sitting already used; create a new sitting' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lab_snapshot_immutable BEFORE UPDATE ON lab_dimensions FOR EACH ROW EXECUTE FUNCTION protect_lab_snapshot();
CREATE FUNCTION protect_instrument_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM lab_dimensions WHERE OLD.id IN (balance_instrument_id,air_instrument_id,water_thermometer_instrument_id)) THEN
  RAISE EXCEPTION 'Instrument already used; create a new calibration version' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER instrument_snapshot_immutable BEFORE UPDATE ON instruments FOR EACH ROW EXECUTE FUNCTION protect_instrument_snapshot();

CREATE FUNCTION validate_lab_instruments() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM instruments WHERE id=NEW.balance_instrument_id AND instrument_type='balance' AND is_active AND calibration_due_date>=NEW.process_date) OR
 NOT EXISTS(SELECT 1 FROM instruments WHERE id=NEW.air_instrument_id AND instrument_type='air_thermometer' AND is_active AND calibration_due_date>=NEW.process_date) OR
 NOT EXISTS(SELECT 1 FROM instruments WHERE id=NEW.water_thermometer_instrument_id AND instrument_type='water_thermometer' AND is_active AND calibration_due_date>=NEW.process_date) THEN
  RAISE EXCEPTION 'Wrong instrument type or expired calibration' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lab_instrument_valid BEFORE INSERT OR UPDATE ON lab_dimensions FOR EACH ROW EXECUTE FUNCTION validate_lab_instruments();

CREATE FUNCTION validate_session_completion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE volume_count integer; lot_count integer; expected_lots integer; test_count integer; channels integer; BEGIN
 IF NEW.status='completed' THEN
  SELECT times_to_test,channel_count INTO test_count,channels FROM range_thresholds WHERE id=NEW.range_threshold_id;
  expected_lots=test_count*CASE WHEN NEW.one_dispensing_per_channel THEN channels ELSE 1 END;
  SELECT count(*) INTO volume_count FROM calibration_volume_results WHERE calibration_session_id=NEW.id;
  SELECT count(*) INTO lot_count FROM calibration_lots WHERE calibration_session_id=NEW.id;
  IF volume_count<>test_count OR lot_count<>expected_lots OR
   EXISTS(SELECT 1 FROM calibration_lots l WHERE l.calibration_session_id=NEW.id AND (SELECT count(*) FROM calibration_readings r WHERE r.calibration_lot_id=l.id)<>10) OR
   EXISTS(SELECT 1 FROM calibration_volume_results WHERE calibration_session_id=NEW.id AND (inaccuracy_result='pending' OR imprecision_result='pending')) THEN
   RAISE EXCEPTION 'Completion requires the full planned readings and results' USING ERRCODE='23514';
  END IF;
  IF (NEW.inaccuracy_status='pass') IS DISTINCT FROM (NOT EXISTS(SELECT 1 FROM calibration_volume_results WHERE calibration_session_id=NEW.id AND inaccuracy_result<>'pass')) OR
   (NEW.imprecision_status='pass') IS DISTINCT FROM (NOT EXISTS(SELECT 1 FROM calibration_volume_results WHERE calibration_session_id=NEW.id AND imprecision_result<>'pass')) THEN
   RAISE EXCEPTION 'Session status must match all volume results' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER session_completion_valid BEFORE UPDATE ON calibration_sessions FOR EACH ROW EXECUTE FUNCTION validate_session_completion();
REVOKE ALL ON FUNCTION validate_reading_volume(),protect_lab_snapshot(),protect_instrument_snapshot(),validate_lab_instruments(),validate_session_completion() FROM PUBLIC;
COMMIT;