import React, { useEffect, useState } from 'react';
import { AlertOctagon, Plus, Check, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api';

const CATEGORIES = [['damage', 'Dégât / casse'], ['noise', 'Bruit'], ['cleanliness', 'Propreté'], ['late_checkout', 'Départ tardif'], ['deposit', 'Caution'], ['complaint', 'Réclamation'], ['other', 'Autre']];
const SEV = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };

/** Guest issues log attached to a booking (shown inside the booking details modal). */
export default function IssuesPanel({ bookingId, propertyId }) {
  const [issues, setIssues] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'other', severity: 'medium', amount: '', description: '' });
  const [error, setError] = useState('');

  const load = () => api(`/api/issues?bookingId=${encodeURIComponent(bookingId)}`).then(setIssues).catch(err => setError(err.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bookingId]);

  const create = async (e) => {
    e.preventDefault();
    try {
      const created = await api('/api/issues', { method: 'POST', body: { ...form, bookingId, propertyId } });
      setIssues(prev => [created, ...prev]);
      setAdding(false);
      setForm({ title: '', category: 'other', severity: 'medium', amount: '', description: '' });
    } catch (err) {
      setError(err.message);
    }
  };
  const setStatus = async (i, status) => {
    const resolution = status === 'resolved' ? (window.prompt('Résolution (optionnel) :', i.resolution || '') ?? '') : undefined;
    const updated = await api(`/api/issues/${i.id}`, { method: 'PUT', body: { status, resolution } });
    setIssues(prev => prev.map(x => (x.id === i.id ? updated : x)));
  };
  const remove = async (i) => {
    if (!window.confirm('Supprimer cet incident ?')) return;
    await api(`/api/issues/${i.id}`, { method: 'DELETE' });
    setIssues(prev => prev.filter(x => x.id !== i.id));
  };

  const open = issues.filter(i => i.status === 'open').length;

  return (
    <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: 14, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h4 style={{ fontSize: '0.9rem', color: '#9A3412', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
          <AlertOctagon size={16} /> Incidents {open ? <span className="badge-count">{open} ouvert(s)</span> : null}
        </h4>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(v => !v)}><Plus size={13} /> Signaler</button>
      </div>
      {error && <div className="text-xs" style={{ color: '#B91C1C', marginTop: 6 }}>{error}</div>}

      {adding && (
        <form onSubmit={create} style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <input className="form-input" required placeholder="Titre (ex: verre cassé, bruit à 2h…)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <select className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="form-input" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
              {Object.entries(SEV).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input className="form-input" type="number" min="0" placeholder="Montant (MAD)" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <textarea className="form-input" rows={2} placeholder="Détails, photos envoyées, échanges avec le voyageur…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>Annuler</button>
            <button type="submit" className="btn btn-rausch btn-sm">Enregistrer</button>
          </div>
        </form>
      )}

      {issues.length === 0 && !adding && <div className="text-xs text-muted" style={{ marginTop: 8 }}>Aucun incident pour cette réservation.</div>}
      {issues.map(i => (
        <div key={i.id} className={`issue-row sev-${i.severity} ${i.status === 'resolved' ? 'issue-resolved' : ''}`}>
          <span className="tv-sev-dot" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div><strong>{i.title}</strong> <span className="text-xs text-muted">· {CATEGORIES.find(c => c[0] === i.category)?.[1]} · {SEV[i.severity]}{i.amount ? ` · ${i.amount} MAD` : ''}</span></div>
            {i.description && <div className="text-xs" style={{ color: '#57534E' }}>{i.description}</div>}
            <div className="text-xs text-muted">{new Date(i.createdAt).toLocaleString('fr-FR')}{i.status === 'resolved' ? ` · résolu${i.resolution ? ` : ${i.resolution}` : ''}` : ''}</div>
          </div>
          {i.status === 'open'
            ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatus(i, 'resolved')}><Check size={13} /> Résolu</button>
            : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatus(i, 'open')}><RotateCcw size={13} /></button>}
          <button type="button" className="btn btn-secondary btn-icon btn-sm" style={{ color: '#B91C1C' }} onClick={() => remove(i)}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}
