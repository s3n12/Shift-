import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  generateSixDigitOtp,
  hashPassword,
  signShiftToken,
  verifyPassword,
} from './src/lib/auth-tokens.ts';
import { sendOtpEmail } from './src/lib/mailer.ts';
import { maskPhoneNumber, normalizePhoneNumber, sendOtpSms } from './src/lib/sms.ts';
import {
  createHabit,
  createOtpCode,
  createTask,
  createTrip,
  deleteHabit,
  deleteTask,
  deleteTrip,
  findUserByEmail,
  findUserByPhone,
  getOrCreatePhoneUser,
  getOrCreateUser,
  listHabits,
  listTasks,
  listTrips,
  toggleHabitToday,
  updateTask,
  updateTrip,
  verifyAndConsumeOtp,
} from './src/db/repository.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.length <= 2 ? local[0] : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

// --- AUTH ROUTES (Email/Password, Email OTP, Mobile SMS OTP, and Google Sign-In) ---

app.post('/api/auth/request-otp', async (req, res) => {
  try {
    const { email, password, mode, displayName, channel, countryCode, phone } = req.body as {
      email?: string;
      password?: string;
      mode?: 'login' | 'signup' | 'otp' | 'sms';
      displayName?: string;
      channel?: 'email' | 'sms';
      countryCode?: string;
      phone?: string;
    };

    const resolvedChannel: 'email' | 'sms' =
      channel === 'sms' || mode === 'sms' ? 'sms' : 'email';

    if (resolvedChannel === 'sms') {
      const normalizedPhone = normalizePhoneNumber(countryCode || '+91', phone || '');
      if (!normalizedPhone) {
        return res
          .status(400)
          .json({ error: 'Please enter a valid mobile number (7 to 15 digits).' });
      }

      const existingPhoneUser = await findUserByPhone(normalizedPhone);
      const code = generateSixDigitOtp();
      const delivery = await sendOtpSms(normalizedPhone, code);

      await createOtpCode({
        channel: 'sms',
        phone: normalizedPhone,
        code,
        purpose: 'sms-login',
      });

      return res.json({
        ok: true,
        channel: 'sms',
        delivered: delivery.delivered,
        maskedTarget: maskPhoneNumber(normalizedPhone),
        ...(delivery.delivered === 'preview' ? { verificationCode: code } : {}),
        displayName: displayName?.trim() || existingPhoneUser?.displayName || null,
      });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const authMode: 'login' | 'signup' | 'otp' =
      mode === 'signup' ? 'signup' : mode === 'otp' ? 'otp' : 'login';
    const existing = await findUserByEmail(normalizedEmail);

    if (authMode === 'login') {
      if (!password || password.length < 6) {
        return res
          .status(400)
          .json({ error: 'Please enter your password (at least 6 characters).' });
      }
      if (!existing) {
        return res.status(404).json({
          error: 'No account found for this email. Switch to Create Account to get started.',
        });
      }
      if (existing.passwordHash) {
        const valid = verifyPassword(password, existing.passwordHash);
        if (!valid) {
          return res.status(401).json({ error: 'Incorrect email or password.' });
        }
      } else {
        const providerHint =
          existing.authProvider === 'google'
            ? 'This email was registered with Google. Use Login with Google, Email OTP, or set a password under Create Account.'
            : 'No password is set for this email yet. Use Create Account to set a password, or sign in with Email OTP.';
        return res.status(400).json({ error: providerHint });
      }
    } else if (authMode === 'signup') {
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }
      if (existing && existing.passwordHash) {
        return res.status(409).json({
          error: 'An account with this email already exists. Sign in instead.',
        });
      }
    }

    let optionalPhone: string | null = null;
    if (authMode === 'signup' && phone && phone.trim()) {
      optionalPhone = normalizePhoneNumber(countryCode || '+91', phone);
      if (!optionalPhone) {
        return res
          .status(400)
          .json({ error: 'Please enter a valid optional mobile number (7 to 15 digits), or leave it blank.' });
      }
    }

    const code = generateSixDigitOtp();

    if (optionalPhone) {
      const delivery = await sendOtpSms(optionalPhone, code);
      await createOtpCode({
        channel: 'sms',
        email: normalizedEmail,
        phone: optionalPhone,
        code,
        purpose: authMode,
      });

      return res.json({
        ok: true,
        channel: 'sms',
        delivered: delivery.delivered,
        maskedTarget: maskPhoneNumber(optionalPhone),
        ...(delivery.delivered === 'preview' ? { verificationCode: code } : {}),
        displayName: displayName?.trim() || existing?.displayName || null,
      });
    }

    const delivery = await sendOtpEmail(normalizedEmail, code, authMode);
    await createOtpCode({
      channel: 'email',
      email: normalizedEmail,
      code,
      purpose: authMode,
    });

    return res.json({
      ok: true,
      channel: 'email',
      delivered: delivery.delivered,
      maskedTarget: maskEmail(normalizedEmail),
      ...(delivery.delivered === 'preview' ? { verificationCode: code } : {}),
      displayName: displayName?.trim() || existing?.displayName || null,
    });
  } catch (error) {
    console.error('Error in /api/auth/request-otp:', error);
    const msg =
      error instanceof Error
        ? error.message
        : 'Could not start verification. Please try again.';
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, code, password, displayName, mode, channel, countryCode, phone } =
      req.body as {
        email?: string;
        code?: string;
        password?: string;
        displayName?: string;
        mode?: 'login' | 'signup' | 'otp' | 'sms';
        channel?: 'email' | 'sms';
        countryCode?: string;
        phone?: string;
      };

    if (!code || code.trim().length !== 6) {
      return res.status(400).json({ error: 'Please enter the 6-digit verification code.' });
    }

    const resolvedChannel: 'email' | 'sms' =
      channel === 'sms' || mode === 'sms' ? 'sms' : 'email';

    if (resolvedChannel === 'sms') {
      const normalizedPhone = normalizePhoneNumber(countryCode || '+91', phone || '');
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Invalid mobile number.' });
      }

      const matched = await verifyAndConsumeOtp({
        channel: 'sms',
        phone: normalizedPhone,
        code,
      });
      if (!matched) {
        return res.status(401).json({ error: 'Invalid or expired SMS verification code.' });
      }

      // If signing up with Email + Password + optional Mobile SMS OTP, link all three
      if (mode === 'signup' && email && email.trim()) {
        const normalizedEmail = email.trim().toLowerCase();
        const existing = await findUserByEmail(normalizedEmail);
        const passwordHash = password ? hashPassword(password) : null;
        const user = await getOrCreateUser({
          uid: existing ? existing.uid : `email:${crypto.randomUUID()}`,
          email: normalizedEmail,
          phone: normalizedPhone,
          displayName:
            displayName?.trim() || existing?.displayName || normalizedEmail.split('@')[0],
          authProvider: passwordHash ? 'email-password' : existing?.authProvider || 'phone-otp',
          passwordHash,
        });

        const token = signShiftToken({
          uid: user.uid,
          email: user.email,
          phone: user.phone,
          name: user.displayName || undefined,
        });

        return res.json({
          token,
          user: {
            id: user.id,
            uid: user.uid,
            email: user.email,
            phone: user.phone,
            displayName: user.displayName,
            authProvider: user.authProvider,
          },
        });
      }

      const user = await getOrCreatePhoneUser({
        phone: normalizedPhone,
        displayName: displayName?.trim() || null,
      });

      const token = signShiftToken({
        uid: user.uid,
        email: user.email,
        phone: user.phone,
        name: user.displayName || undefined,
      });

      return res.json({
        token,
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          phone: user.phone,
          displayName: user.displayName,
          authProvider: user.authProvider,
        },
      });
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const matched = await verifyAndConsumeOtp({
      channel: 'email',
      email: normalizedEmail,
      code,
    });
    if (!matched) {
      return res.status(401).json({ error: 'Invalid or expired verification code.' });
    }

    const existing = await findUserByEmail(normalizedEmail);
    const passwordHash =
      mode === 'signup' && password ? hashPassword(password) : null;

    const user = await getOrCreateUser({
      uid: existing ? existing.uid : `email:${crypto.randomUUID()}`,
      email: normalizedEmail,
      displayName: displayName?.trim() || existing?.displayName || normalizedEmail.split('@')[0],
      authProvider: passwordHash ? 'email-password' : existing?.authProvider || 'email-otp',
      passwordHash,
    });

    const token = signShiftToken({
      uid: user.uid,
      email: user.email,
      phone: user.phone,
      name: user.displayName || undefined,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        phone: user.phone,
        displayName: user.displayName,
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error('Error in /api/auth/verify-otp:', error);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  return res.json({ user: req.dbUser });
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
