import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRODUCTION_SITE_URL,
  formatSupabaseOtpError,
  isValidSupabaseUrl,
  normalizeSupabaseUrl,
  parseEmailOtpTarget,
  resolveAuthRedirectUrl,
  resolveSupabaseConfig,
} from './supabase-otp.ts';

test('resolveSupabaseConfig reads publishable/anon/NEXT_PUBLIC keys and normalizes /rest/v1/ URLs', () => {
  const fromRestUrl = resolveSupabaseConfig({
    VITE_SUPABASE_URL: 'https://iecqsmkzivppqhfygqbx.supabase.co/rest/v1/',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example_key_123456',
  });
  assert.deepEqual(fromRestUrl, {
    url: 'https://iecqsmkzivppqhfygqbx.supabase.co',
    anonKey: 'sb_publishable_example_key_123456',
  });

  const fromNextPublic = resolveSupabaseConfig({
    VITE_SUPABASE_URL: 'default',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'https://iecqsmkzivppqhfygqbx.supabase.co/rest/v1/',
    VITE_SUPABASE_ANON_KEY: 'default',
    NEXT_PUBLIC_SUPABASE_URL: ' "https://xyzproject.supabase.co/auth/v1/" ',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '  sb_publishable_next_key_123456  ',
  });
  assert.deepEqual(fromNextPublic, {
    url: 'https://xyzproject.supabase.co',
    anonKey: 'sb_publishable_next_key_123456',
  });

  assert.equal(
    normalizeSupabaseUrl('https://abc.supabase.co/rest/v1'),
    'https://abc.supabase.co'
  );
  assert.equal(resolveSupabaseConfig({}), null);
  assert.equal(
    resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_valid_length_key_1234',
    }),
    null
  );
  assert.equal(
    resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_allow_in_browser_12345',
    }),
    null
  );
  assert.equal(isValidSupabaseUrl('https://169.254.169.254'), false);
  assert.equal(isValidSupabaseUrl('https://abc.supabase.co'), true);
});

test('parseEmailOtpTarget normalizes valid emails and rejects invalid input', () => {
  const res = parseEmailOtpTarget('  Shani.User@Example.COM ');
  assert.equal(res.email, 'shani.user@example.com');
  assert.equal(res.maskedEmail, 'sh***@example.com');

  assert.throws(() => parseEmailOtpTarget('bad@email'), /valid email address/i);
  assert.throws(() => parseEmailOtpTarget('   '), /valid email address/i);
});

test('formatSupabaseOtpError maps common Supabase Auth & OTP errors clearly', () => {
  assert.match(
    formatSupabaseOtpError(new Error('Token has expired or is invalid'), 'verify'),
    /Invalid or expired verification code/i
  );
  assert.match(
    formatSupabaseOtpError(new Error('Email logins are disabled'), 'send'),
    /Enable the Email provider/i
  );
  assert.match(
    formatSupabaseOtpError(new Error('Invalid login credentials'), 'login'),
    /Incorrect email or password/i
  );
  assert.match(
    formatSupabaseOtpError(
      new Error('For security purposes, you can only request this after 60 seconds'),
      'send'
    ),
    /Too many authentication requests/i
  );
  assert.match(
    formatSupabaseOtpError(new Error('VITE_SUPABASE_URL missing'), 'send'),
    /VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY/i
  );
  assert.equal(
    formatSupabaseOtpError(new Error('SMTP server not configured'), 'send'),
    'SMTP server not configured'
  );
});

test('resolveAuthRedirectUrl dynamically uses deployed origin and never redirects to localhost', () => {
  assert.equal(
    resolveAuthRedirectUrl({ windowOrigin: 'https://shift-s-nova1.vercel.app/' }),
    'https://shift-s-nova1.vercel.app'
  );
  assert.equal(
    resolveAuthRedirectUrl({ windowOrigin: 'https://preview-shift.vercel.app' }),
    'https://preview-shift.vercel.app'
  );
  // Localhost origins fall back to VITE_SITE_URL or production Vercel URL
  assert.equal(
    resolveAuthRedirectUrl({
      windowOrigin: 'http://localhost:3000',
      VITE_SITE_URL: 'https://shift-s-nova1.vercel.app/',
    }),
    'https://shift-s-nova1.vercel.app'
  );
  assert.equal(
    resolveAuthRedirectUrl({ windowOrigin: 'http://127.0.0.1:3000' }),
    DEFAULT_PRODUCTION_SITE_URL
  );
  assert.equal(
    resolveAuthRedirectUrl({
      windowOrigin: 'javascript:alert(1)',
      VITE_SITE_URL: 'http://localhost:3000',
    }),
    DEFAULT_PRODUCTION_SITE_URL
  );
});
