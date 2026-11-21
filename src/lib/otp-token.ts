import crypto from 'node:crypto';

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes (Email OTP)
export const PHONE_OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes (Phone OTP)

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(purpose: 'otp' | 'session'): string {
  const base =
    process.env.OTP_SIGNING_SECRET?.trim() ||
    process.env.SHIFT_SESSION_SECRET?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    process.env.FAST2SMS_API_KEY?.trim() ||
    EPHEMERAL_FALLBACK_SECRET;

  return crypto
    .createHash('sha256')
    .update(`shift:${purpose}:v1:${base}`)
    .digest('hex');
}

export function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.length <= 2 ? local[0] : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

interface OtpChallengePayload {
  target: string;
  salt: string;
  exp: number;
  codeHash: string;
}

function hashOtpCode(
  secret: string,
  salt: string,
  target: string,
  code: string,
  exp: number
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${salt}:${target}:${code}:${exp}`)
    .digest('hex');
}

/**
 * Creates a stateless, HMAC-signed OTP challenge token.
 * Never embeds the plaintext 6-digit OTP; only stores a salted HMAC digest.
 */
export function createOtpChallengeToken(
  target: string,
  code: string,
  ttlMs = OTP_TTL_MS
): { token: string; expiresAt: number } {
  const normalizedTarget = target.trim().toLowerCase();
  const secret = getSigningSecret('otp');
  const salt = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + ttlMs;
  const codeHash = hashOtpCode(secret, salt, normalizedTarget, code, exp);

  const payload: OtpChallengePayload = {
    target: normalizedTarget,
    salt,
    exp,
    codeHash,
  };

  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');

  return { token: `otp.${encoded}.${sig}`, expiresAt: exp };
}

export function verifyOtpChallengeToken(params: {
  token: string;
  target?: string;
  email?: string;
  code: string;
}): { valid: boolean; reason?: 'expired' | 'invalid' } {
  const { token, code } = params;
  const rawTarget = params.target ?? params.email ?? '';
  if (!token || !token.startsWith('otp.') || !rawTarget) {
    return { valid: false, reason: 'invalid' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'invalid' };
  }

  const [, encoded, sig] = parts;
  const secret = getSigningSecret('otp');
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedSigBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedSigBuf)
  ) {
    return { valid: false, reason: 'invalid' };
  }

  let parsed: Partial<OtpChallengePayload> & { email?: string };
  try {
    parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as Partial<OtpChallengePayload> & { email?: string };
  } catch {
    return { valid: false, reason: 'invalid' };
  }

  const parsedTarget = parsed.target || parsed.email;
  if (
    !parsedTarget ||
    !parsed.salt ||
    !parsed.codeHash ||
    typeof parsed.exp !== 'number'
  ) {
    return { valid: false, reason: 'invalid' };
  }

  if (Date.now() > parsed.exp) {
    return { valid: false, reason: 'expired' };
  }

  const normalizedTarget = rawTarget.trim().toLowerCase();
  if (parsedTarget !== normalizedTarget) {
    return { valid: false, reason: 'invalid' };
  }

  const expectedCodeHash = hashOtpCode(
    secret,
    parsed.salt,
    normalizedTarget,
    code.trim(),
    parsed.exp
  );
  const actualHashBuf = Buffer.from(parsed.codeHash, 'hex');
  const expectedHashBuf = Buffer.from(expectedCodeHash, 'hex');

  if (
    actualHashBuf.length !== expectedHashBuf.length ||
    !crypto.timingSafeEqual(actualHashBuf, expectedHashBuf)
  ) {
    return { valid: false, reason: 'invalid' };
  }

  return { valid: true };
}

export function signServerlessSessionToken(payload: {
  uid: string;
  email?: string | null;
  phone?: string | null;
  name?: string;
}): string {
  const fullPayload = {
    ...payload,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const secret = getSigningSecret('session');
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString(
    'base64url'
  );
  const sig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  return `shift.${encoded}.${sig}`;
}
