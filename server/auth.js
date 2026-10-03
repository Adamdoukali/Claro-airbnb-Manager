import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { readDB, findUserByEmail, findUserById, createUser, updateUserPassword, getSettings, updateSettings } from './database.js';
import crypto from 'crypto';

const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_AFTER = 8;
const emailKey = email => crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 16);

function security() {
  const s = getSettings().security || {};
  return { loginFailures: { ...(s.loginFailures || {}) }, sessionsInvalidatedAt: { ...(s.sessionsInvalidatedAt || {}) } };
}

/** Per-account lockout stored in the database: works across serverless instances, unlike the in-memory limiter. */
export function loginLockRemaining(email) {
  const entry = security().loginFailures[emailKey(email)];
  if (!entry?.lockedUntil) return 0;
  return Math.max(0, Date.parse(entry.lockedUntil) - Date.now());
}

async function recordLoginFailure(email) {
  const sec = security();
  const k = emailKey(email);
  const now = Date.now();
  const prev = sec.loginFailures[k];
  const inWindow = prev && now - Date.parse(prev.firstAt) < LOCK_WINDOW_MS;
  const count = inWindow ? prev.count + 1 : 1;
  const entry = { count, firstAt: inWindow ? prev.firstAt : new Date(now).toISOString() };
  if (count >= LOCK_AFTER) entry.lockedUntil = new Date(now + LOCK_WINDOW_MS).toISOString();
  sec.loginFailures[k] = entry;
  // keep the map small
  for (const [key, e] of Object.entries(sec.loginFailures)) if (now - Date.parse(e.firstAt) > 24 * 3600 * 1000) delete sec.loginFailures[key];
  await updateSettings({ security: sec });
}

async function clearLoginFailures(email) {
  const sec = security();
  const k = emailKey(email);
  if (!sec.loginFailures[k]) return;
  delete sec.loginFailures[k];
  await updateSettings({ security: sec });
}

/** Invalidate every session issued before now for this user (after a password change / reset). */
export async function invalidateSessions(userId) {
  const sec = security();
  sec.sessionsInvalidatedAt[userId] = new Date().toISOString();
  await updateSettings({ security: sec });
}

export const SESSION_COOKIE = 'claro_session';

function cookieOptions() {
  const secure = config.isProd || config.appUrl.startsWith('https://');
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000
  };
}

/** Create the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD when no user exists yet. */
export async function ensureAdminUser() {
  const db = readDB();
  if (db.users.length > 0) return;

  if (!config.adminEmail || !config.adminPassword) {
    console.warn('[auth] Aucun utilisateur et ADMIN_EMAIL / ADMIN_PASSWORD absents : la connexion est impossible.');
    return;
  }
  if (config.adminPassword.length < 10) {
    throw new Error('ADMIN_PASSWORD doit contenir au moins 10 caractères.');
  }
  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  await createUser({ email: config.adminEmail, passwordHash, role: 'admin' });
  console.log(`[auth] Compte administrateur créé : ${config.adminEmail}`);
}

export function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role };
}

export async function authenticate(email, password) {
  if (loginLockRemaining(email) > 0) {
    const err = new Error('Compte temporairement bloqué après plusieurs échecs. Réessayez dans 15 minutes.');
    err.status = 429;
    throw err;
  }
  const user = findUserByEmail(email);
  // Always run a hash comparison so timing does not reveal whether the email exists.
  const hash = user?.passwordHash || '$2a$12$CwTycUXWue0Thq9StjUM0uJ8ZzC4rY7Q0fTz1x8W8fQq1lVv1c6vC';
  const ok = await bcrypt.compare(password || '', hash);
  if (!user || !ok) {
    await recordLoginFailure(email).catch(() => {});
    return null;
  }
  await clearLoginFailures(email).catch(() => {});
  return user;
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = findUserById(userId);
  if (!user) throw new Error('Utilisateur introuvable');
  const ok = await bcrypt.compare(currentPassword || '', user.passwordHash);
  if (!ok) {
    const err = new Error('Mot de passe actuel incorrect');
    err.status = 400;
    throw err;
  }
  if (!newPassword || newPassword.length < 10) {
    const err = new Error('Le nouveau mot de passe doit contenir au moins 10 caractères');
    err.status = 400;
    throw err;
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await updateUserPassword(userId, passwordHash);
  await invalidateSessions(userId);
}

export function signSession(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    expiresIn: `${config.sessionDays}d`
  });
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
}

/** Resolve the current user from the session cookie (or Bearer token), without rejecting. */
export function attachUser(req, _res, next) {
  let token = req.cookies?.[SESSION_COOKIE];
  const header = req.headers.authorization || '';
  if (!token && header.startsWith('Bearer ')) token = header.slice(7);
  req.user = null;
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      const user = findUserById(payload.sub);
      const invalidatedAt = Date.parse(getSettings().security?.sessionsInvalidatedAt?.[payload.sub] || 0) || 0;
      // Tokens issued before the last password change are dead.
      if (user && (payload.iat || 0) * 1000 >= invalidatedAt) req.user = publicUser(user);
    } catch {
      // invalid or expired token: treated as anonymous
    }
  }
  next();
}

/** Reject anonymous requests with 401. */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}
