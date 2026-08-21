-- Give back the empty-return charge when the return was not empty.
--
-- An out-of-city job is charged 70% of the fuel for driving home with nothing
-- to carry. When two jobs pair up -- one out to Rubavu, one back from it, on
-- the same run -- that drive happens loaded, and both customers were charged
-- for an empty leg neither of them caused. The money should go back.
--
-- Settled at delivery rather than at planning, for the same reason detention
-- is: a trip planned with both legs can lose one, and a credit promised on a
-- pairing that then falls apart has to be clawed back off a customer who was
-- already told the lower number. What actually happened is known at the end.
--
-- return_leg_rwf has to be stored for the credit to be exact. The quote has
-- always broken it out; the order only ever kept the fuel total, so there was
-- no way to say how much of it was the empty leg without re-deriving it from a
-- rate card that may since have been superseded.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS return_leg_rwf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS backfill_credit_rwf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS backfilled_by_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN orders.return_leg_rwf IS
    'The empty-return portion of price_fuel_rwf. Stored so a backfill credit is exact rather than re-derived from a rate card that may have moved.';
COMMENT ON COLUMN orders.backfill_credit_rwf IS
    'Refunded at delivery when another order on the same run collected near this one''s drop, so the return was not empty after all.';
COMMENT ON COLUMN orders.backfilled_by_order_id IS
    'The order that filled the return. Kept so a customer asking why their bill fell can be told which run it shared.';
