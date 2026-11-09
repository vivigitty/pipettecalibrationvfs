BEGIN;
CREATE VIEW v_range_threshold_readiness AS
SELECT t.id, t.range_label, t.times_to_test AS expected_count, count(l.id) AS captured_count,
 count(l.id)=t.times_to_test AND coalesce(bool_and(
 l.nominal_volume_ul=t.range_max_ul*l.test_point_pct/100 AND
 (t.times_to_test=3 OR l.test_point_pct=100)),false) AS is_ready
FROM range_thresholds t LEFT JOIN range_threshold_limits l ON l.range_threshold_id=t.id GROUP BY t.id;
CREATE VIEW v_reading_detail AS
SELECT r.*,a.customer_id,a.inventory_number,c.customer_name,c.department,l.lot_no,l.channel_no,
 l.nominal_volume_ul,v.inaccuracy_limit_pct,v.imprecision_limit_pct,s.lab_dimension_id
FROM calibration_readings r JOIN calibration_lots l ON l.id=r.calibration_lot_id
JOIN calibration_volume_results v ON v.id=l.calibration_volume_result_id
JOIN calibration_sessions s ON s.id=r.calibration_session_id
JOIN assets a ON a.id=r.asset_id JOIN customers c ON c.id=a.customer_id;
CREATE VIEW v_lot_results AS
SELECT l.id,l.calibration_session_id,l.nominal_volume_ul,count(r.id) AS reading_count,
 avg(r.volume_ul) AS live_mean_volume_ul,stddev_samp(r.volume_ul) AS live_std_dev_ul,
 (avg(r.volume_ul)-l.nominal_volume_ul)/l.nominal_volume_ul*100 AS live_inaccuracy_pct,
 stddev_samp(r.volume_ul)/nullif(avg(r.volume_ul),0)*100 AS live_imprecision_pct,
 l.mean_volume_ul,l.std_dev_ul,l.inaccuracy_actual_pct,l.imprecision_actual_pct
FROM calibration_lots l LEFT JOIN calibration_readings r ON r.calibration_lot_id=l.id GROUP BY l.id;
CREATE VIEW v_volume_results AS
SELECT v.id,v.calibration_session_id,v.nominal_volume_ul,count(r.id) AS live_reading_count,
 avg(r.volume_ul) AS live_mean_volume_ul,stddev_samp(r.volume_ul) AS live_std_dev_ul,
 (avg(r.volume_ul)-v.nominal_volume_ul)/v.nominal_volume_ul*100 AS live_inaccuracy_pct,
 stddev_samp(r.volume_ul)/nullif(avg(r.volume_ul),0)*100 AS live_imprecision_pct,
 v.mean_volume_ul,v.std_dev_ul,v.inaccuracy_actual_pct,v.imprecision_actual_pct,
 v.inaccuracy_result,v.imprecision_result
FROM calibration_volume_results v LEFT JOIN calibration_lots l ON l.calibration_volume_result_id=v.id
LEFT JOIN calibration_readings r ON r.calibration_lot_id=l.id GROUP BY v.id;
CREATE VIEW v_asset_trace AS
SELECT a.id AS asset_id,a.inventory_number,a.serial_number,a.invoice_number,a.progress,
 c.id AS customer_id,c.customer_name,c.department,t.range_label,t.channel,t.make,t.model,
 s.id AS session_id,s.session_no,s.status,s.process_date,s.due_date,s.reminder_date,
 s.inaccuracy_status,s.imprecision_status,s.final_status,d.id AS lab_dimension_id,
 d.dd_water_temp_c,d.room_temp_c,d.humidity_pct,d.air_pressure_hpa,d.z_correction_value,d.z_source_version,
 b.make_model AS balance_model,b.serial_number AS balance_serial,b.calibration_due_date AS balance_due,
 air.make_model AS air_model,air.serial_number AS air_serial,air.calibration_due_date AS air_due,
 w.make_model AS water_model,w.serial_number AS water_serial,w.calibration_due_date AS water_due,
 ac.id AS certificate_id,ac.storage_key
FROM assets a JOIN customers c ON c.id=a.customer_id JOIN range_thresholds t ON t.id=a.range_threshold_id
LEFT JOIN calibration_sessions s ON s.asset_id=a.id LEFT JOIN lab_dimensions d ON d.id=s.lab_dimension_id
LEFT JOIN instruments b ON b.id=d.balance_instrument_id LEFT JOIN instruments air ON air.id=d.air_instrument_id
LEFT JOIN instruments w ON w.id=d.water_thermometer_instrument_id
LEFT JOIN asset_certifications ac ON ac.calibration_session_id=s.id AND ac.voided_at IS NULL;
COMMIT;