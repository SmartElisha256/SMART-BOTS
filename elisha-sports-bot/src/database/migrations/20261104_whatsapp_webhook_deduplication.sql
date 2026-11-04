-- Durable WhatsApp webhook deduplication and safe retry state.
BEGIN;
CREATE TABLE IF NOT EXISTS whatsapp_webhook_messages (
  message_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(20) NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_messages_status_updated
  ON whatsapp_webhook_messages(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_messages_created
  ON whatsapp_webhook_messages(created_at);
COMMIT;
