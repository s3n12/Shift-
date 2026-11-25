import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import { auth } from './firebase.ts';
import {
  formatFirebasePhoneError,
  normalizePhoneNumber,
  type ParsedPhoneTarget,
} from './phone-utils.ts';

let activeRecaptcha: RecaptchaVerifier | null = null;
let activeContainerId: string | null = null;

export function clearPhoneRecaptcha(): void {
  if (activeRecaptcha) {
    try {
      activeRecaptcha.clear();
    } catch {
      // Ignore cleanup errors if the widget was already removed from DOM
    }
    activeRecaptcha = null;
  }
  if (activeContainerId && typeof document !== 'undefined') {
    const el = document.getElementById(activeContainerId);
    if (el) {
      el.replaceChildren();
    }
  }
  activeContainerId = null;
}

function getOrCreateRecaptcha(containerId: string): RecaptchaVerifier {
  if (typeof document === 'undefined') {
    throw new Error('Phone authentication requires a browser environment.');
  }

  // Always recreate cleanly to prevent stale/expired reCAPTCHA tokens on resend
  clearPhoneRecaptcha();

  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error('Unable to initialize phone verification. Please refresh and try again.');
  }

  const verifier = new RecaptchaVerifier(auth, container, {
    size: 'invisible',
  });
  activeRecaptcha = verifier;
  activeContainerId = containerId;
  return verifier;
}

export interface SentPhoneOtpResult extends ParsedPhoneTarget {
  confirmationResult: ConfirmationResult;
}

export async function sendFirebasePhoneOtp(params: {
  phone: string;
  dialCode?: string;
  recaptchaContainerId: string;
}): Promise<SentPhoneOtpResult> {
  const target = normalizePhoneNumber(params.phone, params.dialCode);
  const verifier = getOrCreateRecaptcha(params.recaptchaContainerId);

  try {
    const confirmationResult = await signInWithPhoneNumber(
      auth,
      target.e164,
      verifier
    );
    return {
      ...target,
      confirmationResult,
    };
  } catch (err: unknown) {
    clearPhoneRecaptcha();
    const host =
      typeof window !== 'undefined' ? window.location.hostname : undefined;
    throw new Error(formatFirebasePhoneError(err, host));
  }
}

export async function verifyFirebasePhoneOtp(params: {
  confirmationResult: ConfirmationResult | null;
  code: string;
}): Promise<User> {
  if (!params.confirmationResult) {
    throw new Error('Your verification session expired. Please request a new SMS code.');
  }

  const cleanCode = (params.code || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('Please enter the 6-digit SMS verification code.');
  }

  try {
    const credential = await params.confirmationResult.confirm(cleanCode);
    clearPhoneRecaptcha();
    return credential.user;
  } catch (err: unknown) {
    const host =
      typeof window !== 'undefined' ? window.location.hostname : undefined;
    throw new Error(formatFirebasePhoneError(err, host));
  }
}
