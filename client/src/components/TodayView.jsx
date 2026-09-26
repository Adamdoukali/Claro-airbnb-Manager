import React, { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, Repeat, BedDouble, CalendarDays, AlertTriangle, Send, MessageCircle, FileText, KeyRound, RefreshCw, ClipboardList, Check } from 'lucide-react';
import { api } from '../api';

const SOURCE_LABEL = { airbnb: 'Airbnb', booking: 'Booking', vrbo: 'VRBO', direct: 'Direct' };

function RegBadge({ reg }) {
  if (!reg) return <span className="tv-badge tv-badge-gray">Pas de code</span>;
  if (reg.status === 'completed') return <span className="tv-badge tv-badge-green"><Check size={11} /> Enregistré</span>;
  if (reg.messageSentAt) return <span className="tv-badge tv-badge-amber">Lien envoyé · en attente</span>;
  return <span className="tv-badge tv-badge-red">Formulaire manquant</span>;
}

function Row({ r, extra, onOpenPortal }) {
  return (
    <div className="tv-row">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="tv-row-title">
          <span className={`legend-dot dot-${r.source === 'booking' ? 'booking' : r.source === 'airbnb' ? 'airbnb' : 'direct'}`} />
          <strong>{r.guestName}</strong>
          <span className="text-xs text-muted">· {r.propertyName}</span>
          {r.guestsCount ? <span className="text-xs text-muted">· {r.guestsCount} pers.</span> : null}
        </div>
        <div className="text-xs text-muted">
          {r.checkIn} → {r.checkOut} · {SOURCE_LABEL[r.source] || r.source}{r.guestPhone ? ` · ${r.guestPhone}` : ''}
          {extra}
        </div>
      </div>
      <RegBadge reg={r.registration} />
      {r.registration && (
        <button type="button" className="btn btn-secondary btn-sm" title="Ouvrir la fiche avec ce code" onClick={() => onOpenPortal(r.registration.accessCode)}>
          <KeyRound size={13} /> {r.registration.accessCode}
        </button>
      )}
    </div>
  );
}

function Card({ icon, title, count, accent, children, empty }) {
  return (
    <div className="tv-card">
      <div className="tv-card-head">
        <div className="tv-card-icon" style={{ background: `${accent}14`, color: accent }}>{icon}</div>
        <div className="tv-card-count">{count}</div>
        <div className="tv-card-title">{title}</div>
      </div>
      <div className="tv-card-body">
        {count === 0 ? <div className="text-xs text-muted" style={{ padding: '6px 0' }}>{empty}</div> : children}
      </div>
    </div>
  );
}

/**
 * "Aujourd'hui": the Hospitable-style daily operations view across all properties,
 * with the "À traiter" alert list when that feature is on.
 */
export default function TodayView({ features, onOpenPortalWithCode, onGoToTasks, onRefreshAll }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [date, setDate] = useState('');

  const load = useCallback(async (d) => {
    try {
      setError('');
      const res = await api(`/api/dashboard/today${d ? `?date=${d}` : ''}`);
      setData(res);
      setDate(res.date);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(date); }, 60000);
    return () => clearInterval(t);
  }, [load, date]);

  const shift = (n) => {
    const d = new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
    load(d);
  };

  const markSent = async (registrationId, channel, messageText) => {
    await api('/api/police/message/send', { method: 'POST', body: { registrationId, channel, messageText } });
  };

  const act = async (item) => {
    const b = item.booking;
    const reg = b?.registration;
    setBusy(item.kind + (b?.id || item.issueId));
    try {
      if (item.action === 'resend_hospitable' && reg) {
        await markSent(reg.id, 'hospitable');
        alert(`Message renvoyé à ${b.guestName} via Hospitable.`);
      } else if (item.action === 'send_whatsapp' && reg) {
        const phone = (b.guestPhone || '').replace(/[^\d]/g, '');
        if (!phone) { alert("Pas de numéro de téléphone pour ce voyageur. Ouvrez la fiche et copiez le lien."); return; }
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(reg.message || reg.portalUrl)}`, '_blank', 'noopener');
        await markSent(reg.id, 'whatsapp', reg.message);
      } else if (item.action === 'create_code' && b) {
        const created = await api('/api/police/codes', { method: 'POST', body: { propertyId: b.propertyId, bookingId: b.id, guestName: b.guestName, guestPhone: b.guestPhone } });
        alert(`Nouveau code pour ${b.guestName} : ${created.accessCode}\n${created.portalUrl}`);
      } else if (item.action === 'open_pdf' && reg) {
        window.open(`/api/police/pdf/${reg.id}`, '_blank', 'noopener');
      }
      await load(date);
      if (onRefreshAll) onRefreshAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy('');
    }
  };

  if (error) return <div className="alert-error" role="alert">{error}</div>;
  if (!data) return <div className="text-muted">Chargement…</div>;

  const isToday = data.date === new Date().toISOString().slice(0, 10);
  const label = new Date(data.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div>
      <div className="calendar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, textTransform: 'capitalize' }}>{isToday ? "Aujourd'hui" : label}</h2>
          {isToday && <span className="text-sm text-muted" style={{ textTransform: 'capitalize' }}>{label}</span>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => shift(-1)}>‹</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => load()}>Aujourd'hui</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => shift(1)}>›</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {features?.tasks && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onGoToTasks}>
              <ClipboardList size={14} /> Tâches du jour {data.openTasks ? <span className="badge-count">{data.openTasks}</span> : null}
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => load(date)}><RefreshCw size={14} /> Actualiser</button>
        </div>
      </div>

      {data.attention && (
        <div className={`tv-attention ${data.attention.count ? '' : 'tv-attention-ok'}`}>
          <div className="tv-attention-head">
            <AlertTriangle size={18} />
            <strong>À traiter</strong>
            <span className="badge-count" style={{ background: data.attention.count ? '#DC2626' : '#16A34A', color: '#FFF' }}>{data.attention.count}</span>
            {!data.attention.count && <span className="text-sm text-muted">Rien à signaler : tous les voyageurs qui arrivent sont enregistrés.</span>}
          </div>
          {data.attention.items.map((item, i) => (
            <div key={i} className={`tv-attention-item sev-${item.severity}`}>
              <span className="tv-sev-dot" />
              <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
              {item.action === 'resend_hospitable' && (
                <button type="button" className="btn btn-rausch btn-sm" disabled={busy !== ''} onClick={() => act(item)}><Send size={13} /> Renvoyer le lien</button>
              )}
              {item.action === 'send_whatsapp' && features?.whatsapp && (
                <button type="button" className="btn btn-secondary btn-sm" style={{ color: '#128C7E' }} disabled={busy !== ''} onClick={() => act(item)}><MessageCircle size={13} /> WhatsApp</button>
              )}
              {item.action === 'send_whatsapp' && !features?.whatsapp && item.booking?.registration && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenPortalWithCode(item.booking.registration.accessCode)}><KeyRound size={13} /> Ouvrir la fiche</button>
              )}
              {item.action === 'create_code' && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== ''} onClick={() => act(item)}><KeyRound size={13} /> Nouveau code</button>
              )}
              {item.action === 'open_pdf' && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(item)}><FileText size={13} /> Voir le PDF</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="tv-grid">
        <Card icon={<LogIn size={18} />} title="Arrivées" count={data.arrivals.length} accent="#0369A1" empty="Aucune arrivée ce jour.">
          {data.arrivals.map(r => <Row key={r.id} r={r} onOpenPortal={onOpenPortalWithCode} />)}
        </Card>
        <Card icon={<LogOut size={18} />} title="Départs" count={data.departures.length} accent="#B45309" empty="Aucun départ ce jour.">
          {data.departures.map(r => <Row key={r.id} r={r} onOpenPortal={onOpenPortalWithCode} />)}
        </Card>
        <Card icon={<Repeat size={18} />} title="Rotations le même jour" count={data.turnovers.length} accent="#DC2626" empty="Aucune rotation : le ménage a toute la journée.">
          {data.turnovers.map(r => (
            <Row key={r.id} r={r} onOpenPortal={onOpenPortalWithCode}
              extra={<span style={{ color: '#DC2626', fontWeight: 600 }}> · puis {r.nextGuest.guestName} arrive le même jour</span>} />
          ))}
        </Card>
        <Card icon={<BedDouble size={18} />} title="Voyageurs sur place" count={data.inStay.length} accent="#15803D" empty="Aucun voyageur en séjour.">
          {data.inStay.map(r => <Row key={r.id} r={r} onOpenPortal={onOpenPortalWithCode} />)}
        </Card>
      </div>

      <div className="tv-card" style={{ marginTop: 16 }}>
        <div className="tv-card-head">
          <div className="tv-card-icon" style={{ background: '#EEF2FF', color: '#4338CA' }}><CalendarDays size={18} /></div>
          <div className="tv-card-count">{data.upcoming.length}</div>
          <div className="tv-card-title">Arrivées des 7 prochains jours (tous logements)</div>
        </div>
        <div className="tv-card-body">
          {data.upcoming.length === 0
            ? <div className="text-xs text-muted" style={{ padding: '6px 0' }}>Aucune arrivée prévue dans la semaine.</div>
            : data.upcoming.map(r => <Row key={r.id} r={r} onOpenPortal={onOpenPortalWithCode} />)}
        </div>
      </div>
    </div>
  );
}
