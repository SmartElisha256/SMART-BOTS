# Growth, accuracy, and revenue features

Branch: `feat/growth-accuracy-revenue`

## Accuracy

| Feature | How it works |
|---------|----------------|
| **Prediction logs** | Every TIP/ANALYZE model output is stored in `prediction_logs` |
| **Quality gate** | Low confidence / &lt;20 historical matches → tip refused, not sold |
| **AI cost skip** | AI explanation skipped when model fails the quality gate |
| **Training** | See `docs/HISTORICAL_DATA.md` — expand CSVs and retrain |

Apply migration:

```bash
psql $DATABASE_URL -f src/database/migrations/20261023_growth_features.sql
```

## Productivity

| Feature | How |
|---------|-----|
| **Customer notify** | On APPROVE/REJECT, customer gets WhatsApp confirmation |
| **Expiry reminders** | Hourly job notifies Premium users within 24h of expiry |
| **TEAM command** | `TEAM Arsenal` saves favourite; `FORM` uses it if no arg |
| **Admin digest** | `GET /admin/api/digest` — pending payments, accuracy, queue |

Ensure worker is running:

```bash
npm start
npm run worker
```

Call once after deploy (or rely on `ensureExpiryReminderSchedule` if wired in server):

```js
import { ensureExpiryReminderSchedule } from './src/jobs/queue.js';
await ensureExpiryReminderSchedule();
```

## Revenue / conversion

| Feature | How |
|---------|-----|
| **Soft upgrade prompt** | After ~3 free replies (env `CONVERSION_FREE_REPLIES`), once per 24h |
| **Day / Week / Month** | Existing MoMo plans — match-day impulse via DAY |
| **Honest copy** | Prompts never claim guaranteed winnings |

## Scoreboard (manual weekly)

- Free → first PAY submissions
- Approve rate and time-to-approve
- Premium renewals (expiry reminders sent vs renewed)
- `prediction_logs` hit rate after you resolve results

## What still needs your ops work

1. More real historical match CSVs + `train.py`
2. Manually or via script fill `actual_1x2` on `prediction_logs` after matches
3. MoMo collection API when pending volume is high
4. Merge earlier P0–P2 branches if not already on `main`
