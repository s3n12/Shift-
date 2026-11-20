import type { HabitItem, PackingItem, TaskItem, TripItem, UserProfile } from '../types.ts';

async function apiFetch<T>(
  path: string,
  token: string | null,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data as T;
}

export const api = {
  requestOtp(body: {
    email: string;
    password?: string;
    mode: 'login' | 'signup' | 'otp';
    displayName?: string;
  }) {
    return apiFetch<{
      ok: boolean;
      maskedEmail: string;
      verificationCode: string;
      displayName: string | null;
    }>('/api/auth/request-otp', null, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  verifyOtp(body: {
    email: string;
    code: string;
    password?: string;
    displayName?: string;
    mode: 'login' | 'signup' | 'otp';
  }) {
    return apiFetch<{ token: string; user: UserProfile }>(
      '/api/auth/verify-otp',
      null,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  },

  getMe(token: string) {
    return apiFetch<{ user: UserProfile }>('/api/auth/me', token);
  },

  // Tasks
  listTasks(token: string) {
    return apiFetch<{ tasks: TaskItem[] }>('/api/tasks', token);
  },
  createTask(token: string, body: { title: string; mode?: string; notes?: string }) {
    return apiFetch<{ task: TaskItem }>('/api/tasks', token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  updateTask(
    token: string,
    id: number,
    body: { title?: string; isCompleted?: boolean; notes?: string | null; mode?: string }
  ) {
    return apiFetch<{ task: TaskItem }>(`/api/tasks/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  deleteTask(token: string, id: number) {
    return apiFetch<{ ok: boolean }>(`/api/tasks/${id}`, token, {
      method: 'DELETE',
    });
  },

  // Habits
  listHabits(token: string) {
    return apiFetch<{ habits: HabitItem[] }>('/api/habits', token);
  },
  createHabit(
    token: string,
    body: { title: string; category?: string; targetMinutes?: number | null }
  ) {
    return apiFetch<{ habit: HabitItem }>('/api/habits', token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  toggleHabit(token: string, id: number) {
    return apiFetch<{ habit: HabitItem }>(`/api/habits/${id}/toggle`, token, {
      method: 'POST',
    });
  },
  deleteHabit(token: string, id: number) {
    return apiFetch<{ ok: boolean }>(`/api/habits/${id}`, token, {
      method: 'DELETE',
    });
  },

  // Trips
  listTrips(token: string) {
    return apiFetch<{ trips: TripItem[] }>('/api/trips', token);
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
    return apiFetch<{ trip: TripItem }>('/api/trips', token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
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
    return apiFetch<{ trip: TripItem }>(`/api/trips/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  deleteTrip(token: string, id: number) {
    return apiFetch<{ ok: boolean }>(`/api/trips/${id}`, token, {
      method: 'DELETE',
    });
  },
};
