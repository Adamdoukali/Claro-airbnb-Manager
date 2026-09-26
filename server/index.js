import { config } from './config.js';
import { writeDB } from './database.js';
import { createApp } from './app.js';
import { runAutomation } from './automationRunner.js';

async function main() {
  const app = await createApp({ serveClient: true });

  const server = app.listen(config.port, () => {
    console.log(`Claro Airbnb Manager : http://localhost:${config.port} (${config.useSupabase ? 'Supabase' : 'stockage local'})`);
  });

  // Built-in scheduler for long-running deployments (Render, VPS…). Vercel uses Cron Jobs instead.
  let timer = null;
  if (config.automationIntervalMinutes > 0) {
    const baseUrl = config.appUrl || `http://localhost:${config.port}`;
    const tick = () => runAutomation({ baseUrl, trigger: 'interval' })
      .then(r => {
        const sent = r.messages.filter(m => m.sent).length + r.reminders.filter(m => m.sent).length;
        if (sent || r.errors.length) console.log(`[automation] ${sent} message(s) envoyé(s), ${r.errors.length} erreur(s).`);
      })
      .catch(err => console.error('[automation]', err.message));
    timer = setInterval(tick, config.automationIntervalMinutes * 60 * 1000);
    console.log(`[automation] Passage automatique toutes les ${config.automationIntervalMinutes} min.`);
  }

  const shutdown = async signal => {
    console.log(`[server] ${signal} reçu, arrêt en cours…`);
    if (timer) clearInterval(timer);
    server.close();
    try { await writeDB(); } catch { /* best effort */ }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('Démarrage impossible :', err.message);
  process.exit(1);
});
