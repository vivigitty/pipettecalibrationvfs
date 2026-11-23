BEGIN;
-- Calibration validity is fixed when the pipette is registered, not when calibration starts.
ALTER TABLE assets ADD COLUMN calibration_validity_months smallint NOT NULL DEFAULT 12;
ALTER TABLE assets ADD CONSTRAINT ck_asset_validity_months
  CHECK (calibration_validity_months BETWEEN 1 AND 60);
-- Environmental condition (and therefore calibration date) pre-assigned in bulk before calibration starts.
ALTER TABLE assets ADD COLUMN assigned_lab_dimension_id uuid REFERENCES lab_dimensions(id);
CREATE INDEX ix_assets_assigned_lab ON assets(assigned_lab_dimension_id);
COMMIT;
