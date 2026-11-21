import {
  createOtpChallengeToken,
  generateSixDigitOtp,
  isValidEmail,
  maskEmail,
  OTP_TTL_MS,
  PHONE_OTP_TTL_MS,
} from '../../src/lib/otp-token.ts';
import {
  getResendApiKey,
  MailerConfigError,
  sendOtpEmail,
} from '../../src/lib/mailer.ts';
import {
  maskPhoneNumber,
  normalizeIndianPhone,
  sendOtpSms,
} from '../../src/lib/sms.ts';

interface ServerlessRequest {
  method?: string;
  body?: unknown;
}

interface ServerlessResponse {
  status: (code: number) => ServerlessResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
}

function parseJsonBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') {
    return body as Record<string, unknown>;
  }
  return {};
}

export default async function handler(
  req: ServerlessRequest,
  res: ServerlessResponse
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const body = parseJsonBody(req.body);
    const channel = body.channel === 'phone' ? 'phone' : 'email';
    const displayName =
      typeof body.displayName === 'string' ? body.displayName.trim() : null;

    if (channel === 'phone') {
      const rawPhone = typeof body.phone === 'string' ? body.phone : '';
      const normalizedPhone = normalizeIndianPhone(rawPhone);
      if (!normalizedPhone) {
        return res
          .status(400)
          .json({ error: 'Please enter a valid 10-digit mobile number.' });
      }

      const code = generateSixDigitOtp();
      const { token: otpToken } = createOtpChallengeToken(
        `phone:${normalizedPhone}`,
        code,
        PHONE_OTP_TTL_MS
      );

      const delivery = await sendOtpSms(normalizedPhone, code);
      const exposePreviewCode = delivery.delivered === 'preview';

      return res.status(200).json({
        ok: true,
        channel: 'phone',
        delivered: delivery.delivered,
        maskedTarget: maskPhoneNumber(normalizedPhone),
        otpToken,
        expiresInSeconds: Math.round(PHONE_OTP_TTL_MS / 1000),
        ...(exposePreviewCode ? { verificationCode: code } : {}),
        ...(delivery.notice ? { notice: delivery.notice } : {}),
        displayName: displayName || null,
      });
    }

    const rawEmail = typeof body.email === 'string' ? body.email : '';
    const normalizedEmail = rawEmail.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return res
        .status(400)
        .json({ error: 'Please enter a valid email address.' });
    }

    if (!getResendApiKey()) {
      return res.status(503).json({
        error:
          'Email delivery is not configured yet. Set a valid RESEND_API_KEY in Secrets / environment variables to send verification emails.',
      });
    }

    const code = generateSixDigitOtp();
    const { token: otpToken } = createOtpChallengeToken(
      normalizedEmail,
      code,
      OTP_TTL_MS
    );

    await sendOtpEmail(normalizedEmail, code, 'otp');

    return res.status(200).json({
      ok: true,
      channel: 'email',
      delivered: 'email',
      maskedTarget: maskEmail(normalizedEmail),
      otpToken,
      expiresInSeconds: Math.round(OTP_TTL_MS / 1000),
      displayName: displayName || null,
    });
  } catch (error) {
    if (error instanceof MailerConfigError) {
      console.warn('OTP delivery notice:', error.message);
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error in /api/auth/request-otp:', error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Could not send verification code. Please try again.';
    return res.status(502).json({ error: message });
  }
}
