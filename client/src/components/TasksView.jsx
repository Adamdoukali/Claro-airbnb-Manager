import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Check, Copy, Trash2, Plus, Zap, User, Phone, RotateCcw, Link as LinkIcon } from 'lucide-react';
import { api } from '../api';

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Cleaning & turnover tasks. One task is created automatically per check-out; the host assigns a
 * cleaner and shares a phone-friendly link (no login) with the checklist and a "Terminé" button.
 */
export default function TasksView({ properties = [], role = 'admin' }) {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('todo');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [editing, setEditing] = useState(null); // task id whose assignee is being edited
  const [draft, setDraft] = useState({});
  const [creating, setCreating] = useState(false);
  const [newTask, setNewTask] = useState({ propertyId: '', dueDate: todayIso(), title: 'Ménage', urgent: false });

  const canManage = role !== 'cleaner';

  const load = useCallback(async () => {
    try {
      setError('');
      setTasks(await api('/api/tasks'));
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = tasks
    .filter(t => (filter === 'all' ? true : filter === 'todo' ? t.status !== 'done' : t.status === 'done'))
    .filter(t => !propertyFilter || t.propertyId === propertyFilter);

  const update = async (id, body) => {
    try {
      const updated = await api(`/api/tasks/${id}`, { method: 'PUT', body });
      setTasks(prev => prev.map(t => (t.id === id ? updated : t)));
    } catch (err) {
      alert(err.message);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Supprimer la tâche « ${t.title} » ?`)) return;
    try {
      await api(`/api/tasks/${t.id}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(x => x.id !== t.id));
    } catch (err) {
      alert(err.message);
    }
  };

  const cleanerLink = (t) => `${window.location.origin}/?taskToken=${t.token}`;
  const copyLink = (t) => {
    navigator.clipboard.writeText(cleanerLink(t));
    setCopied(t.id);
    setTimeout(() => setCopied(''), 1800);
  };

  const startEdit = (t) => {
    setEditing(t.id);
    setDraft({ assigneeName: t.assigneeName || '', assigneePhone: t.assigneePhone || '', assigneeEmail: t.assigneeEmail || '', notes: t.notes || '' });
  };
  const saveEdit = async (t) => {
    await update(t.id, draft);
    setEditing(null);
  };

  const create = async (e) => {
    e.preventDefault();
    try {
      const created = await api('/api/tasks', { method: 'POST', body: newTask });
      setTasks(prev => [created, ...prev]);
      setCreating(false);
      setNewTask({ propertyId: '', dueDate: todayIso(), title: 'Ménage', urgent: false });
    } catch (err) {
      alert(err.message);
    }
  };

  const today = todayIso();
  const late = visible.filter(t => t.status !== 'done' && t.dueDate < today).length;

  return (
    <div>
      <div className="calendar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardList size={22} /> Tâches de ménage</h2>
          <div className="tv-filter">
            {[['todo', 'À faire'], ['done', 'Faites'], ['all', 'Toutes']].map(([k, l]) => (
              <button key={k} type="button" className={`tv-filter-btn ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          {properties.length > 1 && (
            <select className="form-input" style={{ width: 'auto', padding: '6px 10px', fontSize: '0.85rem' }} value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)}>
              <option value="">Tous les logements</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {late > 0 && <span className="badge-count">{late} en retard</span>}
        </div>
        {canManage && (
          <button type="button" className="btn btn-rausch btn-sm" onClick={() => setCreating(v => !v)}><Plus size={14} /> Nouvelle tâche</button>
        )}
      </div>

      {error && <div className="alert-error" role="alert">{error}</div>}

      {creating && (
        <form className="card" style={{ padding: 16, marginBottom: 16 }} onSubmit={create}>
          <div className="form-grid-2">
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label">Logement</label>
              <select className="form-input" required value={newTask.propertyId} onChange={e => setNewTask(p => ({ ...p, propertyId: e.target.value }))}>
                <option value="">Choisir…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label">Date</label>
              <input type="date" className="form-input" required value={newTask.dueDate} onChange={e => setNewTask(p => ({ ...p, dueDate: e.target.value }))} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label">Titre</label>
            <input type="text" className="form-input" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Ménage complet, Réparation chauffe-eau…" />
          </div>
          <label className="radio-row" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={newTask.urgent} onChange={e => setNewTask(p => ({ ...p, urgent: e.target.checked }))} /> <span>Urgent</span>
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Annuler</button>
            <button type="submit" className="btn btn-rausch btn-sm">Créer</button>
          </div>
        </form>
      )}

      {visible.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center' }} >
          <div className="text-muted">Aucune tâche {filter === 'todo' ? 'à faire' : ''}. Les tâches de ménage sont créées automatiquement pour chaque départ à venir.</div>
        </div>
      ) : (
        <div className="task-list">
          {visible.map(t => {
            const done = t.checklist.filter(c => c.done).length;
            const isLate = t.status !== 'done' && t.dueDate < today;
            return (
              <div key={t.id} className={`task-card ${t.status === 'done' ? 'task-done' : ''} ${t.urgent ? 'task-urgent' : ''}`}>
                <div className="task-main">
                  <div className="task-date">
                    <div className="task-date-day">{t.dueDate.slice(8, 10)}</div>
                    <div className="task-date-month">{new Date(t.dueDate).toLocaleDateString('fr-FR', { month: 'short' })}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="task-title">
                      {t.urgent && <span className="tv-badge tv-badge-red"><Zap size={11} /> Rotation le jour même</span>}
                      {isLate && <span className="tv-badge tv-badge-amber">En retard</span>}
                      {t.status === 'done' && <span className="tv-badge tv-badge-green"><Check size={11} /> Terminé</span>}
                      <strong>{t.title}</strong>
                    </div>
                    <div className="text-xs text-muted">
                      {t.propertyName}{t.propertyAddress ? ` · ${t.propertyAddress}` : ''}
                      {t.nextArrival ? ` · prochain voyageur : ${t.nextArrival.guestName} le ${t.nextArrival.checkIn}` : ''}
                    </div>
                    <div className="task-progress"><div className="task-progress-bar" style={{ width: `${t.checklist.length ? (done / t.checklist.length) * 100 : 0}%` }} /></div>
                    <div className="text-xs text-muted">{done} / {t.checklist.length} points de contrôle{t.assigneeName ? ` · ${t.assigneeName}${t.assigneePhone ? ` (${t.assigneePhone})` : ''}` : ' · non assigné'}{t.cleanerNotes ? ` · note : ${t.cleanerNotes}` : ''}</div>
                  </div>
                </div>

                {editing === t.id ? (
                  <div className="task-edit">
                    <input className="form-input" placeholder="Nom de la personne de ménage" value={draft.assigneeName} onChange={e => setDraft(d => ({ ...d, assigneeName: e.target.value }))} />
                    <input className="form-input" placeholder="Téléphone" value={draft.assigneePhone} onChange={e => setDraft(d => ({ ...d, assigneePhone: e.target.value }))} />
                    <input className="form-input" placeholder="Email du compte ménage (optionnel)" value={draft.assigneeEmail} onChange={e => setDraft(d => ({ ...d, assigneeEmail: e.target.value }))} />
                    <input className="form-input" placeholder="Consignes" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Annuler</button>
                      <button type="button" className="btn btn-rausch btn-sm" onClick={() => saveEdit(t)}>Enregistrer</button>
                    </div>
                  </div>
                ) : (
                  <div className="task-actions">
                    {canManage && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(t)} title="Assigner une personne"><User size={13} /> Assigner</button>
                    )}
                    {t.assigneePhone && (
                      <a className="btn btn-secondary btn-sm" style={{ color: '#128C7E' }} target="_blank" rel="noopener noreferrer"
                        href={`https://wa.me/${t.assigneePhone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(`Bonjour ${t.assigneeName || ''}, ménage à ${t.propertyName} le ${t.dueDate}${t.urgent ? ' (URGENT, nouveau voyageur le jour même)' : ''}. Checklist : ${cleanerLink(t)}`)}`}>
                        <Phone size={13} /> Envoyer
                      </a>
                    )}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => copyLink(t)} title="Lien de la page ménage (sans connexion)">
                      {copied === t.id ? <Check size={13} color="#008A05" /> : <LinkIcon size={13} />} {copied === t.id ? 'Copié' : 'Lien ménage'}
                    </button>
                    {t.status === 'done'
                      ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => update(t.id, { status: 'todo' })}><RotateCcw size={13} /> Rouvrir</button>
                      : <button type="button" className="btn btn-rausch btn-sm" onClick={() => update(t.id, { status: 'done', checklist: t.checklist.map(c => ({ ...c, done: true })) })}><Check size={13} /> Terminé</button>}
                    {canManage && (
                      <button type="button" className="btn btn-secondary btn-icon btn-sm" style={{ color: '#B91C1C' }} onClick={() => remove(t)} title="Supprimer"><Trash2 size={13} /></button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
