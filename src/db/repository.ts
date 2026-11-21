import crypto from 'node:crypto';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { db } from './index.ts';
import { fileRepository } from './file-store.ts';
import {
  habits,
  otpCodes,
  tasks,
  trips,
  users,
  type PackingItem,
} from './schema.ts';

function formatFutureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

async function seedStarterDataForUser(userId: number) {
  if (!db) return;

  const existingTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .limit(1);

  const existingHabits = await db
    .select({ id: habits.id })
    .from(habits)
    .where(eq(habits.userId, userId))
    .limit(1);

  const existingTrips = await db
    .select({ id: trips.id })
    .from(trips)
    .where(eq(trips.userId, userId))
    .limit(1);

  if (existingTasks.length === 0) {
    await db.insert(tasks).values([
      {
        userId,
        title: 'Finalize Q4 roadmap priorities deck',
        isCompleted: false,
        mode: 'work',
        notes: 'Keep executive summary to 3 crisp slides before Thursday sync',
      },
      {
        userId,
        title: 'Review product design tokens with engineering',
        isCompleted: true,
        mode: 'work',
        notes: 'Confirm spacing scale and button states',
      },
      {
        userId,
        title: 'Send weekly stakeholder progress update',
        isCompleted: false,
        mode: 'work',
        notes: 'Include timeline highlights and next week milestones',
      },
    ]);
  }

  if (existingHabits.length === 0) {
    await db.insert(habits).values([
      {
        userId,
        title: '15 mins of morning yoga',
        category: 'wellness',
        streakCount: 6,
        completedToday: true,
        lastCompletedDate: new Date().toISOString().slice(0, 10),
        targetMinutes: 15,
      },
      {
        userId,
        title: 'Water indoor plants & mist monstera',
        category: 'plants',
        streakCount: 4,
        completedToday: false,
        lastCompletedDate: null,
        targetMinutes: 10,
      },
      {
        userId,
        title: 'Read 20 pages with herbal tea',
        category: 'mindful',
        streakCount: 9,
        completedToday: false,
        lastCompletedDate: null,
        targetMinutes: 25,
      },
      {
        userId,
        title: 'Sunset phone-free neighborhood walk',
        category: 'wellness',
        streakCount: 3,
        completedToday: false,
        lastCompletedDate: null,
        targetMinutes: 30,
      },
    ]);
  }

  if (existingTrips.length === 0) {
    await db.insert(trips).values([
      {
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
      },
      {
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
      },
    ]);
  }
}

export async function getOrCreateUser(params: {
  uid: string;
  email: string;
  phone?: string | null;
  displayName?: string | null;
  authProvider?: string;
  passwordHash?: string | null;
}) {
  if (!db) {
    return fileRepository.getOrCreateUser(params);
  }
  try {
    const normalizedEmail = params.email.trim().toLowerCase();
    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingByEmail.length > 0) {
      const current = existingByEmail[0];
      const updates: Partial<typeof users.$inferInsert> = {};
      if (
        params.displayName?.trim() &&
        (!current.displayName || params.passwordHash)
      ) {
        updates.displayName = params.displayName.trim();
      }
      if (params.passwordHash && !current.passwordHash) {
        updates.passwordHash = params.passwordHash;
        updates.authProvider = 'email-password';
      }
      if (params.phone && !current.phone) {
        updates.phone = params.phone;
      }
      if (Object.keys(updates).length > 0) {
        const updated = await db
          .update(users)
          .set(updates)
          .where(eq(users.id, current.id))
          .returning();
        return updated[0];
      }
      return current;
    }

    const inserted = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: normalizedEmail,
        phone: params.phone ?? null,
        displayName: params.displayName || normalizedEmail.split('@')[0],
        passwordHash: params.passwordHash ?? null,
        authProvider: params.authProvider || 'google',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          ...(params.phone ? { phone: params.phone } : {}),
          displayName: params.displayName || normalizedEmail.split('@')[0],
        },
      })
      .returning();

    const user = inserted[0];
    await seedStarterDataForUser(user.id);
    return user;
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Unable to sync user profile.', { cause: error });
  }
}

export async function findUserByEmail(email: string) {
  if (!db) {
    return fileRepository.findUserByEmail(email);
  }
  try {
    const normalized = email.trim().toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database error in findUserByEmail:', error);
    throw new Error('Unable to look up account.', { cause: error });
  }
}

export async function findUserByPhone(phone: string) {
  if (!db) {
    return fileRepository.findUserByPhone(phone);
  }
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database error in findUserByPhone:', error);
    throw new Error('Unable to look up phone account.', { cause: error });
  }
}

export async function getOrCreatePhoneUser(params: {
  phone: string;
  displayName?: string | null;
}) {
  if (!db) {
    return fileRepository.getOrCreatePhoneUser(params);
  }
  try {
    const existing = await findUserByPhone(params.phone);
    if (existing) {
      if (params.displayName && !existing.displayName) {
        const updated = await db
          .update(users)
          .set({ displayName: params.displayName })
          .where(eq(users.id, existing.id))
          .returning();
        return updated[0];
      }
      return existing;
    }

    const uid = `phone:${crypto.randomUUID()}`;
    const inserted = await db
      .insert(users)
      .values({
        uid,
        email: null,
        phone: params.phone,
        displayName: params.displayName?.trim() || params.phone,
        passwordHash: null,
        authProvider: 'phone-otp',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          displayName: params.displayName?.trim() || params.phone,
        },
      })
      .returning();

    const user = inserted[0];
    await seedStarterDataForUser(user.id);
    return user;
  } catch (error) {
    console.error('Database error in getOrCreatePhoneUser:', error);
    throw new Error('Unable to sync mobile account.', { cause: error });
  }
}

export async function findUserByUid(uid: string) {
  if (!db) {
    return fileRepository.findUserByUid(uid);
  }
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database error in findUserByUid:', error);
    throw new Error('Unable to look up user session.', { cause: error });
  }
}

export async function createOtpCode(params: {
  channel: 'email' | 'sms';
  email?: string | null;
  phone?: string | null;
  code: string;
  purpose: string;
}) {
  if (!db) {
    return fileRepository.createOtpCode(params);
  }
  try {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.insert(otpCodes).values({
      channel: params.channel,
      email: params.email ? params.email.trim().toLowerCase() : null,
      phone: params.phone ?? null,
      code: params.code,
      purpose: params.purpose,
      expiresAt,
      consumed: false,
    });
  } catch (error) {
    console.error('Database error in createOtpCode:', error);
    throw new Error('Unable to generate verification code.', { cause: error });
  }
}

export async function verifyAndConsumeOtp(params: {
  channel: 'email' | 'sms';
  email?: string | null;
  phone?: string | null;
  code: string;
}) {
  if (!db) {
    return fileRepository.verifyAndConsumeOtp(params);
  }
  try {
    const now = new Date();
    const targetCondition =
      params.channel === 'sms'
        ? eq(otpCodes.phone, params.phone || '')
        : eq(otpCodes.email, (params.email || '').trim().toLowerCase());

    const matching = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.channel, params.channel),
          targetCondition,
          eq(otpCodes.code, params.code.trim()),
          eq(otpCodes.consumed, false),
          gt(otpCodes.expiresAt, now)
        )
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    if (matching.length === 0) {
      return null;
    }

    await db
      .update(otpCodes)
      .set({ consumed: true })
      .where(eq(otpCodes.id, matching[0].id));

    return matching[0];
  } catch (error) {
    console.error('Database error in verifyAndConsumeOtp:', error);
    throw new Error('Unable to verify code.', { cause: error });
  }
}

// --- TASKS ---

export async function listTasks(userId: number) {
  if (!db) {
    return fileRepository.listTasks(userId);
  }
  try {
    return await db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(asc(tasks.isCompleted), desc(tasks.createdAt));
  } catch (error) {
    console.error('Database error in listTasks:', error);
    throw new Error('Unable to load tasks.', { cause: error });
  }
}

export async function createTask(
  userId: number,
  data: { title: string; mode?: string; notes?: string | null }
) {
  if (!db) {
    return fileRepository.createTask(userId, data);
  }
  try {
    const rows = await db
      .insert(tasks)
      .values({
        userId,
        title: data.title.trim(),
        mode: data.mode || 'work',
        notes: data.notes?.trim() || null,
        isCompleted: false,
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error in createTask:', error);
    throw new Error('Unable to save task.', { cause: error });
  }
}

export async function updateTask(
  userId: number,
  taskId: number,
  updates: {
    title?: string;
    isCompleted?: boolean;
    notes?: string | null;
    mode?: string;
  }
) {
  if (!db) {
    return fileRepository.updateTask(userId, taskId, updates);
  }
  try {
    const rows = await db
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database error in updateTask:', error);
    throw new Error('Unable to update task.', { cause: error });
  }
}

export async function deleteTask(userId: number, taskId: number) {
  if (!db) {
    return fileRepository.deleteTask(userId, taskId);
  }
  try {
    const rows = await db
      .delete(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database error in deleteTask:', error);
    throw new Error('Unable to delete task.', { cause: error });
  }
}

// --- HABITS ---

export async function listHabits(userId: number) {
  if (!db) {
    return fileRepository.listHabits(userId);
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db
      .select()
      .from(habits)
      .where(eq(habits.userId, userId))
      .orderBy(asc(habits.createdAt));

    return rows.map((h) => ({
      ...h,
      completedToday: h.lastCompletedDate === today ? h.completedToday : false,
    }));
  } catch (error) {
    console.error('Database error in listHabits:', error);
    throw new Error('Unable to load habits.', { cause: error });
  }
}

export async function createHabit(
  userId: number,
  data: { title: string; category?: string; targetMinutes?: number | null }
) {
  if (!db) {
    return fileRepository.createHabit(userId, data);
  }
  try {
    const rows = await db
      .insert(habits)
      .values({
        userId,
        title: data.title.trim(),
        category: data.category || 'wellness',
        targetMinutes: data.targetMinutes ?? null,
        streakCount: 0,
        completedToday: false,
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error in createHabit:', error);
    throw new Error('Unable to save habit.', { cause: error });
  }
}

export async function toggleHabitToday(userId: number, habitId: number) {
  if (!db) {
    return fileRepository.toggleHabitToday(userId, habitId);
  }
  try {
    const existing = await db
      .select()
      .from(habits)
      .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
      .limit(1);

    if (existing.length === 0) return null;
    const habit = existing[0];
    const today = new Date().toISOString().slice(0, 10);
    const currentlyCompleted =
      habit.lastCompletedDate === today && habit.completedToday;

    const nextCompleted = !currentlyCompleted;
    const nextStreak = nextCompleted
      ? habit.streakCount + 1
      : Math.max(0, habit.streakCount - 1);

    const rows = await db
      .update(habits)
      .set({
        completedToday: nextCompleted,
        streakCount: nextStreak,
        lastCompletedDate: nextCompleted ? today : null,
      })
      .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
      .returning();

    return rows[0] ?? null;
  } catch (error) {
    console.error('Database error in toggleHabitToday:', error);
    throw new Error('Unable to update habit.', { cause: error });
  }
}

export async function deleteHabit(userId: number, habitId: number) {
  if (!db) {
    return fileRepository.deleteHabit(userId, habitId);
  }
  try {
    const rows = await db
      .delete(habits)
      .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database error in deleteHabit:', error);
    throw new Error('Unable to delete habit.', { cause: error });
  }
}

// --- TRIPS ---

export async function listTrips(userId: number) {
  if (!db) {
    return fileRepository.listTrips(userId);
  }
  try {
    return await db
      .select()
      .from(trips)
      .where(eq(trips.userId, userId))
      .orderBy(asc(trips.travelDate));
  } catch (error) {
    console.error('Database error in listTrips:', error);
    throw new Error('Unable to load trips.', { cause: error });
  }
}

export async function createTrip(
  userId: number,
  data: {
    destination: string;
    subtitle?: string | null;
    travelDate: string;
    coverKey?: string;
    packingList?: PackingItem[];
  }
) {
  if (!db) {
    return fileRepository.createTrip(userId, data);
  }
  try {
    const rows = await db
      .insert(trips)
      .values({
        userId,
        destination: data.destination.trim(),
        subtitle: data.subtitle?.trim() || null,
        travelDate: data.travelDate,
        coverKey: data.coverKey || 'kyoto',
        packingList: data.packingList ?? [],
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error in createTrip:', error);
    throw new Error('Unable to save trip.', { cause: error });
  }
}

export async function updateTrip(
  userId: number,
  tripId: number,
  updates: {
    destination?: string;
    subtitle?: string | null;
    travelDate?: string;
    coverKey?: string;
    packingList?: PackingItem[];
  }
) {
  if (!db) {
    return fileRepository.updateTrip(userId, tripId, updates);
  }
  try {
    const rows = await db
      .update(trips)
      .set(updates)
      .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database error in updateTrip:', error);
    throw new Error('Unable to update trip.', { cause: error });
  }
}

export async function deleteTrip(userId: number, tripId: number) {
  if (!db) {
    return fileRepository.deleteTrip(userId, tripId);
  }
  try {
    const rows = await db
      .delete(trips)
      .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database error in deleteTrip:', error);
    throw new Error('Unable to delete trip.', { cause: error });
  }
}
