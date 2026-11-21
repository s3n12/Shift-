import 'dotenv/config';
import dotenv from 'dotenv';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  hashPassword,
  signShiftToken,
  verifyPassword,
} from './src/lib/auth-tokens.ts';
import {
  isValidSupabaseUrl,
  normalizeSupabaseUrl,
  resolveSupabaseConfig,
} from './src/lib/supabase-otp.ts';
import {
  createHabit,
  createTask,
  createTrip,
  deleteHabit,
  deleteTask,
  deleteTrip,
  findUserByEmail,
  getOrCreatePhoneUser,
  getOrCreateUser,
  listHabits,
  listTasks,
  listTrips,
  toggleHabitToday,
  updateTask,
  updateTrip,
} from './src/db/repository.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localEnvPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(localEnvPath)) {
  const parsedLocal = dotenv.parse(fs.readFileSync(localEnvPath, 'utf8'));
  for (const [key, value] of Object.entries(parsedLocal)) {
    const existing = (process.env[key] || '').trim();
    const shouldReplace =
      !existing ||
      (key.endsWith('_SUPABASE_URL') &&
        !isValidSupabaseUrl(normalizeSupabaseUrl(existing))) ||
      (key.includes('SUPABASE_') && key.endsWith('_KEY') && existing.length < 20);
    if (shouldReplace) {
      process.env[key] = value;
    }
  }
}
const app = express();
app.use(express.json({ limit: '1mb' }));

// --- AUTH ROUTES (Direct Email/Password Sign In & Sign Up, Email OTP, and Google Sign-In) ---

function setSessionCookie(req: express.Request, res: express.Response, token: string) {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('shift_session', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function formatUserResponse(user: {
  id: number;
  uid: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  authProvider: string;
}) {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    authProvider: user.authProvider,
  };
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({ error: 'Please enter your password (at least 6 characters).' });
    }

    const existing = await findUserByEmail(normalizedEmail);
    if (!existing) {
      return res.status(404).json({
        error: 'No account found for this email. Switch to Sign Up to create one.',
      });
    }

    if (!existing.passwordHash) {
      const hint =
        existing.authProvider === 'google'
          ? 'This account was created with Google. Use Login with Google, Email OTP, or set a password in Sign Up.'
          : 'No password is set for this email yet. Switch to Sign Up to set your password, or sign in with Email OTP.';
      return res.status(400).json({ error: hint });
    }

    const valid = verifyPassword(password, existing.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    const token = signShiftToken({
      uid: existing.uid,
      email: existing.email,
      phone: existing.phone,
      name: existing.displayName || undefined,
    });

    setSessionCookie(req, res, token);

    return res.json({
      token,
      user: formatUserResponse(existing),
    });
  } catch (error) {
    console.error('Error in /api/auth/login:', error);
    return res.status(500).json({ error: 'Unable to sign in right now. Please try again.' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, displayName } = req.body as {
      email?: string;
      password?: string;
      displayName?: string;
    };

    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = await findUserByEmail(normalizedEmail);
    if (existing && existing.passwordHash) {
      return res.status(409).json({
        error: 'An account with this email already exists. Switch to Sign In instead.',
      });
    }

    const passwordHash = hashPassword(password);
    const user = await getOrCreateUser({
      uid: existing ? existing.uid : `email:${crypto.randomUUID()}`,
      email: normalizedEmail,
      displayName:
        displayName?.trim() || existing?.displayName || normalizedEmail.split('@')[0],
      authProvider: 'email-password',
      passwordHash,
    });

    const token = signShiftToken({
      uid: user.uid,
      email: user.email,
      phone: user.phone,
      name: user.displayName || undefined,
    });

    setSessionCookie(req, res, token);

    return res.status(201).json({
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error('Error in /api/auth/signup:', error);
    return res
      .status(500)
      .json({ error: 'Unable to create your account right now. Please try again.' });
  }
});

function getServerSupabaseConfig() {
  return resolveSupabaseConfig({
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  });
}

app.get('/api/auth/supabase-config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const config = getServerSupabaseConfig();
  if (!config) {
    return res.status(404).json({ error: 'Supabase config not set' });
  }
  return res.json({
    url: config.url,
    anonKey: config.anonKey,
    publishableKey: config.anonKey,
  });
});

app.post('/api/auth/supabase-session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const authHeader = req.headers.authorization || '';
    const accessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';
    if (!accessToken) {
      return res.status(401).json({ error: 'Missing Supabase verification token.' });
    }

    const config = getServerSupabaseConfig();
    if (!config) {
      return res.status(503).json({
        error:
          'Supabase is not configured on the server. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your environment variables.',
      });
    }

    const verifyRes = await fetch(`${config.url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: config.anonKey,
      },
    });

    if (!verifyRes.ok) {
      return res.status(401).json({
        error: 'Supabase verification token is invalid or expired. Please try again.',
      });
    }

    const sbUser = (await verifyRes.json()) as {
      id?: string;
      email?: string | null;
      phone?: string | null;
      user_metadata?: { full_name?: string; name?: string };
    };

    if (!sbUser.id || (!sbUser.email && !sbUser.phone)) {
      return res.status(401).json({ error: 'Invalid Supabase user profile.' });
    }

    const normalizedEmail = sbUser.email ? sbUser.email.trim().toLowerCase() : null;
    const normalizedPhone = sbUser.phone
      ? sbUser.phone.startsWith('+')
        ? sbUser.phone.trim()
        : `+${sbUser.phone.trim()}`
      : null;

    const existing = normalizedEmail
      ? await findUserByEmail(normalizedEmail)
      : null;

    const displayName =
      sbUser.user_metadata?.full_name?.trim() ||
      sbUser.user_metadata?.name?.trim() ||
      existing?.displayName ||
      (normalizedEmail ? normalizedEmail.split('@')[0] : normalizedPhone) ||
      'Shift Member';

    const user = normalizedEmail
      ? await getOrCreateUser({
          uid: existing ? existing.uid : `supabase:${sbUser.id}`,
          email: normalizedEmail,
          phone: normalizedPhone,
          displayName,
          authProvider: existing?.authProvider || 'email-otp',
        })
      : await getOrCreatePhoneUser({
          phone: normalizedPhone!,
          displayName,
        });

    const token = signShiftToken({
      uid: user.uid,
      email: user.email,
      phone: user.phone,
      name: user.displayName || undefined,
    });

    setSessionCookie(req, res, token);

    return res.json({
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error('Error in /api/auth/supabase-session:', error);
    return res
      .status(500)
      .json({ error: 'Could not complete sign-in. Please try again.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie('shift_session', {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
  });
  return res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  const user = req.dbUser!;
  const isGoogle = user.authProvider === 'google' && !req.headers.cookie?.includes('shift_session=');
  const token = isGoogle
    ? undefined
    : signShiftToken({
        uid: user.uid,
        email: user.email,
        phone: user.phone,
        name: user.displayName || undefined,
      });
  return res.json({ user, ...(token ? { token } : {}) });
});

// --- TASKS ROUTES ---

app.get('/api/tasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const items = await listTasks(req.dbUser!.id);
    return res.json({ tasks: items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch tasks';
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/tasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { title, mode, notes } = req.body as {
      title?: string;
      mode?: string;
      notes?: string;
    };
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required.' });
    }
    const created = await createTask(req.dbUser!.id, {
      title,
      mode: mode || 'work',
      notes: notes ?? null,
    });
    return res.status(201).json({ task: created });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create task';
    return res.status(500).json({ error: msg });
  }
});

app.patch('/api/tasks/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID.' });
    }
    const { title, isCompleted, notes, mode } = req.body as {
      title?: string;
      isCompleted?: boolean;
      notes?: string | null;
      mode?: string;
    };
    const updated = await updateTask(req.dbUser!.id, taskId, {
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(isCompleted !== undefined ? { isCompleted } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(mode !== undefined ? { mode } : {}),
    });
    if (!updated) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    return res.json({ task: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update task';
    return res.status(500).json({ error: msg });
  }
});

app.delete('/api/tasks/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID.' });
    }
    const deleted = await deleteTask(req.dbUser!.id, taskId);
    if (!deleted) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    return res.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete task';
    return res.status(500).json({ error: msg });
  }
});

// --- HABITS ROUTES ---

app.get('/api/habits', requireAuth, async (req: AuthRequest, res) => {
  try {
    const items = await listHabits(req.dbUser!.id);
    return res.json({ habits: items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch habits';
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/habits', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { title, category, targetMinutes } = req.body as {
      title?: string;
      category?: string;
      targetMinutes?: number | null;
    };
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Habit title is required.' });
    }
    const created = await createHabit(req.dbUser!.id, {
      title,
      category: category || 'wellness',
      targetMinutes: targetMinutes ?? null,
    });
    return res.status(201).json({ habit: created });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create habit';
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/habits/:id/toggle', requireAuth, async (req: AuthRequest, res) => {
  try {
    const habitId = Number(req.params.id);
    if (!Number.isInteger(habitId)) {
      return res.status(400).json({ error: 'Invalid habit ID.' });
    }
    const updated = await toggleHabitToday(req.dbUser!.id, habitId);
    if (!updated) {
      return res.status(404).json({ error: 'Habit not found.' });
    }
    return res.json({ habit: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update habit';
    return res.status(500).json({ error: msg });
  }
});

app.delete('/api/habits/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const habitId = Number(req.params.id);
    if (!Number.isInteger(habitId)) {
      return res.status(400).json({ error: 'Invalid habit ID.' });
    }
    const deleted = await deleteHabit(req.dbUser!.id, habitId);
    if (!deleted) {
      return res.status(404).json({ error: 'Habit not found.' });
    }
    return res.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete habit';
    return res.status(500).json({ error: msg });
  }
});

// --- TRIPS ROUTES ---

app.get('/api/trips', requireAuth, async (req: AuthRequest, res) => {
  try {
    const items = await listTrips(req.dbUser!.id);
    return res.json({ trips: items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch trips';
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/trips', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { destination, subtitle, travelDate, coverKey, packingList } = req.body as {
      destination?: string;
      subtitle?: string;
      travelDate?: string;
      coverKey?: string;
      packingList?: Array<{ id?: string; label: string; packed?: boolean }>;
    };
    if (!destination || !destination.trim() || !travelDate) {
      return res.status(400).json({ error: 'Destination and travel date are required.' });
    }
    const normalizedPacking = (packingList || [])
      .filter((item) => item.label && item.label.trim())
      .map((item) => ({
        id: item.id || crypto.randomUUID(),
        label: item.label.trim(),
        packed: Boolean(item.packed),
      }));

    const created = await createTrip(req.dbUser!.id, {
      destination,
      subtitle: subtitle ?? null,
      travelDate,
      coverKey: coverKey || 'kyoto',
      packingList: normalizedPacking,
    });
    return res.status(201).json({ trip: created });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create trip';
    return res.status(500).json({ error: msg });
  }
});

app.patch('/api/trips/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tripId = Number(req.params.id);
    if (!Number.isInteger(tripId)) {
      return res.status(400).json({ error: 'Invalid trip ID.' });
    }
    const { destination, subtitle, travelDate, coverKey, packingList } = req.body;
    const updated = await updateTrip(req.dbUser!.id, tripId, {
      ...(destination !== undefined ? { destination: String(destination).trim() } : {}),
      ...(subtitle !== undefined ? { subtitle } : {}),
      ...(travelDate !== undefined ? { travelDate } : {}),
      ...(coverKey !== undefined ? { coverKey } : {}),
      ...(packingList !== undefined ? { packingList } : {}),
    });
    if (!updated) {
      return res.status(404).json({ error: 'Trip not found.' });
    }
    return res.json({ trip: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update trip';
    return res.status(500).json({ error: msg });
  }
});

app.delete('/api/trips/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tripId = Number(req.params.id);
    if (!Number.isInteger(tripId)) {
      return res.status(400).json({ error: 'Invalid trip ID.' });
    }
    const deleted = await deleteTrip(req.dbUser!.id, tripId);
    if (!deleted) {
      return res.status(404).json({ error: 'Trip not found.' });
    }
    return res.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete trip';
    return res.status(500).json({ error: msg });
  }
});

// --- VITE DEV / STATIC PROD SERVER ---

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Shift server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
