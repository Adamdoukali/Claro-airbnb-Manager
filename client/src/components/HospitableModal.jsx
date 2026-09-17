import React, { useState } from 'react';
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
  AlertCircle 
} from 'lucide-react';

export default function HospitableModal({ property, onClose, onSyncSuccess }) {
  const [apiKey, setApiKey] = useState(localStorage.getItem('hospitable_api_key') || '');
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState(''); // 'success' | 'error'
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const webhookUrl = `${window.location.protocol}//${window.location.hostname}:5000/api/integrations/hospitable/webhook`;
  const automatedMessageTemplate = `Bonjour %guest_first_name% ! 🇲🇦 Bienvenue à %property_name%.
Conformément à la loi marocaine régissant le tourisme, merci de compléter la fiche d'enregistrement de police en 30 secondes avant votre arrivée :
${window.location.origin}/?guestCode=%reservation_code%`;

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

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setStatusType('error');
      setStatusMsg("Veuillez saisir votre clé API Hospitable (Personal Access Token).");
      return;
    }

    setTesting(true);
    setStatusMsg('');

    try {
      const res = await fetch('/api/integrations/hospitable/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Échec de connexion à Hospitable");
      }

      localStorage.setItem('hospitable_api_key', apiKey.trim());
      setStatusType('success');
      setStatusMsg(`✅ Connexion réussie avec Hospitable ! ${data.propertiesCount} logement(s) détecté(s).`);
    } catch (err) {
      setStatusType('error');
      setStatusMsg(`❌ ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSyncReservations = async () => {
    if (!apiKey.trim()) {
      setStatusType('error');
      setStatusMsg("Veuillez d'abord renseigner votre clé API Hospitable.");
      return;
    }

    setSyncing(true);
    setStatusMsg('');

    try {
      const res = await fetch('/api/integrations/hospitable/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), propertyId: property?.id })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erreur de synchronisation");
      }

      setStatusType('success');
      setStatusMsg(`🎉 Synchronisation terminée : ${data.newBookingsAdded} nouvelle(s) réservation(s) importée(s) depuis Hospitable.`);
      if (onSyncSuccess) onSyncSuccess();
    } catch (err) {
      setStatusType('error');
      setStatusMsg(`❌ ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 660 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#EEF2FF',
              color: '#4F46E5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Zap size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Intégration Hospitable</span>
                <span style={{ fontSize: '0.72rem', background: '#EEF2FF', color: '#4F46E5', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                  my.hospitable.com
                </span>
              </h3>
              <p className="text-xs text-muted">Synchronisation automatique des réservations Airbnb/Booking & automatisation des messages</p>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Status Message */}
          {statusMsg && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 10,
              marginBottom: 20,
              fontSize: '0.85rem',
              fontWeight: 600,
              background: statusType === 'success' ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${statusType === 'success' ? '#BBF7D0' : '#FECACA'}`,
              color: statusType === 'success' ? '#166534' : '#991B1B'
            }}>
              {statusMsg}
            </div>
          )}

          {/* Section 1: API Key */}
          <div style={{ marginBottom: 22, background: '#FAFAFA', border: '1px solid #EBEBEB', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
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
                <span>Obtenir ma clé sur Hospitable</span>
                <ExternalLink size={12} />
              </a>
            </div>

            <p className="text-xs text-muted" style={{ marginBottom: 10 }}>
              Dans Hospitable : <em>Paramètres (Settings) &gt; Applications & API &gt; Clés API (Personal Access Tokens)</em>.
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <input 
                type="password" 
                className="form-input" 
                placeholder="Collez votre token Hospitable (ex: pat_...)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleTestConnection}
                disabled={testing}
              >
                {testing ? "Test..." : "Tester"}
              </button>
            </div>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-rausch btn-sm"
                onClick={handleSyncReservations}
                disabled={syncing}
                style={{ background: '#4F46E5', borderColor: '#4F46E5' }}
              >
                <RefreshCw size={14} className={syncing ? "spinning" : ""} />
                <span>{syncing ? "Importation en cours..." : "Importer les réservations Hospitable"}</span>
              </button>
            </div>
          </div>

          {/* Section 2: Automated Messaging Rule in Hospitable */}
          <div style={{ marginBottom: 22, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <MessageSquare size={17} color="#4F46E5" />
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Automatisation du message voyageur dans Hospitable</h4>
            </div>
            <p className="text-xs text-muted" style={{ marginBottom: 12 }}>
              Collez ce texte dans vos messages programmés Hospitable (*Hospitable &gt; Règles de messages &gt; 2 jours avant l'arrivée*). Hospitable remplacera automatiquement le nom et le code :
            </p>

            <div style={{ position: 'relative' }}>
              <textarea 
                readOnly 
                rows={4} 
                className="form-input" 
                style={{ background: '#FFF', fontSize: '0.82rem', fontFamily: 'monospace' }}
                value={automatedMessageTemplate}
              />
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
                onClick={() => copyText(automatedMessageTemplate, 'msg')}
                style={{ position: 'absolute', top: 8, right: 8 }}
              >
                {copiedMsg ? <Check size={14} color="#008A05" /> : <Copy size={14} />}
                <span>{copiedMsg ? "Copié !" : "Copier"}</span>
              </button>
            </div>
          </div>

          {/* Section 3: Webhook (Real-time updates) */}
          <div style={{ background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Webhook size={17} color="#7E22CE" />
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Webhook Hospitable (Temps Réel)</h4>
            </div>
            <p className="text-xs text-muted" style={{ marginBottom: 10 }}>
              Pour que chaque nouvelle réservation sur Airbnb ou Booking crée automatiquement le dossier de police :
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

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
