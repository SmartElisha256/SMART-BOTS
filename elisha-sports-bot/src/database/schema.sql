CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, phone VARCHAR(30) NOT NULL UNIQUE, provider VARCHAR(30) DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY, phone VARCHAR(30) NOT NULL, plan VARCHAR(30) DEFAULT 'premium',
  is_active BOOLEAN DEFAULT TRUE, expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (phone, plan)
);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_subscriptions_phone_active ON subscriptions(phone, is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiry ON subscriptions(expires_at);

CREATE TABLE IF NOT EXISTS user_preferences (
  id SERIAL PRIMARY KEY, phone VARCHAR(30) NOT NULL UNIQUE, notifications_enabled BOOLEAN DEFAULT TRUE,
  preferred_team VARCHAR(80), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_preferences_phone ON user_preferences(phone);
CREATE INDEX IF NOT EXISTS idx_user_preferences_notifications ON user_preferences(notifications_enabled);

CREATE TABLE IF NOT EXISTS message_events (
  id SERIAL PRIMARY KEY, phone VARCHAR(30) NOT NULL, message_hash VARCHAR(255) NOT NULL,
  provider VARCHAR(30) DEFAULT 'whatsapp', content TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_message_events_phone ON message_events(phone);
CREATE INDEX IF NOT EXISTS idx_message_events_hash ON message_events(message_hash);
CREATE INDEX IF NOT EXISTS idx_message_events_created_at ON message_events(created_at DESC);

CREATE TABLE IF NOT EXISTS daily_usage (
  id BIGSERIAL PRIMARY KEY, phone VARCHAR(30) NOT NULL, usage_date DATE NOT NULL,
  requests_used INTEGER NOT NULL DEFAULT 0 CHECK (requests_used >= 0),
  outgoing_messages INTEGER NOT NULL DEFAULT 0 CHECK (outgoing_messages >= 0),
  daily_quota_notice_sent_at TIMESTAMPTZ,
  monthly_quota_notice_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (phone, usage_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_usage_phone_date ON daily_usage(phone, usage_date DESC);

CREATE TABLE IF NOT EXISTS sports_cache (
  id SERIAL PRIMARY KEY, cache_key VARCHAR(255) NOT NULL UNIQUE, data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sports_cache_key ON sports_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_sports_cache_expires_at ON sports_cache(expires_at);

CREATE TABLE IF NOT EXISTS manual_payment_requests (
  id BIGSERIAL PRIMARY KEY, phone VARCHAR(30) NOT NULL, transaction_id VARCHAR(100) UNIQUE,
  amount_ugx INTEGER NOT NULL CHECK (amount_ugx > 0), network VARCHAR(40) NOT NULL,
  plan_duration_days INTEGER NOT NULL DEFAULT 7 CHECK (plan_duration_days IN (1, 7, 30)),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by VARCHAR(30), reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE manual_payment_requests ADD COLUMN IF NOT EXISTS plan_duration_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE manual_payment_requests DROP CONSTRAINT IF EXISTS manual_payment_requests_check;
ALTER TABLE manual_payment_requests DROP COLUMN IF EXISTS screenshot_media_id;
CREATE INDEX IF NOT EXISTS idx_manual_payment_requests_phone ON manual_payment_requests(phone);
CREATE INDEX IF NOT EXISTS idx_manual_payment_requests_status ON manual_payment_requests(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_payment_transaction_unique ON manual_payment_requests(transaction_id);

-- Audit trail for admin payment decisions (APPROVE / REJECT / SETPLAN).
CREATE TABLE IF NOT EXISTS payment_audit_log (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT NOT NULL,
  action VARCHAR(40) NOT NULL,
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  admin_phone VARCHAR(30) NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_audit_payment_id ON payment_audit_log(payment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_audit_admin ON payment_audit_log(admin_phone, created_at DESC);
