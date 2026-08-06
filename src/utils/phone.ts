import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { AppError } from './AppError';

export interface NormalizedPhoneResult {
  e164: string;
  countryIso: string;
  countryDialCode: string;
}

function normalizeCountryIso(countryIso: string): CountryCode {
  return countryIso.trim().toUpperCase() as CountryCode;
}

export function normalizePhoneToE164(input: {
  rawPhone: string;
  countryIso: string;
  errorCode: string;
  errorMessage: string;
}): NormalizedPhoneResult {
  const normalizedCountryIso = normalizeCountryIso(input.countryIso);
  const phone = parsePhoneNumberFromString(input.rawPhone.trim(), normalizedCountryIso);

  if (!phone || !phone.isValid()) {
    throw new AppError(input.errorMessage, 400, input.errorCode);
  }

  return {
    e164: phone.number,
    countryIso: normalizedCountryIso,
    countryDialCode: `+${getCountryCallingCode(normalizedCountryIso)}`,
  };
}
