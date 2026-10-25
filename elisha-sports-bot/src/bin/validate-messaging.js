#!/usr/bin/env node

import { env } from '../config/env.js';
import { createMessagingAdapter, getAvailableProviders } from '../providers/messaging/factory.js';
import { logger } from '../utils/logger.js';

logger.info({ provider: env.MESSAGING_PROVIDER }, 'Validating messaging configuration');

try {
  const adapter = createMessagingAdapter(env.MESSAGING_PROVIDER);
  const status = adapter.getConfigStatus();

  console.log('\n✓ ELISHA SPORTS BOT - Messaging Configuration\n');
  console.log(`Provider: ${env.MESSAGING_PROVIDER}`);
  console.log(`Configured: ${status.configured ? 'YES' : 'NO'}`);
  console.log(`Endpoint: ${status.endpoint || 'N/A'}`);

  if (env.MESSAGING_PROVIDER === 'whatsapp-cloud') {
    console.log(`Access token set: ${status.tokenSet ? 'YES' : 'NO'}`);
    console.log(`Phone number ID set: ${status.phoneNumberIdSet ? 'YES' : 'NO'}`);
  }

  console.log(`\nAvailable providers: ${getAvailableProviders().join(', ')}`);
  console.log('\nTo send a test message, run: npm run test:messaging\n');

  process.exit(status.configured ? 0 : 1);
} catch (error) {
  console.error('\n✗ Configuration validation failed\n');
  console.error(error.message);
  console.error('\nSetup instructions:\n');
  console.error('1. Copy .env.example to .env');
  console.error('2. Set MESSAGING_PROVIDER to mock or whatsapp-cloud');
  console.error('3. For production, set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID');
  console.error('4. Run this script again to validate\n');
  process.exit(1);
}
