import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'ELISHA SPORTS BOT',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});
