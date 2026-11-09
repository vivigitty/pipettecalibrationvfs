BEGIN;
CREATE UNIQUE INDEX uq_customer_identity ON customers(lower(customer_name),lower(department));
CREATE UNIQUE INDEX uq_active_session ON calibration_sessions(asset_id) WHERE status='in_progress';
CREATE UNIQUE INDEX uq_active_certificate ON asset_certifications(asset_id) WHERE voided_at IS NULL;
ALTER TABLE range_thresholds ADD CONSTRAINT ck_range CHECK (
 range_label ~ '^\d+(\.\d+)?(-\d+(\.\d+)?)?$' AND range_max_ul > 0 AND
 ((range_min_ul IS NULL AND times_to_test=1 AND range_label !~ '-') OR
 (range_min_ul > 0 AND range_min_ul < range_max_ul AND times_to_test=3 AND range_label ~ '-'))
);
ALTER TABLE range_thresholds ADD CONSTRAINT ck_channel CHECK (
 (channel='single' AND channel_count=1) OR (channel='eight' AND channel_count=8) OR (channel='twelve' AND channel_count=12)
);
ALTER TABLE range_thresholds ADD CONSTRAINT ck_repeats CHECK (repeats=CASE WHEN times_to_test=1 THEN 1 ELSE channel_count END);
ALTER TABLE range_threshold_limits ADD CONSTRAINT ck_limits CHECK (
 test_point_pct IN (10,50,100) AND nominal_volume_ul>0 AND inaccuracy_limit_pct>0 AND imprecision_limit_pct>0
);
ALTER TABLE lab_dimensions ADD CONSTRAINT ck_lab CHECK (
 dd_water_temp_c BETWEEN 15 AND 30 AND room_temp_c BETWEEN 15 AND 30 AND humidity_pct BETWEEN 0 AND 100 AND air_pressure_hpa BETWEEN 800 AND 1050 AND z_correction_value>0
);
ALTER TABLE z_factor_references ADD CONSTRAINT ck_z CHECK (temperature_c BETWEEN 15 AND 30 AND pressure_kpa BETWEEN 80 AND 105 AND z_value>0);
ALTER TABLE calibration_readings ADD CONSTRAINT ck_reading CHECK (reading_no BETWEEN 1 AND 10 AND mass_g>0 AND volume_ul>0);
ALTER TABLE calibration_lots ADD CONSTRAINT ck_lot CHECK (lot_no BETWEEN 1 AND 36 AND (channel_no IS NULL OR channel_no BETWEEN 1 AND 12) AND nominal_volume_ul>0);
ALTER TABLE calibration_volume_results ADD CONSTRAINT ck_volume CHECK (inaccuracy_limit_pct>0 AND imprecision_limit_pct>0 AND (reading_count IS NULL OR reading_count BETWEEN 0 AND 120));
ALTER TABLE calibration_sessions ADD CONSTRAINT ck_session CHECK (
 session_no>0 AND next_calibration_months BETWEEN 1 AND 60 AND
 (final_status<>'pass' OR (inaccuracy_status='pass' AND imprecision_status='pass')) AND
 (status<>'completed' OR (end_time IS NOT NULL AND final_status<>'pending')) AND
 (status<>'in_progress' OR (end_time IS NULL AND final_status='pending'))
);
ALTER TABLE asset_damages ADD CONSTRAINT ck_replacement CHECK (
 (part_cost IS NULL OR part_cost>=0) AND
 (NOT part_replaced OR (length(trim(replaced_part_serial_number))>0 AND replaced_part_serial_number IS NOT NULL AND part_cost IS NOT NULL))
);
ALTER TABLE asset_certifications ADD CONSTRAINT ck_void CHECK (
 (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR
 (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL AND length(trim(void_reason))>0)
);

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE FUNCTION reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Business records cannot be deleted' USING ERRCODE='23514'; END $$;
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit log is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['users','customers','range_thresholds','range_threshold_limits','instruments','assets','z_factor_references','lab_dimensions','asset_damages','calibration_sessions','calibration_volume_results','calibration_lots','calibration_readings','asset_certifications'] LOOP
  EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',table_name);
  EXECUTE format('CREATE TRIGGER no_hard_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_delete()',table_name);
 END LOOP;
END $$;
CREATE FUNCTION protect_completed_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('completed','abandoned') THEN RAISE EXCEPTION 'Closed sessions are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER session_immutable BEFORE UPDATE ON calibration_sessions FOR EACH ROW EXECUTE FUNCTION protect_completed_session();
CREATE FUNCTION protect_session_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status session_status; BEGIN
 SELECT status INTO current_status FROM calibration_sessions WHERE id=NEW.calibration_session_id FOR SHARE;
 IF current_status<>'in_progress' THEN RAISE EXCEPTION 'Closed session data is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reading_immutable BEFORE INSERT OR UPDATE ON calibration_readings FOR EACH ROW EXECUTE FUNCTION protect_session_child();
CREATE TRIGGER lot_immutable BEFORE INSERT OR UPDATE ON calibration_lots FOR EACH ROW EXECUTE FUNCTION protect_session_child();
CREATE TRIGGER volume_immutable BEFORE INSERT OR UPDATE ON calibration_volume_results FOR EACH ROW EXECUTE FUNCTION protect_session_child();
CREATE FUNCTION certificate_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_session calibration_sessions; BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.voided_at IS NOT NULL OR (to_jsonb(NEW)-'voided_at'-'voided_by'-'void_reason'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'voided_at'-'voided_by'-'void_reason'-'updated_at') THEN
   RAISE EXCEPTION 'Stored certificates are immutable except voiding' USING ERRCODE='23514';
  END IF;
 END IF;
 SELECT * INTO current_session FROM calibration_sessions WHERE id=NEW.calibration_session_id FOR SHARE;
 IF current_session.status<>'completed' OR current_session.final_status<>'pass' OR
 NOT EXISTS(SELECT 1 FROM calibration_volume_results WHERE calibration_session_id=current_session.id) OR
 EXISTS(SELECT 1 FROM calibration_volume_results WHERE calibration_session_id=current_session.id AND (inaccuracy_result<>'pass' OR imprecision_result<>'pass')) OR
 EXISTS(SELECT 1 FROM calibration_lots l WHERE l.calibration_session_id=current_session.id AND (SELECT count(*) FROM calibration_readings r WHERE r.calibration_lot_id=l.id)<>10) THEN
  RAISE EXCEPTION 'Certificate requires a complete passing session' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER certificate_requires_pass BEFORE INSERT OR UPDATE ON asset_certifications FOR EACH ROW EXECUTE FUNCTION certificate_gate();

CREATE INDEX ix_assets_customer_progress ON assets(customer_id,progress);
CREATE INDEX ix_assets_customer_serial ON assets(customer_id,serial_number);
CREATE INDEX ix_assets_range ON assets(range_threshold_id);
CREATE INDEX ix_sessions_asset ON calibration_sessions(asset_id);
CREATE INDEX ix_sessions_customer_date ON calibration_sessions(customer_id,process_date);
CREATE INDEX ix_sessions_due ON calibration_sessions(due_date);
CREATE INDEX ix_volume_session ON calibration_volume_results(calibration_session_id);
CREATE INDEX ix_lots_session ON calibration_lots(calibration_session_id);
CREATE INDEX ix_lots_asset ON calibration_lots(asset_id);
CREATE INDEX ix_readings_lot ON calibration_readings(calibration_lot_id);
CREATE INDEX ix_readings_asset ON calibration_readings(asset_id);
CREATE INDEX ix_limits_range ON range_threshold_limits(range_threshold_id);
CREATE INDEX ix_audit_entity ON audit_logs(entity_type,entity_id);
COMMIT;