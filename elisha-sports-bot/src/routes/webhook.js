import { Router } from 'express';
import { handleIncomingWebhook, handleVerifyWebhook } from '../controllers/webhookController.js';

export const webhookRouter = Router();

webhookRouter.get('/', handleVerifyWebhook);
webhookRouter.post('/', handleIncomingWebhook);
