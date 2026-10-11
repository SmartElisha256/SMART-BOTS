-- Persist utility-command cooldowns across restarts and bot instances.
CREATE TABLE IF NOT EXISTS command_cooldowns (
  phone TEXT NOT NULL,
  command TEXT NOT NULL CHECK (command IN ('help', 'menu', 'upgrade')),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (phone, command)
);
