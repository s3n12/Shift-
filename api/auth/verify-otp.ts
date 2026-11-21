import crypto from 'node:crypto';
import {
  isValidEmail,
  signServerlessSessionToken,
  verifyOtpChallengeToken,
} from '../../src/lib/otp-token.ts';
import { normalizeIndianPhone } from '../../src/lib/sms.ts';

interface ServerlessRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface ServerlessResponse {
  status: (code: number) => ServerlessResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
}

// Per-instance replay cache (in addition to signed expiration)
const consumedTokens = new Map<string, number>();

function pruneConsumedTokens(now: number) {
  if (consumedTokens.size < 200) return;
  for (const [key, exp] of consumedTokens.entries()) {
    if (exp <= now) {
      consumedTokens.delete(key);
    }
  }
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

function deterministicUidForEmail(email: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`shift:email-uid:${email}`)
    .digest('hex')
    .slice(0, 24);
  return `email:${hash}`;
}

function deterministicUidForPhone(phone: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`shift:phone-uid:${phone}`)
    .digest('hex')
    .slice(0, 24);
  return `phone:${hash}`;
}

function deterministicNumericId(uid: string): number {
  const hex = crypto.createHash('sha256').update(uid).digest('hex').slice(0, 8);
  return (parseInt(hex, 16) % 100000000) + 1;
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
    const rawCode = typeof body.code === 'string' ? body.code : '';
    const otpToken = typeof body.otpToken === 'string' ? body.otpToken : '';
    const displayName =
      typeof body.displayName === 'string' ? body.displayName.trim() : '';

    const cleanCode = rawCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return res
        .status(400)
        .json({ error: 'Please enter the 6-digit verification code.' });
    }

    const now = Date.now();
    pruneConsumedTokens(now);

    if (otpToken && consumedTokens.has(otpToken)) {
      return res.status(401).json({
        error: 'This verification code has already been used. Please request a new code.',
      });
    }

    if (channel === 'phone') {
      const rawPhone = typeof body.phone === 'string' ? body.phone : '';
      const normalizedPhone = normalizeIndianPhone(rawPhone);
      if (!normalizedPhone) {
        return res
          .status(400)
          .json({ error: 'A valid 10-digit mobile number is required.' });
      }

      const result = verifyOtpChallengeToken({
        token: otpToken,
        target: `phone:${normalizedPhone}`,
        code: cleanCode,
      });

      if (!result.valid) {
        const errorMessage =
          result.reason === 'expired'
            ? 'Verification code expired after 5 minutes. Please request a new code.'
            : 'Invalid verification code. Please check the 6-digit SMS code.';
        return res.status(401).json({ error: errorMessage });
      }

      consumedTokens.set(otpToken, now + 5 * 60 * 1000);

      const uid = deterministicUidForPhone(normalizedPhone);
      const resolvedName = displayName || normalizedPhone;
      const token = signServerlessSessionToken({
        uid,
        email: null,
        phone: normalizedPhone,
        name: resolvedName,
      });

      const isHttps = req.headers?.['x-forwarded-proto'] === 'https';
      const cookieFlags = [
        `shift_session=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'Max-Age=604800',
        isHttps ? 'Secure; SameSite=None; Partitioned' : 'SameSite=Lax',
      ].join('; ');
      res.setHeader('Set-Cookie', cookieFlags);

      return res.status(200).json({
        token,
        user: {
          id: deterministicNumericId(uid),
          uid,
          email: null,
          phone: normalizedPhone,
          displayName: resolvedName,
          authProvider: 'phone-otp',
        },
      });
    }

    const rawEmail = typeof body.email === 'string' ? body.email : '';
    const normalizedEmail = rawEmail.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const result = verifyOtpChallengeToken({
      token: otpToken,
      target: normalizedEmail,
      code: cleanCode,
    });

    if (!result.valid) {
      const errorMessage =
        result.reason === 'expired'
          ? 'Verification code expired after 10 minutes. Please request a new code.'
          : 'Invalid verification code. Please check the 6-digit code in your email.';
      return res.status(401).json({ error: errorMessage });
    }

    consumedTokens.set(otpToken, now + 10 * 60 * 1000);

    const uid = deterministicUidForEmail(normalizedEmail);
    const resolvedName = displayName || normalizedEmail.split('@')[0];
    const token = signServerlessSessionToken({
      uid,
      email: normalizedEmail,
      phone: null,
      name: resolvedName,
    });

    const isHttps = req.headers?.['x-forwarded-proto'] === 'https';
    const cookieFlags = [
      `shift_session=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'Max-Age=604800',
      isHttps ? 'Secure; SameSite=None; Partitioned' : 'SameSite=Lax',
    ].join('; ');
    res.setHeader('Set-Cookie', cookieFlags);

    return res.status(200).json({
      token,
      user: {
        id: deterministicNumericId(uid),
        uid,
        email: normalizedEmail,
        phone: null,
        displayName: resolvedName,
        authProvider: 'email-otp',
      },
    });
  } catch (error) {
    console.error('Error in /api/auth/verify-otp:', error);
    return res
      .status(500)
      .json({ error: 'Verification failed. Please try again.' });
  }
}
