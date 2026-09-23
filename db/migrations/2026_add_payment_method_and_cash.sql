-- Additive migration for an existing dev database — run with:
--   node db/scripts/runSqlFile.js db/migrations/2026_add_payment_method_and_cash.sql
--
-- 1. Adds google_pay to the saved payment_methods type enum.
-- 2. Adds a `method` column to payments for one-off (unsaved) payment
--    choices — card/apple_pay/google_pay charged without saving a method,
--    or cash owed on job completion. NULL when payment_method_id is set.

ALTER TABLE payment_methods
  MODIFY COLUMN type ENUM('card','apple_pay','google_pay') NOT NULL;

ALTER TABLE payments
  ADD COLUMN method ENUM('card','apple_pay','google_pay','cash') NULL
    COMMENT 'Set for a one-off payment not backed by a saved payment_methods row (e.g. cash-on-completion, or a card/wallet charge the client chose not to save). NULL when payment_method_id is set — the method is read from there instead.'
    AFTER payment_method_id;
