import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  formatSupabaseOtpError,
  parseEmailOtpTarget,
  resolveSupabaseConfig,
  type ParsedEmailTarget,
  type SupabaseConfig,
} from './supabase-otp.ts';

export interface SupabaseAuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
}

export interface SupabaseAuthSessionResult {
  accessToken: string;
  user: SupabaseAuthUser;
}

function getEnvConfig(): SupabaseConfig | null {
  return resolveSupabaseConfig({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

function buildSupabaseClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

function extractUser(
  sbUser: {
    id: string;
    email?: string | null;
    phone?: string | null;
    user_metadata?: Record<string, unknown>;
  },
  fallbackEmail?: string | null
): SupabaseAuthUser {
  const metadataName =
    typeof sbUser.user_metadata?.full_name === 'string'
      ? sbUser.user_metadata.full_name
      : typeof sbUser.user_metadata?.name === 'string'
        ? sbUser.user_metadata.name
        : null;

  return {
    id: sbUser.id,
    email: sbUser.email || fallbackEmail || null,
    phone: sbUser.phone || null,
    displayName: metadataName,
  };
}

const initialEnvConfig = getEnvConfig();
export const supabase: SupabaseClient | null = initialEnvConfig
  ? buildSupabaseClient(initialEnvConfig)
  : null;

let cachedClient: SupabaseClient | null = supabase;
let cachedConfigKey = initialEnvConfig
  ? `${initialEnvConfig.url}::${initialEnvConfig.anonKey}`
  : '';
let runtimeConfigChecked = Boolean(initialEnvConfig);

async function fetchRuntimeConfig(): Promise<SupabaseConfig | null> {
  try {
    const res = await fetch('/api/auth/supabase-config', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || !contentType.includes('application/json')) return null;
    const data = (await res.json()) as {
      url?: string;
      anonKey?: string;
      publishableKey?: string;
    };
    return resolveSupabaseConfig({
      VITE_SUPABASE_URL: data.url,
      VITE_SUPABASE_PUBLISHABLE_KEY: data.publishableKey,
      VITE_SUPABASE_ANON_KEY: data.anonKey,
    });
  } catch {
    return null;
  }
}

export async function getOptionalSupabaseClient(): Promise<SupabaseClient | null> {
  if (cachedClient) return cachedClient;

  const envConfig = getEnvConfig();
  const config =
    envConfig || (!runtimeConfigChecked ? await fetchRuntimeConfig() : null);
  runtimeConfigChecked = true;

  if (!config) return null;

  const key = `${config.url}::${config.anonKey}`;
  if (!cachedClient || cachedConfigKey !== key) {
    cachedClient = buildSupabaseClient(config);
    cachedConfigKey = key;
  }

  return cachedClient;
}

export async function isSupabaseConfigured(): Promise<boolean> {
  const client = await getOptionalSupabaseClient();
  return client !== null;
}

export async function getSupabaseClient(): Promise<SupabaseClient> {
  const client = await getOptionalSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) to your environment variables and redeploy.'
    );
  }
  return client;
}

export async function sendSupabaseEmailOtp(
  rawEmail: string
): Promise<ParsedEmailTarget> {
  const target = parseEmailOtpTarget(rawEmail);
  const client = await getSupabaseClient();

  try {
    const { error } = await client.auth.signInWithOtp({
      email: target.email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      throw new Error(formatSupabaseOtpError(error, 'send'));
    }

    return target;
  } catch (err) {
    throw new Error(formatSupabaseOtpError(err, 'send'));
  }
}

export async function verifySupabaseEmailOtp(params: {
  email: string;
  token: string;
  type?: 'email' | 'signup';
}): Promise<SupabaseAuthSessionResult> {
  const { email } = parseEmailOtpTarget(params.email);
  const cleanToken = (params.token || '').trim();
  if (!/^\d{6}$/.test(cleanToken)) {
    throw new Error('Please enter the 6-digit verification code.');
  }

  const client = await getSupabaseClient();
  const verifyType = params.type || 'email';

  try {
    const { data, error } = await client.auth.verifyOtp({
      email,
      token: cleanToken,
      type: verifyType,
    });

    if (error || !data.session || !data.user) {
      throw new Error(
        formatSupabaseOtpError(
          error || new Error('Invalid or expired verification code.'),
          'verify'
        )
      );
    }

    return {
      accessToken: data.session.access_token,
      user: extractUser(data.user, email),
    };
  } catch (err) {
    throw new Error(formatSupabaseOtpError(err, 'verify'));
  }
}

export async function signInWithSupabasePassword(params: {
  email: string;
  password: string;
}): Promise<SupabaseAuthSessionResult> {
  const { email } = parseEmailOtpTarget(params.email);
  if (!params.password || params.password.length < 6) {
    throw new Error('Please enter your password (at least 6 characters).');
  }

  const client = await getSupabaseClient();
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: params.password,
    });

    if (error || !data.session || !data.user) {
      throw new Error(
        formatSupabaseOtpError(
          error || new Error('Invalid login credentials'),
          'login'
        )
      );
    }

    return {
      accessToken: data.session.access_token,
      user: extractUser(data.user, email),
    };
  } catch (err) {
    throw new Error(formatSupabaseOtpError(err, 'login'));
  }
}

export async function signUpWithSupabasePassword(params: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<
  | ({ needsEmailConfirmation: false } & SupabaseAuthSessionResult)
  | { needsEmailConfirmation: true; target: ParsedEmailTarget }
> {
  const target = parseEmailOtpTarget(params.email);
  if (!params.password || params.password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const client = await getSupabaseClient();
  const cleanName = params.displayName?.trim() || undefined;

  try {
    const { data, error } = await client.auth.signUp({
      email: target.email,
      password: params.password,
      options: cleanName ? { data: { full_name: cleanName } } : undefined,
    });

    if (error) {
      throw new Error(formatSupabaseOtpError(error, 'signup'));
    }

    if (data.session && data.user) {
      return {
        needsEmailConfirmation: false,
        accessToken: data.session.access_token,
        user: extractUser(data.user, target.email),
      };
    }

    return {
      needsEmailConfirmation: true,
      target,
    };
  } catch (err) {
    throw new Error(formatSupabaseOtpError(err, 'signup'));
  }
}

export async function getActiveSupabaseSession(): Promise<SupabaseAuthSessionResult | null> {
  const client = await getOptionalSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session || !data.session.user) return null;
    return {
      accessToken: data.session.access_token,
      user: extractUser(data.session.user),
    };
  } catch {
    return null;
  }
}

export async function signOutSupabase(): Promise<void> {
  const client = cachedClient;
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch {
    // Ignore Supabase sign-out errors
  }
}
