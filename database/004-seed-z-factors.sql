\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE z_import (temperature_c numeric,pressure_kpa numeric,z_value numeric,source_version varchar(80));
\copy z_import FROM 'z_factors_iso8655.csv' WITH (FORMAT csv,HEADER true)
DO $$ BEGIN
 IF (SELECT count(*) FROM z_import)<>217 OR (SELECT count(DISTINCT (temperature_c,pressure_kpa)) FROM z_import)<>217 THEN
  RAISE EXCEPTION 'ISO table must contain 217 distinct grid points';
 END IF;
END $$;
INSERT INTO z_factor_references(temperature_c,pressure_kpa,z_value,source_version)
SELECT temperature_c,pressure_kpa,z_value,source_version FROM z_import
ON CONFLICT (temperature_c,pressure_kpa,source_version) DO NOTHING;
COMMIT;