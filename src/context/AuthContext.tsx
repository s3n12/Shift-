import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { FIRESTORE_SESSION_TOKEN, firestoreStore } from '../lib/firestore-store.ts';
import { api } from '../lib/api.ts';
import {
  getActiveSupabaseSession,
  signOutSupabase,
  subscribeSupabaseAuthChanges,
} from '../lib/supabase.ts';
import { SUPABASE_SESSION_TOKEN, supabaseStore } from '../lib/supabase-store.ts';
import { vercelStore } from '../lib/vercel-store.ts';
import type { UserProfile } from '../types.ts';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  getToken: () => Promise<string | null>;
  loginWithGoogle: () => Promise<void>;
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

  const syncFirebaseUser = useCallback(async (fbUser: User) => {
    const res = await firestoreStore.syncGoogleUser(fbUser);
    tokenRef.current = res.token;
    isEmailSessionRef.current = false;
    setUser(res.user);
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
        // 1. Check for an active Supabase Auth session (Email OTP / Email & Password)
        try {
          const sbSession = await getActiveSupabaseSession();
          if (active && sbSession) {
            const synced = await supabaseStore.syncSupabaseUser(sbSession.user);
            if (!active) return;
            tokenRef.current = synced.token || SUPABASE_SESSION_TOKEN;
            isEmailSessionRef.current = true;
            setUser(synced.user);
            setAuthError(null);
            setLoading(false);
            return;
          }
        } catch {
          // No active Supabase session
        }

        // 2. Fallback: attempt to restore a legacy server/local session
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

    let unsubscribeSupabase: (() => void) | null = null;
    void subscribeSupabaseAuthChanges(async (sbSession) => {
      if (!active || !sbSession) return;
      try {
        const synced = await supabaseStore.syncSupabaseUser(sbSession.user);
        if (!active) return;
        tokenRef.current = synced.token || SUPABASE_SESSION_TOKEN;
        isEmailSessionRef.current = true;
        setUser(synced.user);
        setAuthError(null);
        setLoading(false);

        // Clean up magic link / PKCE callback tokens from URL bar after sign-in
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          const hasAuthParams =
            url.searchParams.has('code') ||
            url.searchParams.has('token_hash') ||
            url.hash.includes('access_token=');
          if (hasAuthParams) {
            url.searchParams.delete('code');
            url.searchParams.delete('token_hash');
            url.searchParams.delete('type');
            window.history.replaceState({}, document.title, url.pathname + url.search);
          }
        }
      } catch {
        // Ignore transient sync errors; user can still retry
      }
    }).then((unsub) => {
      if (active) {
        unsubscribeSupabase = unsub;
      } else {
        unsub();
      }
    });

    return () => {
      active = false;
      unsubscribe();
      if (unsubscribeSupabase) unsubscribeSupabase();
    };
  }, [syncFirebaseUser]);

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
    await signOutSupabase();
  }, []);

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
