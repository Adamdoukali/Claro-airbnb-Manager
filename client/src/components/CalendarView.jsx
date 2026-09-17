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
  onGeneratePoliceCode,
  onDeleteBooking
}) {
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

  // Generate calendar days
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  
  // Starting day index (Monday as 0)
  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday

  const daysInMonth = lastDayOfMonth.getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const calendarDays = [];

  // Previous month trailing days
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const dateStr = new Date(year, month - 1, dayNum).toISOString().split('T')[0];
    calendarDays.push({
      dateStr,
      dayNum,
      isCurrentMonth: false
    });
  }

  // Current month days
  const todayStr = new Date().toISOString().split('T')[0];
  for (let i = 1; i <= daysInMonth; i++) {
    // Format YYYY-MM-DD
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    calendarDays.push({
      dateStr,
      dayNum: i,
      isCurrentMonth: true,
      isToday: dateStr === todayStr
    });
  }

  // Next month leading days to complete grid (multiples of 7)
  const remaining = (7 - (calendarDays.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const dateStr = new Date(year, month + 1, i).toISOString().split('T')[0];
    calendarDays.push({
      dateStr,
      dayNum: i,
      isCurrentMonth: false
    });
  }

  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];

  // Helper to find bookings for a date
  const getBookingsForDate = (dateStr) => {
    return bookings.filter(b => {
      return dateStr >= b.checkIn && dateStr < b.checkOut;
    });
  };

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
      case 'airbnb': return 'Airbnb';
      case 'booking': return 'Booking.com';
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
              <span>Airbnb</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-booking"></span>
              <span>Booking.com</span>
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

          {/* Sync Button */}
          <button 
            type="button" 
            onClick={onSyncClick} 
            className="btn btn-secondary btn-sm"
            disabled={isSyncing}
          >
            <RefreshCw size={14} className={isSyncing ? "spinning" : ""} />
            <span>{isSyncing ? "Synchronisation..." : "Actualiser iCal"}</span>
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

      {/* Direct link notice banner */}
      <div style={{
        background: '#FFF8F6',
        border: '1px solid #FFE0E5',
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
            background: '#81172E',
            color: '#FFF',
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            AIRBNB LINK
          </div>
          <span style={{ fontSize: '0.9rem', color: '#484848' }}>
            Ce calendrier unifié bloque automatiquement les dates entre <strong>Airbnb</strong> et <strong>Booking.com</strong>.
          </span>
        </div>
        {property?.airbnbUrl && (
          <a
            href={property.airbnbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm"
            style={{ borderColor: '#81172E', color: '#81172E' }}
          >

            <span>Ouvrir mon calendrier Airbnb</span>
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {/* Calendar Grid */}
      <div className="calendar-grid">
        {/* Weekday headers */}
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
          <div key={day} className="calendar-weekday">{day}</div>
        ))}

        {/* Days cells */}
        {calendarDays.map((day, idx) => {
          const dayBookings = getBookingsForDate(day.dateStr);

          return (
            <div 
              key={idx} 
              className={`calendar-day-cell ${!day.isCurrentMonth ? 'other-month' : ''} ${day.isToday ? 'today' : ''}`}
              onClick={() => {
                if (dayBookings.length === 0) {
                  onAddBookingClick(day.dateStr);
                }
              }}
            >
              <div className="day-number">
                {day.isToday ? (
                  <span className="today-pill">{day.dayNum}</span>
                ) : (
                  <span>{day.dayNum}</span>
                )}
              </div>

              {/* Booking chips */}
              {dayBookings.map((bkg) => (
                <div 
                  key={bkg.id}
                  className={`booking-chip ${getChipClass(bkg.source)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBooking(bkg);
                  }}
                  title={`${bkg.guestName} (${getSourceName(bkg.source)}) - Du ${bkg.checkIn} au ${bkg.checkOut}`}
                >
                  {bkg.source === 'blocked' ? <Lock size={10} /> : <User size={10} />}
                  <span>{bkg.guestName || getSourceName(bkg.source)}</span>
                </div>
              ))}
            </div>
          );
        })}
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
