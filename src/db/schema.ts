import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export interface PackingItem {
  id: string;
  label: string;
  packed: boolean;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').unique(),
  phone: text('phone'),
  displayName: text('display_name'),
  passwordHash: text('password_hash'),
  authProvider: text('auth_provider').notNull().default('google'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const otpCodes = pgTable('otp_codes', {
  id: serial('id').primaryKey(),
  email: text('email'),
  phone: text('phone'),
  channel: text('channel').notNull().default('email'),
  code: text('code').notNull(),
  purpose: text('purpose').notNull().default('login'),
  expiresAt: timestamp('expires_at').notNull(),
  consumed: boolean('consumed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  isCompleted: boolean('is_completed').notNull().default(false),
  mode: text('mode').notNull().default('work'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const habits = pgTable('habits', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  category: text('category').notNull().default('wellness'),
  streakCount: integer('streak_count').notNull().default(0),
  completedToday: boolean('completed_today').notNull().default(false),
  lastCompletedDate: text('last_completed_date'),
  targetMinutes: integer('target_minutes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const trips = pgTable('trips', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  destination: text('destination').notNull(),
  subtitle: text('subtitle'),
  travelDate: text('travel_date').notNull(),
  coverKey: text('cover_key').notNull().default('kyoto'),
  packingList: jsonb('packing_list').$type<PackingItem[]>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  tasks: many(tasks),
  habits: many(habits),
  trips: many(trips),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
}));

export const habitsRelations = relations(habits, ({ one }) => ({
  user: one(users, {
    fields: [habits.userId],
    references: [users.id],
  }),
}));

export const tripsRelations = relations(trips, ({ one }) => ({
  user: one(users, {
    fields: [trips.userId],
    references: [users.id],
  }),
}));
