import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  RefreshCw, 
  ExternalLink, 
  Calendar as CalendarIcon,
  Shield,
  Trash2,
  Lock,
  User
} from 'lucide-react';

export default function CalendarView({ 
  bookings, 
  property, 
  onAddBookingClick, 
  onSyncClick,
  isSyncing,
  liveStatus,
  onGeneratePoliceCode,
  onDeleteBooking
}) {
  // "Live" pill: green when the scheduler synced (or a webhook arrived) in the last few minutes.
  const lastLiveAt = [liveStatus?.lastSyncAt, liveStatus?.lastWebhookAt].filter(Boolean).sort().pop() || null;
  const liveAgeMin = lastLiveAt ? Math.max(0, Math.round((Date.now() - Date.parse(lastLiveAt)) / 60000)) : null;
  const isLive = Boolean(liveStatus?.autoSyncEnabled && liveStatus?.scheduler !== 'none') || (liveAgeMin !== null && liveAgeMin <= 5);
  const liveLabel = liveAgeMin === null
    ? 'Aucune synchro'
    : liveAgeMin === 0 ? "synchro à l'instant" : liveAgeMin < 60 ? `synchro il y a ${liveAgeMin} min` : `synchro il y a ${Math.round(liveAgeMin / 60)} h`;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const today = () => {
    setCurrentDate(new Date());
  };

  // Generate calendar days (local dates: never go through toISOString, which is UTC)
  const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Starting day index (Monday as 0)
  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday

  const daysInMonth = lastDayOfMonth.getDate();
  const todayStr = toDateStr(new Date());
  const calendarDays = [];

  for (let i = startDayOfWeek; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    calendarDays.push({ dateStr: toDateStr(d), dayNum: d.getDate(), isCurrentMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = toDateStr(new Date(year, month, i));
    calendarDays.push({ dateStr, dayNum: i, isCurrentMonth: true, isToday: dateStr === todayStr });
  }
  const remaining = (7 - (calendarDays.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    calendarDays.push({ dateStr: toDateStr(d), dayNum: d.getDate(), isCurrentMonth: false });
  }

  // Split into week rows. Each booking becomes ONE continuous bar per week (Hospitable-style):
  // it starts in the middle of the check-in cell and ends in the middle of the check-out cell,
  // so a same-day turnover shares the cell with the next guest.
  const weeks = [];
  let prevLanes = new Map(); // booking id -> lane in the previous week (keeps a long stay on one line)
  for (let i = 0; i < calendarDays.length; i += 7) {
    const days = calendarDays.slice(i, i + 7);
    const weekStart = days[0].dateStr;
    const weekEnd = days[6].dateStr;
    const sorted = [...bookings]
      .filter(b => b.checkIn && b.checkOut && b.checkIn <= weekEnd && b.checkOut >= weekStart)
      .sort((a, b) =>
        (prevLanes.has(a.id) ? prevLanes.get(a.id) : Infinity) - (prevLanes.has(b.id) ? prevLanes.get(b.id) : Infinity)
        || a.checkIn.localeCompare(b.checkIn) || a.checkOut.localeCompare(b.checkOut));

    const laneEnds = []; // right edge (0..1) of the last bar in each lane
    const bars = [];
    const lanesThisWeek = new Map();
    for (const b of sorted) {
      const startsHere = b.checkIn >= weekStart;
      const endsHere = b.checkOut <= weekEnd;
      const left = startsHere ? (days.findIndex(d => d.dateStr === b.checkIn) + 0.5) / 7 : 0;
      const right = endsHere ? (days.findIndex(d => d.dateStr === b.checkOut) + 0.5) / 7 : 1;
      if (right - left <= 0) continue;
      let lane = prevLanes.has(b.id) ? prevLanes.get(b.id) : -1;
      if (lane === -1 || (laneEnds[lane] || 0) > left + 1e-6) lane = laneEnds.findIndex(end => end <= left + 1e-6);
      if (lane === -1) lane = laneEnds.length;
      while (laneEnds.length <= lane) laneEnds.push(0);
      laneEnds[lane] = right;
      lanesThisWeek.set(b.id, lane);
      bars.push({ booking: b, left, width: right - left, lane, startsHere, endsHere });
    }
    weeks.push({ days, bars, lanes: Math.max(1, laneEnds.length) });
    prevLanes = lanesThisWeek;
  }

  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];

  const getChipClass = (source) => {
    switch (source) {
      case 'airbnb': return 'chip-airbnb';
      case 'booking': return 'chip-booking';
      case 'direct': return 'chip-direct';
      case 'blocked': return 'chip-blocked';
      default: return 'chip-direct';
    }
  };

  const getSourceName = (source) => {
    switch (source) {
      case 'airbnb': return 'Airbnb (Hospitable)';
      case 'booking': return 'Booking.com (Hospitable)';
      case 'vrbo': return 'VRBO (Hospitable)';
      case 'direct': return 'Direct';
      case 'blocked': return 'Bloqué';
      default: return source;
    }
  };

  return (
    <div className="calendar-view-container">
      {/* Top Header & Actions */}
      <div className="calendar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>
            {monthNames[month]} {year}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={prevMonth} className="btn btn-secondary btn-icon" title="Mois précédent">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={today} className="btn btn-secondary btn-sm" title="Aujourd'hui">
              Aujourd'hui
            </button>
            <button type="button" onClick={nextMonth} className="btn btn-secondary btn-icon" title="Mois suivant">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Legend */}
          <div className="calendar-legend">
            <div className="legend-item">
              <span className="legend-dot dot-airbnb"></span>
              <span>Airbnb (Hospitable)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-booking"></span>
              <span>Booking.com (Hospitable)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-direct"></span>
              <span>Direct</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-blocked"></span>
              <span>Dates bloquées</span>
            </div>
          </div>

          {/* Live indicator */}
          <span
            className={`live-pill ${isLive ? 'on' : ''}`}
            title={isLive
              ? `Synchronisation automatique active${liveStatus?.lastWebhookAt ? ' · webhook Hospitable reçu' : ''}`
              : 'Synchronisation automatique inactive : activez-la dans Paramètres & Automatisations'}
          >
            <span className="live-dot" />
            <span>{isLive ? 'Live' : 'Hors ligne'} · {liveLabel}</span>
          </span>

          {/* Sync Button */}
          <button
            type="button" 
            onClick={onSyncClick} 
            className="btn btn-secondary btn-sm"
            disabled={isSyncing}
            title="Synchroniser toutes les réservations via Hospitable"
          >
            <RefreshCw size={14} className={isSyncing ? "spinning" : ""} />
            <span>{isSyncing ? "Synchronisation..." : "Actualiser Hospitable"}</span>
          </button>

          {/* Add / Block button */}
          <button 
            type="button" 
            onClick={() => onAddBookingClick()} 
            className="btn btn-rausch btn-sm"
          >
            <Plus size={16} />
            <span>Ajouter / Bloquer</span>
          </button>
        </div>
      </div>

      {/* Hospitable Aggregation Notice banner */}
      <div style={{
        background: '#EEF2FF',
        border: '1px solid #C7D2FE',
        borderRadius: 12,
        padding: '12px 18px',
        marginBottom: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: '#4F46E5',
            color: '#FFF',
            padding: '4px 9px',
            borderRadius: 6,
            fontSize: '0.75rem',
            fontWeight: 800,
            letterSpacing: '0.5px'
          }}>
            HOSPITABLE AGGREGATOR
          </div>
          <span style={{ fontSize: '0.9rem', color: '#1E1B4B' }}>
            Flux multi-canaux unifié : Les réservations et disponibilités <strong>Airbnb</strong> et <strong>Booking.com</strong> sont centralisées en temps réel via l'API Hospitable.
          </span>
        </div>
        {property?.airbnbUrl && (
          <a
            href={property.airbnbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm"
            style={{ borderColor: '#4F46E5', color: '#4F46E5', background: '#FFF' }}
          >
            <span>Ouvrir Airbnb</span>
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {/* Calendar Grid: day cells + one continuous bar per booking and per week */}
      <div className="calendar-grid">
        <div className="calendar-weekdays">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
            <div key={day} className="calendar-weekday">{day}</div>
          ))}
        </div>

        {weeks.map((week, wIdx) => (
          <div key={wIdx} className="calendar-week" style={{ '--lanes': week.lanes }}>
            {week.days.map((day) => {
              const occupied = bookings.some(b => day.dateStr >= b.checkIn && day.dateStr < b.checkOut);
              return (
                <div
                  key={day.dateStr}
                  className={`calendar-day-cell ${!day.isCurrentMonth ? 'other-month' : ''} ${day.isToday ? 'today' : ''}`}
                  onClick={() => { if (!occupied) onAddBookingClick(day.dateStr); }}
                  title={occupied ? undefined : `Ajouter / bloquer le ${day.dateStr}`}
                >
                  <div className="day-number">
                    {day.isToday ? <span className="today-pill">{day.dayNum}</span> : <span>{day.dayNum}</span>}
                  </div>
                </div>
              );
            })}

            <div className="calendar-bars">
              {week.bars.map(({ booking: bkg, left, width, lane, startsHere, endsHere }) => (
                <button
                  type="button"
                  key={bkg.id}
                  className={`booking-bar ${getChipClass(bkg.source)} ${startsHere ? 'bar-start' : ''} ${endsHere ? 'bar-end' : ''}`}
                  style={{ left: `${left * 100}%`, width: `${width * 100}%`, '--lane': lane }}
                  onClick={(e) => { e.stopPropagation(); setSelectedBooking(bkg); }}
                  title={`${bkg.guestName || getSourceName(bkg.source)} · ${getSourceName(bkg.source)} · du ${bkg.checkIn} au ${bkg.checkOut}`}
                >
                  <span className="bar-avatar">
                    {bkg.source === 'blocked' ? <Lock size={11} /> : ((bkg.guestName || '').trim().charAt(0).toUpperCase() || <User size={11} />)}
                  </span>
                  <span className="bar-name">{bkg.guestName || getSourceName(bkg.source)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Booking Details Modal */}
      {selectedBooking && (
        <div className="modal-overlay" onClick={() => setSelectedBooking(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`booking-chip ${getChipClass(selectedBooking.source)}`} style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                  {getSourceName(selectedBooking.source)}
                </span>
                <h3 style={{ fontSize: '1.15rem' }}>Détails de la réservation</h3>
              </div>
              <button 
                type="button" 
                className="btn btn-secondary btn-icon" 
                onClick={() => setSelectedBooking(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="text-xs text-muted font-semibold">VOYAGEUR</label>
                  <p className="font-bold text-base">{selectedBooking.guestName || "Non spécifié"}</p>
                </div>
                <div>
                  <label className="text-xs text-muted font-semibold">SOURCE</label>
                  <p className="font-bold text-base">{getSourceName(selectedBooking.source)}</p>
                </div>
                <div>
                  <label className="text-xs text-muted font-semibold">ARRIVÉE (CHECK-IN)</label>
                  <p className="font-bold text-base">{selectedBooking.checkIn}</p>
                </div>
                <div>
                  <label className="text-xs text-muted font-semibold">DÉPART (CHECK-OUT)</label>
                  <p className="font-bold text-base">{selectedBooking.checkOut}</p>
                </div>
              </div>

              {selectedBooking.notes && (
                <div style={{ background: '#F8F9FA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                  <label className="text-xs text-muted font-semibold">NOTES / INSTRUCTIONS</label>
                  <p style={{ fontSize: '0.85rem', marginTop: 4 }}>{selectedBooking.notes}</p>
                </div>
              )}

              {selectedBooking.source !== 'blocked' && (
                <div style={{
                  background: '#F0F9FF',
                  border: '1px solid #BAE6FD',
                  borderRadius: 10,
                  padding: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}>
                  <div>
                    <h4 style={{ fontSize: '0.9rem', color: '#0369A1', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Shield size={16} /> Fiche de Police Marocaine
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: '#0C4A6E', marginTop: 2 }}>
                      Générez le code d'accès pour que ce voyageur remplisse sa fiche obligatoire.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-rausch btn-sm"
                    onClick={() => {
                      onGeneratePoliceCode(selectedBooking);
                      setSelectedBooking(null);
                    }}
                  >
                    Générer Code
                  </button>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button 
                type="button"
                className="btn btn-outline btn-sm"
                style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
                onClick={() => {
                  if (confirm("Supprimer cette réservation / période ?")) {
                    onDeleteBooking(selectedBooking.id);
                    setSelectedBooking(null);
                  }
                }}
              >
                <Trash2 size={14} />
                Supprimer
              </button>
              <button 
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedBooking(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
