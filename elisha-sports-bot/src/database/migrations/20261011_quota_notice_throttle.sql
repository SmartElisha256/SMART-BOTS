-- Throttle quota-limit notices so repeated over-limit commands do not
-- generate repeated, potentially chargeable WhatsApp messages.
ALTER TABLE daily_usage
  ADD COLUMN IF NOT EXISTS daily_quota_notice_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monthly_quota_notice_sent_at TIMESTAMPTZ;
