CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL UNIQUE,
  provider VARCHAR(30) DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL,
  plan VARCHAR(30) DEFAULT 'premium',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (phone, plan)
);

CREATE TABLE IF NOT EXISTS message_events (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL,
  message_hash VARCHAR(255) NOT NULL,
  provider VARCHAR(30) DEFAULT 'whatsapp',
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
