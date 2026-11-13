-- Align existing installations with manualPaymentService.submitPaymentProof().
-- Existing duplicate, non-null transaction IDs must be reviewed before uniqueness is enforced.
BEGIN;

ALTER TABLE manual_payment_requests
  ADD COLUMN IF NOT EXISTS network VARCHAR(40) NOT NULL DEFAULT 'not-configured';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM manual_payment_requests
    WHERE transaction_id IS NOT NULL
    GROUP BY transaction_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce unique payment transaction IDs: duplicate non-null transaction_id values exist. Review duplicates in manual_payment_requests, preserve payment history, then rerun this migration.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_payment_transaction_id_unique
  ON manual_payment_requests(transaction_id);

COMMIT;
