import React, { useEffect, useMemo, useState } from 'react';
import {
  SlidersHorizontal, MessageSquare, BellRing, RefreshCw, Languages, Home, Check,
  AlertTriangle, Eye, Play, Clock, ShieldCheck, Lock, Car, FlaskConical, Users, MessageSquareText, RotateCcw
} from 'lucide-react';
import { api } from '../api';

const FEATURE_LIST = [
  { key: 'todayView', title: "Vue « Aujourd'hui »", description: "Tableau de bord quotidien façon Hospitable : arrivées, départs, rotations le même jour, voyageurs sur place et 7 prochains jours, tous logements confondus." },
  { key: 'attention', title: 'Alertes « À traiter »', description: "Dans la vue Aujourd'hui : arrivées sous 48 h sans enregistrement, pièces d'identité saisies à la main, codes expirés, réservations sans messagerie. Avec renvoi du lien en 1 clic." },
  { key: 'tasks', title: 'Ménage & tâches', description: 'Une tâche de ménage créée automatiquement pour chaque départ (urgente si rotation le jour même), assignable à une personne, avec une page checklist sans connexion pour le personnel.' },
  { key: 'issues', title: 'Incidents voyageurs', description: 'Journal des incidents par réservation (casse, bruit, caution, réclamation) depuis la fiche de la réservation, avec montant et résolution.' },
  { key: 'whatsapp', title: 'Envoi WhatsApp rapide', description: "Dans les alertes : bouton WhatsApp pré-rempli pour les réservations directes qui n'ont pas de messagerie Hospitable." },
  { key: 'batchExport', title: 'Export groupé pour les autorités', description: 'Dans les fiches : télécharger en un zip tous les bulletins complétés pour une période (par logement ou tous).' },
  { key: 'multiUser', title: 'Comptes multiples & rôles', description: 'Créer des comptes assistant (sans paramètres) et ménage (tâches uniquement). La gestion des comptes apparaît ci-dessous une fois activée et enregistrée.' },
  { key: 'metrics', title: 'Statistiques', description: "Taux d'occupation, nuits et revenus par logement et par mois." }
];

const DEFAULT_AUTOMATION = {
  autoMessageEnabled: false,
  autoMessagePropertyIds: [],
  autoMessageTiming: 'immediate',
  autoMessageDaysBefore: 3,
  autoMessageIncludeExisting: false,
  autoMessageActivatedAt: null,
  reminderEnabled: false,
  reminderDaysBefore: 1,
  autoSyncEnabled: false,
  lastRunAt: null,
  lastRunReport: null
};

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

function FeatureRow({ icon, title, description, checked, onChange, disabled, children, accent = '#4F46E5', badge }) {
  return (
    <div className={`feature-row ${checked ? 'feature-on' : ''}`}>
      <div className="feature-head">
        <div className="feature-icon" style={{ background: `${accent}14`, color: accent }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="feature-title">
            {title}
            {badge && <span className="feature-badge">{badge}</span>}
          </div>
          <div className="text-xs text-muted">{description}</div>
        </div>
        <Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} />
      </div>
      {children && <div className="feature-body">{children}</div>}
    </div>
  );
}

/**
 * Global "Paramètres" panel: feature switches for every automation, the list of houses allowed
 * to message guests automatically, a dry-run preview and the scheduler status.
 */
export default function SettingsModal({ properties = [], onClose }) {
  const [automation, setAutomation] = useState(DEFAULT_AUTOMATION);
  const [offer, setOffer] = useState({ enabled: true, title: '', agencyName: '', description: '', mapsUrl: '', phone: '', whatsapp: '' });
  const [features, setFeatures] = useState({});
  // Editable guest message templates
  const [templates, setTemplates] = useState({ fr: '', en: '', reminderFr: '', reminderEn: '' });
  const [tplDefaults, setTplDefaults] = useState(null);
  const [placeholders, setPlaceholders] = useState([]);
  const [tplLang, setTplLang] = useState('fr');
  const [tplKind, setTplKind] = useState('checkin'); // 'checkin' | 'reminder'
  const [tplPreview, setTplPreview] = useState('');
  const [tplOpen, setTplOpen] = useState(false);
  const tplRef = React.useRef(null);
  const tplKey = tplKind === 'reminder' ? (tplLang === 'en' ? 'reminderEn' : 'reminderFr') : tplLang;
  const tplValue = templates[tplKey] || '';
  const tplIsDefault = !tplValue;

  const loadTemplateDefaults = () => api('/api/settings/message-defaults').then(d => { setTplDefaults(d.defaults); setPlaceholders(d.placeholders); }).catch(() => {});
  const insertPlaceholder = (ph) => {
    const el = tplRef.current;
    const base = tplValue || tplDefaults?.[tplKey] || '';
    if (!el) { setTemplates(t => ({ ...t, [tplKey]: base + ph })); return; }
    const start = el.selectionStart ?? base.length, end = el.selectionEnd ?? base.length;
    const next = base.slice(0, start) + ph + base.slice(end);
    setTemplates(t => ({ ...t, [tplKey]: next }));
    setTimeout(() => { el.focus(); el.setSelectionRange(start + ph.length, start + ph.length); }, 0);
  };
  const previewTemplate = async () => {
    try {
      const d = await api('/api/settings/message-preview', { method: 'POST', body: { template: tplValue, language: tplLang, kind: tplKind } });
      setTplPreview(d.message);
    } catch (err) { setError(err.message); }
  };
  const [users, setUsers] = useState(null);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'assistant' });
  const [userError, setUserError] = useState('');

  const loadUsers = () => api('/api/users').then(d => setUsers(d.users)).catch(() => setUsers(null));
  const addUser = async (e) => {
    e.preventDefault();
    setUserError('');
    try {
      await api('/api/users', { method: 'POST', body: newUser });
      setNewUser({ email: '', password: '', role: 'assistant' });
      await loadUsers();
    } catch (err) {
      setUserError(err.message);
    }
  };
  const removeUser = async (u) => {
    if (!window.confirm(`Supprimer le compte ${u.email} ?`)) return;
    try { await api(`/api/users/${u.id}`, { method: 'DELETE' }); await loadUsers(); } catch (err) { setUserError(err.message); }
  };
  const resetUserPassword = async (u) => {
    const password = window.prompt(`Nouveau mot de passe pour ${u.email} (10 caractères min.) :`);
    if (!password) return;
    try { await api(`/api/users/${u.id}/password`, { method: 'PUT', body: { password } }); alert('Mot de passe mis à jour.'); } catch (err) { setUserError(err.message); }
  };
  const [defaultLanguage, setDefaultLanguage] = useState('fr');
  const [hospitableConnected, setHospitableConnected] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    Promise.all([api('/api/settings'), api('/api/automation/status').catch(() => null)])
      .then(([s, st]) => {
        setAutomation({ ...DEFAULT_AUTOMATION, ...(s.automation || {}) });
        if (s.guestOffer) setOffer(prev => ({ ...prev, ...s.guestOffer }));
        setFeatures(s.features || {});
        if (s.messageTemplates) setTemplates(prev => ({ ...prev, ...s.messageTemplates }));
        loadTemplateDefaults();
        if (s.features?.multiUser) loadUsers();
        setDefaultLanguage(s.defaultLanguage || 'fr');
        setHospitableConnected(Boolean(s.hospitableConnected && s.hasKey));
        setStatus(st);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const selectedIds = automation.autoMessagePropertyIds || [];
  const linkedProperties = useMemo(() => properties.filter(p => p.hospitableId), [properties]);
  const unlinkedCount = properties.length - linkedProperties.length;
  const selectedLinkedCount = linkedProperties.filter(p => selectedIds.includes(p.id)).length;

  const patch = (changes) => setAutomation(prev => ({ ...prev, ...changes }));

  const toggleProperty = (id) => {
    patch({
      autoMessagePropertyIds: selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
    });
  };

  const selectAll = () => patch({ autoMessagePropertyIds: linkedProperties.map(p => p.id) });
  const selectNone = () => patch({ autoMessagePropertyIds: [] });

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const data = await api('/api/settings', {
        method: 'PUT',
        body: {
          defaultLanguage,
          guestOffer: offer,
          features,
          messageTemplates: templates,
          automation: {
            autoMessageEnabled: automation.autoMessageEnabled,
            autoMessagePropertyIds: automation.autoMessagePropertyIds,
            autoMessageTiming: automation.autoMessageTiming,
            autoMessageDaysBefore: automation.autoMessageDaysBefore,
            autoMessageIncludeExisting: automation.autoMessageIncludeExisting,
            reminderEnabled: automation.reminderEnabled,
            reminderDaysBefore: automation.reminderDaysBefore,
            autoSyncEnabled: automation.autoSyncEnabled
          }
        }
      });
      setAutomation({ ...DEFAULT_AUTOMATION, ...(data.settings?.automation || {}) });
      setFeatures(data.settings?.features || features);
      if (data.settings?.messageTemplates) setTemplates(data.settings.messageTemplates);
      if (data.refreshedMessages) setTplPreview(p => p); // keep preview; messages of pending guests were re-rendered server-side
      if (data.settings?.features?.multiUser) loadUsers();
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setError('');
    try {
      // Save first so the preview reflects what is on screen.
      await handleSave();
      const data = await api('/api/automation/preview', { method: 'POST' });
      setPreview(data.report);
    } catch (err) {
      setError(err.message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleRunNow = async () => {
    const count = preview ? preview.messages.length + preview.reminders.length : null;
    const warn = count === null
      ? 'Lancer un passage maintenant ? Les messages activés seront réellement envoyés aux voyageurs.'
      : `Lancer un passage maintenant ? ${count} message(s) seront réellement envoyés aux voyageurs.`;
    if (!window.confirm(warn)) return;
    setRunning(true);
    setError('');
    try {
      await handleSave();
      const data = await api('/api/automation/run', { method: 'POST' });
      const sent = data.report.messages.filter(m => m.sent).length + data.report.reminders.filter(m => m.sent).length;
      setPreview(null);
      const st = await api('/api/automation/status').catch(() => status);
      setStatus(st);
      setAutomation(prev => ({ ...prev, lastRunAt: st?.lastRunAt || prev.lastRunAt, lastRunReport: st?.lastRunReport || prev.lastRunReport }));
      alert(`Passage terminé : ${sent} message(s) envoyé(s)${data.report.errors.length ? `, ${data.report.errors.length} erreur(s)` : ''}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const anyAutomationOn = automation.autoMessageEnabled || automation.reminderEnabled || automation.autoSyncEnabled;
  const schedulerOk = status && status.scheduler !== 'none';
  const lastReport = automation.lastRunReport;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="feature-icon" style={{ background: '#FDF2F4', color: '#81172E', width: 42, height: 42 }}>
              <SlidersHorizontal size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Paramètres & Automatisations</h3>
              <p className="text-xs text-muted" style={{ margin: '2px 0 0' }}>
                Activez chaque fonctionnalité individuellement. Tout est désactivé par défaut.
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          {error && <div className="alert-error" role="alert">{error}</div>}
          {loading ? (
            <div className="text-muted">Chargement…</div>
          ) : (
            <>
              {!hospitableConnected && (
                <div className="settings-note warn">
                  <AlertTriangle size={16} />
                  <span>Hospitable n'est pas connecté : les messages automatiques ne pourront pas partir. Enregistrez votre clé API dans le menu <strong>Hospitable</strong>.</span>
                </div>
              )}

              {/* 1. Automatic check-in message */}
              <FeatureRow
                icon={<MessageSquare size={18} />}
                title="Message automatique de check-in"
                badge={automation.autoMessageEnabled ? 'Actif' : 'Désactivé'}
                description="Envoie le lien du portail et le code d'accès dans la messagerie Airbnb / Booking du voyageur, sans aucun clic. Une seule fois par réservation, uniquement pour les arrivées à venir."
                checked={automation.autoMessageEnabled}
                onChange={v => patch({ autoMessageEnabled: v })}
              >
                <div className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Home size={14} /> Logements autorisés à envoyer automatiquement
                  <span className="text-xs text-muted" style={{ fontWeight: 500, marginLeft: 'auto' }}>
                    {selectedLinkedCount} / {linkedProperties.length} sélectionné(s)
                  </span>
                </div>
                {linkedProperties.length === 0 ? (
                  <div className="text-xs text-muted">Aucun logement lié à Hospitable. Utilisez « Importer logements » dans le menu Hospitable.</div>
                ) : (
                  <>
                    <div className="property-pick-grid">
                      {linkedProperties.map(p => {
                        const on = selectedIds.includes(p.id);
                        return (
                          <label key={p.id} className={`property-pick ${on ? 'on' : ''}`}>
                            <input type="checkbox" checked={on} onChange={() => toggleProperty(p.id)} />
                            <span className="property-pick-check"><Check size={12} /></span>
                            <span style={{ minWidth: 0 }}>
                              <span className="property-pick-name">{p.name}</span>
                              {p.city && <span className="property-pick-city">{p.city}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={selectAll}>Tout sélectionner</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={selectNone}>Aucun</button>
                      {unlinkedCount > 0 && (
                        <span className="text-xs text-muted" style={{ alignSelf: 'center' }}>
                          {unlinkedCount} logement(s) sans lien Hospitable ne peuvent pas recevoir de message automatique.
                        </span>
                      )}
                    </div>
                  </>
                )}

                <div className="form-label" style={{ marginTop: 16, marginBottom: 8 }}>Moment de l'envoi</div>
                <div className="radio-stack">
                  <label className="radio-row">
                    <input type="radio" name="timing" checked={automation.autoMessageTiming === 'immediate'} onChange={() => patch({ autoMessageTiming: 'immediate' })} />
                    <span>
                      <strong>Dès la réservation</strong>
                      <span className="text-xs text-muted"> — à la réception du webhook ou de la synchronisation</span>
                    </span>
                  </label>
                  <label className="radio-row">
                    <input type="radio" name="timing" checked={automation.autoMessageTiming === 'days_before'} onChange={() => patch({ autoMessageTiming: 'days_before' })} />
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong>Quelques jours avant l'arrivée :</strong>
                      <input
                        type="number" min={0} max={30} className="form-input" style={{ width: 70, padding: '4px 8px' }}
                        value={automation.autoMessageDaysBefore}
                        onChange={e => patch({ autoMessageDaysBefore: e.target.value, autoMessageTiming: 'days_before' })}
                      />
                      <span className="text-xs text-muted">jour(s) avant le check-in</span>
                    </span>
                  </label>
                </div>

                <label className="radio-row" style={{ marginTop: 12 }}>
                  <input type="checkbox" checked={automation.autoMessageIncludeExisting} onChange={e => patch({ autoMessageIncludeExisting: e.target.checked })} />
                  <span>
                    <strong>Inclure les réservations déjà importées</strong>
                    <span className="text-xs text-muted"> — sinon seules les réservations reçues après l'activation sont concernées (évite un envoi massif à l'activation)</span>
                  </span>
                </label>
              </FeatureRow>

              {/* 2. Reminder */}
              <FeatureRow
                icon={<BellRing size={18} />}
                accent="#B45309"
                title="Rappel si la fiche n'est pas complétée"
                badge={automation.reminderEnabled ? 'Actif' : 'Désactivé'}
                description="Renvoie un court rappel avec le lien et le code aux voyageurs qui n'ont pas encore rempli leur fiche, peu avant l'arrivée. Une seule fois. Concerne les mêmes logements que ci-dessus."
                checked={automation.reminderEnabled}
                onChange={v => patch({ reminderEnabled: v })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="text-sm">Envoyer le rappel</span>
                  <input
                    type="number" min={0} max={14} className="form-input" style={{ width: 70, padding: '4px 8px' }}
                    value={automation.reminderDaysBefore}
                    onChange={e => patch({ reminderDaysBefore: e.target.value })}
                  />
                  <span className="text-sm">jour(s) avant le check-in (0 = le jour même)</span>
                </div>
              </FeatureRow>

              {/* 3. Scheduled sync */}
              <FeatureRow
                icon={<RefreshCw size={18} />}
                accent="#0369A1"
                title="Synchronisation Hospitable automatique"
                badge={automation.autoSyncEnabled ? 'Actif' : 'Désactivé'}
                description="Récupère automatiquement les nouvelles réservations Airbnb / Booking toutes les minutes (en plus du webhook). Nécessaire pour que les messages partent sans intervention si le webhook n'est pas configuré."
                checked={automation.autoSyncEnabled}
                onChange={v => patch({ autoSyncEnabled: v })}
              />

              {/* 3b. Editable guest message */}
              <div className={`feature-row ${!tplIsDefault ? 'feature-on' : ''}`}>
                <div className="feature-head">
                  <div className="feature-icon" style={{ background: '#FDF2F4', color: '#81172E' }}><MessageSquareText size={18} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="feature-title">Message envoyé aux voyageurs
                      <span className="feature-badge">{(templates.fr || templates.en || templates.reminderFr || templates.reminderEn) ? 'Personnalisé' : 'Texte par défaut'}</span>
                    </div>
                    <div className="text-xs text-muted">Le texte du message de check-in (et du rappel) que reçoivent les voyageurs, en français et en anglais. Il est enregistré dans la base de données et s'applique immédiatement aux voyageurs en attente.</div>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTplOpen(v => !v)}>{tplOpen ? 'Réduire' : 'Modifier'}</button>
                </div>
                {tplOpen && (
                  <div className="feature-body">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                      <div className="tv-filter">
                        <button type="button" className={`tv-filter-btn ${tplKind === 'checkin' ? 'on' : ''}`} onClick={() => { setTplKind('checkin'); setTplPreview(''); }}>Message de check-in</button>
                        <button type="button" className={`tv-filter-btn ${tplKind === 'reminder' ? 'on' : ''}`} onClick={() => { setTplKind('reminder'); setTplPreview(''); }}>Rappel</button>
                      </div>
                      <div className="tv-filter">
                        <button type="button" className={`tv-filter-btn ${tplLang === 'fr' ? 'on' : ''}`} onClick={() => { setTplLang('fr'); setTplPreview(''); }}>🇫🇷 Français</button>
                        <button type="button" className={`tv-filter-btn ${tplLang === 'en' ? 'on' : ''}`} onClick={() => { setTplLang('en'); setTplPreview(''); }}>🇬🇧 English</button>
                      </div>
                      <span className="text-xs text-muted">{tplIsDefault ? 'Texte par défaut affiché (modifiez-le pour le personnaliser)' : 'Texte personnalisé'}</span>
                    </div>

                    <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Cliquez pour insérer un champ automatique :</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {placeholders.map(([ph, label]) => (
                        <button key={ph} type="button" className="chip chip-indigo" style={{ border: 'none', cursor: 'pointer' }} title={label} onClick={() => insertPlaceholder(ph)}>{ph}</button>
                      ))}
                    </div>

                    <textarea
                      ref={tplRef}
                      className="form-input"
                      rows={14}
                      style={{ fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.45 }}
                      value={tplValue || tplDefaults?.[tplKey] || ''}
                      onChange={e => setTemplates(t => ({ ...t, [tplKey]: e.target.value }))}
                      placeholder="Chargement du texte par défaut…"
                    />
                    <div className="text-xs text-muted" style={{ marginTop: 6 }}>
                      Le lien du formulaire et le code d'accès sont toujours ajoutés : si vous oubliez {'{{portal_url}}'} ou {'{{access_code}}'}, ils sont ajoutés automatiquement à la fin.
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={previewTemplate}><Eye size={14} /> Aperçu avec un exemple</button>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={tplIsDefault} onClick={() => { setTemplates(t => ({ ...t, [tplKey]: '' })); setTplPreview(''); }}>
                        <RotateCcw size={14} /> Revenir au texte par défaut
                      </button>
                      <span className="text-xs text-muted" style={{ alignSelf: 'center' }}>Puis « Enregistrer » en bas.</span>
                    </div>

                    {tplPreview && (
                      <div className="preview-box" style={{ whiteSpace: 'pre-wrap', fontSize: '0.84rem', lineHeight: 1.45 }}>{tplPreview}</div>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Language */}
              <div className="feature-row">
                <div className="feature-head">
                  <div className="feature-icon" style={{ background: '#F0FDF4', color: '#15803D' }}><Languages size={18} /></div>
                  <div style={{ flex: 1 }}>
                    <div className="feature-title">Langue des messages</div>
                    <div className="text-xs text-muted">Utilisée pour les messages automatiques, les rappels et les codes générés manuellement.</div>
                  </div>
                  <select className="form-input" style={{ width: 'auto', padding: '6px 10px', fontSize: '0.85rem' }} value={defaultLanguage} onChange={e => setDefaultLanguage(e.target.value)}>
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                    <option value="bilingual">Bilingue FR + EN</option>
                  </select>
                </div>
              </div>

              {/* 5. Partner recommendation on the guest thank-you page */}
              <FeatureRow
                icon={<Car size={18} />}
                accent="#EA580C"
                title="Page de fin : location de voiture"
                badge={offer.enabled ? 'Affiché' : 'Masqué'}
                description="Carte affichée au voyageur une fois son enregistrement terminé, avec le lien Google Maps et le numéro de l'agence partenaire."
                checked={offer.enabled}
                onChange={v => setOffer(prev => ({ ...prev, enabled: v }))}
              >
                <div className="form-grid-2">
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Nom de l'agence</label>
                    <input type="text" className="form-input" value={offer.agencyName} onChange={e => setOffer(p => ({ ...p, agencyName: e.target.value }))} placeholder="Ex: Agence Intissar" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Titre de la carte</label>
                    <input type="text" className="form-input" value={offer.title} onChange={e => setOffer(p => ({ ...p, title: e.target.value }))} placeholder="Besoin d'une voiture ?" />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">Lien Google Maps</label>
                  <input type="url" className="form-input" value={offer.mapsUrl} onChange={e => setOffer(p => ({ ...p, mapsUrl: e.target.value }))} placeholder="https://maps.app.goo.gl/…" />
                </div>
                <div className="form-grid-2">
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Téléphone (bouton « Appeler »)</label>
                    <input type="tel" className="form-input" value={offer.phone} onChange={e => setOffer(p => ({ ...p, phone: e.target.value }))} placeholder="+212 6 00 00 00 00" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">WhatsApp (optionnel)</label>
                    <input type="tel" className="form-input" value={offer.whatsapp} onChange={e => setOffer(p => ({ ...p, whatsapp: e.target.value }))} placeholder="+212 6 00 00 00 00" />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Texte</label>
                  <textarea className="form-input" rows={3} value={offer.description} onChange={e => setOffer(p => ({ ...p, description: e.target.value }))} />
                </div>
              </FeatureRow>

              {/* 6. Beta features (each behind its own switch, off by default) */}
              <div className="feature-row" style={{ borderColor: '#C7D2FE' }}>
                <div className="feature-head">
                  <div className="feature-icon" style={{ background: '#EEF2FF', color: '#4338CA' }}><FlaskConical size={18} /></div>
                  <div style={{ flex: 1 }}>
                    <div className="feature-title">Fonctionnalités (bêta) <span className="feature-badge">{Object.values(features).filter(Boolean).length} / {FEATURE_LIST.length} actives</span></div>
                    <div className="text-xs text-muted">Chaque fonctionnalité est indépendante et désactivée par défaut. Une fonctionnalité désactivée est aussi bloquée côté serveur. Enregistrez pour appliquer.</div>
                  </div>
                </div>
                <div className="feature-body" style={{ display: 'grid', gap: 10 }}>
                  {FEATURE_LIST.map(fd => (
                    <div key={fd.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <Toggle checked={Boolean(features[fd.key])} onChange={v => setFeatures(p => ({ ...p, [fd.key]: v }))} label={fd.title} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{fd.title} {features[fd.key] && <span className="feature-badge" style={{ background: '#DCFCE7', color: '#166534' }}>Actif</span>}</div>
                        <div className="text-xs text-muted">{fd.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {features.multiUser && (
                <div className="feature-row">
                  <div className="feature-head">
                    <div className="feature-icon" style={{ background: '#F0FDF4', color: '#15803D' }}><Users size={18} /></div>
                    <div style={{ flex: 1 }}>
                      <div className="feature-title">Comptes utilisateurs</div>
                      <div className="text-xs text-muted">Admin : tout. Assistant : réservations, fiches, tâches et incidents, sans les paramètres ni Hospitable. Ménage : uniquement les tâches qui lui sont assignées (par email).</div>
                    </div>
                  </div>
                  <div className="feature-body">
                    {userError && <div className="text-xs" style={{ color: '#B91C1C', marginBottom: 8 }}>{userError}</div>}
                    {users === null ? (
                      <div className="text-xs text-muted">Enregistrez d'abord pour activer la gestion des comptes.</div>
                    ) : (
                      <table className="users-table">
                        <thead><tr><th>Email</th><th>Rôle</th><th></th></tr></thead>
                        <tbody>
                          {users.map(u => (
                            <tr key={u.id}>
                              <td>{u.email}</td>
                              <td><span className="feature-badge">{u.role}</span></td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => resetUserPassword(u)}>Mot de passe</button>{' '}
                                <button type="button" className="btn btn-secondary btn-sm" style={{ color: '#B91C1C' }} onClick={() => removeUser(u)}>Supprimer</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {users !== null && (
                      <form onSubmit={addUser} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 8, marginTop: 12, alignItems: 'center' }}>
                        <input type="email" required className="form-input" placeholder="email@exemple.com" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} style={{ padding: '8px 10px' }} />
                        <input type="text" required minLength={10} className="form-input" placeholder="Mot de passe (10 min.)" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} style={{ padding: '8px 10px' }} />
                        <select className="form-input" value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))} style={{ padding: '8px 10px' }}>
                          <option value="admin">admin</option>
                          <option value="assistant">assistant</option>
                          <option value="cleaner">ménage</option>
                        </select>
                        <button type="submit" className="btn btn-rausch btn-sm">Ajouter</button>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {/* 7. Always-on safeguards */}
              <div className="feature-row" style={{ background: '#FAFAFA' }}>
                <div className="feature-head">
                  <div className="feature-icon" style={{ background: '#F1F5F9', color: '#475569' }}><Lock size={18} /></div>
                  <div style={{ flex: 1 }}>
                    <div className="feature-title">Garde-fous toujours actifs</div>
                    <ul className="text-xs text-muted safeguards">
                      <li>Jamais de message pour un séjour passé, annulé ou déjà complété.</li>
                      <li>Un seul message de check-in et un seul rappel par réservation.</li>
                      <li>Seuls les logements cochés ci-dessus peuvent envoyer automatiquement.</li>
                      <li>Le scan de la pièce d'identité reste obligatoire pour signer la fiche.</li>
                    </ul>
                  </div>
                  <ShieldCheck size={20} color="#15803D" />
                </div>
              </div>

              {/* Scheduler status + preview */}
              <div className="settings-status">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Clock size={15} color={schedulerOk ? '#15803D' : '#B45309'} />
                  <span className="text-sm" style={{ fontWeight: 600 }}>
                    {schedulerOk
                      ? `Planificateur actif : passage toutes les ${status.intervalMinutes} min`
                      : 'Planificateur non configuré (les envois se font uniquement au webhook / à la synchronisation manuelle)'}
                  </span>
                  {automation.lastRunAt && (
                    <span className="text-xs text-muted">· Dernier passage : {new Date(automation.lastRunAt).toLocaleString('fr-FR')}</span>
                  )}
                </div>
                <div className="text-xs" style={{ marginTop: 6, color: status?.lastWebhookAt ? '#166534' : '#92400E' }}>
                  {status?.lastWebhookAt
                    ? `Webhook Hospitable actif · dernière réservation reçue en temps réel le ${new Date(status.lastWebhookAt).toLocaleString('fr-FR')}`
                    : 'Webhook Hospitable : aucune réception pour l\'instant. Pour le temps réel (à la seconde), ajoutez l\'URL du menu Hospitable dans Hospitable > Settings > Apps & API > Webhooks.'}
                </div>
                {lastReport && (
                  <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                    Dernier résultat ({lastReport.trigger}) : {lastReport.messagesSent} message(s), {lastReport.remindersSent} rappel(s)
                    {lastReport.sync ? `, synchro ${lastReport.sync.totalReservations} réservation(s)` : ''}
                    {lastReport.errors?.length ? `, ${lastReport.errors.length} erreur(s) : ${lastReport.errors[0]}` : ''}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handlePreview} disabled={previewing || saving}>
                    <Eye size={14} /> {previewing ? 'Analyse…' : 'Aperçu : qui recevrait un message ?'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleRunNow} disabled={running || saving || !anyAutomationOn} title={anyAutomationOn ? 'Exécuter un passage maintenant' : 'Activez au moins une automatisation'}>
                    <Play size={14} /> {running ? 'Envoi…' : 'Lancer un passage maintenant'}
                  </button>
                </div>

                {preview && (
                  <div className="preview-box">
                    {preview.messages.length + preview.reminders.length === 0 ? (
                      <div className="text-sm">Aucun message ne partirait avec les réglages actuels.</div>
                    ) : (
                      <>
                        <div className="text-sm" style={{ fontWeight: 600, marginBottom: 6 }}>
                          {preview.messages.length} message(s) de check-in et {preview.reminders.length} rappel(s) partiraient au prochain passage :
                        </div>
                        <ul className="preview-list">
                          {[...preview.messages, ...preview.reminders].slice(0, 30).map((m, i) => (
                            <li key={i}>
                              <span className={`chip ${m.kind === 'reminder' ? 'chip-amber' : 'chip-indigo'}`}>{m.kind === 'reminder' ? 'Rappel' : 'Check-in'}</span>
                              <strong>{m.guestName}</strong> · {m.property} · arrivée {m.checkIn}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {preview.errors?.length > 0 && <div className="text-xs" style={{ color: '#B91C1C', marginTop: 6 }}>{preview.errors.join(' · ')}</div>}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div>
            {saved && (
              <span style={{ color: '#008A05', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={16} /> Enregistré !
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Fermer</button>
            <button type="button" className="btn btn-rausch" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
