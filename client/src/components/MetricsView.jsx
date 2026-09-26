import React, { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, BedDouble, Coins } from 'lucide-react';
import { api } from '../api';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const fmt = n => new Intl.NumberFormat('fr-MA').format(Math.round(n));

/** Occupancy, nights and revenue per property and per month (revenue only for priced bookings). */
export default function MetricsView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/dashboard/metrics?year=${year}`).then(setData).catch(err => setError(err.message));
  }, [year]);

  if (error) return <div className="alert-error" role="alert">{error}</div>;
  if (!data) return <div className="text-muted">Chargement…</div>;

  const totals = data.properties.reduce((acc, p) => ({
    nights: acc.nights + p.totalNights, bookings: acc.bookings + p.bookings, revenue: acc.revenue + p.revenue, priced: acc.priced + p.pricedBookings
  }), { nights: 0, bookings: 0, revenue: 0, priced: 0 });
  const avgOcc = data.properties.length ? Math.round(data.properties.reduce((s, p) => s + p.occupancy, 0) / data.properties.length) : 0;
  const monthOcc = data.months.map((m, i) => {
    const vals = data.properties.map(p => p.monthly[i].occupancy);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
  });

  return (
    <div>
      <div className="calendar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><BarChart3 size={22} /> Statistiques {year}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setYear(y => y - 1)}>‹</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setYear(new Date().getFullYear())}>Cette année</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setYear(y => y + 1)}>›</button>
          </div>
        </div>
      </div>

      <div className="police-stats-grid">
        <div className="stat-card"><div className="feature-icon" style={{ background: '#EEF2FF', color: '#4338CA' }}><TrendingUp size={18} /></div><div><div className="tv-card-count">{avgOcc}%</div><div className="text-xs text-muted">Taux d'occupation moyen</div></div></div>
        <div className="stat-card"><div className="feature-icon" style={{ background: '#F0FDF4', color: '#15803D' }}><BedDouble size={18} /></div><div><div className="tv-card-count">{fmt(totals.nights)}</div><div className="text-xs text-muted">Nuits réservées · {totals.bookings} réservations</div></div></div>
        <div className="stat-card"><div className="feature-icon" style={{ background: '#FFF7ED', color: '#C2410C' }}><Coins size={18} /></div><div><div className="tv-card-count">{fmt(totals.revenue)} {data.currency}</div><div className="text-xs text-muted">Revenu des réservations avec prix ({totals.priced} sur {totals.bookings})</div></div></div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="form-label">Occupation par mois (moyenne des logements)</div>
        <div className="metrics-bars">
          {monthOcc.map((v, i) => (
            <div key={i} className="metrics-bar-col" title={`${MONTHS[i]} : ${v}%`}>
              <div className="metrics-bar-value">{v}%</div>
              <div className="metrics-bar"><div className="metrics-bar-fill" style={{ height: `${v}%` }} /></div>
              <div className="metrics-bar-label">{MONTHS[i]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="metrics-table">
          <thead>
            <tr>
              <th>Logement</th>
              {MONTHS.map(m => <th key={m}>{m}</th>)}
              <th>Année</th>
              <th>Nuits</th>
              <th>Revenu</th>
            </tr>
          </thead>
          <tbody>
            {data.properties.map(p => (
              <tr key={p.propertyId}>
                <td><strong>{p.name}</strong><div className="text-xs text-muted">{p.city}</div></td>
                {p.monthly.map(m => (
                  <td key={m.month} className="metrics-cell" style={{ background: `rgba(129, 23, 46, ${Math.min(0.85, m.occupancy / 120)})`, color: m.occupancy > 55 ? '#FFF' : '#222' }} title={`${m.nights} nuits · ${m.bookings} arrivée(s)${m.revenue ? ` · ${fmt(m.revenue)} ${data.currency}` : ''}`}>
                    {m.occupancy}%
                  </td>
                ))}
                <td><strong>{p.occupancy}%</strong></td>
                <td>{fmt(p.totalNights)}</td>
                <td>{p.revenue ? `${fmt(p.revenue)} ${data.currency}` : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted" style={{ marginTop: 10 }}>
        Le revenu n'est calculé que pour les réservations qui ont un prix (réservations directes saisies avec un montant). Les réservations importées d'Hospitable n'incluent pas encore le montant.
      </p>
    </div>
  );
}
