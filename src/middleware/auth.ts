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

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  // 1. Check Shift Email/Password, Email OTP, or Mobile SMS OTP signed session token
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
