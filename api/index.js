// Vercel serverless entry point: every /api/* request is rewritten here (see vercel.json)
// and handled by the same Express app as the long-running server.
import { createApp } from '../server/app.js';

let appPromise = null;

export default async function handler(req, res) {
  try {
    if (!appPromise) {
      appPromise = createApp({ serveClient: false }).catch(err => {
        appPromise = null; // retry on the next invocation instead of caching a broken app
        throw err;
      });
    }
    const app = await appPromise;
    return app(req, res);
  } catch (err) {
    console.error('[vercel] Démarrage impossible :', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: `Démarrage impossible : ${err.message}` }));
  }
}
