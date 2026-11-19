# Free-tier production stack ($0 APIs)

ELISHA can launch without paid football or AI subscriptions.

## Core (always works offline from your server)

| Feature | Dependency |
|---------|------------|
| MENU / HELP / quotas / Premium / feedback | Node + Postgres |
| ANALYZE match probabilities | Local Python ML (`football-analytics/`) |

Train models on the server:

```bash
cd football-analytics
python3 prepare_epl_data.py
python3 train.py --data data/epl_historical.csv
```

## Free football data

1. Register at https://www.football-data.org/client/register
2. Set:

```bash
SPORTS_DATA_PROVIDER=football-data
SPORTS_API_BASE_URL=https://api.football-data.org/v4
FOOTBALL_DATA_API_KEY=your_free_token
```

Free tier is about **10 requests/minute**. Redis cache (fixtures ~10 min, table ~15 min) multiplies how many WhatsApp users you can serve.

On rate limit or outage the bot serves **last cached** data when available, or tells the user to retry — **ANALYZE still works**.

## Optional free AI chat

1. Create a key at https://openrouter.ai
2. Set:

```bash
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_STYLE=auto
OPENAI_MODEL=openrouter/free
```

Pick any current model id ending in `:free` from OpenRouter’s models page if `openrouter/free` is unavailable.

Leave `OPENAI_API_KEY` empty if you have no AI budget. Production **does not require** AI.

Free OpenRouter models are typically limited (~50 requests/day until you buy credits). Only use AI for open questions, not every ANALYZE.

## Production env checklist ($0 APIs)

- [ ] Postgres + Redis
- [ ] Trained ML models on disk
- [ ] WhatsApp Cloud credentials
- [ ] `FOOTBALL_DATA_API_KEY` (free)
- [ ] Optional OpenRouter key
- [ ] Admin + MoMo settings for Premium

## When Premium revenue arrives

1. Keep caching.
2. Top up OpenRouter (~$10) for higher free-model daily caps, or switch to a cheap paid model.
3. Upgrade football data only if live coverage becomes the bottleneck.
