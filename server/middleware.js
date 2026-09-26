import rateLimit from 'express-rate-limit';
import multer from 'multer';

const limiterDefaults = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans quelques minutes.' }
};

/** Login: 15 failed attempts per 15 minutes per IP (successful logins are not counted). */
export const loginLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000,
  limit: 15,
  skipSuccessfulRequests: true,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});

/** Public guest portal (verify / submit): 60 per 15 minutes per IP. */
export const guestLimiter = rateLimit({ ...limiterDefaults, windowMs: 15 * 60 * 1000, limit: 60 });

/** OCR is CPU heavy: 20 scans per 15 minutes per IP. */
export const ocrLimiter = rateLimit({ ...limiterDefaults, windowMs: 15 * 60 * 1000, limit: 20 });

/** Webhook endpoint: 120 per minute per IP. */
export const webhookLimiter = rateLimit({ ...limiterDefaults, windowMs: 60 * 1000, limit: 120 });

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Uploads stay in memory and are handed to the storage adapter (disk or Supabase). */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    fieldSize: 30 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
    const err = new Error('Format de fichier non supporté (JPEG, PNG ou WebP uniquement).');
    err.status = 400;
    cb(err);
  }
});

/** Central error handler: consistent JSON errors, no stack traces leaked. */
export function errorHandler(err, _req, res, _next) {
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err.message || 'Erreur serveur' });
}
