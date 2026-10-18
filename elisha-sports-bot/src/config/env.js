import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000).refine((p) => p > 0 && p < 65536, 'PORT must be between 1 and 65535'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').default('postgresql://postgres:change-me@localhost:5432/elisha_sports_bot'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required').default('redis://localhost:6379'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default('replace-me'),
  WHATSAPP_TOKEN: z.string().default('replace-me'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default('replace-me'),
  WHATSAPP_API_BASE_URL: z.string().url().default('https://graph.facebook.com/v19.0'),
  WHATSAPP_APP_SECRET: z.string().optional().default(''),
  WHATSAPP_API_VERSION: z.string().default('v19.0'),
  CALLMEBOT_API_KEY: z.string().default('replace-me'),
  CALLMEBOT_PHONE: z.string().default('replace-me'),
  CALLMEBOT_ENDPOINT: z.string().url().default('https://api.callmebot.com/whatsapp.php'),
  MESSAGING_PROVIDER: z.enum(['mock', 'callmebot', 'whatsapp-cloud']).default('mock'),
  SPORTS_DATA_PROVIDER: z.enum(['mock', 'api-football']).default('mock'),
  SPORTS_API_BASE_URL: z.string().url().default('https://v3.football.api-sports.io'),
  SPORTS_API_KEY: z.string().optional().default(''),
  SPORTS_API_LEAGUE_ID: z.string().default('39'),
  SPORTS_API_SEASON: z.coerce.number().int().min(2000).default(new Date().getFullYear()),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CACHE_TTL_FIXTURES: z.coerce.number().int().positive().default(600),
  CACHE_TTL_TABLE: z.coerce.number().int().positive().default(900),
  CACHE_TTL_FORM: z.coerce.number().int().positive().default(1800),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  JOB_CONCURRENCY: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_DURATION: z.coerce.number().int().positive().default(60),
  FREE_DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().default(20),
  PREMIUM_DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().default(200),
  PREMIUM_MONTHLY_REQUEST_LIMIT: z.coerce.number().int().positive().default(300),
  PREMIUM_PRICE_UGX: z.coerce.number().int().nonnegative().default(5000),
  PREMIUM_PRICE_DAY_UGX: z.coerce.number().int().positive().default(1000),
  PREMIUM_PRICE_WEEK_UGX: z.coerce.number().int().positive().default(5000),
  PREMIUM_PRICE_MONTH_UGX: z.coerce.number().int().positive().default(15000),
  MOMO_NETWORK: z.string().default(''),
  MOMO_MERCHANT_CODE: z.string().default('SET_YOUR_MERCHANT_CODE'),
  MOMO_MERCHANT_NAME: z.string().default(''),
  PAYMENT_ADMIN_PHONES: z.string().default(''),
  // Private web admin dashboard (/admin). Required to use the dashboard.
  ADMIN_API_KEY: z.string().default('replace-me')
});

export const env = envSchema.parse(process.env);

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function isPlaceholder(value) {
  const v = String(value ?? '').trim();
  return !v || v === 'replace-me' || v === 'SET_YOUR_MERCHANT_CODE' || v === 'change-me';
}

export function validateEnvironment() {
  const requiredVars = ['DATABASE_URL', 'REDIS_URL'];
  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const productionIssues = [];
  if (env.NODE_ENV === 'production') {
    if (env.MESSAGING_PROVIDER === 'whatsapp-cloud') {
      if (isPlaceholder(env.WHATSAPP_TOKEN)) productionIssues.push('WHATSAPP_TOKEN');
      if (isPlaceholder(env.WHATSAPP_PHONE_NUMBER_ID)) productionIssues.push('WHATSAPP_PHONE_NUMBER_ID');
      if (isPlaceholder(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)) productionIssues.push('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
      if (isPlaceholder(env.WHATSAPP_APP_SECRET)) productionIssues.push('WHATSAPP_APP_SECRET');
    }
    if (isPlaceholder(env.MOMO_MERCHANT_CODE) || isPlaceholder(env.MOMO_MERCHANT_NAME) || !env.MOMO_NETWORK) {
      productionIssues.push('MOMO_NETWORK / MOMO_MERCHANT_CODE / MOMO_MERCHANT_NAME');
    }
    if (!String(env.PAYMENT_ADMIN_PHONES || '').trim()) {
      productionIssues.push('PAYMENT_ADMIN_PHONES');
    }
    if (isPlaceholder(env.DATABASE_URL) || env.DATABASE_URL.includes('change-me')) {
      productionIssues.push('DATABASE_URL');
    }
  }

  if (productionIssues.length) {
    throw new Error(
      'Production configuration incomplete. Replace placeholders for: ' + productionIssues.join(', ')
    );
  }

  return {
    ok: true,
    validated: true,
    environment: env.NODE_ENV,
    port: env.PORT,
    databaseConfigured: Boolean(env.DATABASE_URL),
    redisConfigured: Boolean(env.REDIS_URL),
    messagingProvider: env.MESSAGING_PROVIDER,
    sportsDataProvider: env.SPORTS_DATA_PROVIDER,
    sportsApiConfigured: Boolean(env.SPORTS_API_KEY),
    aiAnalysisConfigured: Boolean(env.OPENAI_API_KEY),
    adminDashboardConfigured: !isPlaceholder(env.ADMIN_API_KEY),
    dailyRequestLimits: {
      free: env.FREE_DAILY_REQUEST_LIMIT,
      premium: env.PREMIUM_DAILY_REQUEST_LIMIT,
      premiumMonthly: env.PREMIUM_MONTHLY_REQUEST_LIMIT
    },
    manualPaymentsConfigured: Boolean(
      env.PREMIUM_PRICE_DAY_UGX > 0 &&
      env.PREMIUM_PRICE_WEEK_UGX > 0 &&
      env.PREMIUM_PRICE_MONTH_UGX > 0 &&
      env.MOMO_NETWORK &&
      env.MOMO_MERCHANT_CODE !== 'SET_YOUR_MERCHANT_CODE' &&
      env.MOMO_MERCHANT_NAME &&
      env.PAYMENT_ADMIN_PHONES
    ),
    cacheTTLs: {
      fixtures: env.CACHE_TTL_FIXTURES,
      table: env.CACHE_TTL_TABLE,
      form: env.CACHE_TTL_FORM
    }
  };
}
