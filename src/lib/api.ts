import type { HabitItem, PackingItem, TaskItem, TripItem, UserProfile } from '../types.ts';
import { vercelStore } from './vercel-store.ts';

class BackendUnavailableError extends Error {
  constructor() {
    super('API backend unavailable');
    this.name = 'BackendUnavailableError';
  }
}

let useStandaloneStore = false;

async function apiFetch<T>(
  path: string,
  token: string | null,
  options: RequestInit = {}
): Promise<T> {
  if (useStandaloneStore || (token && token.startsWith('local.'))) {
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
    useStandaloneStore = true;
    throw new BackendUnavailableError();
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    // Static hosts (e.g. Vercel Vite deployment) return HTML/404/405 for /api/*
    useStandaloneStore = true;
    throw new BackendUnavailableError();
  }

  const data = await response.json().catch(() => null);
  if (data === null) {
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

  requestOtp(body: { email: string; displayName?: string }) {
    return withFallback(
      () =>
        apiFetch<{
          ok: boolean;
          channel: 'email';
          delivered: 'email' | 'preview';
          maskedTarget: string;
          verificationCode?: string;
          displayName: string | null;
        }>('/api/auth/request-otp', null, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      () => vercelStore.requestOtp(body)
    );
  },

  verifyOtp(body: { email: string; code: string; displayName?: string }) {
    return withFallback(
      () =>
        apiFetch<{ token: string; user: UserProfile }>(
          '/api/auth/verify-otp',
          null,
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        ),
      () => vercelStore.verifyOtp(body)
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
    return withFallback(
      () => apiFetch<{ tasks: TaskItem[] }>('/api/tasks', token),
      () => vercelStore.listTasks(token)
    );
  },
  createTask(token: string, body: { title: string; mode?: string; notes?: string }) {
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
    return withFallback(
      () => apiFetch<{ habits: HabitItem[] }>('/api/habits', token),
      () => vercelStore.listHabits(token)
    );
  },
  createHabit(
    token: string,
    body: { title: string; category?: string; targetMinutes?: number | null }
  ) {
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
    return withFallback(
      () =>
        apiFetch<{ habit: HabitItem }>(`/api/habits/${id}/toggle`, token, {
          method: 'POST',
        }),
      () => vercelStore.toggleHabit(token, id)
    );
  },
  deleteHabit(token: string, id: number) {
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
    return withFallback(
      () =>
        apiFetch<{ ok: boolean }>(`/api/trips/${id}`, token, {
          method: 'DELETE',
        }),
      () => vercelStore.deleteTrip(token, id)
    );
  },
};
