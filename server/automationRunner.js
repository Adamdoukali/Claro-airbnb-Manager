import { readDB, writeDB } from './database.js';
import { getActiveHospitableApiKey, sendHospitableMessage, syncHospitableReservations, syncPropertiesFromHospitable } from './hospitableService.js';
import { generateReminderMessage } from './messages.js';
import { autoMessageDecision, reminderDecision, todayIsoDate } from './automation.js';
import { portalUrl } from './utils.js';

let running = null;

/**
 * One automation pass: optional Hospitable sync, then check-in messages and reminders
 * for every registration that is due according to the host's settings.
 *
 * `dryRun` lists what *would* be sent without sending or persisting anything
 * (used by the settings panel preview).
 */
export function runAutomation(opts = {}) {
  // Never run two passes at once (cron + manual click, or overlapping intervals).
  if (running) return running;
  running = runAutomationOnce(opts).finally(() => { running = null; });
  return running;
}

async function runAutomationOnce({ baseUrl = '', trigger = 'manual', dryRun = false } = {}) {
  const startedAt = new Date().toISOString();
  const report = {
    trigger, dryRun, startedAt, finishedAt: null,
    sync: null,
    messages: [],   // { registrationId, guestName, property, checkIn, sent }
    reminders: [],
    errors: []
  };

  let db = readDB();
  const automation = db.settings.automation || {};
  const token = getActiveHospitableApiKey();

  if (automation.autoSyncEnabled && !dryRun) {
    if (!token) {
      report.errors.push('Synchronisation : clé API Hospitable absente.');
    } else {
      try {
        // Listing names / new properties change rarely: refresh them once an hour.
        const lastProps = Date.parse(db.settings.lastPropertySyncAt || 0) || 0;
        if (Date.now() - lastProps > 60 * 60 * 1000) {
          const ps = await syncPropertiesFromHospitable();
          report.properties = { total: ps.totalProperties, imported: ps.importedCount, updated: ps.updatedCount, missing: ps.missing };
          db = readDB();
        }
        const r = await syncHospitableReservations({ baseUrl, logOnlyChanges: true });
        report.sync = {
          totalReservations: r.totalReservations, addedCount: r.addedCount,
          updatedCount: r.updatedCount, autoMessagesSent: r.autoMessagesSent
        };
        for (let i = 0; i < r.autoMessagesSent; i++) report.messages.push({ sent: true, viaSync: true });
      } catch (err) {
        report.errors.push(`Synchronisation : ${err.message}`);
      }
      db = readDB();
    }
  }

  const todayIso = todayIsoDate();
  const canSend = Boolean(token) && !dryRun;
  if (!token && !dryRun && (automation.autoMessageEnabled || automation.reminderEnabled)) {
    report.errors.push('Messages : clé API Hospitable absente, aucun envoi possible.');
  }

  for (const reg of db.policeRegistrations) {
    const booking = reg.bookingId ? db.bookings.find(b => b.id === reg.bookingId) : null;
    const property = db.properties.find(p => p.id === reg.propertyId) || null;
    if (!booking || !property) continue;
    const reservationId = reg.hospitableReservationId || booking.hospitableReservationId;
    const base = { registrationId: reg.id, guestName: reg.guestName, property: property.name, checkIn: booking.checkIn };

    const msg = autoMessageDecision({ automation, property, booking, reg, todayIso });
    if (msg.due) {
      const entry = { ...base, kind: 'checkin', sent: false };
      if (canSend) {
        try {
          await sendHospitableMessage(token, reservationId, reg.automatedMessage);
          reg.messageSentAt = new Date().toISOString();
          reg.messageChannel = 'hospitable';
          entry.sent = true;
        } catch (err) {
          entry.error = err.message;
          report.errors.push(`${reg.guestName} : ${err.message}`);
        }
      }
      report.messages.push(entry);
    }

    const rem = reminderDecision({ automation, property, booking, reg, todayIso });
    if (rem.due) {
      const entry = { ...base, kind: 'reminder', sent: false };
      if (canSend) {
        try {
          const body = generateReminderMessage({
            guestName: reg.guestName,
            propertyName: property.name,
            accessCode: reg.accessCode,
            portalUrl: portalUrl(baseUrl, reg.accessCode),
            checkIn: booking.checkIn,
            hostName: property.hostName,
            language: db.settings.defaultLanguage || 'fr'
          });
          await sendHospitableMessage(token, reservationId, body);
          reg.reminderSentAt = new Date().toISOString();
          entry.sent = true;
        } catch (err) {
          entry.error = err.message;
          report.errors.push(`Rappel ${reg.guestName} : ${err.message}`);
        }
      }
      report.reminders.push(entry);
    }
  }

  report.finishedAt = new Date().toISOString();

  if (!dryRun) {
    db.settings.automation = {
      ...db.settings.automation,
      lastRunAt: report.finishedAt,
      lastRunReport: {
        trigger,
        startedAt,
        finishedAt: report.finishedAt,
        sync: report.sync,
        messagesSent: report.messages.filter(m => m.sent).length,
        remindersSent: report.reminders.filter(m => m.sent).length,
        errors: report.errors.slice(0, 10)
      }
    };
    await writeDB(db);
  }

  return report;
}
