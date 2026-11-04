-- Durable feedback workflow and cross-instance rate limiting.
BEGIN;
ALTER TABLE user_feedback DROP CONSTRAINT IF EXISTS user_feedback_status_check;
ALTER TABLE user_feedback ADD CONSTRAINT user_feedback_status_check
  CHECK (status IN ('new', 'under_review', 'in_progress', 'resolved', 'rejected'));
UPDATE user_feedback SET status = 'under_review' WHERE status = 'reviewed';
CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  phone VARCHAR(30) PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submissions INTEGER NOT NULL DEFAULT 0 CHECK (submissions >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_rate_limits_updated ON feedback_rate_limits(updated_at);
COMMIT;
