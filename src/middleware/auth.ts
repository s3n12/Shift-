import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifyShiftToken } from '../lib/auth-tokens.ts';
import { findUserByUid, getOrCreateUser } from '../db/repository.ts';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  authProvider: string;
}

export interface AuthRequest extends Request {
  dbUser?: AuthenticatedUser;
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return part.slice(idx + 1).trim();
      }
    }
  }
  return null;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
  } else {
    token = readCookie(req, 'shift_session');
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  // 1. Check Shift signed session token (Email/Password or Email OTP)
  if (token.startsWith('shift.')) {
    const payload = verifyShiftToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    try {
      const dbUser = await findUserByUid(payload.uid);
      if (!dbUser) {
        return res.status(401).json({ error: 'Account not found.' });
      }
      req.dbUser = {
        id: dbUser.id,
        uid: dbUser.uid,
        email: dbUser.email,
        phone: dbUser.phone,
        displayName: dbUser.displayName,
        authProvider: dbUser.authProvider,
      };
      return next();
    } catch (error) {
      console.error('Error hydrating Shift session user:', error);
      return res.status(500).json({ error: 'Unable to load account session.' });
    }
  }

  // 2. Verify Firebase ID Token (Google Sign-In)
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email || `${decoded.uid}@users.shift.app`;
    const dbUser = await getOrCreateUser({
      uid: decoded.uid,
      email,
      displayName: decoded.name || null,
      authProvider: 'google',
    });
    req.dbUser = {
      id: dbUser.id,
      uid: dbUser.uid,
      email: dbUser.email,
      phone: dbUser.phone,
      displayName: dbUser.displayName,
      authProvider: dbUser.authProvider,
    };
    return next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
