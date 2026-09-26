/**
 * Automation rules (pure functions, no I/O).
 *
 * Every automated action is opt-in and controlled from the host "Paramètres" panel:
 *  - autoMessage : send the check-in link + access code in the guest's Airbnb/Booking thread
 *  - reminder    : nudge guests who still have not completed their police form
 *  - autoSync    : pull Hospitable reservations on a schedule (cron)
 *
 * Only properties explicitly listed in `autoMessagePropertyIds` ever receive automated messages.
 */

export const DEFAULT_AUTOMATION = {
  // --- Message automatique de check-in (lien + code) ---
  autoMessageEnabled: false,
  autoMessagePropertyIds: [],        // logements autorisés ; vide = aucun
  autoMessageTiming: 'immediate',    // 'immediate' (dès la réservation) | 'days_before' (X jours avant l'arrivée)
  autoMessageDaysBefore: 3,
  autoMessageIncludeExisting: false, // inclure les réservations importées avant l'activation
  autoMessageActivatedAt: null,      // horodatage de la dernière activation

  // --- Rappel si la fiche n'est pas complétée ---
  reminderEnabled: false,
  reminderDaysBefore: 1,

  // --- Synchronisation Hospitable planifiée ---
  autoSyncEnabled: false,

  // --- Journal du dernier passage ---
  lastRunAt: null,
  lastRunReport: null
};

export const AUTO_MESSAGE_TIMINGS = new Set(['immediate', 'days_before']);

export function normalizeAutomation(raw) {
  const a = { ...DEFAULT_AUTOMATION, ...(raw && typeof raw === 'object' ? raw : {}) };
  a.autoMessagePropertyIds = Array.isArray(a.autoMessagePropertyIds) ? a.autoMessagePropertyIds.filter(Boolean) : [];
  if (!AUTO_MESSAGE_TIMINGS.has(a.autoMessageTiming)) a.autoMessageTiming = 'immediate';
  a.autoMessageDaysBefore = clampInt(a.autoMessageDaysBefore, 0, 30, 3);
  a.reminderDaysBefore = clampInt(a.reminderDaysBefore, 0, 14, 1);
  return a;
}

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function todayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Whole days between today and an ISO date (negative when in the past). */
export function daysUntil(dateIso, todayIso) {
  return Math.round((Date.parse(dateIso) - Date.parse(todayIso)) / 86400000);
}

/**
 * Should the check-in message be sent now for this registration?
 * Returns { due: boolean, reason: string }. `reason` explains a negative answer.
 */
export function autoMessageDecision({ automation, property, booking, reg, todayIso = todayIsoDate() }) {
  const a = normalizeAutomation(automation);
  if (!a.autoMessageEnabled) return no('disabled');
  if (!property || !a.autoMessagePropertyIds.includes(property.id)) return no('property_not_selected');
  if (!reg) return no('no_registration');
  if (reg.messageSentAt) return no('already_sent');
  if (reg.status === 'completed') return no('form_completed');
  if (!booking) return no('no_booking');
  if (booking.status !== 'confirmed') return no('not_confirmed');
  if (!(reg.hospitableReservationId || booking.hospitableReservationId)) return no('no_hospitable_id');
  if (!booking.checkIn || booking.checkIn < todayIso) return no('past_arrival');
  if (!a.autoMessageIncludeExisting && a.autoMessageActivatedAt && booking.createdAt && booking.createdAt < a.autoMessageActivatedAt) {
    return no('existing_booking');
  }
  if (a.autoMessageTiming === 'days_before' && daysUntil(booking.checkIn, todayIso) > a.autoMessageDaysBefore) {
    return no('not_yet');
  }
  return { due: true, reason: 'due' };
}

/** Should a reminder be sent now (form still pending, arrival close)? */
export function reminderDecision({ automation, property, booking, reg, todayIso = todayIsoDate() }) {
  const a = normalizeAutomation(automation);
  if (!a.reminderEnabled) return no('disabled');
  if (!property || !a.autoMessagePropertyIds.includes(property.id)) return no('property_not_selected');
  if (!reg) return no('no_registration');
  if (reg.status === 'completed') return no('form_completed');
  if (!reg.messageSentAt) return no('first_message_not_sent');
  if (reg.reminderSentAt) return no('already_sent');
  if (!booking) return no('no_booking');
  if (booking.status !== 'confirmed') return no('not_confirmed');
  if (!(reg.hospitableReservationId || booking.hospitableReservationId)) return no('no_hospitable_id');
  if (!booking.checkIn) return no('no_dates');
  const d = daysUntil(booking.checkIn, todayIso);
  if (d < 0) return no('past_arrival');
  if (d > a.reminderDaysBefore) return no('not_yet');
  // Never remind the same day the first message went out.
  if (String(reg.messageSentAt).slice(0, 10) === todayIso) return no('sent_today');
  return { due: true, reason: 'due' };
}

function no(reason) {
  return { due: false, reason };
}
