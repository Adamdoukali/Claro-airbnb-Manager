import React, { useState } from 'react';
import { Calendar, Copy, Check, ExternalLink, RefreshCw, AlertCircle, ArrowRight } from 'lucide-react';

export default function SyncModal({ property, onClose, onSaveProperty, onTriggerSync, isSyncing, syncLogs }) {
  const [airbnbIcal, setAirbnbIcal] = useState(property?.airbnbIcalUrl || '');
  const [bookingIcal, setBookingIcal] = useState(property?.bookingIcalUrl || '');
  const [airbnbUrl, setAirbnbUrl] = useState(property?.airbnbUrl || '');
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Export iCal URL (same origin as the app, protected by the property's private token)
  const exportUrl = `${window.location.origin}/api/calendar/export/${property?.id}.ics?token=${property?.icalToken || ''}`;

  const copyExportUrl = () => {
    navigator.clipboard.writeText(exportUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    await onSaveProperty({
      ...property,
      airbnbIcalUrl: airbnbIcal,
      bookingIcalUrl: bookingIcal,
      airbnbUrl: airbnbUrl
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: '#EBF3FF',
              color: '#003580',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Calendar size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem' }}>Synchronisation Airbnb & Booking.com</h3>
              <p className="text-xs text-muted">Intégration bidirectionnelle des calendriers (Flux iCal RFC 5545)</p>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Step 1: Export Feed from This App */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0F172A' }}>
              <span>1. Votre flux iCal unifié (À coller dans Airbnb & Booking)</span>
            </label>
            <p className="text-xs text-muted" style={{ marginBottom: 8 }}>
              Ce lien bloque automatiquement vos dates sur Airbnb et Booking.com dès qu'une réservation est ajoutée ou bloquée.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input 
                type="text" 
                readOnly 
                value={exportUrl} 
                className="form-input" 
                style={{ background: '#FFF', fontSize: '0.82rem', fontFamily: 'monospace' }}
              />
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                onClick={copyExportUrl}
              >
                {copied ? <Check size={14} color="#008A05" /> : <Copy size={14} />}
                <span>{copied ? "Copié !" : "Copier"}</span>
              </button>
            </div>
          </div>

          {/* Step 2: Import Airbnb & Booking feeds */}
          <div style={{ marginBottom: 20 }}>
            <label className="form-label" style={{ color: '#81172E', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>2. Flux d'exportation Airbnb (.ics)</span>
            </label>

            <p className="text-xs text-muted" style={{ marginBottom: 6 }}>
              Dans Airbnb : Annonce &gt; Tarifs et disponibilités &gt; Synchronisation du calendrier &gt; Exporter le calendrier.
            </p>
            <input 
              type="url" 
              className="form-input" 
              placeholder="https://www.airbnb.com/calendar/ical/12345678.ics?s=..."
              value={airbnbIcal}
              onChange={(e) => setAirbnbIcal(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="form-label" style={{ color: '#003580', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>3. Flux d'exportation Booking.com (.ics)</span>
            </label>
            <p className="text-xs text-muted" style={{ marginBottom: 6 }}>
              Dans l'Extranet Booking : Tarifs et disponibilités &gt; Synchroniser les calendriers &gt; Exporter.
            </p>
            <input 
              type="url" 
              className="form-input" 
              placeholder="https://admin.booking.com/hotel/hoteladmin/ical.html?t=..."
              value={bookingIcal}
              onChange={(e) => setBookingIcal(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>4. Lien direct vers votre annonce / calendrier Airbnb</span>
            </label>
            <p className="text-xs text-muted" style={{ marginBottom: 6 }}>
              Ce lien permet le bouton « Basculer vers Airbnb » dans la barre du haut pour ouvrir votre page en 1 clic.
            </p>
            <input 
              type="url" 
              className="form-input" 
              placeholder="https://www.airbnb.com/rooms/12345678 ou https://www.airbnb.com/hosting/calendar"
              value={airbnbUrl}
              onChange={(e) => setAirbnbUrl(e.target.value)}
            />
          </div>

          {/* Sync status & Logs */}
          <div style={{ background: '#F8F9FA', borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="text-xs text-muted font-semibold">DERNIÈRES SYNCHRONISATIONS</span>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                onClick={onTriggerSync}
                disabled={isSyncing}
              >
                <RefreshCw size={12} className={isSyncing ? "spinning" : ""} />
                <span>{isSyncing ? "En cours..." : "Synchroniser maintenant"}</span>
              </button>
            </div>
            
            {syncLogs && syncLogs.length > 0 ? (
              <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: '0.78rem' }}>
                {syncLogs.slice(0, 3).map((log, idx) => (
                  <div key={idx} style={{ padding: '4px 0', borderBottom: '1px solid #EBEBEB', color: '#484848' }}>
                    <span className="text-muted">{new Date(log.timestamp).toLocaleTimeString('fr-FR')} : </span>
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">Aucune synchronisation effectuée pour le moment.</p>
            )}
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          {saveSuccess ? (
            <span style={{ color: '#008A05', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check size={16} /> Enregistré avec succès
            </span>
          ) : <div />}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Fermer</button>
            <button type="button" className="btn btn-rausch" onClick={handleSave}>Enregistrer les URLs</button>
          </div>
        </div>
      </div>
    </div>
  );
}
