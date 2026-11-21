import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { FIRESTORE_SESSION_TOKEN, firestoreStore } from '../lib/firestore-store.ts';
import { api } from '../lib/api.ts';
import { vercelStore } from '../lib/vercel-store.ts';
import type { UserProfile } from '../types.ts';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  getToken: () => Promise<string | null>;
  loginWithGoogle: () => Promise<void>;
  startFirebasePhoneOtp: (
    phoneE164: string,
    recaptchaContainerId: string
  ) => Promise<ConfirmationResult>;
  verifyFirebasePhoneOtp: (
    confirmation: ConfirmationResult,
    code: string
  ) => Promise<void>;
  resetRecaptcha: (recaptchaContainerId?: string) => void;
  completeEmailOtpLogin: (token: string, profile: UserProfile) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const isEmailSessionRef = useRef(false);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const syncFirebaseUser = useCallback(async (fbUser: User) => {
    const res = await firestoreStore.syncFirebaseUser(fbUser);
    tokenRef.current = res.token;
    isEmailSessionRef.current = false;
    setUser(res.user);
  }, []);

  const resetRecaptcha = useCallback((recaptchaContainerId?: string) => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {
        // Ignore cleanup errors if element was unmounted
      }
      recaptchaVerifierRef.current = null;
    }
    if (typeof document !== 'undefined' && recaptchaContainerId) {
      const container = document.getElementById(recaptchaContainerId);
      if (container) {
        container.innerHTML = '';
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!active) return;

      if (isEmailSessionRef.current && tokenRef.current) {
        setLoading(false);
        return;
      }

      if (!fbUser) {
        // Attempt to restore an active email/OTP session (HttpOnly cookie on server or local session)
        try {
          const restored = await api.getMe(null);
          if (!active) return;
          if (restored.user) {
            if (restored.token) {
              tokenRef.current = restored.token;
              isEmailSessionRef.current = true;
            }
            setUser(restored.user);
            setAuthError(null);
            setLoading(false);
            return;
          }
        } catch {
          // No active session
        }

        if (!active) return;
        tokenRef.current = null;
        isEmailSessionRef.current = false;
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        await syncFirebaseUser(fbUser);
        if (active) setAuthError(null);
      } catch (err) {
        console.error('Failed to sync Firebase user:', err);
        if (active) {
          setAuthError('Unable to sign in right now. Please try again.');
          setUser(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
      resetRecaptcha();
    };
  }, [syncFirebaseUser, resetRecaptcha]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (isEmailSessionRef.current && tokenRef.current) {
      return tokenRef.current;
    }
    if (tokenRef.current === FIRESTORE_SESSION_TOKEN && auth.currentUser) {
      return FIRESTORE_SESSION_TOKEN;
    }
    if (auth.currentUser) {
      tokenRef.current = FIRESTORE_SESSION_TOKEN;
      return FIRESTORE_SESSION_TOKEN;
    }
    return tokenRef.current;
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      await syncFirebaseUser(result.user);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '';
      let message = 'Google sign-in failed. Please allow popups and try again.';
      if (errMsg.includes('popup-closed-by-user')) {
        message = 'Google sign-in popup was closed before completing.';
      } else if (errMsg.includes('unauthorized-domain')) {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        message = `Add "${host}" to Authorized Domains in Firebase Console (Authentication → Settings) to enable Google Sign-In on this domain.`;
      }
      setAuthError(message);
      throw err;
    }
  }, [syncFirebaseUser]);

  const startFirebasePhoneOtp = useCallback(
    async (
      phoneE164: string,
      recaptchaContainerId: string
    ): Promise<ConfirmationResult> => {
      setAuthError(null);
      resetRecaptcha(recaptchaContainerId);

      const container = document.getElementById(recaptchaContainerId);
      if (!container) {
        throw new Error('reCAPTCHA container is not mounted.');
      }

      const verifier = new RecaptchaVerifier(auth, container, {
        size: 'invisible',
      });
      recaptchaVerifierRef.current = verifier;

      try {
        const confirmation = await signInWithPhoneNumber(
          auth,
          phoneE164,
          verifier
        );
        return confirmation;
      } catch (err) {
        resetRecaptcha(recaptchaContainerId);
        throw err;
      }
    },
    [resetRecaptcha]
  );

  const verifyFirebasePhoneOtp = useCallback(
    async (confirmation: ConfirmationResult, code: string) => {
      setAuthError(null);
      const credential = await confirmation.confirm(code);
      await syncFirebaseUser(credential.user);
      resetRecaptcha();
    },
    [syncFirebaseUser, resetRecaptcha]
  );

  const completeEmailOtpLogin = useCallback(
    (token: string, profile: UserProfile) => {
      tokenRef.current = token;
      isEmailSessionRef.current = true;
      vercelStore.syncVerifiedOtpUser(profile);
      setAuthError(null);
      setUser(profile);
    },
    []
  );

  const logout = useCallback(async () => {
    isEmailSessionRef.current = false;
    tokenRef.current = null;
    setUser(null);
    resetRecaptcha();
    try {
      await api.logout();
    } catch {
      // Ignore logout errors
    }
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error signing out of Firebase:', err);
    }
  }, [resetRecaptcha]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        clearAuthError,
        getToken,
        loginWithGoogle,
        startFirebasePhoneOtp,
        verifyFirebasePhoneOtp,
        resetRecaptcha,
        completeEmailOtpLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
