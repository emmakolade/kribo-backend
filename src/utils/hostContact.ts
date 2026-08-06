type HostWithComplianceContact = {
  hostCompliance?: {
    businessContact?: {
      trustedWhatsappNumber?: string | null;
    } | null;
  } | null;
};

export function getHostTrustedWhatsappNumber(host: HostWithComplianceContact): string | null {
  const trustedPhone = host.hostCompliance?.businessContact?.trustedWhatsappNumber;
  if (typeof trustedPhone !== 'string') {
    return null;
  }

  const normalized = trustedPhone.trim();
  return normalized.length > 0 ? normalized : null;
}
