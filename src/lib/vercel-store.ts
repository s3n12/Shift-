import type { HabitItem, PackingItem, TaskItem, TripItem, UserProfile } from '../types.ts';

interface StoredAccount {
  id: number;
  uid: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  passwordSalt: string | null;
  passwordHash: string | null;
  authProvider: string;
  createdAt: string;
}

interface StoredOtp {
  email: string;
  code: string;
  expiresAt: number;
  consumed: boolean;
}

interface StoredDatabase {
  nextUserId: number;
  nextTaskId: number;
  nextHabitId: number;
  nextTripId: number;
  users: StoredAccount[];
  otps: StoredOtp[];
  tasks: TaskItem[];
  habits: HabitItem[];
  trips: TripItem[];
  activeUid: string | null;
}

const STORAGE_KEY = 'shift_standalone_db_v1';

function createEmptyDb(): StoredDatabase {
  return {
    nextUserId: 1,
    nextTaskId: 1,
    nextHabitId: 1,
    nextTripId: 1,
    users: [],
    otps: [],
    tasks: [],
    habits: [],
    trips: [],
    activeUid: null,
  };
}

function loadDb(): StoredDatabase {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyDb();
    const parsed = JSON.parse(raw) as Partial<StoredDatabase>;
    return {
      nextUserId: parsed.nextUserId ?? 1,
      nextTaskId: parsed.nextTaskId ?? 1,
      nextHabitId: parsed.nextHabitId ?? 1,
      nextTripId: parsed.nextTripId ?? 1,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      otps: Array.isArray(parsed.otps) ? parsed.otps : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      trips: Array.isArray(parsed.trips) ? parsed.trips : [],
      activeUid: typeof parsed.activeUid === 'string' ? parsed.activeUid : null,
    };
  } catch {
    return createEmptyDb();
  }
}

function saveDb(db: StoredDatabase) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Ignore storage quota issues
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPasswordClient(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0')
    ).join('');
  }
  // Fallback deterministic hash if SubtleCrypto is unavailable on insecure origin
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function generateSixDigitOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.length <= 2 ? local[0] : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

function formatFutureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function toUserProfile(account: StoredAccount): UserProfile {
  return {
    id: account.id,
    uid: account.uid,
    email: account.email,
    phone: account.phone,
    displayName: account.displayName,
    authProvider: account.authProvider,
  };
}

function makeLocalToken(uid: string): string {
  return `local.${uid}`;
}

function seedStarterData(db: StoredDatabase, userId: number) {
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  if (!db.tasks.some((t) => t.userId === userId)) {
    db.tasks.push(
      {
        id: db.nextTaskId++,
        userId,
        title: 'Finalize Q4 roadmap priorities deck',
        isCompleted: false,
        mode: 'work',
        notes: 'Keep executive summary to 3 crisp slides before Thursday sync',
        createdAt: nowIso,
      },
      {
        id: db.nextTaskId++,
        userId,
        title: 'Review product design tokens with engineering',
        isCompleted: true,
        mode: 'work',
        notes: 'Confirm spacing scale and button states',
        createdAt: nowIso,
      },
      {
        id: db.nextTaskId++,
        userId,
        title: 'Send weekly stakeholder progress update',
        isCompleted: false,
        mode: 'work',
        notes: 'Include timeline highlights and next week milestones',
        createdAt: nowIso,
      }
    );
  }

  if (!db.habits.some((h) => h.userId === userId)) {
    db.habits.push(
      {
        id: db.nextHabitId++,
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
        id: db.nextHabitId++,
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
        id: db.nextHabitId++,
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
        id: db.nextHabitId++,
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

  if (!db.trips.some((t) => t.userId === userId)) {
    db.trips.push(
      {
        id: db.nextTripId++,
        userId,
        destination: 'Kyoto, Japan',
        subtitle: 'Cedar tea houses, moss gardens & slow mornings',
        travelDate: formatFutureDate(24),
        coverKey: 'kyoto',
        packingList: [
          { id: randomId(), label: 'Passport & rail pass', packed: true },
          { id: randomId(), label: 'Linen overshirt & comfortable walking shoes', packed: true },
          { id: randomId(), label: '35mm travel camera & spare film rolls', packed: false },
          { id: randomId(), label: 'Compact rain umbrella', packed: false },
          { id: randomId(), label: 'Universal travel power adapter', packed: false },
        ],
        createdAt: nowIso,
      },
      {
        id: db.nextTripId++,
        userId,
        destination: 'Ravello, Amalfi Coast',
        subtitle: 'Cliffside terraces, lemon groves & coastal swims',
        travelDate: formatFutureDate(68),
        coverKey: 'amalfi',
        packingList: [
          { id: randomId(), label: 'Swimwear & Turkish linen towel', packed: false },
          { id: randomId(), label: 'Mineral sunscreen & sunglasses', packed: false },
          { id: randomId(), label: 'Evening summer reading novel', packed: true },
        ],
        createdAt: nowIso,
      }
    );
  }
}

function resolveUser(db: StoredDatabase, token?: string | null): StoredAccount {
  let uid: string | null = null;
  if (token && token.startsWith('local.')) {
    uid = token.slice('local.'.length);
  } else {
    uid = db.activeUid;
  }
  const user = uid ? db.users.find((u) => u.uid === uid) : undefined;
  if (!user) {
    throw new Error('Session expired. Please sign in again.');
  }
  return user;
}

export const vercelStore = {
  async login(body: { email: string; password: string }) {
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!body.password || body.password.length < 6) {
      throw new Error('Please enter your password (at least 6 characters).');
    }

    const db = loadDb();
    const existing = db.users.find((u) => u.email === email);
    if (!existing) {
      throw new Error('No account found for this email. Switch to Sign Up to create one.');
    }
    if (!existing.passwordHash || !existing.passwordSalt) {
      throw new Error(
        'No password is set for this email yet. Switch to Sign Up to set your password, or sign in with Email OTP.'
      );
    }

    const hash = await hashPasswordClient(body.password, existing.passwordSalt);
    if (hash !== existing.passwordHash) {
      throw new Error('Incorrect email or password.');
    }

    db.activeUid = existing.uid;
    saveDb(db);

    return {
      token: makeLocalToken(existing.uid),
      user: toUserProfile(existing),
    };
  },

  async signup(body: { email: string; password: string; displayName?: string }) {
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!body.password || body.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const db = loadDb();
    const existing = db.users.find((u) => u.email === email);
    if (existing && existing.passwordHash) {
      throw new Error('An account with this email already exists. Switch to Sign In instead.');
    }

    const salt = randomHex(16);
    const passwordHash = await hashPasswordClient(body.password, salt);

    let account: StoredAccount;
    if (existing) {
      existing.passwordSalt = salt;
      existing.passwordHash = passwordHash;
      existing.authProvider = 'email-password';
      if (body.displayName?.trim()) {
        existing.displayName = body.displayName.trim();
      }
      account = existing;
    } else {
      account = {
        id: db.nextUserId++,
        uid: `email:${randomId()}`,
        email,
        phone: null,
        displayName: body.displayName?.trim() || email.split('@')[0],
        passwordSalt: salt,
        passwordHash,
        authProvider: 'email-password',
        createdAt: new Date().toISOString(),
      };
      db.users.push(account);
      seedStarterData(db, account.id);
    }

    db.activeUid = account.uid;
    saveDb(db);

    return {
      token: makeLocalToken(account.uid),
      user: toUserProfile(account),
    };
  },

  async syncSupabaseUser(profile: {
    id: string;
    email: string | null;
    phone: string | null;
    displayName: string | null;
  }) {
    const db = loadDb();
    const normalizedEmail = profile.email ? profile.email.trim().toLowerCase() : null;
    const normalizedPhone = profile.phone ? profile.phone.trim() : null;
    const uid = `supabase:${profile.id}`;
    let account = db.users.find(
      (u) =>
        u.uid === uid ||
        (normalizedEmail !== null && u.email === normalizedEmail) ||
        (normalizedPhone !== null && u.phone === normalizedPhone)
    );
    if (!account) {
      account = {
        id: db.nextUserId++,
        uid,
        email: normalizedEmail,
        phone: normalizedPhone,
        displayName:
          profile.displayName?.trim() ||
          normalizedPhone ||
          (normalizedEmail ? normalizedEmail.split('@')[0] : 'Shift Member'),
        passwordSalt: null,
        passwordHash: null,
        authProvider: normalizedPhone && !normalizedEmail ? 'phone-otp' : 'email-otp',
        createdAt: new Date().toISOString(),
      };
      db.users.push(account);
      seedStarterData(db, account.id);
    }
    db.activeUid = account.uid;
    saveDb(db);
    return {
      token: makeLocalToken(account.uid),
      user: toUserProfile(account),
    };
  },

  async syncExternalGoogleUser(profile: {
    uid: string;
    email: string;
    displayName?: string | null;
  }) {
    const db = loadDb();
    const normalizedEmail = profile.email.trim().toLowerCase();
    let account = db.users.find(
      (u) => u.uid === profile.uid || u.email === normalizedEmail
    );
    if (!account) {
      account = {
        id: db.nextUserId++,
        uid: profile.uid,
        email: normalizedEmail,
        phone: null,
        displayName: profile.displayName?.trim() || normalizedEmail.split('@')[0],
        passwordSalt: null,
        passwordHash: null,
        authProvider: 'google',
        createdAt: new Date().toISOString(),
      };
      db.users.push(account);
      seedStarterData(db, account.id);
    }
    db.activeUid = account.uid;
    saveDb(db);
    return {
      token: makeLocalToken(account.uid),
      user: toUserProfile(account),
    };
  },

  syncVerifiedOtpUser(profile: UserProfile) {
    if (typeof window === 'undefined' || (!profile.email && !profile.phone)) return;
    const db = loadDb();
    const normalizedEmail = profile.email ? profile.email.trim().toLowerCase() : null;
    const normalizedPhone = profile.phone ? profile.phone.trim() : null;
    let account = db.users.find(
      (u) =>
        u.uid === profile.uid ||
        (normalizedEmail !== null && u.email === normalizedEmail) ||
        (normalizedPhone !== null && u.phone === normalizedPhone)
    );
    if (!account) {
      account = {
        id: db.nextUserId++,
        uid: profile.uid,
        email: normalizedEmail,
        phone: normalizedPhone,
        displayName:
          profile.displayName?.trim() ||
          normalizedPhone ||
          (normalizedEmail ? normalizedEmail.split('@')[0] : 'Shift Member'),
        passwordSalt: null,
        passwordHash: null,
        authProvider: profile.authProvider || (normalizedPhone ? 'phone-otp' : 'email-otp'),
        createdAt: new Date().toISOString(),
      };
      db.users.push(account);
      seedStarterData(db, account.id);
    } else if (profile.displayName?.trim() && !account.displayName) {
      account.displayName = profile.displayName.trim();
    }
    db.activeUid = account.uid;
    saveDb(db);
  },

  async logout() {
    const db = loadDb();
    db.activeUid = null;
    saveDb(db);
    return { ok: true };
  },

  async getMe(token?: string | null) {
    const db = loadDb();
    const user = resolveUser(db, token);
    return {
      user: toUserProfile(user),
      token: makeLocalToken(user.uid),
    };
  },

  // Tasks
  async listTasks(token: string) {
    const db = loadDb();
    const user = resolveUser(db, token);
    const items = db.tasks
      .filter((t) => t.userId === user.id)
      .sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        return b.createdAt.localeCompare(a.createdAt);
      });
    return { tasks: items };
  },

  async createTask(
    token: string,
    body: { title: string; mode?: string; notes?: string }
  ) {
    if (!body.title?.trim()) throw new Error('Task title is required.');
    const db = loadDb();
    const user = resolveUser(db, token);
    const created: TaskItem = {
      id: db.nextTaskId++,
      userId: user.id,
      title: body.title.trim(),
      isCompleted: false,
      mode: body.mode || 'work',
      notes: body.notes?.trim() || null,
      createdAt: new Date().toISOString(),
    };
    db.tasks.push(created);
    saveDb(db);
    return { task: created };
  },

  async updateTask(
    token: string,
    id: number,
    body: { title?: string; isCompleted?: boolean; notes?: string | null; mode?: string }
  ) {
    const db = loadDb();
    const user = resolveUser(db, token);
    const task = db.tasks.find((t) => t.id === id && t.userId === user.id);
    if (!task) throw new Error('Task not found.');
    if (body.title !== undefined) task.title = body.title.trim();
    if (body.isCompleted !== undefined) task.isCompleted = body.isCompleted;
    if (body.notes !== undefined) task.notes = body.notes;
    if (body.mode !== undefined) task.mode = body.mode;
    saveDb(db);
    return { task };
  },

  async deleteTask(token: string, id: number) {
    const db = loadDb();
    const user = resolveUser(db, token);
    const before = db.tasks.length;
    db.tasks = db.tasks.filter((t) => !(t.id === id && t.userId === user.id));
    if (db.tasks.length === before) throw new Error('Task not found.');
    saveDb(db);
    return { ok: true };
  },

  // Habits
  async listHabits(token: string) {
    const db = loadDb();
    const user = resolveUser(db, token);
    const today = new Date().toISOString().slice(0, 10);
    const items = db.habits
      .filter((h) => h.userId === user.id)
      .map((h) => ({
        ...h,
        completedToday: h.lastCompletedDate === today ? h.completedToday : false,
      }));
    return { habits: items };
  },

  async createHabit(
    token: string,
    body: { title: string; category?: string; targetMinutes?: number | null }
  ) {
    if (!body.title?.trim()) throw new Error('Habit title is required.');
    const db = loadDb();
    const user = resolveUser(db, token);
    const created: HabitItem = {
      id: db.nextHabitId++,
      userId: user.id,
      title: body.title.trim(),
      category: body.category || 'wellness',
      streakCount: 0,
      completedToday: false,
      lastCompletedDate: null,
      targetMinutes: body.targetMinutes ?? null,
      createdAt: new Date().toISOString(),
    };
    db.habits.push(created);
    saveDb(db);
    return { habit: created };
  },

  async toggleHabit(token: string, id: number) {
    const db = loadDb();
    const user = resolveUser(db, token);
    const habit = db.habits.find((h) => h.id === id && h.userId === user.id);
    if (!habit) throw new Error('Habit not found.');
    const today = new Date().toISOString().slice(0, 10);
    const currentlyCompleted =
      habit.lastCompletedDate === today && habit.completedToday;
    const nextCompleted = !currentlyCompleted;
    habit.completedToday = nextCompleted;
    habit.streakCount = nextCompleted
      ? habit.streakCount + 1
      : Math.max(0, habit.streakCount - 1);
    habit.lastCompletedDate = nextCompleted ? today : null;
    saveDb(db);
    return { habit };
  },

  async deleteHabit(token: string, id: number) {
    const db = loadDb();
    const user = resolveUser(db, token);
    const before = db.habits.length;
    db.habits = db.habits.filter((h) => !(h.id === id && h.userId === user.id));
    if (db.habits.length === before) throw new Error('Habit not found.');
    saveDb(db);
    return { ok: true };
  },

  // Trips
  async listTrips(token: string) {
    const db = loadDb();
    const user = resolveUser(db, token);
    const items = db.trips
      .filter((t) => t.userId === user.id)
      .sort((a, b) => a.travelDate.localeCompare(b.travelDate));
    return { trips: items };
  },

  async createTrip(
    token: string,
    body: {
      destination: string;
      subtitle?: string;
      travelDate: string;
      coverKey: string;
      packingList: PackingItem[];
    }
  ) {
    if (!body.destination?.trim() || !body.travelDate) {
      throw new Error('Destination and travel date are required.');
    }
    const db = loadDb();
    const user = resolveUser(db, token);
    const created: TripItem = {
      id: db.nextTripId++,
      userId: user.id,
      destination: body.destination.trim(),
      subtitle: body.subtitle?.trim() || null,
      travelDate: body.travelDate,
      coverKey: body.coverKey || 'kyoto',
      packingList: (body.packingList || [])
        .filter((i) => i.label?.trim())
        .map((i) => ({
          id: i.id || randomId(),
          label: i.label.trim(),
          packed: Boolean(i.packed),
        })),
      createdAt: new Date().toISOString(),
    };
    db.trips.push(created);
    saveDb(db);
    return { trip: created };
  },

  async updateTrip(
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
    const db = loadDb();
    const user = resolveUser(db, token);
    const trip = db.trips.find((t) => t.id === id && t.userId === user.id);
    if (!trip) throw new Error('Trip not found.');
    if (body.destination !== undefined) trip.destination = body.destination.trim();
    if (body.subtitle !== undefined) trip.subtitle = body.subtitle;
    if (body.travelDate !== undefined) trip.travelDate = body.travelDate;
    if (body.coverKey !== undefined) trip.coverKey = body.coverKey;
    if (body.packingList !== undefined) trip.packingList = body.packingList;
    saveDb(db);
    return { trip };
  },

  async deleteTrip(token: string, id: number) {
    const db = loadDb();
    const user = resolveUser(db, token);
    const before = db.trips.length;
    db.trips = db.trips.filter((t) => !(t.id === id && t.userId === user.id));
    if (db.trips.length === before) throw new Error('Trip not found.');
    saveDb(db);
    return { ok: true };
  },
};
