-- Payment decision audit trail (APPROVE / REJECT / SETPLAN).
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
