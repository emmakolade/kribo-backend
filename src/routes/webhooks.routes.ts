import { Router } from 'express';
import { z } from 'zod';
import { whatsappWebhookController } from '../controllers/bookings.controller';
import { paystackWebhookController } from '../controllers/payments.controller';
import { validate } from '../middleware/validate.middleware';

const webhookSchema = z.object({
  body: z
    .object({
      Body: z.string().optional(),
      MessageSid: z.string().optional(),
      From: z.string().optional(),
      ButtonText: z.string().optional(),
      ButtonPayload: z.string().optional(),
    })
    .passthrough(),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const webhooksRouter = Router();

webhooksRouter.post('/whatsapp', validate(webhookSchema), whatsappWebhookController);
webhooksRouter.post('/paystack', paystackWebhookController);
