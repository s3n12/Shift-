import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase.ts';
import type {
  HabitItem,
  PackingItem,
  TaskItem,
  TripItem,
  UserProfile,
} from '../types.ts';

export const FIRESTORE_SESSION_TOKEN = 'firestore.session';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_MODES = new Set(['work', 'weekend']);
const ALLOWED_CATEGORIES = new Set(['wellness', 'plants', 'mindful']);
const ALLOWED_COVERS = new Set(['kyoto', 'amalfi', 'alpine']);

let idSequence = 0;
function nextNumericId(): number {
  idSequence = (idSequence + 1) % 1000;
  return Date.now() * 1000 + idSequence;
}

function clampString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function formatFutureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

function sanitizePackingList(items: PackingItem[]): PackingItem[] {
  return (items || [])
    .filter((item) => item && typeof item.label === 'string' && item.label.trim().length > 0)
    .slice(0, 100)
    .map((item) => ({
      id: clampString(item.id || crypto.randomUUID(), 64) || crypto.randomUUID().slice(0, 36),
      label: clampString(item.label, 160),
      packed: Boolean(item.packed),
    }));
}

function requireVerifiedUid(): string {
  const current = auth.currentUser;
  if (!current || !current.uid) {
    throw new Error('Session expired. Please sign in again.');
  }
  return current.uid;
}

async function seedStarterData(uid: string) {
  const tasksPath = `users/${uid}/tasks`;
  const habitsPath = `users/${uid}/habits`;
  const tripsPath = `users/${uid}/trips`;

  let hasTasks = false;
  try {
    const snap = await getDocs(
      query(collection(db, tasksPath), where('ownerUid', '==', uid))
    );
    hasTasks = !snap.empty;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, tasksPath);
  }

  let hasHabits = false;
  try {
    const snap = await getDocs(
      query(collection(db, habitsPath), where('ownerUid', '==', uid))
    );
    hasHabits = !snap.empty;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, habitsPath);
  }

  let hasTrips = false;
  try {
    const snap = await getDocs(
      query(collection(db, tripsPath), where('ownerUid', '==', uid))
    );
    hasTrips = !snap.empty;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, tripsPath);
  }

  if (!hasTasks) {
    const starterTasks = [
      {
        title: 'Finalize Q4 roadmap priorities deck',
        isCompleted: false,
        mode: 'work',
        notes: 'Keep executive summary to 3 crisp slides before Thursday sync',
      },
      {
        title: 'Review product design tokens with engineering',
        isCompleted: true,
        mode: 'work',
        notes: 'Confirm spacing scale and button states',
      },
      {
        title: 'Send weekly stakeholder progress update',
        isCompleted: false,
        mode: 'work',
        notes: 'Include timeline highlights and next week milestones',
      },
    ];
    for (const item of starterTasks) {
      const id = nextNumericId();
      const docPath = `${tasksPath}/${id}`;
      try {
        await setDoc(doc(db, tasksPath, String(id)), {
          id,
          ownerUid: uid,
          title: item.title,
          isCompleted: item.isCompleted,
          mode: item.mode,
          notes: item.notes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }
    }
  }

  if (!hasHabits) {
    const today = new Date().toISOString().slice(0, 10);
    const starterHabits = [
      {
        title: '15 mins of morning yoga',
        category: 'wellness',
        streakCount: 6,
        completedToday: true,
        lastCompletedDate: today,
        targetMinutes: 15,
      },
      {
        title: 'Water indoor plants & mist monstera',
        category: 'plants',
        streakCount: 4,
        completedToday: false,
        lastCompletedDate: null,
        targetMinutes: 10,
      },
      {
        title: 'Read 20 pages with herbal tea',
        category: 'mindful',
        streakCount: 9,
        completedToday: false,
        lastCompletedDate: null,
        targetMinutes: 25,
      },
      {
        title: 'Sunset phone-free neighborhood walk',
        category: 'wellness',
        streakCount: 3,
        completedToday: false,
        lastCompletedDate: null,
        targetMinutes: 30,
      },
    ];
    for (const item of starterHabits) {
      const id = nextNumericId();
      const docPath = `${habitsPath}/${id}`;
      try {
        await setDoc(doc(db, habitsPath, String(id)), {
          id,
          ownerUid: uid,
          title: item.title,
          category: item.category,
          streakCount: item.streakCount,
          completedToday: item.completedToday,
          lastCompletedDate: item.lastCompletedDate,
          targetMinutes: item.targetMinutes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }
    }
  }

  if (!hasTrips) {
    const starterTrips = [
      {
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
      },
      {
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
      },
    ];
    for (const item of starterTrips) {
      const id = nextNumericId();
      const docPath = `${tripsPath}/${id}`;
      try {
        await setDoc(doc(db, tripsPath, String(id)), {
          id,
          ownerUid: uid,
          destination: item.destination,
          subtitle: item.subtitle,
          travelDate: item.travelDate,
          coverKey: item.coverKey,
          packingList: item.packingList,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }
    }
  }
}

export const firestoreStore = {
  async syncFirebaseUser(fbUser: User): Promise<{ user: UserProfile; token: string }> {
    const uid = fbUser.uid;
    const isPhoneProvider =
      Boolean(fbUser.phoneNumber) &&
      !fbUser.providerData.some((p) => p.providerId === 'google.com');
    const authProvider: 'google' | 'phone' = isPhoneProvider ? 'phone' : 'google';
    const phone = fbUser.phoneNumber ? clampString(fbUser.phoneNumber, 20) : null;
    const email = fbUser.email
      ? clampString(fbUser.email.toLowerCase(), 254)
      : isPhoneProvider
        ? null
        : clampString(`${uid}@users.shift.app`.toLowerCase(), 254);
    const displayName = clampString(
      fbUser.displayName ||
        phone ||
        (email ? email.split('@')[0] : '') ||
        'Shift User',
      120
    );

    const userPath = `users/${uid}`;
    const userRef = doc(db, 'users', uid);

    let existingSnap;
    try {
      existingSnap = await getDoc(userRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, userPath);
    }

    if (!existingSnap.exists()) {
      try {
        await setDoc(userRef, {
          uid,
          email,
          phone,
          displayName,
          authProvider,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, userPath);
      }
      await seedStarterData(uid);
    } else {
      const existingData = existingSnap.data();
      const needsUpdate =
        existingData.displayName !== displayName ||
        existingData.email !== email ||
        (phone !== null && existingData.phone !== phone);
      if (needsUpdate) {
        try {
          await updateDoc(userRef, {
            displayName,
            email,
            ...(phone !== null ? { phone } : {}),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, userPath);
        }
      }
    }

    return {
      token: FIRESTORE_SESSION_TOKEN,
      user: {
        id: 1,
        uid,
        email,
        phone,
        displayName,
        authProvider,
      },
    };
  },

  async syncGoogleUser(fbUser: User): Promise<{ user: UserProfile; token: string }> {
    return this.syncFirebaseUser(fbUser);
  },

  // --- TASKS ---
  async listTasks(): Promise<{ tasks: TaskItem[] }> {
    const uid = requireVerifiedUid();
    const path = `users/${uid}/tasks`;
    try {
      const snap = await getDocs(
        query(collection(db, path), where('ownerUid', '==', uid))
      );
      const tasks: TaskItem[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: Number(data.id),
            userId: 1,
            title: String(data.title || ''),
            isCompleted: Boolean(data.isCompleted),
            mode: String(data.mode || 'work'),
            notes: data.notes ? String(data.notes) : null,
            createdAt: timestampToIso(data.createdAt),
          };
        })
        .sort((a, b) => {
          if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
          return b.createdAt.localeCompare(a.createdAt);
        });
      return { tasks };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async createTask(body: {
    title: string;
    mode?: string;
    notes?: string;
  }): Promise<{ task: TaskItem }> {
    const uid = requireVerifiedUid();
    const cleanTitle = clampString(body.title || '', 200);
    if (!cleanTitle) {
      throw new Error('Task title is required.');
    }
    const mode = ALLOWED_MODES.has(body.mode || '') ? body.mode! : 'work';
    const notes = body.notes?.trim() ? clampString(body.notes, 500) : null;
    const id = nextNumericId();
    const path = `users/${uid}/tasks/${id}`;

    try {
      await setDoc(doc(db, `users/${uid}/tasks`, String(id)), {
        id,
        ownerUid: uid,
        title: cleanTitle,
        isCompleted: false,
        mode,
        notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }

    return {
      task: {
        id,
        userId: 1,
        title: cleanTitle,
        isCompleted: false,
        mode,
        notes,
        createdAt: new Date().toISOString(),
      },
    };
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
    const uid = requireVerifiedUid();
    const path = `users/${uid}/tasks/${id}`;
    const ref = doc(db, `users/${uid}/tasks`, String(id));

    const updates: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (body.title !== undefined) {
      const clean = clampString(body.title, 200);
      if (!clean) throw new Error('Task title is required.');
      updates.title = clean;
    }
    if (body.isCompleted !== undefined) {
      updates.isCompleted = Boolean(body.isCompleted);
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes ? clampString(body.notes, 500) : null;
    }
    if (body.mode !== undefined && ALLOWED_MODES.has(body.mode)) {
      updates.mode = body.mode;
    }

    try {
      await updateDoc(ref, updates);
      const snap = await getDoc(ref);
      const data = snap.data();
      if (!data) throw new Error('Task not found.');
      return {
        task: {
          id: Number(data.id),
          userId: 1,
          title: String(data.title),
          isCompleted: Boolean(data.isCompleted),
          mode: String(data.mode || 'work'),
          notes: data.notes ? String(data.notes) : null,
          createdAt: timestampToIso(data.createdAt),
        },
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteTask(id: number): Promise<{ ok: boolean }> {
    const uid = requireVerifiedUid();
    const path = `users/${uid}/tasks/${id}`;
    try {
      await deleteDoc(doc(db, `users/${uid}/tasks`, String(id)));
      return { ok: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // --- HABITS ---
  async listHabits(): Promise<{ habits: HabitItem[] }> {
    const uid = requireVerifiedUid();
    const path = `users/${uid}/habits`;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const snap = await getDocs(
        query(collection(db, path), where('ownerUid', '==', uid))
      );
      const habits: HabitItem[] = snap.docs
        .map((d) => {
          const data = d.data();
          const lastDate = data.lastCompletedDate
            ? String(data.lastCompletedDate)
            : null;
          return {
            id: Number(data.id),
            userId: 1,
            title: String(data.title || ''),
            category: String(data.category || 'wellness'),
            streakCount: Number(data.streakCount || 0),
            completedToday: lastDate === today ? Boolean(data.completedToday) : false,
            lastCompletedDate: lastDate,
            targetMinutes:
              typeof data.targetMinutes === 'number' ? data.targetMinutes : null,
            createdAt: timestampToIso(data.createdAt),
          };
        })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { habits };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async createHabit(body: {
    title: string;
    category?: string;
    targetMinutes?: number | null;
  }): Promise<{ habit: HabitItem }> {
    const uid = requireVerifiedUid();
    const cleanTitle = clampString(body.title || '', 160);
    if (!cleanTitle) {
      throw new Error('Habit title is required.');
    }
    const category = ALLOWED_CATEGORIES.has(body.category || '')
      ? body.category!
      : 'wellness';
    const rawMins =
      typeof body.targetMinutes === 'number' && Number.isFinite(body.targetMinutes)
        ? Math.round(body.targetMinutes)
        : null;
    const targetMinutes =
      rawMins !== null ? Math.min(480, Math.max(1, rawMins)) : null;

    const id = nextNumericId();
    const path = `users/${uid}/habits/${id}`;

    try {
      await setDoc(doc(db, `users/${uid}/habits`, String(id)), {
        id,
        ownerUid: uid,
        title: cleanTitle,
        category,
        streakCount: 0,
        completedToday: false,
        lastCompletedDate: null,
        targetMinutes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }

    return {
      habit: {
        id,
        userId: 1,
        title: cleanTitle,
        category,
        streakCount: 0,
        completedToday: false,
        lastCompletedDate: null,
        targetMinutes,
        createdAt: new Date().toISOString(),
      },
    };
  },

  async toggleHabit(id: number): Promise<{ habit: HabitItem }> {
    const uid = requireVerifiedUid();
    const path = `users/${uid}/habits/${id}`;
    const ref = doc(db, `users/${uid}/habits`, String(id));
    const today = new Date().toISOString().slice(0, 10);

    try {
      const snap = await getDoc(ref);
      const data = snap.data();
      if (!data) throw new Error('Habit not found.');

      const currentlyCompleted =
        data.lastCompletedDate === today && Boolean(data.completedToday);
      const nextCompleted = !currentlyCompleted;
      const currentStreak = Number(data.streakCount || 0);
      const nextStreak = nextCompleted
        ? Math.min(10000, currentStreak + 1)
        : Math.max(0, currentStreak - 1);
      const nextDate = nextCompleted ? today : null;

      await updateDoc(ref, {
        completedToday: nextCompleted,
        streakCount: nextStreak,
        lastCompletedDate: nextDate,
        updatedAt: serverTimestamp(),
      });

      return {
        habit: {
          id: Number(data.id),
          userId: 1,
          title: String(data.title),
          category: String(data.category || 'wellness'),
          streakCount: nextStreak,
          completedToday: nextCompleted,
          lastCompletedDate: nextDate,
          targetMinutes:
            typeof data.targetMinutes === 'number' ? data.targetMinutes : null,
          createdAt: timestampToIso(data.createdAt),
        },
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteHabit(id: number): Promise<{ ok: boolean }> {
    const uid = requireVerifiedUid();
    const path = `users/${uid}/habits/${id}`;
    try {
      await deleteDoc(doc(db, `users/${uid}/habits`, String(id)));
      return { ok: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // --- TRIPS ---
  async listTrips(): Promise<{ trips: TripItem[] }> {
    const uid = requireVerifiedUid();
    const path = `users/${uid}/trips`;
    try {
      const snap = await getDocs(
        query(collection(db, path), where('ownerUid', '==', uid))
      );
      const trips: TripItem[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: Number(data.id),
            userId: 1,
            destination: String(data.destination || ''),
            subtitle: data.subtitle ? String(data.subtitle) : null,
            travelDate: String(data.travelDate || ''),
            coverKey: String(data.coverKey || 'kyoto'),
            packingList: Array.isArray(data.packingList)
              ? (data.packingList as PackingItem[])
              : [],
            createdAt: timestampToIso(data.createdAt),
          };
        })
        .sort((a, b) => a.travelDate.localeCompare(b.travelDate));
      return { trips };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async createTrip(body: {
    destination: string;
    subtitle?: string;
    travelDate: string;
    coverKey: string;
    packingList: PackingItem[];
  }): Promise<{ trip: TripItem }> {
    const uid = requireVerifiedUid();
    const destination = clampString(body.destination || '', 120);
    if (!destination || !DATE_PATTERN.test(body.travelDate || '')) {
      throw new Error('Destination and valid travel date are required.');
    }
    const subtitle = body.subtitle?.trim() ? clampString(body.subtitle, 240) : null;
    const coverKey = ALLOWED_COVERS.has(body.coverKey) ? body.coverKey : 'kyoto';
    const packingList = sanitizePackingList(body.packingList);
    const id = nextNumericId();
    const path = `users/${uid}/trips/${id}`;

    try {
      await setDoc(doc(db, `users/${uid}/trips`, String(id)), {
        id,
        ownerUid: uid,
        destination,
        subtitle,
        travelDate: body.travelDate,
        coverKey,
        packingList,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }

    return {
      trip: {
        id,
        userId: 1,
        destination,
        subtitle,
        travelDate: body.travelDate,
        coverKey,
        packingList,
        createdAt: new Date().toISOString(),
      },
    };
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
    const uid = requireVerifiedUid();
    const path = `users/${uid}/trips/${id}`;
    const ref = doc(db, `users/${uid}/trips`, String(id));

    const updates: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (body.destination !== undefined) {
      const clean = clampString(body.destination, 120);
      if (!clean) throw new Error('Destination is required.');
      updates.destination = clean;
    }
    if (body.subtitle !== undefined) {
      updates.subtitle = body.subtitle ? clampString(body.subtitle, 240) : null;
    }
    if (body.travelDate !== undefined && DATE_PATTERN.test(body.travelDate)) {
      updates.travelDate = body.travelDate;
    }
    if (body.coverKey !== undefined && ALLOWED_COVERS.has(body.coverKey)) {
      updates.coverKey = body.coverKey;
    }
    if (body.packingList !== undefined) {
      updates.packingList = sanitizePackingList(body.packingList);
    }

    try {
      await updateDoc(ref, updates);
      const snap = await getDoc(ref);
      const data = snap.data();
      if (!data) throw new Error('Trip not found.');
      return {
        trip: {
          id: Number(data.id),
          userId: 1,
          destination: String(data.destination),
          subtitle: data.subtitle ? String(data.subtitle) : null,
          travelDate: String(data.travelDate),
          coverKey: String(data.coverKey || 'kyoto'),
          packingList: Array.isArray(data.packingList)
            ? (data.packingList as PackingItem[])
            : [],
          createdAt: timestampToIso(data.createdAt),
        },
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteTrip(id: number): Promise<{ ok: boolean }> {
    const uid = requireVerifiedUid();
    const path = `users/${uid}/trips/${id}`;
    try {
      await deleteDoc(doc(db, `users/${uid}/trips`, String(id)));
      return { ok: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // --- REAL-TIME SUBSCRIPTIONS (onSnapshot) ---
  subscribeTasks(
    uid: string,
    onData: (tasks: TaskItem[]) => void,
    onError: (err: Error) => void
  ): Unsubscribe {
    const path = `users/${uid}/tasks`;
    return onSnapshot(
      query(collection(db, path), where('ownerUid', '==', uid)),
      (snap) => {
        const items: TaskItem[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: Number(data.id),
              userId: 1,
              title: String(data.title || ''),
              isCompleted: Boolean(data.isCompleted),
              mode: String(data.mode || 'work'),
              notes: data.notes ? String(data.notes) : null,
              createdAt: timestampToIso(data.createdAt),
            };
          })
          .sort((a, b) => {
            if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
            return b.createdAt.localeCompare(a.createdAt);
          });
        onData(items);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
  },

  subscribeHabits(
    uid: string,
    onData: (habits: HabitItem[]) => void,
    onError: (err: Error) => void
  ): Unsubscribe {
    const path = `users/${uid}/habits`;
    return onSnapshot(
      query(collection(db, path), where('ownerUid', '==', uid)),
      (snap) => {
        const today = new Date().toISOString().slice(0, 10);
        const items: HabitItem[] = snap.docs
          .map((d) => {
            const data = d.data();
            const lastDate = data.lastCompletedDate
              ? String(data.lastCompletedDate)
              : null;
            return {
              id: Number(data.id),
              userId: 1,
              title: String(data.title || ''),
              category: String(data.category || 'wellness'),
              streakCount: Number(data.streakCount || 0),
              completedToday:
                lastDate === today ? Boolean(data.completedToday) : false,
              lastCompletedDate: lastDate,
              targetMinutes:
                typeof data.targetMinutes === 'number' ? data.targetMinutes : null,
              createdAt: timestampToIso(data.createdAt),
            };
          })
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        onData(items);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
  },

  subscribeTrips(
    uid: string,
    onData: (trips: TripItem[]) => void,
    onError: (err: Error) => void
  ): Unsubscribe {
    const path = `users/${uid}/trips`;
    return onSnapshot(
      query(collection(db, path), where('ownerUid', '==', uid)),
      (snap) => {
        const items: TripItem[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: Number(data.id),
              userId: 1,
              destination: String(data.destination || ''),
              subtitle: data.subtitle ? String(data.subtitle) : null,
              travelDate: String(data.travelDate || ''),
              coverKey: String(data.coverKey || 'kyoto'),
              packingList: Array.isArray(data.packingList)
                ? (data.packingList as PackingItem[])
                : [],
              createdAt: timestampToIso(data.createdAt),
            };
          })
          .sort((a, b) => a.travelDate.localeCompare(b.travelDate));
        onData(items);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
  },
};
