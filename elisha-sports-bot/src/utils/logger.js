import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'elisha-sports-bot'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

export default logger;
