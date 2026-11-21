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
): Promise<{ delivered: 'sms' | 'preview' }> {
  const fast2smsKey = process.env.FAST2SMS_API_KEY?.trim();
  const messageText = `Your Shift verification code is ${code}. It expires in 5 minutes.`;

  // 1. Fast2SMS Quick/OTP API (for Indian +91 10-digit numbers)
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
      console.error('Fast2SMS network error:', networkErr);
      throw new Error('Unable to reach the SMS service right now. Please try again.');
    }

    const rawBody = await response.text().catch(() => '');
    let parsed: Fast2SmsResponse | null = null;
    try {
      parsed = rawBody ? (JSON.parse(rawBody) as Fast2SmsResponse) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok || parsed?.return === false) {
      console.error('Fast2SMS delivery failed:', response.status, rawBody);
      const apiMsg = Array.isArray(parsed?.message)
        ? parsed?.message.join(' ')
        : typeof parsed?.message === 'string'
          ? parsed.message
          : '';
      if (response.status === 401 || response.status === 403 || parsed?.status_code === 412) {
        throw new Error(
          apiMsg
            ? `SMS delivery failed: ${apiMsg}`
            : 'Fast2SMS rejected the API key. Check FAST2SMS_API_KEY in Secrets.'
        );
      }
      throw new Error(
        apiMsg
          ? `SMS delivery failed: ${apiMsg}`
          : 'Could not send SMS OTP via Fast2SMS. Please try again.'
      );
    }

    return { delivered: 'sms' };
  }

  // Fallback preview mode when FAST2SMS_API_KEY is missing from Secrets
  return { delivered: 'preview' };
}
