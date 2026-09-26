import React, { useState } from 'react';
import { 
  Key, 
  Copy, 
  Check, 
  MessageSquare, 
  ExternalLink, 
  ShieldCheck, 
  UserCheck, 
  Send, 
  Zap, 
  Globe, 
  Sparkles
} from 'lucide-react';
import { api } from '../api';

export default function GenerateCodeModal({ 
  property, 
  bookings, 
  initialBooking, 
  onClose, 
  onCreatedCode, 
  onOpenPortalWithCode 
}) {
  const [guestName, setGuestName] = useState(initialBooking?.guestName || '');
  const [guestPhone, setGuestPhone] = useState(initialBooking?.guestPhone || '');
  const [selectedBookingId, setSelectedBookingId] = useState(initialBooking?.id || '');
  const [language, setLanguage] = useState('fr'); // 'fr' | 'en' | 'bilingual'
  const [createdReg, setCreatedReg] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingHospitable, setSendingHospitable] = useState(false);
  const [hospitableStatus, setHospitableStatus] = useState(null); // { success: boolean, msg: string }


  const handleBookingSelect = (e) => {
    const bId = e.target.value;
    setSelectedBookingId(bId);
    const b = bookings.find(item => item.id === bId);
    if (b) {
      setGuestName(b.guestName || '');
      setGuestPhone(b.guestPhone || '');
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await api('/api/police/codes', {
        method: 'POST',
        body: {
          propertyId: property?.id,
          guestName: guestName || 'Voyageur Invité',
          bookingId: selectedBookingId || null,
          guestPhone: guestPhone || '',
          language
        }
      });
      setCreatedReg(data);
      setMessageText(data.automatedMessage || '');
      if (onCreatedCode) onCreatedCode(data);
    } catch (err) {
      alert("Erreur lors de la génération du code: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Change language dynamically
  const handleChangeLanguage = async (newLang) => {
    setLanguage(newLang);
    if (!createdReg) return;

    try {
      const data = await api('/api/police/message/preview', {
        method: 'POST',
        body: {
          registrationId: createdReg.id,
          bookingId: selectedBookingId || createdReg.bookingId,
          propertyId: property?.id,
          guestName: guestName || createdReg.guestName,
          language: newLang
        }
      });
      if (data.message) {
        setMessageText(data.message);
      }
    } catch (err) {
      console.error("Error regenerating message language:", err);
    }
  };

  const guestLink = createdReg ? `${window.location.origin}/?guestCode=${createdReg.accessCode}` : '';

  const copyLink = () => {
    navigator.clipboard.writeText(guestLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyMessage = () => {
    navigator.clipboard.writeText(messageText);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2000);
  };

  // Send via Hospitable API
  const handleSendViaHospitable = async () => {
    setSendingHospitable(true);
    setHospitableStatus(null);

    try {
      const data = await api('/api/police/message/send', {
        method: 'POST',
        body: {
          registrationId: createdReg.id,
          messageText,
          channel: 'hospitable'
        }
      });

      setHospitableStatus({
        success: true,
        msg: "✅ Message automatisé envoyé avec succès au voyageur sur Hospitable (Airbnb / Booking) !"
      });
      if (onCreatedCode) {
        onCreatedCode({ ...createdReg, messageSentAt: data.messageSentAt });
      }
    } catch (err) {
      setHospitableStatus({
        success: false,
        msg: `❌ ${err.message}`
      });
    } finally {
      setSendingHospitable(false);
    }
  };

  // Open WhatsApp with full message preloaded
  const handleOpenWhatsApp = () => {
    const cleanPhone = (guestPhone || '').replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
    window.open(url, '_blank');

    // Mark as sent in system
    api('/api/police/message/send', {
      method: 'POST',
      body: { registrationId: createdReg.id, messageText, channel: 'whatsapp' }
    })
      .then(data => {
        if (onCreatedCode) onCreatedCode({ ...createdReg, messageSentAt: data.messageSentAt });
      })
      .catch(err => console.error('Error marking message as sent:', err));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#FDF2F4',
              color: '#81172E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Key size={20} />
            </div>

            <div>
              <h3 style={{ fontSize: '1.25rem' }}>Générateur de Portail & Message Automatique</h3>
              <p className="text-xs text-muted">Création instantanée du code d'accès et du message d'accueil personnalisé</p>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {!createdReg ? (
            <form onSubmit={handleGenerate}>
              {/* Optional link to existing booking */}
              {bookings && bookings.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Lier à une réservation existante (Optionnel)</label>
                  <select
                    className="form-input"
                    value={selectedBookingId}
                    onChange={handleBookingSelect}
                  >
                    <option value="">-- Sélectionner ou créer un nouveau code indépendant --</option>
                    {bookings.filter(b => b.source !== 'blocked').map(b => (
                      <option key={b.id} value={b.id}>
                        {b.guestName} ({b.source.toUpperCase()}) : du {b.checkIn} au {b.checkOut}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Nom complet du voyageur *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ex: Sophie Martin"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Numéro WhatsApp du voyageur (avec indicatif)</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="Ex: +33 6 12 34 56 78 ou +212 6 00 00 00 00"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Langue du message automatisé</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { id: 'fr', label: '🇫🇷 Français' },
                    { id: 'en', label: '🇬🇧 English' },
                    { id: 'bilingual', label: '🌐 Bilingue (FR + EN)' }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLanguage(item.id)}
                      className={`btn ${language === item.id ? 'btn-rausch' : 'btn-secondary'} btn-sm`}
                      style={{ flex: 1, padding: '8px 12px' }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: '#FDF2F4', border: '1px solid #F5D5DC', borderRadius: 10, padding: 14, marginTop: 16 }}>
                <p style={{ fontSize: '0.82rem', color: '#484848', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color="#81172E" />
                  <span>Le système va générer le <strong>code 6 chiffres</strong>, le <strong>lien direct sécurisé</strong>, et préparer le <strong>message complet prêt à l'envoi</strong>.</span>
                </p>
              </div>

              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                <button type="submit" className="btn btn-rausch" disabled={loading}>
                  {loading ? "Génération..." : "Générer le Portail & le Message"}
                </button>
              </div>
            </form>
          ) : (
            <div>
              {/* Access Code & Link Header */}
              <div style={{ 
                background: '#F8FAFC', 
                border: '1px solid #E2E8F0', 
                borderRadius: 14, 
                padding: '16px 20px', 
                marginBottom: 18,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Code d'accès voyageur
                  </div>
                  <div style={{
                    fontSize: '2rem',
                    fontWeight: 900,
                    letterSpacing: '5px',
                    color: '#81172E',
                    fontFamily: 'monospace'
                  }}>
                    {createdReg.accessCode}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm"
                    onClick={copyLink}
                    title="Copier le lien direct"
                  >
                    {copiedLink ? <Check size={14} color="#008A05" /> : <Copy size={14} />}
                    <span>{copiedLink ? "Lien copié !" : "Copier le lien"}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      onOpenPortalWithCode(createdReg.accessCode);
                      onClose();
                    }}
                  >
                    <UserCheck size={14} />
                    <span>Tester le portail</span>
                  </button>
                </div>
              </div>

              {/* Language Switcher for Message */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={16} color="#81172E" />
                  <span>Message Complet Automatisé :</span>
                </label>


                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { id: 'fr', label: 'FR' },
                    { id: 'en', label: 'EN' },
                    { id: 'bilingual', label: 'FR + EN' }
                  ].map(l => (
                    <button
                      key={l.id}
                      type="button"
                      className={`btn ${language === l.id ? 'btn-rausch' : 'btn-secondary'} btn-xs`}
                      onClick={() => handleChangeLanguage(l.id)}
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Full Message Box */}
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <textarea
                  rows={8}
                  className="form-input"
                  style={{
                    fontFamily: 'inherit',
                    fontSize: '0.82rem',
                    lineHeight: '1.45',
                    background: '#FFFFFF',
                    border: '1px solid #D1D5DB',
                    borderRadius: 10,
                    padding: 12,
                    resize: 'vertical'
                  }}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                />
              </div>

              {/* Hospitable Send Feedback */}
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

              {/* Action Buttons Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {/* 1. Copy Message */}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={copyMessage}
                  style={{ justifyContent: 'center' }}
                >
                  {copiedMsg ? <Check size={14} color="#008A05" /> : <Copy size={14} />}
                  <span>{copiedMsg ? "Copié !" : "Copier Message"}</span>
                </button>

                {/* 2. WhatsApp Share */}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleOpenWhatsApp}
                  style={{ color: '#16A34A', borderColor: '#BBF7D0', background: '#F0FDF4', justifyContent: 'center' }}
                >
                  <MessageSquare size={14} />
                  <span>WhatsApp</span>
                </button>

                {/* 3. Send via Hospitable */}
                <button
                  type="button"
                  className="btn btn-rausch btn-sm"
                  onClick={handleSendViaHospitable}
                  disabled={sendingHospitable}
                  style={{ background: '#4F46E5', borderColor: '#4F46E5', justifyContent: 'center' }}
                >
                  <Zap size={14} />
                  <span>{sendingHospitable ? "Envoi..." : "Envoyer Hospitable"}</span>
                </button>
              </div>

              <div style={{ marginTop: 20, textAlign: 'center' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                  Fermer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
