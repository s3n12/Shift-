export function normalizePhoneNumber(countryCode: string, localNumber: string): string | null {
  const cleanCode = countryCode.replace(/[^\d+]/g, '');
  const digits = localNumber.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;

  const prefix = cleanCode.startsWith('+') ? cleanCode : `+${cleanCode || '91'}`;
  const full = `${prefix}${digits}`;
  if (!/^\+\d{8,16}$/.test(full)) return null;
  return full;
}

export function maskPhoneNumber(e164: string): string {
  if (e164.length <= 6) return e164;
  return `${e164.slice(0, 4)}****${e164.slice(-3)}`;
}

export async function sendOtpSms(
  toPhone: string,
  code: string
): Promise<{ delivered: 'sms' | 'preview' }> {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const twilioToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER?.trim();
  const fast2smsKey = process.env.FAST2SMS_API_KEY?.trim();

  const messageText = `Your Shift verification code is ${code}. It expires in 10 minutes.`;

  // 1. Twilio SMS API
  if (twilioSid && twilioToken && twilioFrom) {
    const authHeader = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
    const body = new URLSearchParams({
      To: toPhone,
      From: twilioFrom,
      Body: messageText,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error('Twilio SMS delivery failed:', response.status, errBody);
      throw new Error('Could not send SMS OTP. Check your Twilio Secrets configuration.');
    }

    return { delivered: 'sms' };
  }

  // 2. Fast2SMS (for Indian +91 numbers)
  if (fast2smsKey) {
    const indianTenDigit = toPhone.replace(/^\+91/, '').replace(/\D/g, '');
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        authorization: fast2smsKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'q',
        message: messageText,
        numbers: indianTenDigit,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error('Fast2SMS delivery failed:', response.status, errBody);
      throw new Error('Could not send SMS OTP. Check your FAST2SMS_API_KEY configuration.');
    }

    return { delivered: 'sms' };
  }

  return { delivered: 'preview' };
}
