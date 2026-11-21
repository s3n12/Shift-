import type { HabitItem, PackingItem, TaskItem, TripItem, UserProfile } from '../types.ts';
import { FIRESTORE_SESSION_TOKEN, firestoreStore } from './firestore-store.ts';
import { vercelStore } from './vercel-store.ts';

class BackendUnavailableError extends Error {
  constructor() {
    super('API backend unavailable');
    this.name = 'BackendUnavailableError';
  }
}

let useStandaloneStore = false;

function isFirestoreToken(token: string | null | undefined): boolean {
  return token === FIRESTORE_SESSION_TOKEN;
}

async function apiFetch<T>(
  path: string,
  token: string | null,
  options: RequestInit = {},
  { allowStandaloneBypass = true }: { allowStandaloneBypass?: boolean } = {}
): Promise<T> {
  if (
    allowStandaloneBypass &&
    (useStandaloneStore || (token && token.startsWith('local.')))
  ) {
    throw new BackendUnavailableError();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'include',
      headers,
    });
  } catch {
    if (!allowStandaloneBypass) {
      throw new Error('Could not reach the verification service. Please try again.');
    }
    useStandaloneStore = true;
    throw new BackendUnavailableError();
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    if (!allowStandaloneBypass) {
      throw new Error(
        response.status >= 500
          ? 'Email delivery service encountered an error. Please try again.'
          : 'Verification endpoint is unavailable. Please check your deployment settings.'
      );
    }
    // Static hosts without serverless endpoints return HTML/404/405 for /api/*
    useStandaloneStore = true;
    throw new BackendUnavailableError();
  }

  const data = await response.json().catch(() => null);
  if (data === null) {
    if (!allowStandaloneBypass) {
      throw new Error('Received an invalid response from the verification service.');
    }
    useStandaloneStore = true;
    throw new BackendUnavailableError();
  }

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data as T;
}

async function withFallback<T>(
  remote: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  try {
    return await remote();
  } catch (err) {
    if (err instanceof BackendUnavailableError) {
      return await fallback();
    }
    throw err;
  }
}

export const api = {
  login(body: { email: string; password: string }) {
    return withFallback(
      () =>
        apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', null, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      () => vercelStore.login(body)
    );
  },

  signup(body: { email: string; password: string; displayName?: string }) {
    return withFallback(
      () =>
        apiFetch<{ token: string; user: UserProfile }>('/api/auth/signup', null, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      () => vercelStore.signup(body)
    );
  },

  requestOtp(
    body:
      | { channel?: 'email'; email: string; displayName?: string }
      | { channel: 'phone'; phone: string; displayName?: string }
  ) {
    return apiFetch<{
      ok: boolean;
      channel: 'email' | 'phone';
      delivered: 'email' | 'sms' | 'preview';
      maskedTarget: string;
      otpToken?: string;
      expiresInSeconds?: number;
      verificationCode?: string;
      displayName: string | null;
    }>(
      '/api/auth/request-otp',
      null,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      { allowStandaloneBypass: false }
    );
  },

  verifyOtp(
    body:
      | {
          channel?: 'email';
          email: string;
          code: string;
          otpToken?: string;
          displayName?: string;
        }
      | {
          channel: 'phone';
          phone: string;
          code: string;
          otpToken?: string;
          displayName?: string;
        }
  ) {
    return apiFetch<{ token: string; user: UserProfile }>(
      '/api/auth/verify-otp',
      null,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      { allowStandaloneBypass: false }
    );
  },

  logout() {
    return withFallback(
      () =>
        apiFetch<{ ok: boolean }>('/api/auth/logout', null, {
          method: 'POST',
        }),
      () => vercelStore.logout()
    );
  },

  getMe(
    token?: string | null,
    googleProfile?: { uid: string; email: string; displayName?: string | null }
  ) {
    return withFallback(
      () =>
        apiFetch<{ user: UserProfile; token?: string }>(
          '/api/auth/me',
          token ?? null
        ),
      () =>
        googleProfile
          ? vercelStore.syncExternalGoogleUser(googleProfile)
          : vercelStore.getMe(token)
    );
  },

  // Tasks
  listTasks(token: string) {
    if (isFirestoreToken(token)) return firestoreStore.listTasks();
    return withFallback(
      () => apiFetch<{ tasks: TaskItem[] }>('/api/tasks', token),
      () => vercelStore.listTasks(token)
    );
  },
  createTask(token: string, body: { title: string; mode?: string; notes?: string }) {
    if (isFirestoreToken(token)) return firestoreStore.createTask(body);
    return withFallback(
      () =>
        apiFetch<{ task: TaskItem }>('/api/tasks', token, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      () => vercelStore.createTask(token, body)
    );
  },
  updateTask(
    token: string,
    id: number,
    body: { title?: string; isCompleted?: boolean; notes?: string | null; mode?: string }
  ) {
    if (isFirestoreToken(token)) return firestoreStore.updateTask(id, body);
    return withFallback(
      () =>
        apiFetch<{ task: TaskItem }>(`/api/tasks/${id}`, token, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }),
      () => vercelStore.updateTask(token, id, body)
    );
  },
  deleteTask(token: string, id: number) {
    if (isFirestoreToken(token)) return firestoreStore.deleteTask(id);
    return withFallback(
      () =>
        apiFetch<{ ok: boolean }>(`/api/tasks/${id}`, token, {
          method: 'DELETE',
        }),
      () => vercelStore.deleteTask(token, id)
    );
  },

  // Habits
  listHabits(token: string) {
    if (isFirestoreToken(token)) return firestoreStore.listHabits();
    return withFallback(
      () => apiFetch<{ habits: HabitItem[] }>('/api/habits', token),
      () => vercelStore.listHabits(token)
    );
  },
  createHabit(
    token: string,
    body: { title: string; category?: string; targetMinutes?: number | null }
  ) {
    if (isFirestoreToken(token)) return firestoreStore.createHabit(body);
    return withFallback(
      () =>
        apiFetch<{ habit: HabitItem }>('/api/habits', token, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      () => vercelStore.createHabit(token, body)
    );
  },
  toggleHabit(token: string, id: number) {
    if (isFirestoreToken(token)) return firestoreStore.toggleHabit(id);
    return withFallback(
      () =>
        apiFetch<{ habit: HabitItem }>(`/api/habits/${id}/toggle`, token, {
          method: 'POST',
        }),
      () => vercelStore.toggleHabit(token, id)
    );
  },
  deleteHabit(token: string, id: number) {
    if (isFirestoreToken(token)) return firestoreStore.deleteHabit(id);
    return withFallback(
      () =>
        apiFetch<{ ok: boolean }>(`/api/habits/${id}`, token, {
          method: 'DELETE',
        }),
      () => vercelStore.deleteHabit(token, id)
    );
  },

  // Trips
  listTrips(token: string) {
    if (isFirestoreToken(token)) return firestoreStore.listTrips();
    return withFallback(
      () => apiFetch<{ trips: TripItem[] }>('/api/trips', token),
      () => vercelStore.listTrips(token)
    );
  },
  createTrip(
    token: string,
    body: {
      destination: string;
      subtitle?: string;
      travelDate: string;
      coverKey: string;
      packingList: PackingItem[];
    }
  ) {
    if (isFirestoreToken(token)) return firestoreStore.createTrip(body);
    return withFallback(
      () =>
        apiFetch<{ trip: TripItem }>('/api/trips', token, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      () => vercelStore.createTrip(token, body)
    );
  },
  updateTrip(
    token: string,
    id: number,
    body: {
      destination?: string;
      subtitle?: string | null;
      travelDate?: string;
      coverKey?: string;
      packingList?: PackingItem[];
    }
  ) {
    if (isFirestoreToken(token)) return firestoreStore.updateTrip(id, body);
    return withFallback(
      () =>
        apiFetch<{ trip: TripItem }>(`/api/trips/${id}`, token, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }),
      () => vercelStore.updateTrip(token, id, body)
    );
  },
  deleteTrip(token: string, id: number) {
    if (isFirestoreToken(token)) return firestoreStore.deleteTrip(id);
    return withFallback(
      () =>
        apiFetch<{ ok: boolean }>(`/api/trips/${id}`, token, {
          method: 'DELETE',
        }),
      () => vercelStore.deleteTrip(token, id)
    );
  },
};
