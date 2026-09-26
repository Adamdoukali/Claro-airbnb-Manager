import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { listUsers, createUser, deleteUser, findUserByEmail, findUserById, updateUserPassword } from '../database.js';
import { requireAuth } from '../auth.js';
import { requireFeature, requireRole, ROLES } from '../features.js';
import { asyncHandler, str } from '../utils.js';

const router = Router();
router.use(requireAuth, requireFeature('multiUser'), requireRole('admin'));

router.get('/', (_req, res) => {
  res.json({ users: listUsers(), roles: ROLES });
});

router.post('/', asyncHandler(async (req, res) => {
  const email = str(req.body?.email, 200).toLowerCase();
  const password = String(req.body?.password || '');
  const role = ROLES.includes(req.body?.role) ? req.body.role : 'assistant';
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });
  if (password.length < 10) return res.status(400).json({ error: 'Mot de passe : 10 caractères minimum' });
  if (findUserByEmail(email)) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  const user = await createUser({ email, passwordHash: await bcrypt.hash(password, 12), role });
  res.status(201).json({ id: user.id, email: user.email, role: user.role, createdAt: user.createdAt });
}));

router.put('/:id/password', asyncHandler(async (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 10) return res.status(400).json({ error: 'Mot de passe : 10 caractères minimum' });
  if (!findUserById(req.params.id)) return res.status(404).json({ error: 'Utilisateur introuvable' });
  await updateUserPassword(req.params.id, await bcrypt.hash(password, 12));
  res.json({ success: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  const target = findUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const admins = listUsers().filter(u => u.role === 'admin');
  if (target.role === 'admin' && admins.length <= 1) return res.status(400).json({ error: 'Impossible de supprimer le dernier administrateur' });
  await deleteUser(req.params.id);
  res.json({ success: true });
}));

export default router;
