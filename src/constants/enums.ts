export const USER_ROLES = ['guest', 'host', 'admin'] as const;
export const AUTH_REGISTER_ROLES = ['guest', 'host'] as const;
export const PROPERTY_TYPES = ['hotel', 'shortlet'] as const;
export const EMAIL_OTP_PURPOSES = ['register', 'login', 'forgot_password'] as const;
export const AMENITIES = [
	'wifi',
	'air_conditioning',
	'power_backup',
	'parking',
	'restaurant',
	'bar',
	'gym',
	'swimming_pool',
	'laundry_service',
	'security',
	'breakfast',
	'kitchen',
	'room_service',
	'spa',
	'conference_room',
	'elevator',
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type AuthRegisterRole = (typeof AUTH_REGISTER_ROLES)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type EmailOtpPurpose = (typeof EMAIL_OTP_PURPOSES)[number];
export type Amenity = (typeof AMENITIES)[number];