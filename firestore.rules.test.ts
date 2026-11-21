/**
 * Phase 0 Payload-First Security TDD specification for Shift Firestore Security Rules.
 * Covers all 12 adversarial "Dirty Dozen" payloads defined in security_spec.md.
 *
 * Run against the Firebase Emulator Suite (`@firebase/rules-unit-testing`) when testing locally.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Task Create',
    operation: 'create',
    path: '/users/victimUid/tasks/101',
    auth: { uid: 'attackerUid', email: 'attacker@example.com', email_verified: true },
    payload: {
      id: 101,
      ownerUid: 'victimUid',
      title: 'Injected task',
      isCompleted: false,
      mode: 'work',
      notes: null,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Profile Write',
    operation: 'create',
    path: '/users/userA',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: false },
    payload: {
      uid: 'userA',
      email: 'a@example.com',
      displayName: 'User A',
      authProvider: 'google',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Privilege Escalation',
    operation: 'create',
    path: '/users/userA',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: {
      uid: 'userA',
      email: 'a@example.com',
      displayName: 'User A',
      authProvider: 'google',
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-User PII Read Attempt',
    operation: 'get',
    path: '/users/victimUid',
    auth: { uid: 'attackerUid', email: 'attacker@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphaned Subcollection Write Without Parent User Doc',
    operation: 'create',
    path: '/users/ghostUid/tasks/101',
    auth: { uid: 'ghostUid', email: 'ghost@example.com', email_verified: true },
    payload: {
      id: 101,
      ownerUid: 'ghostUid',
      title: 'Orphan task',
      isCompleted: false,
      mode: 'work',
      notes: null,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Document ID Poisoning',
    operation: 'create',
    path: '/users/userA/tasks/bad$id!invalid',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: {
      id: 101,
      ownerUid: 'userA',
      title: 'Valid title',
      isCompleted: false,
      mode: 'work',
      notes: null,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immutable Field Mutation (ownerUid)',
    operation: 'update',
    path: '/users/userA/tasks/101',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: {
      ownerUid: 'otherUser',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Client Timestamp Forgery',
    operation: 'create',
    path: '/users/userA/tasks/102',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: {
      id: 102,
      ownerUid: 'userA',
      title: 'Backdated task',
      isCompleted: false,
      mode: 'work',
      notes: null,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Habit Streak Type & Bounds Poisoning',
    operation: 'update',
    path: '/users/userA/habits/201',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: {
      streakCount: -10,
      completedToday: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Denial-of-Wallet Oversized Task Title',
    operation: 'update',
    path: '/users/userA/tasks/101',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: {
      title: 'x'.repeat(5000),
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Trip Packing List Array Overflow / Malformed Element',
    operation: 'update',
    path: '/users/userA/trips/301',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: {
      packingList: [{ id: '1', label: 'Passport', packed: 'yes' }],
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Invalid Trip Date Format and Cover Key',
    operation: 'create',
    path: '/users/userA/trips/302',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: {
      id: 302,
      ownerUid: 'userA',
      destination: 'Kyoto',
      subtitle: null,
      travelDate: 'next-summer',
      coverKey: 'injected',
      packingList: [],
    },
    expected: 'PERMISSION_DENIED',
  },
];
