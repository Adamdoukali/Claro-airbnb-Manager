import { getSettings, DEFAULT_FEATURES } from './database.js';

export const FEATURE_KEYS = Object.keys(DEFAULT_FEATURES);

/** Current feature switches (always merged over the defaults). */
export function getFeatures() {
  return { ...DEFAULT_FEATURES, ...(getSettings().features || {}) };
}

export function isFeatureOn(name) {
  return Boolean(getFeatures()[name]);
}

/**
 * Express guard: the route only exists while the feature is switched on in the settings panel.
 * A disabled feature answers 404 so it is indistinguishable from "not deployed".
 */
export function requireFeature(name) {
  return (_req, res, next) => {
    if (!isFeatureOn(name)) {
      return res.status(404).json({ error: `Fonctionnalité désactivée (${name}). Activez-la dans Paramètres > Fonctionnalités.` });
    }
    next();
  };
}

/** Role hierarchy used by requireRole(): admin > assistant > cleaner. */
export const ROLES = ['admin', 'assistant', 'cleaner'];

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
    const role = req.user.role || 'admin';
    if (!allowed.includes(role)) return res.status(403).json({ error: 'Accès réservé : droits insuffisants' });
    next();
  };
}

/** Paths a cleaner account may call (everything else is 403). */
export const CLEANER_ALLOWED = [/^\/api\/auth\//, /^\/api\/tasks(\/|$)/, /^\/api\/health$/];
