export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface ParsedEmailTarget {
  email: string;
  maskedEmail: string;
}

function cleanEnv(raw: string | undefined): string {
  if (typeof raw !== 'string') return '';
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value.replace(/[\r\n]+/g, '').trim();
}

export function normalizeSupabaseUrl(rawUrl: string): string {
  const cleaned = cleanEnv(rawUrl);
  if (!cleaned) return '';
  try {
    const parsed = new URL(cleaned);
    // Users often copy the REST or Auth endpoint (e.g. https://<ref>.supabase.co/rest/v1/)
    const normalizedPath = parsed.pathname
      .replace(/\/+(rest|auth|realtime|storage)\/v1\/?$/i, '')
      .replace(/\/+$/, '');
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return cleaned.replace(/\/+(rest|auth)\/v1\/?$/i, '').replace(/\/+$/, '');
  }
}

export function isValidSupabaseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return host.includes('.');
  } catch {
    return false;
  }
}

export function isLikelySupabaseKey(key: string): boolean {
  const cleaned = cleanEnv(key);
  if (cleaned.length < 20) return false;
  if (/^https?:\/\//i.test(cleaned) || /\s/.test(cleaned)) return false;
  if (/^(your|replace|placeholder|example|changeme|default)/i.test(cleaned)) {
    return false;
  }
  return true;
}

export function resolveSupabaseConfig(env: {
  VITE_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
}): SupabaseConfig | null {
  const urlCandidates = [
    env.VITE_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_URL,
  ]
    .map((v) => normalizeSupabaseUrl(v || ''))
    .filter((v) => v.length > 0);

  const url = urlCandidates.find((candidate) => isValidSupabaseUrl(candidate));

  const keyCandidates = [
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    env.SUPABASE_PUBLISHABLE_KEY,
    env.VITE_SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.SUPABASE_ANON_KEY,
  ]
    .map((v) => cleanEnv(v))
    .filter((v) => v.length > 0);

  const anonKey = keyCandidates.find((candidate) => isLikelySupabaseKey(candidate));

  if (!url || !anonKey) return null;

  return {
    url,
    anonKey,
  };
}

export function maskEmailTarget(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.length <= 2 ? local[0] || '*' : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

export function parseEmailOtpTarget(rawInput: string): ParsedEmailTarget {
  const email = (rawInput || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid email address.');
  }

  return {
    email,
    maskedEmail: maskEmailTarget(email),
  };
}

export function formatSupabaseOtpError(
  error: unknown,
  action: 'send' | 'verify' | 'login' | 'signup'
): string {
  const rawMessage =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : '';

  const lower = rawMessage.toLowerCase();

  if (lower.includes('vite_supabase_url') || lower.includes('not configured')) {
    return 'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) to your environment variables and redeploy.';
  }
  if (lower.includes('invalid api key') || lower.includes('invalid jwt')) {
    return 'Your Supabase API key is invalid. Check your Supabase project API settings.';
  }
  if (lower.includes('email logins are disabled') || lower.includes('signups not allowed')) {
    return 'Email authentication is disabled in your Supabase project. Enable the Email provider in Supabase Dashboard → Authentication → Providers.';
  }
  if (
    lower.includes('rate limit') ||
    lower.includes('too many') ||
    lower.includes('security purposes')
  ) {
    return 'Too many authentication requests right now. Please wait a minute before trying again.';
  }
  if (
    lower.includes('token has expired') ||
    lower.includes('otp_expired') ||
    lower.includes('invalid otp') ||
    lower.includes('token is invalid')
  ) {
    return 'Invalid or expired verification code. Please check the 6-digit code or click Resend code.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'Incorrect email or password. You can also sign in instantly with the Email OTP tab.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address first, or sign in directly using the Email OTP tab.';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'An account with this email already exists. Switch to Sign In or Email OTP instead.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Could not reach Supabase. Check your VITE_SUPABASE_URL and network connection.';
  }

  if (rawMessage.trim()) {
    return rawMessage.trim();
  }

  if (action === 'send') {
    return 'Could not send the verification email. Please try again.';
  }
  if (action === 'verify') {
    return 'Verification failed. Please check the 6-digit code and try again.';
  }
  if (action === 'signup') {
    return 'Could not create your account. Please try again.';
  }
  return 'Unable to sign in right now. Please try again.';
}
