-- Prediction feedback loop (accuracy tracking)
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

-- Soft conversion: track when we last showed an upgrade prompt
CREATE TABLE IF NOT EXISTS conversion_prompts (
  phone VARCHAR(30) PRIMARY KEY,
  free_replies INTEGER NOT NULL DEFAULT 0,
  last_prompt_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expiry reminder throttle
CREATE TABLE IF NOT EXISTS expiry_reminders (
  phone VARCHAR(30) NOT NULL,
  subscription_id INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (phone, expires_at)
);
