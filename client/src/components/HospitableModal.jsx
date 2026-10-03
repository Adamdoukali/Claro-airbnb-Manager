import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Key, 
  Check, 
  Copy, 
  RefreshCw, 
  ExternalLink, 
  MessageSquare, 
  Webhook, 
  ShieldCheck, 
  AlertCircle,
  Building,
  ArrowRight,
  Radio
} from 'lucide-react';
import { api } from '../api';

export default function HospitableModal({ property, onClose, onSyncSuccess, onOpenAutomation }) {
  const [apiKey, setApiKey] = useState('');
  const [savedSettings, setSavedSettings] = useState(null);
  const [automation, setAutomation] = useState(null);
  
  const [testing, setTesting] = useState(false);
  const [syncingReservations, setSyncingReservations] = useState(false);
  const [syncingProperties, setSyncingProperties] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState(''); // 'success' | 'error' | 'info'
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [syncedListings, setSyncedListings] = useState([]);

  const webhookUrl = `${window.location.origin}/api/integrations/hospitable/webhook`;

  // Fetch current server settings on mount
  useEffect(() => {
    // The token itself never leaves the server: only hasKey / maskedKey are returned.
    api('/api/settings')
      .then(data => {
        setSavedSettings(data);
        setAutomation(data.automation || null);
      })
      .catch(err => console.error("Error fetching settings:", err));
  }, []);

  const copyText = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'webhook') {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } else {
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    }
  };

  // Test and save API Key to server
  const handleTestAndSaveConnection = async () => {
    if (!apiKey.trim()) {
      setStatusType('error');
      setStatusMsg("Veuillez saisir votre clé API Hospitable (Personal Access Token).");
      return;
    }

    setTesting(true);
    setStatusMsg('');

    try {
      // Test the key with Hospitable: the server stores it once it is verified.
      const data = await api('/api/integrations/hospitable/test', {
        method: 'POST',
        body: { apiKey: apiKey.trim() }
      });

      setApiKey('');
      setSavedSettings(prev => ({
        ...prev,
        hospitableConnected: true,
        hasKey: true
      }));

      setSyncedListings(data.properties || []);
      setStatusType('success');
      setStatusMsg(`✅ Connexion réussie avec Hospitable ! ${data.propertiesCount} logement(s) Airbnb/Booking détecté(s).`);
      if (onSyncSuccess) onSyncSuccess();
    } catch (err) {
      setStatusType('error');
      setStatusMsg(`❌ ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  // Import properties from Hospitable
  const handleImportProperties = async () => {
    setSyncingProperties(true);
    setStatusMsg('');

    try {
      const data = await api('/api/integrations/hospitable/sync-properties', {
        method: 'POST',
        body: { apiKey: apiKey.trim() || undefined }
      });

      setStatusType('success');
      setStatusMsg(`🏠 ${data.totalProperties} hébergement(s) Hospitable synchronisés (${data.importedCount} importés, ${data.updatedCount} mis à jour)`);
      if (onSyncSuccess) onSyncSuccess();
    } catch (err) {
      setStatusType('error');
      setStatusMsg(`❌ ${err.message}`);
    } finally {
      setSyncingProperties(false);
    }
  };

  // Sync reservations from Hospitable
  const handleSyncReservations = async () => {
    setSyncingReservations(true);
    setStatusMsg('');

    try {
      const data = await api('/api/integrations/hospitable/sync', {
        method: 'POST',
        body: { apiKey: apiKey.trim() || undefined, propertyId: property?.id }
      });

      setStatusType('success');
      setStatusMsg(`🎉 Synchronisation terminée : ${data.totalReservations} réservations Airbnb/Booking vérifiées (${data.addedCount} nouvelles, ${data.updatedCount} actualisées${data.autoMessagesSent ? `, ${data.autoMessagesSent} message(s) envoyé(s)` : ''}).`);
      if (onSyncSuccess) onSyncSuccess();
    } catch (err) {
      setStatusType('error');
      setStatusMsg(`❌ ${err.message}`);
    } finally {
      setSyncingReservations(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: '#EEF2FF',
              color: '#4F46E5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.15)'
            }}>
              <Zap size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                  Intégration Hospitable
                </h3>
                <span style={{ 
                  fontSize: '0.72rem', 
                  background: savedSettings?.hospitableConnected ? '#DCFCE7' : '#EEF2FF', 
                  color: savedSettings?.hospitableConnected ? '#166534' : '#4F46E5', 
                  padding: '3px 9px', 
                  borderRadius: 12, 
                  fontWeight: 700 
                }}>
                  {savedSettings?.hospitableConnected ? '● Connecté' : 'Aggregateur Central'}
                </span>
              </div>
              <p className="text-xs text-muted" style={{ margin: '2px 0 0 0' }}>
                Hospitable gère et agrège vos flux <strong>Airbnb</strong>, <strong>Booking.com</strong> & VRBO
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Status Alert */}
          {statusMsg && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 10,
              marginBottom: 18,
              fontSize: '0.85rem',
              fontWeight: 600,
              background: statusType === 'success' ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${statusType === 'success' ? '#BBF7D0' : '#FECACA'}`,
              color: statusType === 'success' ? '#166534' : '#991B1B'
            }}>
              {statusMsg}
            </div>
          )}

          {/* Section 1: API Key & Connect */}
          <div style={{ marginBottom: 20, background: '#FAFAFA', border: '1px solid #EBEBEB', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <Key size={16} color="#4F46E5" />
                <span>Clé API Hospitable (Personal Access Token)</span>
              </label>
              <a 
                href="https://my.hospitable.com/settings/api" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-xs" 
                style={{ color: '#4F46E5', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
              >
                <span>Générer sur Hospitable</span>
                <ExternalLink size={12} />
              </a>
            </div>

            <p className="text-xs text-muted" style={{ marginBottom: 12 }}>
              Créez un <em>Personal Access Token</em> dans <strong>Hospitable &gt; Settings &gt; Apps & API &gt; API Keys</strong>.
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <input 
                type="password" 
                className="form-input" 
                placeholder={savedSettings?.hasKey ? `Clé enregistrée (${savedSettings.maskedKey || '••••••••'}) – coller une nouvelle clé pour la remplacer` : "Collez votre token Hospitable (ex: pat_...)"}
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleTestAndSaveConnection}
                disabled={testing}
                style={{ minWidth: 100 }}
              >
                {testing ? "Test..." : "Enregistrer"}
              </button>
            </div>

            {/* Quick Actions Buttons */}
            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                onClick={handleImportProperties}
                disabled={syncingProperties}
                title="Importer tous vos logements configurés dans Hospitable"
              >
                <Building size={14} className={syncingProperties ? "spinning" : ""} />
                <span>{syncingProperties ? "Importation..." : "Importer logements"}</span>
              </button>

              <button 
                type="button" 
                className="btn btn-rausch btn-sm"
                onClick={handleSyncReservations}
                disabled={syncingReservations}
                style={{ background: '#4F46E5', borderColor: '#4F46E5' }}
                title="Importer les réservations Airbnb et Booking.com"
              >
                <RefreshCw size={14} className={syncingReservations ? "spinning" : ""} />
                <span>{syncingReservations ? "Synchronisation..." : "Synchroniser Airbnb & Booking"}</span>
              </button>
            </div>
          </div>

          {/* Section 2: Automation (managed in the global settings panel) */}
          <div style={{ marginBottom: 20, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} color="#008A05" />
                <h4 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0 }}>Messages automatiques aux voyageurs</h4>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                  background: automation?.autoMessageEnabled ? '#DCFCE7' : '#F3F4F6',
                  color: automation?.autoMessageEnabled ? '#166534' : '#6B7280'
                }}>
                  {automation?.autoMessageEnabled
                    ? `Actif · ${(automation.autoMessagePropertyIds || []).length} logement(s)`
                    : 'Désactivé'}
                </span>
              </div>
              {onOpenAutomation && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenAutomation}>
                  Gérer dans Paramètres <ArrowRight size={14} />
                </button>
              )}
            </div>
            <p className="text-xs text-muted" style={{ margin: '8px 0 0' }}>
              L'envoi automatique du lien de check-in, les rappels et la synchronisation planifiée se règlent dans le panneau
              <strong> Paramètres & Automatisations</strong>, logement par logement. Tout est désactivé par défaut.
            </p>
          </div>

          {/* Section 3: Webhook (Real-time Instant Sync) */}
          <div style={{ background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Webhook size={18} color="#7E22CE" />
              <h4 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0 }}>
                Webhook Hospitable (Synchronisation Instantanée)
              </h4>
            </div>
            <p className="text-xs text-muted" style={{ marginBottom: 12 }}>
              Ajoutez cette URL dans <strong>Hospitable &gt; Settings &gt; Apps & API &gt; Webhooks</strong> (événements : <code>reservation.created</code>, <code>reservation.updated</code>, <code>reservation.cancelled</code>) pour une mise à jour instantanée dès qu'un voyageur réserve sur Airbnb ou Booking.com :
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <input 
                type="text" 
                readOnly 
                value={webhookUrl} 
                className="form-input" 
                style={{ background: '#FFF', fontSize: '0.82rem', fontFamily: 'monospace' }}
              />
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
                onClick={() => copyText(webhookUrl, 'webhook')}
              >
                {copiedWebhook ? <Check size={14} color="#008A05" /> : <Copy size={14} />}
                <span>{copiedWebhook ? "Copié !" : "Copier"}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div className="text-xs text-muted">
            {savedSettings?.lastGlobalSync && (
              <span>Dernière synchro : {new Date(savedSettings.lastGlobalSync).toLocaleTimeString('fr-FR')}</span>
            )}
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
