import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { api } from '../lib/api.ts';
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

  const syncFirebaseUser = useCallback(async (idToken: string) => {
    tokenRef.current = idToken;
    isEmailSessionRef.current = false;
    const { user: dbUser } = await api.getMe(idToken);
    setUser(dbUser);
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
        // Attempt to restore an active HttpOnly cookie session (Email/Password or Email OTP)
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
          // No active cookie session
        }

        if (!active) return;
        tokenRef.current = null;
        isEmailSessionRef.current = false;
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const idToken = await fbUser.getIdToken();
        await syncFirebaseUser(idToken);
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
    };
  }, [syncFirebaseUser]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (isEmailSessionRef.current && tokenRef.current) {
      return tokenRef.current;
    }
    if (auth.currentUser) {
      const fresh = await auth.currentUser.getIdToken();
      tokenRef.current = fresh;
      return fresh;
    }
    return tokenRef.current;
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await result.user.getIdToken();
      await syncFirebaseUser(idToken);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.includes('popup-closed-by-user')
          ? 'Google sign-in popup was closed before completing.'
          : 'Google sign-in failed. Please allow popups and try again.';
      setAuthError(message);
      throw err;
    }
  }, [syncFirebaseUser]);

  const completeEmailOtpLogin = useCallback(
    (token: string, profile: UserProfile) => {
      tokenRef.current = token;
      isEmailSessionRef.current = true;
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
      // Ignore cookie clear errors
    }
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error signing out of Firebase:', err);
    }
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
