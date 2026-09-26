import React, { useEffect, useState } from 'react';
import { Check, MapPin, Home, Zap, RotateCcw, Sparkles } from 'lucide-react';
import { api } from '../api';

/** Public cleaner page opened from the task link (no login): checklist + "Terminé". */
export default function CleanerTaskPage({ token }) {
  const [task, setTask] = useState(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api(`/api/tasks/public/${encodeURIComponent(token)}`)
      .then(t => { setTask(t); setNotes(t.cleanerNotes || ''); })
      .catch(err => setError(err.message));
  }, [token]);

  const save = async (body) => {
    setSaving(true);
    try {
      const updated = await api(`/api/tasks/public/${encodeURIComponent(token)}`, { method: 'PUT', body });
      setTask(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (i) => {
    const checklist = task.checklist.map((c, idx) => (idx === i ? { ...c, done: !c.done } : c));
    setTask(t => ({ ...t, checklist }));
    save({ checklist });
  };

  const done = task?.checklist.filter(c => c.done).length || 0;

  return (
    <div className="guest-portal-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 520, marginBottom: 12 }}>
        <img src="/claro.png" alt="Claro" style={{ height: 26 }} />
        <span style={{ fontSize: '0.72rem', background: '#FDF2F4', color: '#81172E', border: '1px solid #F5D5DC', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Fiche ménage</span>
      </div>
      <div className="guest-wizard-card" style={{ maxWidth: 520 }}>
        <div className="wizard-step-body">
          {error && <div className="alert-error" role="alert">{error}</div>}
          {!task && !error && <div className="text-muted">Chargement…</div>}
          {task && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div className="feature-icon" style={{ background: '#FDF2F4', color: '#81172E' }}><Sparkles size={18} /></div>
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>{task.title}</h2>
                  <div className="text-xs text-muted">Le {new Date(task.dueDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                </div>
              </div>
              {task.urgent && (
                <div className="settings-note warn" style={{ marginTop: 10 }}><Zap size={16} /><span><strong>Urgent :</strong> un nouveau voyageur arrive le jour même{task.nextArrival ? ` (${task.nextArrival.guestName}${task.nextArrival.guestsCount ? `, ${task.nextArrival.guestsCount} pers.` : ''})` : ''}.</span></div>
              )}
              <div style={{ background: '#F8F9FA', border: '1px solid #EBEBEB', borderRadius: 12, padding: 14, margin: '12px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><Home size={15} /> {task.propertyName}</div>
                {task.propertyAddress && (
                  <a className="text-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0369A1', marginTop: 4 }} target="_blank" rel="noopener noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${task.propertyAddress} ${task.propertyCity || ''}`)}`}>
                    <MapPin size={14} /> {task.propertyAddress}
                  </a>
                )}
                {task.notes && <div className="text-sm" style={{ marginTop: 8 }}><strong>Consignes :</strong> {task.notes}</div>}
              </div>

              <div className="form-label">Points de contrôle ({done} / {task.checklist.length})</div>
              <div className="task-progress" style={{ marginBottom: 10 }}><div className="task-progress-bar" style={{ width: `${task.checklist.length ? (done / task.checklist.length) * 100 : 0}%` }} /></div>
              <div className="cleaner-checklist">
                {task.checklist.map((c, i) => (
                  <label key={i} className={`cleaner-check ${c.done ? 'on' : ''}`}>
                    <input type="checkbox" checked={c.done} onChange={() => toggle(i)} disabled={task.status === 'done'} />
                    <span className="property-pick-check"><Check size={12} /></span>
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>

              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label">Remarque pour l'hôte (optionnel)</label>
                <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => save({ notes })} placeholder="Ex: ampoule grillée dans la chambre, manque de serviettes…" />
              </div>

              {task.status === 'done' ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#166534', fontWeight: 700, marginBottom: 8 }}><Check size={16} /> Tâche terminée, merci !</div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => save({ status: 'todo' })}><RotateCcw size={13} /> Rouvrir</button>
                </div>
              ) : (
                <button type="button" className="btn btn-rausch" style={{ width: '100%', padding: 14 }} disabled={saving} onClick={() => save({ status: 'done', notes, checklist: task.checklist.map(c => ({ ...c, done: true })) })}>
                  <Check size={18} /> Ménage terminé
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
