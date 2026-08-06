export interface CreateBookingBodyDto {
  unitId?: string;
  propertyId?: string;
  checkIn: string;
  checkOut: string;
  guestCount?: number;
  roomType?: string;
  nightlyRate?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface WhatsappWebhookBodyDto {
  Body?: string;
  MessageSid?: string;
  From?: string;
  ButtonText?: string;
  ButtonPayload?: string;
}
