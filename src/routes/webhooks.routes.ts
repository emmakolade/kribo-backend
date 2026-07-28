import { Router } from 'express';
import { z } from 'zod';
import { paystackWebhookController, whatsappWebhookController } from '../controllers/bookings.controller';
import { validate } from '../middleware/validate.middleware';

const webhookSchema = z.object({
  body: z.union([
    z.object({
      bookingId: z.string(),
      decision: z.enum(['accept', 'decline']),
      webhookId: z.string(),
    }),
    z
      .object({
        Body: z.string().optional(),
        MessageSid: z.string().optional(),
        From: z.string().optional(),
      })
      .passthrough(),
  ]),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const webhooksRouter = Router();

webhooksRouter.post('/whatsapp', validate(webhookSchema), whatsappWebhookController);
webhooksRouter.post('/paystack', paystackWebhookController);
