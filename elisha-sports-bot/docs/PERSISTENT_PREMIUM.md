# Persistent Premium subscriptions and manual payments

Premium subscriptions and transaction-ID payment requests are stored in PostgreSQL when `DATABASE_URL` is configured. PostgreSQL is durable storage; the in-memory fallback used for local development and tests is not durable and is lost when the process restarts.

## Production setup

1. Create a persistent PostgreSQL database with a provider that retains data across application restarts/redeploys.
2. Set `NODE_ENV=production` and `DATABASE_URL` in the hosting provider's private environment variables. Do not commit database credentials.
3. From the `elisha-sports-bot` directory, apply the schema once:
   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/database/schema.sql
   ```
4. Set `MESSAGING_PROVIDER=whatsapp-cloud` and the real WhatsApp Cloud API credentials for live WhatsApp messages.
5. Set `PAYMENT_ADMIN_PHONES` to your administrator WhatsApp number in international digits, e.g. `2567XXXXXXXX`. Keep it private. If this is empty, the bot cannot notify an administrator or authorize an approval.
6. Restart/redeploy and check `/health`. Production startup now refuses to start if `DATABASE_URL` is missing, the database is unreachable, or the `subscriptions` / `manual_payment_requests` tables are missing.

## Payment flow

- The customer submits `PAY WEEK TRANSACTION_ID` (or DAY/MONTH).
- The bot records the request as `pending` and attempts to send the configured admin number a WhatsApp notification with the payment reference.
- Verify the transaction in the official merchant account, including the amount and recipient.
- Reply from the configured admin number with `APPROVE REFERENCE_NUMBER` or `REJECT REFERENCE_NUMBER`.
- Approval updates the payment record and subscription in PostgreSQL. An already-reviewed request cannot be approved again through the normal flow.

The transaction ID is only a claim until you independently verify it in the merchant account. Never ask for a Mobile Money PIN or OTP.

## Restart check

After approving a test subscription, restart/redeploy the application and send a Premium-only command from that same customer account. The subscription remains active until its recorded expiry, provided the same persistent PostgreSQL database is still configured and available.
