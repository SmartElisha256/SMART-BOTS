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
  cache_key VARCHAR(255) PRIMARY KEY,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sports_cache_expires ON sports_cache(expires_at);

CREATE TABLE IF NOT EXISTS manual_payment_requests (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL,
  transaction_id VARCHAR(120),
  amount_ugx INTEGER,
  plan_duration_days INTEGER,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  reviewed_by VARCHAR(30),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_manual_payments_status ON manual_payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_manual_payments_phone ON manual_payment_requests(phone);
CREATE INDEX IF NOT EXISTS idx_manual_payments_created ON manual_payment_requests(created_at DESC);

CREATE TABLE IF NOT EXISTS payment_audit_log (
  id BIGSERIAL PRIMARY KEY,
  payment_id INTEGER,
  action VARCHAR(40) NOT NULL,
  previous_status VARCHAR(30),
  new_status VARCHAR(30),
  admin_phone VARCHAR(30),
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_audit_created ON payment_audit_log(created_at DESC);

-- Growth / feedback tables (also in migrations/*.sql for existing installs)
CREATE TABLE IF NOT EXISTS prediction_logs (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(30),
  home_team VARCHAR(120) NOT NULL,
  away_team VARCHAR(120) NOT NULL,
  kickoff TIMESTAMPTZ,
  predicted_1x2 VARCHAR(10),
  home_win_prob NUMERIC(6,4),
  draw_prob NUMERIC(6,4),
  away_win_prob NUMERIC(6,4),
  confidence_level VARCHAR(20),
  historical_matches INTEGER,
  data_quality_status VARCHAR(30),
  model_version VARCHAR(80),
  source_command VARCHAR(40),
  actual_1x2 VARCHAR(10),
  actual_home_goals INTEGER,
  actual_away_goals INTEGER,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prediction_logs_created ON prediction_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_logs_unresolved ON prediction_logs(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prediction_logs_phone ON prediction_logs(phone);

CREATE TABLE IF NOT EXISTS conversion_prompts (
  phone VARCHAR(30) PRIMARY KEY,
  free_replies INTEGER NOT NULL DEFAULT 0,
  last_prompt_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expiry_reminders (
  phone VARCHAR(30) NOT NULL,
  subscription_id INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (phone, expires_at)
);

CREATE TABLE IF NOT EXISTS user_feedback (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created ON user_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_phone ON user_feedback(phone);
