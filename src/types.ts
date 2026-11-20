export type PlannerMode = 'work' | 'weekend';

export type PageRoute = 'dashboard' | 'habits' | 'trips';

export interface UserProfile {
  id: number;
  uid: string;
  email: string | null;
  phone?: string | null;
  displayName: string | null;
  authProvider: string;
}

export interface TaskItem {
  id: number;
  userId: number;
  title: string;
  isCompleted: boolean;
  mode: string;
  notes: string | null;
  createdAt: string;
}

export interface HabitItem {
  id: number;
  userId: number;
  title: string;
  category: string;
  streakCount: number;
  completedToday: boolean;
  lastCompletedDate: string | null;
  targetMinutes: number | null;
  createdAt: string;
}

export interface PackingItem {
  id: string;
  label: string;
  packed: boolean;
}

export interface TripItem {
  id: number;
  userId: number;
  destination: string;
  subtitle: string | null;
  travelDate: string;
  coverKey: string;
  packingList: PackingItem[];
  createdAt: string;
}

export const LOGIN_HERO_IMAGE =
  '/src/assets/images/login_lifestyle_hero_1795173284290.jpg';

export const HABIT_RITUAL_IMAGE =
  '/src/assets/images/habit_morning_ritual_1795173293080.jpg';

export const TRIP_COVERS: Record<string, { label: string; src: string }> = {
  kyoto: {
    label: 'Kyoto Garden',
    src: '/src/assets/images/trip_kyoto_retreat_1795173285216.jpg',
  },
  amalfi: {
    label: 'Amalfi Terrace',
    src: '/src/assets/images/trip_amalfi_coast_1795173284059.jpg',
  },
  alpine: {
    label: 'Alpine Cabin',
    src: '/src/assets/images/trip_alpine_cabin_1795173284535.jpg',
  },
};

export function getTripCoverSrc(coverKey: string): string {
  return TRIP_COVERS[coverKey]?.src || TRIP_COVERS.kyoto.src;
}

export function daysUntil(dateStr: string): number {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const diffMs = target.getTime() - startOfToday.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function formatReadableDate(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
