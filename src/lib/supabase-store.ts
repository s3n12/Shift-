import type {
  HabitItem,
  PackingItem,
  TaskItem,
  TripItem,
  UserProfile,
} from '../types.ts';
import { getSupabaseClient, type SupabaseAuthUser } from './supabase.ts';
import {
  ALLOWED_CATEGORIES,
  ALLOWED_COVERS,
  ALLOWED_MODES,
  clampString,
  computeNextHabitToggle,
  DATE_PATTERN,
  formatSupabaseDbError,
  isMissingTableError,
  mapHabitRow,
  mapTaskRow,
  mapTripRow,
  sanitizePackingList,
  type SupabaseHabitRow,
  type SupabaseTaskRow,
  type SupabaseTripRow,
} from './supabase-store-mappers.ts';

export const SUPABASE_SESSION_TOKEN = 'supabase.session';

function todayDateIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatFutureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

async function requireSupabaseUserId(): Promise<string> {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.id) {
    throw new Error('Your Supabase session has expired. Please sign in again.');
  }
  return data.user.id;
}

async function seedStarterData(userId: string): Promise<void> {
  const client = await getSupabaseClient();

  const [tasksCheck, habitsCheck, tripsCheck] = await Promise.all([
    client.from('tasks').select('id').eq('user_id', userId).limit(1),
    client.from('habits').select('id').eq('user_id', userId).limit(1),
    client.from('trips').select('id').eq('user_id', userId).limit(1),
  ]);

  if (
    isMissingTableError(tasksCheck.error) ||
    isMissingTableError(habitsCheck.error) ||
    isMissingTableError(tripsCheck.error)
  ) {
    return;
  }

  if (!tasksCheck.error && (!tasksCheck.data || tasksCheck.data.length === 0)) {
    await client.from('tasks').insert([
      {
        user_id: userId,
        title: 'Finalize Q4 roadmap priorities deck',
        is_completed: false,
        mode: 'work',
        notes: 'Keep executive summary to 3 crisp slides before Thursday sync',
      },
      {
        user_id: userId,
        title: 'Review product design tokens with engineering',
        is_completed: true,
        mode: 'work',
        notes: 'Confirm spacing scale and button states',
      },
      {
        user_id: userId,
        title: 'Send weekly stakeholder progress update',
        is_completed: false,
        mode: 'work',
        notes: 'Include timeline highlights and next week milestones',
      },
    ]);
  }

  if (!habitsCheck.error && (!habitsCheck.data || habitsCheck.data.length === 0)) {
    const today = todayDateIso();
    await client.from('habits').insert([
      {
        user_id: userId,
        title: '15 mins of morning yoga',
        category: 'wellness',
        streak_count: 6,
        completed_today: true,
        last_completed_date: today,
        target_minutes: 15,
      },
      {
        user_id: userId,
        title: 'Water indoor plants & mist monstera',
        category: 'plants',
        streak_count: 4,
        completed_today: false,
        last_completed_date: null,
        target_minutes: 10,
      },
      {
        user_id: userId,
        title: 'Read 20 pages with herbal tea',
        category: 'mindful',
        streak_count: 9,
        completed_today: false,
        last_completed_date: null,
        target_minutes: 25,
      },
      {
        user_id: userId,
        title: 'Sunset phone-free neighborhood walk',
        category: 'wellness',
        streak_count: 3,
        completed_today: false,
        last_completed_date: null,
        target_minutes: 30,
      },
    ]);
  }

  if (!tripsCheck.error && (!tripsCheck.data || tripsCheck.data.length === 0)) {
    await client.from('trips').insert([
      {
        user_id: userId,
        destination: 'Kyoto, Japan',
        subtitle: 'Cedar tea houses, moss gardens & slow mornings',
        travel_date: formatFutureDate(24),
        cover_key: 'kyoto',
        packing_list: [
          { id: 'kyoto-1', label: 'Passport & rail pass', packed: true },
          {
            id: 'kyoto-2',
            label: 'Linen overshirt & comfortable walking shoes',
            packed: true,
          },
          {
            id: 'kyoto-3',
            label: '35mm travel camera & spare film rolls',
            packed: false,
          },
          { id: 'kyoto-4', label: 'Compact rain umbrella', packed: false },
          {
            id: 'kyoto-5',
            label: 'Universal travel power adapter',
            packed: false,
          },
        ],
      },
      {
        user_id: userId,
        destination: 'Ravello, Amalfi Coast',
        subtitle: 'Cliffside terraces, lemon groves & coastal swims',
        travel_date: formatFutureDate(68),
        cover_key: 'amalfi',
        packing_list: [
          { id: 'amalfi-1', label: 'Swimwear & Turkish linen towel', packed: false },
          { id: 'amalfi-2', label: 'Mineral sunscreen & sunglasses', packed: false },
          { id: 'amalfi-3', label: 'Evening summer reading novel', packed: true },
        ],
      },
    ]);
  }
}

export const supabaseStore = {
  async syncSupabaseUser(
    sbUser: SupabaseAuthUser,
    authProvider = 'supabase-otp'
  ): Promise<{ token: string; user: UserProfile }> {
    const fallbackName =
      sbUser.displayName ||
      (sbUser.email ? sbUser.email.split('@')[0] : sbUser.phone || 'Shift Member');

    const profile: UserProfile = {
      id: 1,
      uid: sbUser.id,
      email: sbUser.email,
      phone: sbUser.phone,
      displayName: fallbackName,
      authProvider,
    };

    try {
      const client = await getSupabaseClient();
      const { data: existing, error: selectErr } = await client
        .from('profiles')
        .select('id, email, phone, display_name, auth_provider, seeded')
        .eq('id', sbUser.id)
        .maybeSingle();

      if (selectErr) {
        // Allow sign-in to complete even if schema.sql hasn't been executed yet;
        // table queries will surface the clear SQL setup banner inside Shift.
        if (isMissingTableError(selectErr)) {
          return { token: SUPABASE_SESSION_TOKEN, user: profile };
        }
        throw selectErr;
      }

      const displayName =
        existing?.display_name || sbUser.displayName || fallbackName;

      if (!existing) {
        const { error: insertErr } = await client.from('profiles').insert({
          id: sbUser.id,
          email: sbUser.email,
          phone: sbUser.phone,
          display_name: clampString(displayName, 120),
          auth_provider: authProvider,
          seeded: false,
        });
        if (insertErr && !isMissingTableError(insertErr)) {
          throw insertErr;
        }
      } else {
        await client
          .from('profiles')
          .update({
            email: sbUser.email ?? existing.email,
            phone: sbUser.phone ?? existing.phone,
            display_name: clampString(displayName, 120),
            updated_at: new Date().toISOString(),
          })
          .eq('id', sbUser.id);
      }

      if (!existing?.seeded) {
        await seedStarterData(sbUser.id);
        await client
          .from('profiles')
          .update({ seeded: true, updated_at: new Date().toISOString() })
          .eq('id', sbUser.id);
      }

      return {
        token: SUPABASE_SESSION_TOKEN,
        user: {
          ...profile,
          displayName,
          authProvider: existing?.auth_provider || authProvider,
        },
      };
    } catch (err) {
      if (isMissingTableError(err)) {
        return { token: SUPABASE_SESSION_TOKEN, user: profile };
      }
      throw new Error(
        formatSupabaseDbError(err, 'Unable to sync your Supabase profile.')
      );
    }
  },

  // --- Tasks ---
  async listTasks(): Promise<{ tasks: TaskItem[] }> {
    const userId = await requireSupabaseUserId();
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('tasks')
      .select('id, user_id, title, is_completed, mode, notes, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(formatSupabaseDbError(error, 'Could not load tasks from Supabase.'));
    }

    return {
      tasks: ((data || []) as SupabaseTaskRow[]).map(mapTaskRow),
    };
  },

  async createTask(body: {
    title: string;
    mode?: string;
    notes?: string;
  }): Promise<{ task: TaskItem }> {
    const userId = await requireSupabaseUserId();
    const title = clampString(body.title || '', 200);
    if (!title) {
      throw new Error('Task title is required.');
    }
    const mode = body.mode && ALLOWED_MODES.has(body.mode) ? body.mode : 'work';
    const notes =
      typeof body.notes === 'string' && body.notes.trim().length > 0
        ? clampString(body.notes, 2000)
        : null;

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('tasks')
      .insert({
        user_id: userId,
        title,
        is_completed: false,
        mode,
        notes,
      })
      .select('id, user_id, title, is_completed, mode, notes, created_at')
      .single();

    if (error || !data) {
      throw new Error(formatSupabaseDbError(error, 'Could not create task in Supabase.'));
    }

    return { task: mapTaskRow(data as SupabaseTaskRow) };
  },

  async updateTask(
    id: number,
    body: {
      title?: string;
      isCompleted?: boolean;
      notes?: string | null;
      mode?: string;
    }
  ): Promise<{ task: TaskItem }> {
    const userId = await requireSupabaseUserId();
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.title === 'string') {
      const cleanTitle = clampString(body.title, 200);
      if (!cleanTitle) throw new Error('Task title cannot be empty.');
      patch.title = cleanTitle;
    }
    if (typeof body.isCompleted === 'boolean') {
      patch.is_completed = body.isCompleted;
    }
    if (body.notes !== undefined) {
      patch.notes =
        typeof body.notes === 'string' && body.notes.trim().length > 0
          ? clampString(body.notes, 2000)
          : null;
    }
    if (typeof body.mode === 'string' && ALLOWED_MODES.has(body.mode)) {
      patch.mode = body.mode;
    }

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('tasks')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, user_id, title, is_completed, mode, notes, created_at')
      .single();

    if (error || !data) {
      throw new Error(formatSupabaseDbError(error, 'Could not update task in Supabase.'));
    }

    return { task: mapTaskRow(data as SupabaseTaskRow) };
  },

  async deleteTask(id: number): Promise<{ ok: boolean }> {
    const userId = await requireSupabaseUserId();
    const client = await getSupabaseClient();
    const { error } = await client
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(formatSupabaseDbError(error, 'Could not delete task in Supabase.'));
    }
    return { ok: true };
  },

  // --- Habits ---
  async listHabits(): Promise<{ habits: HabitItem[] }> {
    const userId = await requireSupabaseUserId();
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('habits')
      .select(
        'id, user_id, title, category, streak_count, completed_today, last_completed_date, target_minutes, created_at'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(formatSupabaseDbError(error, 'Could not load habits from Supabase.'));
    }

    const today = todayDateIso();
    return {
      habits: ((data || []) as SupabaseHabitRow[]).map((row) =>
        mapHabitRow(row, today)
      ),
    };
  },

  async createHabit(body: {
    title: string;
    category?: string;
    targetMinutes?: number | null;
  }): Promise<{ habit: HabitItem }> {
    const userId = await requireSupabaseUserId();
    const title = clampString(body.title || '', 160);
    if (!title) {
      throw new Error('Habit title is required.');
    }
    const category =
      body.category && ALLOWED_CATEGORIES.has(body.category)
        ? body.category
        : 'wellness';
    const targetMinutes =
      typeof body.targetMinutes === 'number' &&
      Number.isFinite(body.targetMinutes) &&
      body.targetMinutes >= 1
        ? Math.min(600, Math.round(body.targetMinutes))
        : null;

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('habits')
      .insert({
        user_id: userId,
        title,
        category,
        streak_count: 0,
        completed_today: false,
        last_completed_date: null,
        target_minutes: targetMinutes,
      })
      .select(
        'id, user_id, title, category, streak_count, completed_today, last_completed_date, target_minutes, created_at'
      )
      .single();

    if (error || !data) {
      throw new Error(formatSupabaseDbError(error, 'Could not create habit in Supabase.'));
    }

    return { habit: mapHabitRow(data as SupabaseHabitRow, todayDateIso()) };
  },

  async toggleHabit(id: number): Promise<{ habit: HabitItem }> {
    const userId = await requireSupabaseUserId();
    const client = await getSupabaseClient();

    const { data: current, error: fetchErr } = await client
      .from('habits')
      .select(
        'id, user_id, title, category, streak_count, completed_today, last_completed_date, target_minutes, created_at'
      )
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !current) {
      throw new Error(formatSupabaseDbError(fetchErr, 'Habit not found in Supabase.'));
    }

    const today = todayDateIso();
    const nextState = computeNextHabitToggle(current as SupabaseHabitRow, today);

    const { data: updated, error: updateErr } = await client
      .from('habits')
      .update({
        ...nextState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select(
        'id, user_id, title, category, streak_count, completed_today, last_completed_date, target_minutes, created_at'
      )
      .single();

    if (updateErr || !updated) {
      throw new Error(formatSupabaseDbError(updateErr, 'Could not toggle habit in Supabase.'));
    }

    return { habit: mapHabitRow(updated as SupabaseHabitRow, today) };
  },

  async deleteHabit(id: number): Promise<{ ok: boolean }> {
    const userId = await requireSupabaseUserId();
    const client = await getSupabaseClient();
    const { error } = await client
      .from('habits')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(formatSupabaseDbError(error, 'Could not delete habit in Supabase.'));
    }
    return { ok: true };
  },

  // --- Trips ---
  async listTrips(): Promise<{ trips: TripItem[] }> {
    const userId = await requireSupabaseUserId();
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('trips')
      .select('id, user_id, destination, subtitle, travel_date, cover_key, packing_list, created_at')
      .eq('user_id', userId)
      .order('travel_date', { ascending: true });

    if (error) {
      throw new Error(formatSupabaseDbError(error, 'Could not load trips from Supabase.'));
    }

    return {
      trips: ((data || []) as SupabaseTripRow[]).map(mapTripRow),
    };
  },

  async createTrip(body: {
    destination: string;
    subtitle?: string;
    travelDate: string;
    coverKey: string;
    packingList: PackingItem[];
  }): Promise<{ trip: TripItem }> {
    const userId = await requireSupabaseUserId();
    const destination = clampString(body.destination || '', 140);
    if (!destination) {
      throw new Error('Destination is required.');
    }
    const travelDate = DATE_PATTERN.test(body.travelDate || '')
      ? body.travelDate
      : formatFutureDate(30);
    const coverKey = ALLOWED_COVERS.has(body.coverKey) ? body.coverKey : 'kyoto';
    const subtitle =
      typeof body.subtitle === 'string' && body.subtitle.trim().length > 0
        ? clampString(body.subtitle, 240)
        : null;
    const packingList = sanitizePackingList(body.packingList);

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('trips')
      .insert({
        user_id: userId,
        destination,
        subtitle,
        travel_date: travelDate,
        cover_key: coverKey,
        packing_list: packingList,
      })
      .select('id, user_id, destination, subtitle, travel_date, cover_key, packing_list, created_at')
      .single();

    if (error || !data) {
      throw new Error(formatSupabaseDbError(error, 'Could not create trip in Supabase.'));
    }

    return { trip: mapTripRow(data as SupabaseTripRow) };
  },

  async updateTrip(
    id: number,
    body: {
      destination?: string;
      subtitle?: string | null;
      travelDate?: string;
      coverKey?: string;
      packingList?: PackingItem[];
    }
  ): Promise<{ trip: TripItem }> {
    const userId = await requireSupabaseUserId();
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.destination === 'string') {
      const cleanDest = clampString(body.destination, 140);
      if (!cleanDest) throw new Error('Destination cannot be empty.');
      patch.destination = cleanDest;
    }
    if (body.subtitle !== undefined) {
      patch.subtitle =
        typeof body.subtitle === 'string' && body.subtitle.trim().length > 0
          ? clampString(body.subtitle, 240)
          : null;
    }
    if (typeof body.travelDate === 'string' && DATE_PATTERN.test(body.travelDate)) {
      patch.travel_date = body.travelDate;
    }
    if (typeof body.coverKey === 'string' && ALLOWED_COVERS.has(body.coverKey)) {
      patch.cover_key = body.coverKey;
    }
    if (body.packingList !== undefined) {
      patch.packing_list = sanitizePackingList(body.packingList);
    }

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('trips')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, user_id, destination, subtitle, travel_date, cover_key, packing_list, created_at')
      .single();

    if (error || !data) {
      throw new Error(formatSupabaseDbError(error, 'Could not update trip in Supabase.'));
    }

    return { trip: mapTripRow(data as SupabaseTripRow) };
  },

  async deleteTrip(id: number): Promise<{ ok: boolean }> {
    const userId = await requireSupabaseUserId();
    const client = await getSupabaseClient();
    const { error } = await client
      .from('trips')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(formatSupabaseDbError(error, 'Could not delete trip in Supabase.'));
    }
    return { ok: true };
  },
};
