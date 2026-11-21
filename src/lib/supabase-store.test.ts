import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNextHabitToggle,
  formatSupabaseDbError,
  isMissingTableError,
  mapHabitRow,
  mapTaskRow,
  mapTripRow,
  sanitizePackingList,
} from './supabase-store-mappers.ts';

test('mapTaskRow normalizes mode and boolean fields from Supabase rows', () => {
  const task = mapTaskRow({
    id: '42',
    user_id: 'user-uuid-1',
    title: 'Ship Supabase DB sync',
    is_completed: true,
    mode: 'weekend',
    notes: 'Verify RLS policies',
    created_at: '2026-11-21T00:00:00.000Z',
  });

  assert.equal(task.id, 42);
  assert.equal(task.title, 'Ship Supabase DB sync');
  assert.equal(task.isCompleted, true);
  assert.equal(task.mode, 'weekend');
  assert.equal(task.notes, 'Verify RLS policies');

  const fallbackMode = mapTaskRow({
    id: 7,
    user_id: 'user-uuid-1',
    title: 'Unknown mode task',
    is_completed: false,
    mode: 'invalid',
    notes: null,
    created_at: '2026-11-21T00:00:00.000Z',
  });
  assert.equal(fallbackMode.mode, 'work');
});

test('mapHabitRow and computeNextHabitToggle handle daily rollover and toggling accurately', () => {
  const yesterdayRow = {
    id: 10,
    user_id: 'user-uuid-1',
    title: 'Morning yoga',
    category: 'wellness',
    streak_count: 5,
    completed_today: true,
    last_completed_date: '2026-11-20',
    target_minutes: 15,
    created_at: '2026-11-15T00:00:00.000Z',
  };

  // On a new day, completedToday resets to false until toggled today
  const mappedToday = mapHabitRow(yesterdayRow, '2026-11-21');
  assert.equal(mappedToday.completedToday, false);
  assert.equal(mappedToday.streakCount, 5);

  // Toggling on today increments streak and stamps today's date
  const toggledOn = computeNextHabitToggle(yesterdayRow, '2026-11-21');
  assert.deepEqual(toggledOn, {
    completed_today: true,
    streak_count: 6,
    last_completed_date: '2026-11-21',
  });

  // Toggling off on the same day decrements streak and clears last_completed_date
  const toggledOff = computeNextHabitToggle(toggledOn, '2026-11-21');
  assert.deepEqual(toggledOff, {
    completed_today: false,
    streak_count: 5,
    last_completed_date: null,
  });
});

test('mapTripRow and sanitizePackingList enforce safe packing list shapes and cover keys', () => {
  const cleanPacking = sanitizePackingList([
    { id: 'p1', label: '  Passport  ', packed: true },
    { id: '', label: 'Charger', packed: false },
    { id: 'empty', label: '   ', packed: false },
    null,
  ]);
  assert.deepEqual(cleanPacking, [
    { id: 'p1', label: 'Passport', packed: true },
    { id: 'pack-2', label: 'Charger', packed: false },
  ]);

  const trip = mapTripRow({
    id: 99,
    user_id: 'user-uuid-1',
    destination: 'Kyoto, Japan',
    subtitle: 'Slow mornings',
    travel_date: '2026-12-15',
    cover_key: 'unknown-cover',
    packing_list: cleanPacking,
    created_at: '2026-11-21T00:00:00.000Z',
  });
  assert.equal(trip.coverKey, 'kyoto');
  assert.equal(trip.packingList.length, 2);
});

test('formatSupabaseDbError detects missing schema tables and RLS denials clearly', () => {
  assert.equal(isMissingTableError({ code: 'PGRST205', message: 'Not found' }), true);
  assert.equal(
    isMissingTableError({ message: 'relation "public.tasks" does not exist' }),
    true
  );
  assert.match(
    formatSupabaseDbError({ code: '42P01', message: 'relation missing' }, 'Failed'),
    /supabase\/schema\.sql/i
  );
  assert.match(
    formatSupabaseDbError(
      { message: 'new row violates row-level security policy for table "tasks"' },
      'Failed'
    ),
    /Row-Level Security/i
  );
});
