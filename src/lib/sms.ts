import { sanitizeSecretEnv } from './secret-utils.ts';

export function getFast2SmsApiKey(): string | null {
  return sanitizeSecretEnv(process.env.FAST2SMS_API_KEY, 'FAST2SMS_API_KEY');
}

export function normalizeIndianPhone(input: string): string | null {
  const digitsOnly = (input || '').replace(/\D/g, '');
  let tenDigits = digitsOnly;

  if (tenDigits.length === 12 && tenDigits.startsWith('91')) {
    tenDigits = tenDigits.slice(2);
  } else if (tenDigits.length === 11 && tenDigits.startsWith('0')) {
    tenDigits = tenDigits.slice(1);
  }

  if (!/^\d{10}$/.test(tenDigits)) {
    return null;
  }
  return `+91${tenDigits}`;
}

export function normalizePhoneNumber(countryCode: string, localNumber: string): string | null {
  const cleanCode = countryCode.replace(/[^\d+]/g, '');
  const digits = localNumber.replace(/\D/g, '');
  if (cleanCode === '+91' || cleanCode === '91' || !cleanCode) {
    return normalizeIndianPhone(digits);
  }
  if (digits.length < 7 || digits.length > 15) return null;

  const prefix = cleanCode.startsWith('+') ? cleanCode : `+${cleanCode}`;
  const full = `${prefix}${digits}`;
  if (!/^\+\d{8,16}$/.test(full)) return null;
  return full;
}

export function maskPhoneNumber(e164: string): string {
  if (e164.length <= 6) return e164;
  if (e164.startsWith('+91') && e164.length === 13) {
    return `+91 ${e164.slice(3, 5)}****${e164.slice(-4)}`;
  }
  return `${e164.slice(0, 4)}****${e164.slice(-3)}`;
}

interface Fast2SmsResponse {
  return?: boolean;
  status_code?: number;
  message?: string | string[];
}

export async function sendOtpSms(
  toPhone: string,
  code: string
): Promise<{ delivered: 'sms' | 'preview'; notice?: string }> {
  const fast2smsKey = getFast2SmsApiKey();
  const messageText = `Your Shift verification code is ${code}. It expires in 5 minutes.`;

  // Fast2SMS Quick/OTP API (for Indian +91 10-digit numbers)
  if (fast2smsKey) {
    const indianTenDigit = toPhone.replace(/^\+91/, '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(indianTenDigit)) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.');
    }

    let response: Response;
    try {
      response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: fast2smsKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          route: 'q',
          message: messageText,
          language: 'english',
          flash: 0,
          numbers: indianTenDigit,
        }),
      });
    } catch (networkErr) {
      console.warn('Fast2SMS network error, falling back to preview mode:', networkErr);
      return {
        delivered: 'preview',
        notice:
          'Unable to reach Fast2SMS right now. Showing verification code in preview mode.',
      };
    }

    const rawBody = await response.text().catch(() => '');
    let parsed: Fast2SmsResponse | null = null;
    try {
      parsed = rawBody ? (JSON.parse(rawBody) as Fast2SmsResponse) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok || parsed?.return === false) {
      console.warn('Fast2SMS delivery unavailable:', response.status, parsed?.status_code ?? '');
      const apiMsg = Array.isArray(parsed?.message)
        ? parsed?.message.join(' ')
        : typeof parsed?.message === 'string'
          ? parsed.message
          : '';

      if (response.status === 401 || response.status === 403 || parsed?.status_code === 412) {
        return {
          delivered: 'preview',
          notice:
            'Fast2SMS rejected FAST2SMS_API_KEY (Invalid Authentication). Update FAST2SMS_API_KEY in Secrets or enable Phone Sign-In in Firebase Console to deliver real SMS.',
        };
      }

      return {
        delivered: 'preview',
        notice: apiMsg
          ? `Fast2SMS could not send SMS (${apiMsg}). Using preview code instead.`
          : 'Fast2SMS could not deliver SMS right now. Add a valid FAST2SMS_API_KEY in Secrets to deliver real SMS.',
      };
    }

    return { delivered: 'sms' };
  }

  // Fallback preview mode when FAST2SMS_API_KEY is missing from Secrets
  return { delivered: 'preview' };
}
