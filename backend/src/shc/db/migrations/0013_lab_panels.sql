-- Qualitative lab results + panel grouping.
-- Existing labs.value (DOUBLE) stays for trended numerics. New columns
-- support categorical results ("Negative", "Non Reactive", "Yellow") and
-- group results by the panel/order they came from (e.g. "Urine Dipstick",
-- "HIV Ag/Ab Combo", "Comprehensive Metabolic Panel").

ALTER TABLE labs ADD COLUMN IF NOT EXISTS value_text   VARCHAR;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS panel        VARCHAR;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS is_abnormal  BOOLEAN;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS ref_text     VARCHAR;
