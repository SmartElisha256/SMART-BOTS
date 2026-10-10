import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('postgresql://postgres:change-me@localhost:5432/elisha_sports_bot'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default('replace-me'),
  WHATSAPP_TOKEN: z.string().default('replace-me'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default('replace-me'),
  WHATSAPP_API_BASE_URL: z.string().default('https://graph.facebook.com/v19.0'),
  CALLMEBOT_API_URL: z.string().default('https://api.callmebot.com/whatsapp.php'),
  CALLMEBOT_TOKEN: z.string().default('replace-me'),
  SPORTS_API_BASE_URL: z.string().optional().default(''),
  SPORTS_API_KEY: z.string().optional().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')
});

export const env = envSchema.parse(process.env);

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
