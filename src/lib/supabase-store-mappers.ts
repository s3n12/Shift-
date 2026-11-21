import type { HabitItem, PackingItem, TaskItem, TripItem } from '../types.ts';

export const ALLOWED_MODES = new Set(['work', 'weekend']);
export const ALLOWED_CATEGORIES = new Set(['wellness', 'plants', 'mindful']);
export const ALLOWED_COVERS = new Set(['kyoto', 'amalfi', 'alpine']);
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface SupabaseTaskRow {
  id: number | string;
  user_id: string;
  title: string;
  is_completed: boolean;
  mode: string;
  notes: string | null;
  created_at: string;
}

export interface SupabaseHabitRow {
  id: number | string;
  user_id: string;
  title: string;
  category: string;
  streak_count: number;
  completed_today: boolean;
  last_completed_date: string | null;
  target_minutes: number | null;
  created_at: string;
}

export interface SupabaseTripRow {
  id: number | string;
  user_id: string;
  destination: string;
  subtitle: string | null;
  travel_date: string;
  cover_key: string;
  packing_list: unknown;
  created_at: string;
}

export function clampString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function sanitizePackingList(items: unknown): PackingItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter(
      (item): item is { id?: unknown; label: string; packed?: unknown } =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as { label?: unknown }).label === 'string' &&
        (item as { label: string }).label.trim().length > 0
    )
    .slice(0, 100)
    .map((item, idx) => ({
      id:
        typeof item.id === 'string' && item.id.trim().length > 0
          ? clampString(item.id, 64)
          : `pack-${idx + 1}`,
      label: clampString(item.label, 160),
      packed: Boolean(item.packed),
    }));
}

export function mapTaskRow(row: SupabaseTaskRow): TaskItem {
  return {
    id: Number(row.id),
    userId: 1,
    title: row.title,
    isCompleted: Boolean(row.is_completed),
    mode: ALLOWED_MODES.has(row.mode) ? row.mode : 'work',
    notes: row.notes ?? null,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapHabitRow(row: SupabaseHabitRow, todayIso: string): HabitItem {
  const completedToday =
    Boolean(row.completed_today) &&
    (!row.last_completed_date || row.last_completed_date === todayIso);

  return {
    id: Number(row.id),
    userId: 1,
    title: row.title,
    category: ALLOWED_CATEGORIES.has(row.category) ? row.category : 'wellness',
    streakCount: Math.max(0, Number(row.streak_count) || 0),
    completedToday,
    lastCompletedDate: row.last_completed_date ?? null,
    targetMinutes:
      typeof row.target_minutes === 'number' && Number.isFinite(row.target_minutes)
        ? row.target_minutes
        : null,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapTripRow(row: SupabaseTripRow): TripItem {
  return {
    id: Number(row.id),
    userId: 1,
    destination: row.destination,
    subtitle: row.subtitle ?? null,
    travelDate: row.travel_date,
    coverKey: ALLOWED_COVERS.has(row.cover_key) ? row.cover_key : 'kyoto',
    packingList: sanitizePackingList(row.packing_list),
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function computeNextHabitToggle(
  row: Pick<SupabaseHabitRow, 'completed_today' | 'last_completed_date' | 'streak_count'>,
  todayIso: string
): {
  completed_today: boolean;
  streak_count: number;
  last_completed_date: string | null;
} {
  const isAlreadyDoneToday =
    Boolean(row.completed_today) && row.last_completed_date === todayIso;

  if (isAlreadyDoneToday) {
    return {
      completed_today: false,
      streak_count: Math.max(0, (Number(row.streak_count) || 0) - 1),
      last_completed_date: null,
    };
  }

  return {
    completed_today: true,
    streak_count: Math.max(0, Number(row.streak_count) || 0) + 1,
    last_completed_date: todayIso,
  };
}

export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  const message =
    'message' in error ? String((error as { message?: unknown }).message || '').toLowerCase() : '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('could not find the table') ||
    (message.includes('relation') && message.includes('does not exist'))
  );
}

export function formatSupabaseDbError(error: unknown, fallback: string): string {
  if (isMissingTableError(error)) {
    return 'Supabase tables are not created yet. Run the SQL in supabase/schema.sql inside your Supabase SQL Editor, then refresh.';
  }
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : '';
  if (message.toLowerCase().includes('row-level security')) {
    return 'Database access was blocked by Supabase Row-Level Security. Please sign in again or verify your policies from supabase/schema.sql.';
  }
  return message.trim() || fallback;
}
