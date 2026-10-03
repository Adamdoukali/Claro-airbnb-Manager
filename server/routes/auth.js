import { Router } from 'express';
import { authenticate, changePassword, signSession, setSessionCookie, clearSessionCookie, requireAuth } from '../auth.js';
import { loginLimiter } from '../middleware.js';
import { asyncHandler, str } from '../utils.js';
import { getFeatures } from '../features.js';

const router = Router();

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const email = str(req.body?.email, 200).toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  let user;
  try {
    user = await authenticate(email, password);
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ error: err.message });
    throw err;
  }
  if (!user) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  setSessionCookie(res, signSession(user));
  res.json({ user: { id: user.id, email: user.email, role: user.role }, features: getFeatures() });
}));

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user || null, features: req.user ? getFeatures() : null });
});

router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  await changePassword(req.user.id, req.body?.currentPassword, req.body?.newPassword);
  res.json({ success: true });
}));

export default router;
