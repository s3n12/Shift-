import { useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import {
  isSupabaseConfigured,
  sendSupabaseEmailOtp,
  signInWithSupabasePassword,
  signUpWithSupabasePassword,
  verifySupabaseEmailOtp,
} from '../lib/supabase.ts';
import { supabaseStore } from '../lib/supabase-store.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { LOGIN_HERO_IMAGE } from '../types.ts';
import { MediaImage } from '../components/MediaImage.tsx';

type AuthMode = 'login' | 'signup' | 'otp';

export function LoginPage() {
  const { loginWithGoogle, completeEmailOtpLogin, authError, clearAuthError } =
    useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [otpStep, setOtpStep] = useState<'email' | 'verify'>('email');
  const [otpVerifyType, setOtpVerifyType] = useState<'email' | 'signup'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [maskedTarget, setMaskedTarget] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentNotice, setResentNotice] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const errorMessage = localError || authError;

  const switchMode = (next: AuthMode) => {
    setAuthMode(next);
    setOtpStep('email');
    setOtpVerifyType('email');
    setOtpInput('');
    setResentNotice(false);
    setLocalError(null);
    clearAuthError();
  };

  const handlePrimarySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();
    setBusy(true);
    try {
      if (authMode === 'login') {
        if (await isSupabaseConfigured()) {
          const authRes = await signInWithSupabasePassword({
            email: email.trim(),
            password,
          });
          const synced = await supabaseStore.syncSupabaseUser(
            authRes.user,
            'supabase-password'
          );
          completeEmailOtpLogin(synced.token, synced.user);
          return;
        }
        const res = await api.login({ email: email.trim(), password });
        completeEmailOtpLogin(res.token, res.user);
        return;
      }

      if (authMode === 'signup') {
        if (await isSupabaseConfigured()) {
          const signupRes = await signUpWithSupabasePassword({
            email: email.trim(),
            password,
            displayName: displayName.trim() || undefined,
          });
          if (signupRes.needsEmailConfirmation) {
            setAuthMode('otp');
            setOtpVerifyType('signup');
            setOtpEmail(signupRes.target.email);
            setMaskedTarget(signupRes.target.maskedEmail);
            setOtpInput('');
            setResentNotice(false);
            setOtpStep('verify');
            return;
          }
          const synced = await supabaseStore.syncSupabaseUser(
            signupRes.user,
            'supabase-password'
          );
          completeEmailOtpLogin(synced.token, synced.user);
          return;
        }
        const res = await api.signup({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        });
        completeEmailOtpLogin(res.token, res.user);
        return;
      }

      // Supabase Email OTP mode
      const sent = await sendSupabaseEmailOtp(email);
      setOtpVerifyType('email');
      setOtpEmail(sent.email);
      setMaskedTarget(sent.maskedEmail);
      setOtpInput('');
      setResentNotice(false);
      setOtpStep('verify');
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error ? err.message : 'Unable to continue. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();
    setBusy(true);
    try {
      const verified = await verifySupabaseEmailOtp({
        email: otpEmail || email,
        token: otpInput.trim(),
        type: otpVerifyType,
      });
      const synced = await supabaseStore.syncSupabaseUser(
        verified.user,
        'supabase-otp'
      );
      completeEmailOtpLogin(synced.token, synced.user);
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error ? err.message : 'Invalid verification code.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleResendOtp = async () => {
    setLocalError(null);
    clearAuthError();
    setResentNotice(false);
    setResending(true);
    try {
      const sent = await sendSupabaseEmailOtp(otpEmail || email);
      setOtpVerifyType('email');
      setOtpEmail(sent.email);
      setMaskedTarget(sent.maskedEmail);
      setOtpInput('');
      setResentNotice(true);
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not resend code.'
      );
    } finally {
      setResending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    setGoogleBusy(true);
    try {
      await loginWithGoogle();
    } catch {
      // AuthContext already populates authError
    } finally {
      setGoogleBusy(false);
    }
  };

  const isOtpVerifyView = authMode === 'otp' && otpStep === 'verify';

  return (
    <div className="min-h-screen bg-[#FAF8F5] grid grid-cols-1 lg:grid-cols-2 items-stretch">
      {/* Left Side: Sign In, Sign Up, Email OTP + Login with Google */}
      <div className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-16 xl:px-20">
        <div className="flex items-center justify-between">
          <span className="font-display text-2xl font-semibold tracking-tight text-[#1E293B]">
            Shift
          </span>
          <span className="text-xs text-[#64748B]">
            Work Mode · Weekend Mode
          </span>
        </div>

        <div className="w-full max-w-md mx-auto my-8">
          <div className="mb-7">
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#1E293B] leading-tight [text-wrap:balance]">
              Work with clarity. Unwind without guilt.
            </h1>
            <p className="mt-3 text-[15px] text-[#5C6672] leading-relaxed">
              Sign in with your email and password, a 6-digit Email OTP, or Google to manage weekday priorities and weekend rituals.
            </p>
          </div>

          {/* 3-option Auth Method Selector */}
          <div
            role="tablist"
            aria-label="Sign in method"
            className="grid grid-cols-3 gap-1 p-1 mb-6 rounded-full bg-[#EFEAE2] border border-[#E3DBD0]"
          >
            {(
              [
                { id: 'login', label: 'Sign In' },
                { id: 'signup', label: 'Sign Up' },
                { id: 'otp', label: 'Email OTP' },
              ] as const
            ).map((tab) => {
              const active = authMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchMode(tab.id)}
                  className={`py-2 px-3 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 cursor-pointer ${
                    active
                      ? 'bg-[#1E293B] text-white shadow-sm'
                      : 'text-[#5C6672] hover:text-[#1E293B]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 px-4 py-3 rounded-2xl bg-[#FDF2EE] border border-[#EBC6B9] text-sm text-[#9A3D22]"
            >
              {errorMessage}
            </div>
          )}

          {!isOtpVerifyView ? (
            <form onSubmit={handlePrimarySubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label
                    htmlFor="shift-name"
                    className="block text-xs font-medium text-[#475569] mb-1.5"
                  >
                    Your name
                  </label>
                  <div className="relative">
                    <User
                      className="w-4 h-4 text-[#8C95A0] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                      strokeWidth={1.8}
                    />
                    <input
                      id="shift-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Alex Rivera"
                      className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white border border-[#E3DBD0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1E293B] focus:ring-2 focus:ring-[#1E293B]/10 transition"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="shift-email"
                  className="block text-xs font-medium text-[#475569] mb-1.5"
                >
                  Email address
                </label>
                <div className="relative">
                  <Mail
                    className="w-4 h-4 text-[#8C95A0] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    strokeWidth={1.8}
                  />
                  <input
                    id="shift-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white border border-[#E3DBD0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1E293B] focus:ring-2 focus:ring-[#1E293B]/10 transition"
                  />
                </div>
              </div>

              {authMode !== 'otp' && (
                <div>
                  <label
                    htmlFor="shift-password"
                    className="block text-xs font-medium text-[#475569] mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock
                      className="w-4 h-4 text-[#8C95A0] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                      strokeWidth={1.8}
                    />
                    <input
                      id="shift-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete={
                        authMode === 'signup' ? 'new-password' : 'current-password'
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        authMode === 'signup'
                          ? 'At least 6 characters'
                          : 'Enter your password'
                      }
                      className="w-full pl-11 pr-11 py-3 rounded-2xl bg-white border border-[#E3DBD0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1E293B] focus:ring-2 focus:ring-[#1E293B]/10 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-[#8C95A0] hover:text-[#1E293B] transition cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" strokeWidth={1.8} />
                      ) : (
                        <Eye className="w-4 h-4" strokeWidth={1.8} />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-[#1E293B] text-white text-sm font-medium hover:bg-[#0F172A] active:scale-[0.99] transition-all duration-200 disabled:opacity-60 cursor-pointer"
              >
                {authMode === 'otp' && (
                  <ShieldCheck className="w-4 h-4 shrink-0" strokeWidth={1.9} />
                )}
                <span>
                  {busy
                    ? authMode === 'login'
                      ? 'Signing in...'
                      : authMode === 'signup'
                        ? 'Creating account...'
                        : 'Sending 6-digit code...'
                    : authMode === 'login'
                      ? 'Sign In to Shift'
                      : authMode === 'signup'
                        ? 'Create Account'
                        : 'Send 6-Digit Email OTP'}
                </span>
                <ArrowRight className="w-4 h-4 shrink-0" strokeWidth={1.9} />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="p-4 rounded-2xl bg-white border border-[#E3DBD0]">
                <div className="flex items-start gap-3">
                  <KeyRound
                    className="w-5 h-5 text-[#4A6B5D] shrink-0 mt-0.5"
                    strokeWidth={1.8}
                  />
                  <div className="text-sm flex-1 min-w-0">
                    <p className="font-medium text-[#1E293B]">
                      Enter Verification Code
                    </p>
                    <p className="text-[#5C6672] mt-0.5 text-xs leading-relaxed">
                      We emailed a 6-digit verification code to{' '}
                      <span className="font-medium text-[#1E293B]">
                        {maskedTarget}
                      </span>
                      . Enter it below to finish signing in.
                    </p>
                    {resentNotice && (
                      <p className="text-[#4A6B5D] mt-1.5 text-xs font-medium">
                        A new verification code was sent to your inbox.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="shift-otp"
                  className="block text-xs font-medium text-[#475569] mb-1.5"
                >
                  6-Digit Verification Code
                </label>
                <input
                  id="shift-otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={otpInput}
                  onChange={(e) =>
                    setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="000000"
                  className="w-full px-4 py-3.5 rounded-2xl bg-white border border-[#E3DBD0] text-center font-mono text-xl tracking-[0.4em] text-[#1E293B] placeholder:text-[#CBD5E1] focus:outline-none focus:border-[#4A6B5D] focus:ring-2 focus:ring-[#4A6B5D]/15 transition tabular-nums"
                />
              </div>

              <button
                type="submit"
                disabled={busy || resending || otpInput.length !== 6}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-[#4A6B5D] text-white text-sm font-medium hover:bg-[#3A564A] active:scale-[0.99] transition-all duration-200 disabled:opacity-50 cursor-pointer"
              >
                <span>{busy ? 'Verifying...' : 'Verify & Open Shift'}</span>
                <ArrowRight className="w-4 h-4 shrink-0" strokeWidth={1.9} />
              </button>

              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep('email');
                    setOtpInput('');
                    setResentNotice(false);
                    setLocalError(null);
                  }}
                  className="inline-flex items-center gap-1 text-[#64748B] hover:text-[#1E293B] cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={busy || resending}
                  className="font-medium text-[#D97757] hover:text-[#BF6243] disabled:opacity-50 cursor-pointer"
                >
                  {resending ? 'Sending...' : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          <div className="relative my-6 flex items-center">
            <div className="flex-grow border-t border-[#E3DBD0]" />
            <span className="mx-4 text-xs text-[#7B8490]">or continue with</span>
            <div className="flex-grow border-t border-[#E3DBD0]" />
          </div>

          {/* Pill-shaped Login with Google Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleBusy}
            className="w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-full bg-white border border-[#DED7CC] text-sm font-medium text-[#1E293B] hover:bg-[#F5F1EB] hover:border-[#CFC7BA] active:scale-[0.99] transition-all duration-200 disabled:opacity-60 cursor-pointer shadow-[0_1px_2px_rgba(30,41,59,0.04)]"
          >
            <svg
              aria-hidden="true"
              className="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
            >
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>{googleBusy ? 'Connecting Google...' : 'Login with Google'}</span>
          </button>
        </div>

        <p className="text-xs text-[#848D98]">
          Your tasks, habits, and getaways sync automatically to your private account.
        </p>
      </div>

      {/* Right Side: Full-height Editorial Lifestyle & Travel Photo */}
      <div className="hidden lg:block p-5">
        <div className="relative h-full min-h-[640px] w-full rounded-[28px] overflow-hidden">
          <MediaImage
            src={LOGIN_HERO_IMAGE}
            alt="Sunlit Mediterranean balcony with coffee cup, linen notebook, olive branch, and coastal view"
            fallbackLabel="Coastal Morning Retreat"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1E293B]/75 via-[#1E293B]/15 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 p-10 text-white">
            <p className="text-xs tracking-wide text-white/80 mb-2">
              One switch · Two distinct rhythms
            </p>
            <h2 className="font-display text-2xl xl:text-3xl font-medium leading-snug max-w-md [text-wrap:balance]">
              Finish your three most important tasks, then leave work completely behind.
            </h2>
          </div>
        </div>
      </div>
    </div>
  );
}
