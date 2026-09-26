import React, { useState } from 'react';
import { 
  ShieldCheck, 
  FileText, 
  UserPlus, 
  Download, 
  Copy, 
  Check, 
  MessageSquare, 
  Clock, 
  Eye, 
  Share2,
  AlertCircle,
  Zap,
  Send,
  Sparkles
} from 'lucide-react';
import { api } from '../api';

export default function PoliceDashboard({ 
  registrations, 
  property, 
  onOpenCodeGenerator,
  onOpenGuestPortalWithCode,
  onRefresh,
  features = {}
}) {
  const [exportFrom, setExportFrom] = useState(new Date().toISOString().slice(0, 10));
  const [exportTo, setExportTo] = useState(new Date().toISOString().slice(0, 10));
  const [exportAll, setExportAll] = useState(false);
  const exportZip = () => {
    const q = new URLSearchParams({ from: exportFrom, to: exportTo || exportFrom });
    if (!exportAll && property?.id) q.set('propertyId', property.id);
    window.location.href = `/api/police/export?${q.toString()}`;
  };
  const [copiedCode, setCopiedCode] = useState(null);
  const [previewReg, setPreviewReg] = useState(null);
  const [messageReg, setMessageReg] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Message modal state
  const [messageText, setMessageText] = useState('');
  const [language, setLanguage] = useState('fr');
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [sendingHospitable, setSendingHospitable] = useState(false);
  const [hospitableStatus, setHospitableStatus] = useState(null);

  const completedCount = registrations.filter(r => r.status === 'completed').length;
  const pendingCount = registrations.filter(r => r.status === 'pending').length;
  const sentMessagesCount = registrations.filter(r => !!r.messageSentAt).length;

  const copyToClipboard = (text, code) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const openMessageModal = (reg) => {
    setMessageReg(reg);
    setMessageText(reg.automatedMessage || '');
    setLanguage('fr');
    setHospitableStatus(null);
    setCopiedMsg(false);
  };

  const handleLanguageChange = async (newLang) => {
    setLanguage(newLang);
    if (!messageReg) return;

    try {
      const data = await api('/api/police/message/preview', {
        method: 'POST',
        body: { registrationId: messageReg.id, propertyId: property?.id, language: newLang }
      });
      if (data.message) {
        setMessageText(data.message);
      }
    } catch (err) {
      console.error("Error previewing language:", err);
    }
  };

  const handleSendHospitable = async () => {
    setSendingHospitable(true);
    setHospitableStatus(null);

    try {
      await api('/api/police/message/send', {
        method: 'POST',
        body: { registrationId: messageReg.id, messageText, channel: 'hospitable' }
      });

      setHospitableStatus({
        success: true,
        msg: "✅ Message envoyé automatiquement au voyageur sur Hospitable (Airbnb / Booking) !"
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      setHospitableStatus({
        success: false,
        msg: `❌ ${err.message}`
      });
    } finally {
      setSendingHospitable(false);
    }
  };

  const handleWhatsAppSend = () => {
    const cleanPhone = (messageReg.guestPhone || '').replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
    window.open(url, '_blank');

    // Mark sent
    api('/api/police/message/send', {
      method: 'POST',
      body: { registrationId: messageReg.id, messageText, channel: 'whatsapp' }
    })
      .then(() => { if (onRefresh) onRefresh(); })
      .catch(err => console.error('Error marking message as sent:', err));
  };

  const copyMessage = () => {
    navigator.clipboard.writeText(messageText);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2000);
  };

  const filtered = registrations.filter(r => {
    const nameMatch = (r.guestName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const codeMatch = (r.accessCode || '').toLowerCase().includes(searchTerm.toLowerCase());
    return nameMatch || codeMatch;
  });

  return (
    <div className="police-dashboard-container">
      {/* Title & Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.8rem' }}>🇲🇦</span>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>
              Fiche Individuelle de Police (Maroc)
            </h2>
          </div>
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Automatisation de la déclaration obligatoire de séjour (DGSN) & portail d'enregistrement voyageur.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onOpenCodeGenerator}
            className="btn btn-rausch"
          >
            <UserPlus size={18} />
            <span>Générer un Code Voyageur</span>
          </button>

          {features.batchExport && (
            <div className="export-bar" title="Télécharger en un zip tous les bulletins complétés dont l'arrivée est dans la période">
              <span className="text-xs text-muted" style={{ fontWeight: 600 }}>Export pour les autorités :</span>
              <input type="date" className="form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }} value={exportFrom} onChange={e => setExportFrom(e.target.value)} />
              <span className="text-xs text-muted">→</span>
              <input type="date" className="form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }} value={exportTo} onChange={e => setExportTo(e.target.value)} />
              <label className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={exportAll} onChange={e => setExportAll(e.target.checked)} /> tous les logements
              </label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={exportZip}>📦 Exporter (zip)</button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="police-stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: '#FDF2F4', color: '#81172E' }}>
            <FileText size={24} />
          </div>

          <div>
            <div className="stat-num">{registrations.length}</div>
            <div className="stat-label">Total Dossiers</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: '#EAF8EB', color: '#008A05' }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <div className="stat-num">{completedCount}</div>
            <div className="stat-label">Fiches Signées & Prêtes</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: '#FFF4E6', color: '#C25E00' }}>
            <Clock size={24} />
          </div>
          <div>
            <div className="stat-num">{pendingCount}</div>
            <div className="stat-label">En Attente Voyageur</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
            <MessageSquare size={24} />
          </div>
          <div>
            <div className="stat-num">{sentMessagesCount}</div>
            <div className="stat-label">Messages Automatisés Envoyés</div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card">
        {/* Search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <input 
            type="text" 
            placeholder="Rechercher par nom de voyageur ou code..."
            className="form-input"
            style={{ maxWidth: 360 }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="text-xs text-muted font-semibold">
            {filtered.length} enregistrement(s)
          </span>
        </div>

        {/* Table */}
        <div className="table-responsive">
          <table className="airbnb-table">
            <thead>
              <tr>
                <th>Code d'accès</th>
                <th>Voyageur</th>
                <th>Statut Fiche</th>
                <th>Message Automatisé</th>
                <th>Pièce & Signature</th>
                <th style={{ textAlign: 'right' }}>Actions Police & Messages</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px 0', color: '#717171' }}>
                    Aucun dossier de police trouvé. Cliquez sur "Générer un Code Voyageur" pour commencer.
                  </td>
                </tr>
              ) : (
                filtered.map((reg) => {
                  const checkinUrl = `${window.location.origin}/?guestCode=${reg.accessCode}`;

                  return (
                    <tr key={reg.id}>
                      {/* Code */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="code-badge">{reg.accessCode}</span>
                          <button 
                            type="button"
                            className="btn btn-secondary btn-icon btn-sm"
                            title="Copier le code"
                            onClick={() => copyToClipboard(reg.accessCode, `code_${reg.id}`)}
                          >
                            {copiedCode === `code_${reg.id}` ? <Check size={12} color="#008A05" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>

                      {/* Guest name */}
                      <td>
                        <div className="font-bold">{reg.guestName}</div>
                        {reg.guestDetails?.nationality && (
                          <div className="text-xs text-muted">
                            Nationalité: {reg.guestDetails.nationality}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        {reg.status === 'completed' ? (
                          <span className="status-pill status-completed">
                            <Check size={12} /> Signé & Validé
                          </span>
                        ) : (
                          <span className="status-pill status-pending">
                            <Clock size={12} /> En attente
                          </span>
                        )}
                      </td>

                      {/* Message Delivery Status */}
                      <td>
                        {reg.messageSentAt ? (
                          <span 
                            className="status-pill" 
                            style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', cursor: 'pointer' }}
                            onClick={() => openMessageModal(reg)}
                            title={`Envoyé le ${new Date(reg.messageSentAt).toLocaleString('fr-FR')}`}
                          >
                            <Check size={12} /> Envoyé
                          </span>
                        ) : (
                          <span 
                            className="status-pill" 
                            style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA', cursor: 'pointer' }}
                            onClick={() => openMessageModal(reg)}
                            title="Cliquez pour envoyer le message complet"
                          >
                            <Clock size={12} /> À envoyer
                          </span>
                        )}
                      </td>

                      {/* Proofs */}
                      <td>
                        {reg.status === 'completed' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {reg.idDocumentPath && (
                              <span style={{ fontSize: '0.75rem', background: '#F0F9FF', color: '#0284C7', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                🪪 ID joint
                              </span>
                            )}
                            {reg.signaturePath && (
                              <span style={{ fontSize: '0.75rem', background: '#F0FDF4', color: '#16A34A', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                ✍️ Signé
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted">Non soumis</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          {/* Automated Message Modal Trigger */}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openMessageModal(reg)}
                            title="Ouvrir le message automatisé avec le code et le lien"
                            style={{ color: '#4F46E5', borderColor: '#C7D2FE', background: '#EEF2FF' }}
                          >
                            <MessageSquare size={14} />
                            <span>Message</span>
                          </button>

                          {/* Copy link */}
                          <button 
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => copyToClipboard(checkinUrl, `link_${reg.id}`)}
                            title="Copier le lien direct du portail voyageur"
                          >
                            {copiedCode === `link_${reg.id}` ? <Check size={14} color="#008A05" /> : <Copy size={14} />}
                            <span>Lien</span>
                          </button>

                          {/* Test Portal as this guest */}
                          {reg.status === 'pending' && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => onOpenGuestPortalWithCode(reg.accessCode)}
                              title="Tester ou remplir directement la fiche pour ce voyageur"
                            >
                              Remplir
                            </button>
                          )}

                          {/* Download Police PDF */}
                          {reg.status === 'completed' && (
                            <a 
                              href={`/api/police/pdf/${reg.id}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="btn btn-rausch btn-sm"
                              title="Télécharger la Fiche de Police officielle au format PDF pour les autorités"
                            >
                              <Download size={14} />
                              <span>PDF</span>
                            </a>
                          )}

                          {/* View details */}
                          {reg.status === 'completed' && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-icon btn-sm"
                              onClick={() => setPreviewReg(reg)}
                              title="Aperçu des informations"
                            >
                              <Eye size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Automated Message Modal */}
      {messageReg && (
        <div className="modal-overlay" onClick={() => setMessageReg(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
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
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem' }}>Message d'Enregistrement - {messageReg.guestName}</h3>
                  <p className="text-xs text-muted">
                    Code: <strong style={{ color: '#81172E' }}>{messageReg.accessCode}</strong>

                    {messageReg.messageSentAt ? (
                      <span style={{ marginLeft: 8, color: '#16A34A', fontWeight: 600 }}>
                        • Envoyé le {new Date(messageReg.messageSentAt).toLocaleString('fr-FR')}
                      </span>
                    ) : (
                      <span style={{ marginLeft: 8, color: '#D97706', fontWeight: 600 }}>
                        • Pas encore envoyé
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button type="button" className="btn btn-secondary btn-icon" onClick={() => setMessageReg(null)}>✕</button>
            </div>

            <div className="modal-body">
              {/* Language Selector */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className="text-xs text-muted font-bold uppercase">Langue du message</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { id: 'fr', label: '🇫🇷 Français' },
                    { id: 'en', label: '🇬🇧 English' },
                    { id: 'bilingual', label: '🌐 Bilingue' }
                  ].map(l => (
                    <button
                      key={l.id}
                      type="button"
                      className={`btn ${language === l.id ? 'btn-rausch' : 'btn-secondary'} btn-xs`}
                      onClick={() => handleLanguageChange(l.id)}
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message text area */}
              <textarea
                rows={9}
                className="form-input"
                style={{
                  fontFamily: 'inherit',
                  fontSize: '0.84rem',
                  lineHeight: '1.45',
                  background: '#FFFFFF',
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 14,
                  resize: 'vertical'
                }}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />

              {/* Feedback status */}
              {hospitableStatus && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  marginBottom: 14,
                  background: hospitableStatus.success ? '#F0FDF4' : '#FEF2F2',
                  border: `1px solid ${hospitableStatus.success ? '#BBF7D0' : '#FECACA'}`,
                  color: hospitableStatus.success ? '#166534' : '#991B1B'
                }}>
                  {hospitableStatus.msg}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={copyMessage}
                  style={{ justifyContent: 'center' }}
                >
                  {copiedMsg ? <Check size={14} color="#008A05" /> : <Copy size={14} />}
                  <span>{copiedMsg ? "Copié !" : "Copier le texte"}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleWhatsAppSend}
                  style={{ color: '#16A34A', borderColor: '#BBF7D0', background: '#F0FDF4', justifyContent: 'center' }}
                >
                  <MessageSquare size={14} />
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  className="btn btn-rausch btn-sm"
                  onClick={handleSendHospitable}
                  disabled={sendingHospitable}
                  style={{ background: '#4F46E5', borderColor: '#4F46E5', justifyContent: 'center' }}
                >
                  <Zap size={14} />
                  <span>{sendingHospitable ? "Envoi..." : "Envoyer Hospitable"}</span>
                </button>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setMessageReg(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guest Details Preview Modal */}
      {previewReg && (
        <div className="modal-overlay" onClick={() => setPreviewReg(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck color="#008A05" size={20} />
                <h3 style={{ fontSize: '1.2rem' }}>Fiche de Police - {previewReg.guestName}</h3>
              </div>
              <button 
                type="button" 
                className="btn btn-secondary btn-icon" 
                onClick={() => setPreviewReg(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
                <div>
                  <div className="text-xs text-muted font-semibold">NATIONALITÉ</div>
                  <div className="font-bold">{previewReg.guestDetails?.nationality || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted font-semibold">DATE DE NAISSANCE</div>
                  <div className="font-bold">{previewReg.guestDetails?.birthDate || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted font-semibold">LIEU DE NAISSANCE</div>
                  <div className="font-bold">{previewReg.guestDetails?.birthPlace || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted font-semibold">TYPE DOCUMENT</div>
                  <div className="font-bold">{previewReg.guestDetails?.idType === 'cin' ? 'CIN Marocaine' : 'Passeport'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted font-semibold">N° PIÈCE</div>
                  <div className="font-bold">{previewReg.guestDetails?.idNumber || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted font-semibold">PROFESSION</div>
                  <div className="font-bold">{previewReg.guestDetails?.profession || "-"}</div>
                </div>
              </div>

              {/* Photos & Signature Preview */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                <div>
                  <div className="text-xs text-muted font-semibold" style={{ marginBottom: 6 }}>
                    PIÈCE D'IDENTITÉ UPLOADÉE
                  </div>
                  {previewReg.idDocumentPath ? (
                    <img 
                      src={`/uploads/${previewReg.idDocumentPath.split(/[/\\]/).pop()}`} 
                      alt="ID Document" 
                      className="upload-preview-img"
                    />
                  ) : (
                    <div style={{ padding: 20, background: '#F7F7F7', textAlign: 'center', borderRadius: 8, fontSize: '0.8rem' }}>
                      Non disponible
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs text-muted font-semibold" style={{ marginBottom: 6 }}>
                    SIGNATURE DU VOYAGEUR
                  </div>
                  {previewReg.signaturePath ? (
                    <div style={{ background: '#FFF', border: '1px solid #EBEBEB', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                      <img 
                        src={`/uploads/${previewReg.signaturePath.split(/[/\\]/).pop()}`} 
                        alt="Signature" 
                        style={{ maxHeight: 100, maxWidth: '100%' }}
                      />
                      <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                        Signé le {new Date(previewReg.completedAt).toLocaleString('fr-FR')}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 20, background: '#F7F7F7', textAlign: 'center', borderRadius: 8, fontSize: '0.8rem' }}>
                      Non disponible
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <a 
                href={`/api/police/pdf/${previewReg.id}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-rausch"
              >
                <Download size={16} />
                <span>Télécharger la Fiche de Police Officielle (PDF)</span>
              </a>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setPreviewReg(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
