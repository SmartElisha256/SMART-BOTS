import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  listPendingPayments,
  approvePayment,
  rejectPayment,
  setPaymentPlan,
  getPaymentRequestByReference
} from '../services/manualPaymentService.js';
import { afterPaymentApproved, afterPaymentRejected } from '../services/paymentNotifyHook.js';
import { getUserSubscriptions } from '../services/subscriptionService.js';
import { getPredictionAccuracySummary } from '../services/predictionLogService.js';
import pool from '../database/pool.js';
import { env } from '../config/env.js';
import { getQueueStats } from '../jobs/queue.js';
import { getMlCircuitState } from '../services/footballMlService.js';
import { getAiCircuitState } from '../services/footballAssistantService.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

function adminPhone() {
  const phones = String(env.PAYMENT_ADMIN_PHONES || '')
    .split(',')
    .map((p) => p.trim().replace(/[^0-9]/g, ''))
    .filter(Boolean);
  return phones[0] || 'admin-dashboard';
}

adminRouter.get('/api/status', async (req, res) => {
  const queue = await getQueueStats();
  res.json({
    ok: true,
    environment: env.NODE_ENV,
    messagingProvider: env.MESSAGING_PROVIDER,
    sportsDataProvider: env.SPORTS_DATA_PROVIDER,
    queue,
    circuits: {
      ml: getMlCircuitState(),
      ai: getAiCircuitState()
    }
  });
});

adminRouter.get('/api/digest', async (req, res) => {
  let pending = 0;
  let premiumActive = 0;
  if (pool) {
    try {
      const p = await pool.query(
        "SELECT COUNT(*)::int AS c FROM manual_payment_requests WHERE status = 'pending' AND transaction_id IS NOT NULL"
      );
      pending = Number(p.rows[0]?.c ?? 0);
      const s = await pool.query(
        "SELECT COUNT(*)::int AS c FROM subscriptions WHERE is_active = TRUE AND plan = 'premium' AND (expires_at IS NULL OR expires_at > NOW())"
      );
      premiumActive = Number(s.rows[0]?.c ?? 0);
    } catch {
      /* tables may be incomplete */
    }
  }
  const accuracy = await getPredictionAccuracySummary();
  const queue = await getQueueStats();
  res.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    pendingPayments: pending,
    activePremium: premiumActive,
    accuracy,
    queue,
    circuits: { ml: getMlCircuitState(), ai: getAiCircuitState() }
  });
});

adminRouter.get('/api/payments/pending', async (req, res) => {
  const page = Number(req.query.page) || 1;
  const text = await listPendingPayments({ adminPhone: adminPhone(), page });
  let rows = [];
  if (pool) {
    const result = await pool.query(
      `SELECT id, phone, transaction_id, amount_ugx, plan_duration_days, status, created_at
         FROM manual_payment_requests
        WHERE status = 'pending' AND transaction_id IS NOT NULL
        ORDER BY created_at ASC, id ASC
        LIMIT 50`
    );
    rows = result.rows;
  }
  res.json({ ok: true, page, text, rows });
});

adminRouter.post('/api/payments/:id/approve', async (req, res) => {
  const message = await approvePayment({
    adminPhone: adminPhone(),
    paymentReference: req.params.id
  });
  const ok = !message.startsWith('⛔') && !message.startsWith('No pending');
  if (ok) {
    await afterPaymentApproved(req.params.id).catch(() => {});
  }
  res.json({ ok, message });
});

adminRouter.post('/api/payments/:id/reject', async (req, res) => {
  // Capture phone before reject clears pending row shape
  const before = await getPaymentRequestByReference(req.params.id);
  const message = await rejectPayment({
    adminPhone: adminPhone(),
    paymentReference: req.params.id
  });
  const ok = !message.startsWith('⛔') && !message.startsWith('No pending');
  if (ok && before) {
    await afterPaymentRejected(req.params.id).catch(() => {});
  }
  res.json({ ok, message });
});

adminRouter.post('/api/payments/:id/plan', async (req, res) => {
  const planKey = String(req.body?.plan || req.query.plan || '').toLowerCase();
  const message = await setPaymentPlan({
    adminPhone: adminPhone(),
    paymentReference: req.params.id,
    planKey
  });
  res.json({ ok: message.startsWith('✅'), message });
});

adminRouter.get('/api/payments/:id', async (req, res) => {
  const payment = await getPaymentRequestByReference(req.params.id);
  if (!payment) return res.status(404).json({ ok: false, message: 'Payment not found' });
  res.json({ ok: true, payment });
});

adminRouter.get('/api/users/:phone', async (req, res) => {
  const phone = String(req.params.phone || '').replace(/[^0-9]/g, '');
  if (!phone) return res.status(400).json({ ok: false, message: 'Invalid phone' });

  const subscriptions = await getUserSubscriptions(phone);
  let usage = [];
  let payments = [];

  if (pool) {
    const usageResult = await pool.query(
      `SELECT usage_date, requests_used, outgoing_messages
         FROM daily_usage WHERE phone = $1
         ORDER BY usage_date DESC LIMIT 14`,
      [phone]
    );
    usage = usageResult.rows;

    const payResult = await pool.query(
      `SELECT id, transaction_id, amount_ugx, plan_duration_days, status, created_at, reviewed_at
         FROM manual_payment_requests WHERE phone = $1
         ORDER BY created_at DESC LIMIT 20`,
      [phone]
    );
    payments = payResult.rows;
  }

  res.json({ ok: true, phone, subscriptions, usage, payments });
});

adminRouter.get('/api/audit', async (req, res) => {
  if (!pool) return res.json({ ok: true, rows: [] });
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const result = await pool.query(
      `SELECT id, payment_id, action, previous_status, new_status, admin_phone, details, created_at
         FROM payment_audit_log
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );
    res.json({ ok: true, rows: result.rows });
  } catch {
    res.json({ ok: true, rows: [], note: 'payment_audit_log table may not exist yet' });
  }
});

adminRouter.get('/', (req, res) => {
  const key = String(req.query.key || '');
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ELISHA Admin</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
    body { max-width: 960px; margin: 0 auto; padding: 1.25rem; }
    h1 { font-size: 1.25rem; margin: 0 0 1rem; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { text-align: left; padding: 0.45rem 0.35rem; border-bottom: 1px solid #e2e8f0; }
    button { cursor: pointer; border: 0; border-radius: 6px; padding: 0.35rem 0.65rem; margin-right: 0.25rem; }
    .ok { background: #16a34a; color: #fff; }
    .bad { background: #dc2626; color: #fff; }
    input { padding: 0.4rem 0.55rem; border: 1px solid #cbd5e1; border-radius: 6px; }
    .muted { color: #64748b; font-size: 0.85rem; }
    pre { white-space: pre-wrap; background: #f1f5f9; padding: 0.75rem; border-radius: 8px; font-size: 0.8rem; }
  </style>
</head>
<body>
  <h1>ELISHA SPORTS BOT — Admin</h1>
  <p class="muted">Private dashboard. Keep the admin key secret.</p>
  <div class="card"><strong>Digest</strong><pre id="digest">Loading…</pre></div>
  <div class="card"><strong>Status</strong><pre id="status">Loading…</pre></div>
  <div class="card"><strong>Pending payments</strong><div id="payments">Loading…</div></div>
  <div class="card">
    <strong>User lookup</strong>
    <form id="lookupForm">
      <input name="phone" placeholder="Phone e.g. 2567…" required />
      <button type="submit" class="ok">Lookup</button>
    </form>
    <pre id="userResult"></pre>
  </div>
  <div class="card"><strong>Recent audit log</strong><pre id="audit">Loading…</pre></div>
<script>
const KEY = ${JSON.stringify(key)};
async function api(path, opts = {}) {
  const res = await fetch(path + (path.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(KEY), {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-admin-key': KEY, ...(opts.headers || {}) }
  });
  return res.json();
}
async function loadDigest() {
  document.getElementById('digest').textContent = JSON.stringify(await api('/admin/api/digest'), null, 2);
}
async function loadStatus() {
  document.getElementById('status').textContent = JSON.stringify(await api('/admin/api/status'), null, 2);
}
async function loadPayments() {
  const data = await api('/admin/api/payments/pending');
  const el = document.getElementById('payments');
  if (!data.rows || !data.rows.length) { el.innerHTML = '<p class="muted">No pending payments.</p>'; return; }
  el.innerHTML = '<table><thead><tr><th>ID</th><th>Phone</th><th>Txn</th><th>Amount</th><th>Days</th><th></th></tr></thead><tbody>' +
    data.rows.map(r => '<tr><td>' + r.id + '</td><td>' + r.phone + '</td><td>' + (r.transaction_id||'') + '</td><td>UGX ' + Number(r.amount_ugx).toLocaleString() + '</td><td>' + r.plan_duration_days + '</td><td><button class="ok" data-act="approve" data-id="' + r.id + '">Approve</button><button class="bad" data-act="reject" data-id="' + r.id + '">Reject</button></td></tr>').join('') +
    '</tbody></table>';
  el.querySelectorAll('button').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      const result = await api('/admin/api/payments/' + btn.dataset.id + '/' + btn.dataset.act, { method: 'POST' });
      alert(result.message || JSON.stringify(result));
      loadPayments(); loadAudit(); loadDigest();
    };
  });
}
async function loadAudit() {
  document.getElementById('audit').textContent = JSON.stringify((await api('/admin/api/audit?limit=30')).rows || [], null, 2);
}
document.getElementById('lookupForm').onsubmit = async (e) => {
  e.preventDefault();
  const phone = new FormData(e.target).get('phone');
  document.getElementById('userResult').textContent = JSON.stringify(await api('/admin/api/users/' + encodeURIComponent(phone)), null, 2);
};
loadDigest(); loadStatus(); loadPayments(); loadAudit();
setInterval(() => { loadPayments(); loadStatus(); loadDigest(); }, 30000);
</script>
</body>
</html>`);
});
