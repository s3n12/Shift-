export interface CountryDialOption {
  code: string;
  label: string;
  dialCode: string;
}

export const COUNTRY_DIAL_CODES: readonly CountryDialOption[] = [
  { code: 'IN', label: 'India (+91)', dialCode: '+91' },
  { code: 'US', label: 'United States (+1)', dialCode: '+1' },
  { code: 'GB', label: 'United Kingdom (+44)', dialCode: '+44' },
  { code: 'CA', label: 'Canada (+1)', dialCode: '+1' },
  { code: 'AU', label: 'Australia (+61)', dialCode: '+61' },
  { code: 'AE', label: 'UAE (+971)', dialCode: '+971' },
  { code: 'SG', label: 'Singapore (+65)', dialCode: '+65' },
  { code: 'DE', label: 'Germany (+49)', dialCode: '+49' },
  { code: 'FR', label: 'France (+33)', dialCode: '+33' },
  { code: 'JP', label: 'Japan (+81)', dialCode: '+81' },
  { code: 'BR', label: 'Brazil (+55)', dialCode: '+55' },
] as const;

export interface ParsedPhoneTarget {
  e164: string;
  maskedPhone: string;
}

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function maskPhoneNumber(e164: string): string {
  const cleaned = e164.trim();
  if (cleaned.length <= 6) return cleaned;
  const prefixLength = cleaned.startsWith('+1') ? 2 : cleaned.length >= 12 ? 3 : 2;
  const prefix = cleaned.slice(0, prefixLength);
  const lastFour = cleaned.slice(-4);
  const hiddenCount = Math.max(4, cleaned.length - prefixLength - 4);
  return `${prefix} ${'•'.repeat(hiddenCount)}${lastFour}`;
}

export function normalizePhoneNumber(
  rawInput: string,
  defaultDialCode = '+91'
): ParsedPhoneTarget {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    throw new Error('Please enter your mobile phone number.');
  }

  let candidate: string;
  if (trimmed.startsWith('+')) {
    candidate = `+${trimmed.slice(1).replace(/\D/g, '')}`;
  } else if (trimmed.startsWith('00')) {
    candidate = `+${trimmed.slice(2).replace(/\D/g, '')}`;
  } else {
    const cleanDial = `+${(defaultDialCode || '+91').replace(/\D/g, '')}`;
    const localDigits = trimmed.replace(/\D/g, '').replace(/^0+/, '');
    if (!localDigits) {
      throw new Error('Please enter a valid mobile phone number.');
    }
    candidate = `${cleanDial}${localDigits}`;
  }

  if (!E164_PATTERN.test(candidate)) {
    throw new Error(
      'Enter a valid phone number with country code (for example, +91 9876543210 or +1 4155552671).'
    );
  }

  return {
    e164: candidate,
    maskedPhone: maskPhoneNumber(candidate),
  };
}

export function formatFirebasePhoneError(error: unknown, hostname?: string): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '').toLowerCase()
      : '';
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : '';
  const lower = `${code} ${rawMessage}`.toLowerCase();

  if (lower.includes('auth/operation-not-allowed')) {
    return 'Phone sign-in is not enabled yet. Open Firebase Console → Authentication → Sign-in method and enable Phone.';
  }
  if (lower.includes('auth/billing-not-enabled')) {
    return 'Live SMS delivery requires the Firebase Blaze plan, or you can add a test phone number in Firebase Console → Authentication → Sign-in method → Phone → Phone numbers for testing.';
  }
  if (lower.includes('auth/unauthorized-domain')) {
    const hostLabel = hostname ? `"${hostname}"` : 'this domain';
    return `Add ${hostLabel} to Authorized Domains in Firebase Console (Authentication → Settings) to use Phone Sign-In here.`;
  }
  if (
    lower.includes('auth/invalid-phone-number') ||
    lower.includes('auth/missing-phone-number')
  ) {
    return 'Invalid phone number. Include the country code (for example, +91 9876543210 or +1 4155552671).';
  }
  if (lower.includes('auth/invalid-verification-code')) {
    return 'That 6-digit SMS code is incorrect. Please check the code and try again.';
  }
  if (
    lower.includes('auth/code-expired') ||
    lower.includes('auth/session-expired')
  ) {
    return 'This SMS code has expired. Tap Resend code to receive a new one.';
  }
  if (
    lower.includes('auth/too-many-requests') ||
    lower.includes('auth/quota-exceeded')
  ) {
    return 'Too many SMS attempts. Please wait a few minutes before requesting another code.';
  }
  if (
    lower.includes('auth/captcha-check-failed') ||
    lower.includes('auth/app-not-authorized') ||
    lower.includes('recaptcha')
  ) {
    return 'reCAPTCHA verification failed. Refresh the page and verify this domain is listed in Firebase Authorized Domains.';
  }
  if (lower.includes('auth/network-request-failed')) {
    return 'Network error while contacting Firebase Authentication. Please check your connection and try again.';
  }

  return rawMessage.trim() || 'Phone verification failed. Please try again.';
}
