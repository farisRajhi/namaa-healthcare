const SAUDI_COUNTRY_CODE = '966';

function normalizeSaudiPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return SAUDI_COUNTRY_CODE + digits.slice(1);
  if (digits.startsWith(SAUDI_COUNTRY_CODE)) return digits;
  return SAUDI_COUNTRY_CODE + digits;
}

export function getWhatsAppLink(phone: string, prefilledText?: string): string {
  const digits = normalizeSaudiPhone(phone);
  const suffix = prefilledText ? `?text=${encodeURIComponent(prefilledText)}` : '';
  return `https://wa.me/${digits}${suffix}`;
}

export function isValidSaudiPhone(phone: string | null | undefined): phone is string {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}
