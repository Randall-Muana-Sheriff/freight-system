ALTER TABLE orders DROP COLUMN IF EXISTS recipient_phone;
ALTER TABLE orders DROP COLUMN IF EXISTS recipient_name;
ALTER TABLE delivery_confirmations DROP COLUMN IF EXISTS location_flagged;
ALTER TABLE delivery_confirmations DROP COLUMN IF EXISTS distance_from_target_m;
