# Shift Firestore Security Specification

## 1. Data Invariants

1. **Strict Ownership & Verified Identity**: Every user document (`/users/{userId}`) and every subcollection document (`/users/{userId}/tasks/{taskId}`, `/users/{userId}/habits/{habitId}`, `/users/{userId}/trips/{tripId}`) may only be read or written by the authenticated owner whose `request.auth.uid == userId` AND whose email is verified (`request.auth.token.email_verified == true`).
2. **Master Gate Relational Sync**: A task, habit, or trip cannot be created, updated, fetched, or deleted unless the parent `/users/{userId}` document exists.
3. **No PII Leakage or Collection Scraping**: Listing `/users` is strictly forbidden (`allow list: if false;`). Listing subcollections enforces `resource.data.ownerUid == request.auth.uid` without `get()`/`exists()` cost amplification.
4. **Immutable Provenance**: `uid`/`ownerUid`, `id`, and `createdAt` can never be mutated after document creation. `createdAt` on create and `updatedAt` on create/update must strictly equal `request.time`.
5. **Strict Schema & Volumetric Bounds**: No shadow/ghost keys allowed (`hasOnly`). Every string field has strict `.size()` limits, every document ID matches `^[a-zA-Z0-9_\-]+$` with max length 128, and `packingList` is strictly bounded to `<= 100` validated map entries.

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Category | Target Path | Adversarial Payload / Context | Expected Result |
|---|-----------------|-------------|-------------------------------|-----------------|
| 1 | **Identity Spoofing** | `/users/victimUid/tasks/101` | Authenticated as `attackerUid` writing `ownerUid: "victimUid"` | `PERMISSION_DENIED` |
| 2 | **Unverified Email Spoof** | `/users/userA` | Authenticated with `email_verified: false` creating profile | `PERMISSION_DENIED` |
| 3 | **Shadow Field Injection** | `/users/userA` | Valid profile + `{ "isAdmin": true }` ghost field | `PERMISSION_DENIED` |
| 4 | **PII Blanket Read** | `/users/victimUid` | `get` or `list` `/users` as `attackerUid` | `PERMISSION_DENIED` |
| 5 | **Orphaned Subcollection Write** | `/users/userA/tasks/101` | Creating a task when `/users/userA` parent doc does not exist | `PERMISSION_DENIED` |
| 6 | **ID Poisoning** | `/users/userA/tasks/bad$id!...` | Document ID exceeding 128 chars or containing invalid characters | `PERMISSION_DENIED` |
| 7 | **Immutable Field Tampering** | `/users/userA/tasks/101` | Updating `createdAt` or `ownerUid` or `id` on an existing task | `PERMISSION_DENIED` |
| 8 | **Client Timestamp Forgery** | `/users/userA/tasks/101` | Creating a task with client-forged `createdAt` != `request.time` | `PERMISSION_DENIED` |
| 9 | **Value Poisoning (Type)** | `/users/userA/habits/201` | Updating `streakCount` to `"999"` (string) or `-5` (negative int) | `PERMISSION_DENIED` |
| 10 | **Value Poisoning (Size / DoW)** | `/users/userA/tasks/101` | Updating `title` to a 5,000-character string (> 200 max) | `PERMISSION_DENIED` |
| 11 | **Array Bomb / Invalid Element** | `/users/userA/trips/301` | Writing `packingList` with > 100 items or an entry missing `packed: bool` | `PERMISSION_DENIED` |
| 12 | **Invalid Date / Cover Enum** | `/users/userA/trips/301` | Writing `travelDate: "next week"` or `coverKey: "malicious"` | `PERMISSION_DENIED` |
