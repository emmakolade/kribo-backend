export interface CreateBookingBodyDto {
  unitId: string;
  checkIn: string;
  checkOut: string;
  paymentMethod?: 'card' | 'bank_transfer' | 'transfer';
}

export interface WhatsappWebhookBodyDto {
  Body?: string;
  MessageSid?: string;
  From?: string;
  bookingId?: string;
  decision?: 'accept' | 'decline';
  webhookId?: string;
}
