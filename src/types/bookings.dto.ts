export interface CreateBookingBodyDto {
  unitId: string;
  checkIn: string;
  checkOut: string;
}

export interface WhatsappWebhookBodyDto {
  Body?: string;
  MessageSid?: string;
  From?: string;
  bookingId?: string;
  decision?: 'accept' | 'decline';
  webhookId?: string;
}
