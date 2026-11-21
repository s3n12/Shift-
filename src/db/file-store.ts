import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PackingItem } from './schema.ts';

export interface FileUserRecord {
  id: number;
  uid: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  passwordHash: string | null;
  authProvider: string;
  createdAt: Date;
}

export interface FileOtpRecord {
  id: number;
  email: string | null;
  phone: string | null;
  channel: string;
  code: string;
  purpose: string;
  expiresAt: Date;
  consumed: boolean;
  createdAt: Date;
}

export interface FileTaskRecord {
  id: number;
  userId: number;
  title: string;
  isCompleted: boolean;
  mode: string;
  notes: string | null;
  createdAt: Date;
}

export interface FileHabitRecord {
  id: number;
  userId: number;
  title: string;
  category: string;
  streakCount: number;
  completedToday: boolean;
  lastCompletedDate: string | null;
  targetMinutes: number | null;
  createdAt: Date;
}

export interface FileTripRecord {
  id: number;
  userId: number;
  destination: string;
  subtitle: string | null;
  travelDate: string;
  coverKey: string;
  packingList: PackingItem[];
  createdAt: Date;
}

interface SerializedStore {
  nextUserId: number;
  nextOtpId: number;
  nextTaskId: number;
  nextHabitId: number;
  nextTripId: number;
  users: Array<Omit<FileUserRecord, 'createdAt'> & { createdAt: string }>;
  otpCodes: Array<
    Omit<FileOtpRecord, 'expiresAt' | 'createdAt'> & {
      expiresAt: string;
      createdAt: string;
    }
  >;
  tasks: Array<Omit<FileTaskRecord, 'createdAt'> & { createdAt: string }>;
  habits: Array<Omit<FileHabitRecord, 'createdAt'> & { createdAt: string }>;
  trips: Array<Omit<FileTripRecord, 'createdAt'> & { createdAt: string }>;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'shift-db.json');

let memoryStore: SerializedStore | null = null;

function createEmptyStore(): SerializedStore {
  return {
    nextUserId: 1,
    nextOtpId: 1,
    nextTaskId: 1,
    nextHabitId: 1,
    nextTripId: 1,
    users: [],
    otpCodes: [],
    tasks: [],
    habits: [],
    trips: [],
  };
}

function loadStore(): SerializedStore {
  if (memoryStore) return memoryStore;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SerializedStore>;
      memoryStore = {
        nextUserId: parsed.nextUserId ?? 1,
        nextOtpId: parsed.nextOtpId ?? 1,
        nextTaskId: parsed.nextTaskId ?? 1,
        nextHabitId: parsed.nextHabitId ?? 1,
        nextTripId: parsed.nextTripId ?? 1,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        otpCodes: Array.isArray(parsed.otpCodes) ? parsed.otpCodes : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        habits: Array.isArray(parsed.habits) ? parsed.habits : [],
        trips: Array.isArray(parsed.trips) ? parsed.trips : [],
      };
      return memoryStore;
    }
  } catch (err) {
    console.error('Failed to read local store, starting fresh:', err);
  }
  memoryStore = createEmptyStore();
  return memoryStore;
}

function saveStore(store: SerializedStore) {
  memoryStore = store;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('Failed to persist local store to disk:', err);
  }
}

function formatFutureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function toUserRecord(u: SerializedStore['users'][number]): FileUserRecord {
  return { ...u, createdAt: new Date(u.createdAt) };
}

function toTaskRecord(t: SerializedStore['tasks'][number]): FileTaskRecord {
  return { ...t, createdAt: new Date(t.createdAt) };
}

function toHabitRecord(h: SerializedStore['habits'][number]): FileHabitRecord {
  return { ...h, createdAt: new Date(h.createdAt) };
}

function toTripRecord(t: SerializedStore['trips'][number]): FileTripRecord {
  return { ...t, createdAt: new Date(t.createdAt) };
}

function seedStarterData(store: SerializedStore, userId: number) {
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  if (!store.tasks.some((t) => t.userId === userId)) {
    store.tasks.push(
      {
        id: store.nextTaskId++,
        userId,
        title: 'Finalize Q4 roadmap priorities deck',
        isCompleted: false,
        mode: 'work',
        notes: 'Keep executive summary to 3 crisp slides before Thursday sync',
        createdAt: nowIso,
      },
      {
        id: store.nextTaskId++,
        userId,
        title: 'Review product design tokens with engineering',
        isCompleted: true,
        mode: 'work',
        notes: 'Confirm spacing scale and button states',
        createdAt: nowIso,
      },
      {
        id: store.nextTaskId++,
        userId,
        title: 'Send weekly stakeholder progress update',
        isCompleted: false,
        mode: 'work',
        notes: 'Include timeline highlights and next week milestones',
        createdAt: nowIso,
      }
    );
  }

  if (!store.habits.some((h) => h.userId === userId)) {
    store.habits.push(
      {
        id: store.nextHabitId++,
        userId,
        title: '15 mins of morning yoga',
        category: 'wellness',
        streakCount: 6,
        completedToday: true,
        lastCompletedDate: today,
        targetMinutes: 15,
        createdAt: nowIso,
      },
      {
        id: store.nextHabitId++,
        userId,
        title: 'Water indoor plants & mist monstera',
        category: 'plants',
        streakCount: 4,
        completedToday: false,
        lastCompletedDate: null,
        targetMinutes: 10,
        createdAt: nowIso,
      },
      {
        id: store.nextHabitId++,
        userId,
        title: 'Read 20 pages with herbal tea',
        category: 'mindful',
        streakCount: 9,
        completedToday: false,
        lastCompletedDate: null,
        targetMinutes: 25,
        createdAt: nowIso,
      },
      {
        id: store.nextHabitId++,
        userId,
        title: 'Sunset phone-free neighborhood walk',
        category: 'wellness',
        streakCount: 3,
        completedToday: false,
        lastCompletedDate: null,
        targetMinutes: 30,
        createdAt: nowIso,
      }
    );
  }

  if (!store.trips.some((t) => t.userId === userId)) {
    store.trips.push(
      {
        id: store.nextTripId++,
        userId,
        destination: 'Kyoto, Japan',
        subtitle: 'Cedar tea houses, moss gardens & slow mornings',
        travelDate: formatFutureDate(24),
        coverKey: 'kyoto',
        packingList: [
          { id: crypto.randomUUID(), label: 'Passport & rail pass', packed: true },
          {
            id: crypto.randomUUID(),
            label: 'Linen overshirt & comfortable walking shoes',
            packed: true,
          },
          {
            id: crypto.randomUUID(),
            label: '35mm travel camera & spare film rolls',
            packed: false,
          },
          { id: crypto.randomUUID(), label: 'Compact rain umbrella', packed: false },
          {
            id: crypto.randomUUID(),
            label: 'Universal travel power adapter',
            packed: false,
          },
        ],
        createdAt: nowIso,
      },
      {
        id: store.nextTripId++,
        userId,
        destination: 'Ravello, Amalfi Coast',
        subtitle: 'Cliffside terraces, lemon groves & coastal swims',
        travelDate: formatFutureDate(68),
        coverKey: 'amalfi',
        packingList: [
          {
            id: crypto.randomUUID(),
            label: 'Swimwear & Turkish linen towel',
            packed: false,
          },
          {
            id: crypto.randomUUID(),
            label: 'Mineral sunscreen & sunglasses',
            packed: false,
          },
          {
            id: crypto.randomUUID(),
            label: 'Evening summer reading novel',
            packed: true,
          },
        ],
        createdAt: nowIso,
      }
    );
  }
}

export const fileRepository = {
  async getOrCreateUser(params: {
    uid: string;
    email: string;
    phone?: string | null;
    displayName?: string | null;
    authProvider?: string;
    passwordHash?: string | null;
  }): Promise<FileUserRecord> {
    const store = loadStore();
    const normalizedEmail = params.email.trim().toLowerCase();
    const existingByEmail = store.users.find((u) => u.email === normalizedEmail);

    if (existingByEmail) {
      let changed = false;
      if (
        params.displayName?.trim() &&
        (!existingByEmail.displayName || params.passwordHash)
      ) {
        existingByEmail.displayName = params.displayName.trim();
        changed = true;
      }
      if (params.passwordHash && !existingByEmail.passwordHash) {
        existingByEmail.passwordHash = params.passwordHash;
        existingByEmail.authProvider = 'email-password';
        changed = true;
      }
      if (params.phone && !existingByEmail.phone) {
        existingByEmail.phone = params.phone;
        changed = true;
      }
      if (changed) saveStore(store);
      return toUserRecord(existingByEmail);
    }

    const existingByUid = store.users.find((u) => u.uid === params.uid);
    if (existingByUid) {
      existingByUid.email = normalizedEmail;
      if (params.phone) existingByUid.phone = params.phone;
      existingByUid.displayName =
        params.displayName || normalizedEmail.split('@')[0];
      saveStore(store);
      return toUserRecord(existingByUid);
    }

    const created = {
      id: store.nextUserId++,
      uid: params.uid,
      email: normalizedEmail,
      phone: params.phone ?? null,
      displayName: params.displayName || normalizedEmail.split('@')[0],
      passwordHash: params.passwordHash ?? null,
      authProvider: params.authProvider || 'google',
      createdAt: new Date().toISOString(),
    };
    store.users.push(created);
    seedStarterData(store, created.id);
    saveStore(store);
    return toUserRecord(created);
  },

  async findUserByEmail(email: string): Promise<FileUserRecord | null> {
    const store = loadStore();
    const normalized = email.trim().toLowerCase();
    const found = store.users.find((u) => u.email === normalized);
    return found ? toUserRecord(found) : null;
  },

  async findUserByPhone(phone: string): Promise<FileUserRecord | null> {
    const store = loadStore();
    const found = store.users.find((u) => u.phone === phone);
    return found ? toUserRecord(found) : null;
  },

  async getOrCreatePhoneUser(params: {
    phone: string;
    displayName?: string | null;
  }): Promise<FileUserRecord> {
    const store = loadStore();
    const existing = store.users.find((u) => u.phone === params.phone);
    if (existing) {
      if (params.displayName && !existing.displayName) {
        existing.displayName = params.displayName;
        saveStore(store);
      }
      return toUserRecord(existing);
    }

    const created = {
      id: store.nextUserId++,
      uid: `phone:${crypto.randomUUID()}`,
      email: null,
      phone: params.phone,
      displayName: params.displayName?.trim() || params.phone,
      passwordHash: null,
      authProvider: 'phone-otp',
      createdAt: new Date().toISOString(),
    };
    store.users.push(created);
    seedStarterData(store, created.id);
    saveStore(store);
    return toUserRecord(created);
  },

  async findUserByUid(uid: string): Promise<FileUserRecord | null> {
    const store = loadStore();
    const found = store.users.find((u) => u.uid === uid);
    return found ? toUserRecord(found) : null;
  },

  async createOtpCode(params: {
    channel: 'email' | 'sms';
    email?: string | null;
    phone?: string | null;
    code: string;
    purpose: string;
  }): Promise<void> {
    const store = loadStore();
    const now = Date.now();
    store.otpCodes.push({
      id: store.nextOtpId++,
      channel: params.channel,
      email: params.email ? params.email.trim().toLowerCase() : null,
      phone: params.phone ?? null,
      code: params.code,
      purpose: params.purpose,
      expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
      consumed: false,
      createdAt: new Date(now).toISOString(),
    });
    // Trim expired/old OTP entries
    store.otpCodes = store.otpCodes.slice(-100);
    saveStore(store);
  },

  async verifyAndConsumeOtp(params: {
    channel: 'email' | 'sms';
    email?: string | null;
    phone?: string | null;
    code: string;
  }): Promise<FileOtpRecord | null> {
    const store = loadStore();
    const now = Date.now();
    const normalizedEmail = (params.email || '').trim().toLowerCase();
    const cleanCode = params.code.trim();

    const matched = [...store.otpCodes]
      .reverse()
      .find((entry) => {
        if (entry.channel !== params.channel) return false;
        if (entry.consumed) return false;
        if (entry.code !== cleanCode) return false;
        if (new Date(entry.expiresAt).getTime() <= now) return false;
        if (params.channel === 'sms') {
          return entry.phone === (params.phone || '');
        }
        return entry.email === normalizedEmail;
      });

    if (!matched) return null;

    matched.consumed = true;
    saveStore(store);
    return {
      ...matched,
      expiresAt: new Date(matched.expiresAt),
      createdAt: new Date(matched.createdAt),
    };
  },

  async listTasks(userId: number): Promise<FileTaskRecord[]> {
    const store = loadStore();
    return store.tasks
      .filter((t) => t.userId === userId)
      .sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        return b.createdAt.localeCompare(a.createdAt);
      })
      .map(toTaskRecord);
  },

  async createTask(
    userId: number,
    data: { title: string; mode?: string; notes?: string | null }
  ): Promise<FileTaskRecord> {
    const store = loadStore();
    const created = {
      id: store.nextTaskId++,
      userId,
      title: data.title.trim(),
      mode: data.mode || 'work',
      notes: data.notes?.trim() || null,
      isCompleted: false,
      createdAt: new Date().toISOString(),
    };
    store.tasks.push(created);
    saveStore(store);
    return toTaskRecord(created);
  },

  async updateTask(
    userId: number,
    taskId: number,
    updates: {
      title?: string;
      isCompleted?: boolean;
      notes?: string | null;
      mode?: string;
    }
  ): Promise<FileTaskRecord | null> {
    const store = loadStore();
    const task = store.tasks.find((t) => t.id === taskId && t.userId === userId);
    if (!task) return null;
    if (updates.title !== undefined) task.title = updates.title;
    if (updates.isCompleted !== undefined) task.isCompleted = updates.isCompleted;
    if (updates.notes !== undefined) task.notes = updates.notes;
    if (updates.mode !== undefined) task.mode = updates.mode;
    saveStore(store);
    return toTaskRecord(task);
  },

  async deleteTask(userId: number, taskId: number): Promise<FileTaskRecord | null> {
    const store = loadStore();
    const idx = store.tasks.findIndex(
      (t) => t.id === taskId && t.userId === userId
    );
    if (idx === -1) return null;
    const [removed] = store.tasks.splice(idx, 1);
    saveStore(store);
    return toTaskRecord(removed);
  },

  async listHabits(userId: number): Promise<FileHabitRecord[]> {
    const store = loadStore();
    const today = new Date().toISOString().slice(0, 10);
    return store.habits
      .filter((h) => h.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((h) =>
        toHabitRecord({
          ...h,
          completedToday: h.lastCompletedDate === today ? h.completedToday : false,
        })
      );
  },

  async createHabit(
    userId: number,
    data: { title: string; category?: string; targetMinutes?: number | null }
  ): Promise<FileHabitRecord> {
    const store = loadStore();
    const created = {
      id: store.nextHabitId++,
      userId,
      title: data.title.trim(),
      category: data.category || 'wellness',
      targetMinutes: data.targetMinutes ?? null,
      streakCount: 0,
      completedToday: false,
      lastCompletedDate: null,
      createdAt: new Date().toISOString(),
    };
    store.habits.push(created);
    saveStore(store);
    return toHabitRecord(created);
  },

  async toggleHabitToday(
    userId: number,
    habitId: number
  ): Promise<FileHabitRecord | null> {
    const store = loadStore();
    const habit = store.habits.find(
      (h) => h.id === habitId && h.userId === userId
    );
    if (!habit) return null;
    const today = new Date().toISOString().slice(0, 10);
    const currentlyCompleted =
      habit.lastCompletedDate === today && habit.completedToday;
    const nextCompleted = !currentlyCompleted;
    habit.completedToday = nextCompleted;
    habit.streakCount = nextCompleted
      ? habit.streakCount + 1
      : Math.max(0, habit.streakCount - 1);
    habit.lastCompletedDate = nextCompleted ? today : null;
    saveStore(store);
    return toHabitRecord(habit);
  },

  async deleteHabit(
    userId: number,
    habitId: number
  ): Promise<FileHabitRecord | null> {
    const store = loadStore();
    const idx = store.habits.findIndex(
      (h) => h.id === habitId && h.userId === userId
    );
    if (idx === -1) return null;
    const [removed] = store.habits.splice(idx, 1);
    saveStore(store);
    return toHabitRecord(removed);
  },

  async listTrips(userId: number): Promise<FileTripRecord[]> {
    const store = loadStore();
    return store.trips
      .filter((t) => t.userId === userId)
      .sort((a, b) => a.travelDate.localeCompare(b.travelDate))
      .map(toTripRecord);
  },

  async createTrip(
    userId: number,
    data: {
      destination: string;
      subtitle?: string | null;
      travelDate: string;
      coverKey?: string;
      packingList?: PackingItem[];
    }
  ): Promise<FileTripRecord> {
    const store = loadStore();
    const created = {
      id: store.nextTripId++,
      userId,
      destination: data.destination.trim(),
      subtitle: data.subtitle?.trim() || null,
      travelDate: data.travelDate,
      coverKey: data.coverKey || 'kyoto',
      packingList: data.packingList ?? [],
      createdAt: new Date().toISOString(),
    };
    store.trips.push(created);
    saveStore(store);
    return toTripRecord(created);
  },

  async updateTrip(
    userId: number,
    tripId: number,
    updates: {
      destination?: string;
      subtitle?: string | null;
      travelDate?: string;
      coverKey?: string;
      packingList?: PackingItem[];
    }
  ): Promise<FileTripRecord | null> {
    const store = loadStore();
    const trip = store.trips.find((t) => t.id === tripId && t.userId === userId);
    if (!trip) return null;
    if (updates.destination !== undefined) trip.destination = updates.destination;
    if (updates.subtitle !== undefined) trip.subtitle = updates.subtitle;
    if (updates.travelDate !== undefined) trip.travelDate = updates.travelDate;
    if (updates.coverKey !== undefined) trip.coverKey = updates.coverKey;
    if (updates.packingList !== undefined) trip.packingList = updates.packingList;
    saveStore(store);
    return toTripRecord(trip);
  },

  async deleteTrip(userId: number, tripId: number): Promise<FileTripRecord | null> {
    const store = loadStore();
    const idx = store.trips.findIndex(
      (t) => t.id === tripId && t.userId === userId
    );
    if (idx === -1) return null;
    const [removed] = store.trips.splice(idx, 1);
    saveStore(store);
    return toTripRecord(removed);
  },
};
