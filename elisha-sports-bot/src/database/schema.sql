CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL UNIQUE,
  provider VARCHAR(30) DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL,
  plan VARCHAR(30) DEFAULT 'premium',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (phone, plan)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_phone_active ON subscriptions(phone, is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);

CREATE TABLE IF NOT EXISTS user_preferences (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL UNIQUE,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  preferred_team VARCHAR(80),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_phone ON user_preferences(phone);
CREATE INDEX IF NOT EXISTS idx_user_preferences_notifications ON user_preferences(notifications_enabled);

CREATE TABLE IF NOT EXISTS message_events (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL,
  message_hash VARCHAR(255) NOT NULL,
  provider VARCHAR(30) DEFAULT 'whatsapp',
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_events_phone ON message_events(phone);
CREATE INDEX IF NOT EXISTS idx_message_events_hash ON message_events(message_hash);
CREATE INDEX IF NOT EXISTS idx_message_events_created_at ON message_events(created_at DESC);

-- Daily quota counters use Kampala's calendar date and are shared across app instances.
CREATE TABLE IF NOT EXISTS daily_usage (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL,
  usage_date DATE NOT NULL,
  requests_used INTEGER NOT NULL DEFAULT 0 CHECK (requests_used >= 0),
  outgoing_messages INTEGER NOT NULL DEFAULT 0 CHECK (outgoing_messages >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (phone, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_usage_phone_date ON daily_usage(phone, usage_date DESC);

-- Cache table for sports data
CREATE TABLE IF NOT EXISTS sports_cache (
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(255) NOT NULL UNIQUE,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sports_cache_key ON sports_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_sports_cache_expires_at ON sports_cache(expires_at);
