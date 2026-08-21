-- Drops the credit and the stored return-leg split. Credits already given are
-- lost from the record, though the reduced totals they produced stand.
ALTER TABLE orders
    DROP COLUMN IF EXISTS return_leg_rwf,
    DROP COLUMN IF EXISTS backfill_credit_rwf,
    DROP COLUMN IF EXISTS backfilled_by_order_id;
