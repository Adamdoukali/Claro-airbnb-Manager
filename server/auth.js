import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { readDB, findUserByEmail, findUserById, createUser, updateUserPassword } from './database.js';

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
  const user = findUserByEmail(email);
  // Always run a hash comparison so timing does not reveal whether the email exists.
  const hash = user?.passwordHash || '$2a$12$CwTycUXWue0Thq9StjUM0uJ8ZzC4rY7Q0fTz1x8W8fQq1lVv1c6vC';
  const ok = await bcrypt.compare(password || '', hash);
  if (!user || !ok) return null;
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
      if (user) req.user = publicUser(user);
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
