import React, { useEffect, useMemo, useState } from 'react';
import {
  SlidersHorizontal, MessageSquare, BellRing, RefreshCw, Languages, Home, Check,
  AlertTriangle, Eye, Play, Clock, ShieldCheck, Lock, Car
} from 'lucide-react';
import { api } from '../api';

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

              {/* 6. Always-on safeguards */}
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
