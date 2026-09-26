import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ArrowRight, 
  ArrowLeft, 
  Upload, 
  CheckCircle2, 
  Sparkles, 
  Camera, 
  User, 
  UserPlus, 
  Trash2,
  PenTool,
  Home, 
  Check, 
  AlertCircle, 
  Users,
  Key,
  Car,
  MapPin,
  Phone,
  MessageCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import SignaturePad from './SignaturePad';
import { api } from '../api';

/**
 * Shrink a photo before upload: phones produce 5-12 MB images, the server only needs
 * ~1600px for OCR and hosting platforms cap request bodies (Vercel: 4.5 MB).
 */
async function compressImage(file, { maxSize = 1600, quality = 0.85 } = {}) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (err) {
    console.warn('Image compression skipped:', err);
    return file;
  }
}

export default function GuestCheckin({ initialCode, onExitToHost }) {
  const [step, setStep] = useState(1);
  const [code, setCode] = useState(initialCode || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [propertyData, setPropertyData] = useState(null);
  const [bookingData, setBookingData] = useState(null);
  const [offer, setOffer] = useState(null); // partner recommendation shown on the final page

  // List of guests: each has a fullName, document details, and photo
  const [guests, setGuests] = useState([
    {
      id: 'g_1',
      fullName: '',
      idDocumentPath: '',
      idPreview: null,
      idNumber: '',
      birthDate: '',
      birthPlace: '',
      nationality: '',
      idType: 'passport',
      ocrScanned: false,
      ocrReadable: false,
      ocrStatus: 'idle', // idle | scanning | readable | unreadable
      isScanning: false
    }
  ]);

  const [signatureData, setSignatureData] = useState(null);

  // Verify access code
  useEffect(() => {
    if (initialCode) {
      verifyCode(initialCode);
    }
  }, [initialCode]);

  const verifyCode = async (codeToVerify) => {
    const cleanCode = (codeToVerify || code).trim().toUpperCase();
    if (!cleanCode) {
      setError("Veuillez saisir votre code d'accès");
      return;
    }
    setLoading(true);
    setError('');

    try {
      const data = await api(`/api/police/verify/${encodeURIComponent(cleanCode)}`);

      setCode(cleanCode);
      setPropertyData(data.property);
      setBookingData(data.booking);
      setOffer(data.offer || null);

      // Pre-fill primary guest full name if host provided it
      if (data.guestName && !guests[0].fullName) {
        setGuests(prev => {
          const updated = [...prev];
          updated[0].fullName = data.guestName;
          return updated;
        });
      }

      setStep(2); // Go directly to Guest Names step
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add another guest (e.g. Guest 2, Guest 3, etc.)
  const handleAddGuest = () => {
    setGuests(prev => [
      ...prev,
      {
        id: `g_${Date.now()}`,
        fullName: '',
        idDocumentPath: '',
        idPreview: null,
        idNumber: '',
        birthDate: '',
        birthPlace: '',
        nationality: '',
        idType: 'passport',
        ocrScanned: false,
        ocrReadable: false,
        ocrStatus: 'idle',
        isScanning: false
      }
    ]);
  };

  // Remove guest
  const handleRemoveGuest = (index) => {
    if (guests.length <= 1) return;
    setGuests(prev => prev.filter((_, i) => i !== index));
  };

  // Update guest full name
  const handleNameChange = (index, value) => {
    setGuests(prev => {
      const updated = [...prev];
      updated[index].fullName = value;
      return updated;
    });
  };

  // Upload & OCR Scan for a specific guest
  const handleScanForGuest = async (index, file) => {
    if (!file) return;

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = () => {
      setGuests(prev => {
        const updated = [...prev];
        updated[index].idPreview = reader.result;
        return updated;
      });
    };
    reader.readAsDataURL(file);

    // Set loading for this specific guest
    setGuests(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], isScanning: true, ocrStatus: 'scanning' };
      return updated;
    });
    setError('');

    try {
      const uploadFile = await compressImage(file);
      const uploadData = new FormData();
      uploadData.append('idDocument', uploadFile);
      uploadData.append('code', code.trim().toUpperCase());

      const resJson = await api('/api/police/ocr', { method: 'POST', formData: uploadData });

      const d = (resJson.success && resJson.data) || {};
      // "Readable" = the police form can be filled from the scan: an ID number plus a birth date or surname.
      const readable = Boolean(d.idNumber && (d.birthDate || d.lastName));

      setGuests(prev => {
        const updated = [...prev];
        const curr = updated[index];
        const extractedFullName = `${d.firstName || ''} ${d.lastName || ''}`.trim();

        updated[index] = {
          ...curr,
          fullName: curr.fullName || extractedFullName,
          idNumber: d.idNumber || curr.idNumber,
          birthDate: d.birthDate || curr.birthDate,
          birthPlace: d.birthPlace || curr.birthPlace,
          nationality: d.nationality || curr.nationality,
          idType: d.documentType === 'cin' ? 'cin' : 'passport',
          idDocumentPath: resJson.filePath || curr.idDocumentPath,
          ocrScanned: true,
          ocrReadable: readable,
          ocrStatus: readable ? 'readable' : 'unreadable',
          isScanning: false
        };
        return updated;
      });
    } catch (err) {
      console.warn("OCR recognition error:", err);
      setError(err.message || "Lecture du document impossible. Reprenez la photo.");
      setGuests(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], isScanning: false, ocrStatus: updated[index].idDocumentPath ? 'unreadable' : 'idle' };
        return updated;
      });
    }
  };

  // Manual correction of the fields the police form needs (fallback when the OCR is unreadable)
  const handleGuestFieldChange = (index, field, value) => {
    setGuests(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // A guest is ready for the signature step once the scan is finished AND the data is usable
  const isGuestReady = (g) =>
    !g.isScanning && Boolean(g.idDocumentPath) && (g.ocrReadable || Boolean(g.idNumber && g.birthDate));
  const isScanningAny = guests.some(g => g.isScanning);
  const allGuestsReady = guests.every(isGuestReady);
  const missingGuests = guests.filter(g => !isGuestReady(g));

  // Submit all guests with 1 single signature
  const handleSubmitAll = async () => {
    if (!signatureData) {
      setError("Veuillez apposer votre signature numérique ci-dessous.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Split full names into firstName & lastName for Moroccan Police official standard
      const formattedGuests = guests.map(g => {
        const parts = (g.fullName || '').trim().split(' ');
        const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0] || 'Voyageur';
        const firstName = parts.length > 1 ? parts.slice(0, parts.length - 1).join(' ') : '';
        // Only the fields the server needs: never send the base64 image preview.
        return {
          fullName: g.fullName,
          lastName,
          firstName,
          idNumber: g.idNumber,
          birthDate: g.birthDate,
          birthPlace: g.birthPlace,
          nationality: g.nationality,
          idType: g.idType,
          idDocumentPath: g.idDocumentPath,
          ocrReadable: Boolean(g.ocrReadable),
          address: g.birthPlace || g.nationality || 'Touriste International'
        };
      });

      const payload = {
        guests: formattedGuests,
        totalGuests: formattedGuests.length,
        commonStay: {
          arrivalDate: bookingData?.checkIn || new Date().toISOString().split('T')[0],
          departureDate: bookingData?.checkOut || new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
          comingFrom: formattedGuests[0]?.birthPlace || 'Étranger',
          goingTo: 'Maroc'
        }
      };

      const submitForm = new FormData();
      submitForm.append('code', code.trim().toUpperCase());
      submitForm.append('guestData', JSON.stringify(payload));
      submitForm.append('signatureData', signatureData);

      await api('/api/police/submit', { method: 'POST', formData: submitForm });

      setStep(5); // Thank-you screen (the generated document stays with the host, never offered to the guest)

      try {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch (e) {}

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="guest-portal-container">
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 560, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img 
            src="/claro.png" 
            alt="Claro" 
            style={{ height: 26, width: 'auto', objectFit: 'contain' }} 
          />
          <div style={{ width: 1, height: 20, background: '#E5E7EB' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="22" height="22" viewBox="0 0 32 32" fill="#81172E" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 1c2.008 0 3.463.963 4.751 3.269l.533 1.025c1.954 3.83 4.14 8.784 5.394 13.064 1.258 4.293.992 7.788-.737 9.873C24.195 30.334 21.436 31 18.067 31c-2.316 0-4.32-.47-6.07-1.402-1.748.932-3.753 1.402-6.064 1.402-3.37 0-6.128-.666-7.874-2.769-1.73-2.085-1.996-5.58-.738-9.873 1.254-4.28 3.44-9.234 5.394-13.064l.533-1.025C4.537 1.963 5.992 1 8 1c2.25 0 3.882 1.246 5.25 3.52C14.618 2.246 16.25 1 18.5 1zm-.5 18.5c-2.209 0-4 1.791-4 4s1.791 4 4 4 4-1.791 4-4-1.791-4-4-4z"/>
            </svg>
            <span style={{ fontWeight: 800, color: '#81172E', fontSize: '1rem' }}>airbnb</span>
          </div>
          <span style={{ fontSize: '0.72rem', background: '#FDF2F4', color: '#81172E', border: '1px solid #F5D5DC', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
            Check-in en ligne
          </span>
        </div>


        {onExitToHost && (
          <button 
            type="button" 
            onClick={onExitToHost} 
            className="btn btn-secondary btn-sm btn-pill"
          >
            Mode Hôte
          </button>
        )}
      </div>

      {/* Main Card */}
      <div className="guest-wizard-card" style={{ maxWidth: 560 }}>
        {/* Progress bar */}
        <div className="wizard-progress">
          <div 
            className="wizard-progress-bar" 
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        {/* Error Alert */}
        {error && step !== 1 && (
          <div style={{
            margin: '16px 24px 0 24px',
            background: '#FEE2E2',
            border: '1px solid #FCA5A5',
            color: '#B91C1C',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* ================================================================
            STEP 1: CODE VERIFICATION
            ================================================================ */}
        {step === 1 && (
          <div className="wizard-step-body">
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: '#FDF2F4',
                color: '#81172E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <ShieldCheck size={32} />
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Enregistrement Voyageur</h2>
              <p className="text-muted text-sm" style={{ marginTop: 4 }}>
                Enregistrement des voyageurs avant l'arrivée (obligatoire au Maroc)
              </p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); verifyCode(); }}>
              <div className="form-group">
                <label className="form-label">Code d'accès de votre réservation</label>
                <div style={{ position: 'relative' }}>
                  <Key size={18} style={{ position: 'absolute', left: 14, top: 14, color: '#717171' }} />
                  <input 
                    type="text" 
                    required
                    maxLength={10}
                    placeholder="Ex: MAR892 ou 884920"
                    className="form-input"
                    style={{ paddingLeft: 42, fontSize: '1.1rem', letterSpacing: '2px', fontWeight: 700, textTransform: 'uppercase' }}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              {error && (
                <div style={{ color: '#E00B41', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-rausch" 
                style={{ width: '100%', padding: '14px' }}
                disabled={loading}
              >
                {loading ? "Vérification..." : "Accéder à mon enregistrement"}
                <ArrowRight size={18} />
              </button>
            </form>
          </div>
        )}

        {/* ================================================================
            STEP 2: GUEST NAMES ONLY (Zero typing address!)
            ================================================================ */}
        {step === 2 && (
          <div className="wizard-step-body">
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Voyageurs du séjour</h3>
              <p className="text-muted text-sm" style={{ marginTop: 4 }}>
                Indiquez le nom complet des personnes qui séjournent dans le logement
              </p>
            </div>

            {/* List of Guests */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {guests.map((g, idx) => (
                <div 
                  key={g.id} 
                  style={{
                    background: '#FAFAFA',
                    border: '1px solid #EBEBEB',
                    borderRadius: 12,
                    padding: '14px 16px',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.88rem', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={15} color="#81172E" />
                      <span>{idx === 0 ? 'Voyageur 1 (Titulaire de réservation)' : `Voyageur ${idx + 1}`}</span>
                    </label>

                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveGuest(idx)}
                        className="btn btn-secondary btn-icon btn-sm"
                        title="Supprimer ce voyageur"
                        style={{ color: '#DC2626' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    className="form-input"
                    placeholder="Nom et Prénom complet (Ex: Sophie Martin)"
                    value={g.fullName}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    autoFocus={idx === 0 && !g.fullName}
                    required
                  />
                </div>
              ))}
            </div>

            {/* Add another guest button */}
            <button
              type="button"
              onClick={handleAddGuest}
              className="btn btn-outline"
              style={{
                width: '100%',
                marginTop: 16,
                borderColor: '#81172E',
                color: '#81172E',
                padding: '12px'
              }}
            >
              <UserPlus size={16} />
              <span>+ Ajouter un autre voyageur (Voyageur {guests.length + 1})</span>
            </button>

            {/* Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
              <button 
                type="button" 
                onClick={() => setStep(1)} 
                className="btn btn-secondary"
              >
                <ArrowLeft size={16} />
                <span>Retour</span>
              </button>

              <button 
                type="button" 
                onClick={() => {
                  const empty = guests.find(g => !g.fullName.trim());
                  if (empty) {
                    setError("Veuillez renseigner le nom complet de chaque voyageur.");
                    return;
                  }
                  setError('');
                  setStep(3); // Go to Document Scan Step
                }} 
                className="btn btn-rausch"
              >
                <span>Scanner les documents ({guests.length})</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================
            STEP 3: SCAN & UPLOAD DOCUMENTS (ONE CARD PER GUEST)
            ================================================================ */}
        {step === 3 && (
          <div className="wizard-step-body">
            <div style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 4 }}>
                Pièces d'identité
              </h3>
              <p className="text-muted text-sm">
                Pour chaque voyageur, prenez en photo le passeport ou la carte nationale (CIN), ou importez une photo depuis votre galerie ou vos fichiers. Les informations sont lues automatiquement.
              </p>
            </div>

            {/* Cards for each guest to scan */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {guests.map((g, idx) => (
                <div 
                  key={g.id}
                  style={{
                    background: isGuestReady(g) ? '#F0FDF4' : g.ocrStatus === 'unreadable' ? '#FFF7ED' : g.isScanning ? '#F8FAFC' : '#FDF2F4',
                    border: `1.5px ${isGuestReady(g) ? 'solid #86EFAC' : g.ocrStatus === 'unreadable' ? 'solid #FDBA74' : g.isScanning ? 'solid #CBD5E1' : 'dashed #81172E'}`,
                    borderRadius: 14,
                    padding: 16,
                    transition: 'background 0.2s, border-color 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div className="font-bold text-base" style={{ color: '#222222' }}>
                        {idx + 1}. {g.fullName || `Voyageur ${idx + 1}`}
                      </div>
                      <div className="text-xs" style={{ color: g.isScanning ? '#475569' : g.ocrStatus === 'unreadable' && !isGuestReady(g) ? '#C2410C' : isGuestReady(g) ? '#166534' : '#717171', fontWeight: g.isScanning ? 600 : 400 }}>
                        {g.isScanning
                          ? "⏳ Lecture du document en cours…"
                          : isGuestReady(g)
                            ? "Document lu avec succès ✅"
                            : g.ocrStatus === 'unreadable'
                              ? "⚠️ Document illisible : reprenez la photo (à plat, bien éclairée, sans reflet) ou complétez ci-dessous"
                              : "Passeport ou Carte Nationale requis"}
                      </div>
                    </div>

                    {/* Camera (phone) + file/gallery upload (phone gallery, desktop files) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', flex: '0 0 auto' }}>
                      <label
                        className={`btn ${g.ocrScanned ? 'btn-secondary' : 'btn-rausch'} btn-sm`}
                        style={{ cursor: g.isScanning ? 'not-allowed' : 'pointer', justifyContent: 'flex-start' }}
                        title="Prendre une photo avec l'appareil photo"
                      >
                        <Camera size={15} />
                        <span>{g.isScanning ? 'Lecture...' : g.ocrScanned ? 'Reprendre la photo' : 'Prendre une photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={g.isScanning}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) handleScanForGuest(idx, e.target.files[0]);
                            e.target.value = '';
                          }}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <label
                        className="btn btn-secondary btn-sm"
                        style={{ cursor: g.isScanning ? 'not-allowed' : 'pointer', justifyContent: 'flex-start' }}
                        title="Choisir une image depuis la galerie ou les fichiers"
                      >
                        <Upload size={15} />
                        <span>Importer (galerie / fichier)</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/*"
                          disabled={g.isScanning}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) handleScanForGuest(idx, e.target.files[0]);
                            e.target.value = '';
                          }}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Scanned Image Preview */}
                  {g.idPreview && (
                    <div style={{ textAlign: 'center', marginTop: 10, background: '#FFF', borderRadius: 8, padding: 8, border: '1px solid #EBEBEB' }}>
                      <img 
                        src={g.idPreview} 
                        alt="Aperçu document" 
                        style={{ maxHeight: 110, maxWidth: '100%', borderRadius: 6 }}
                      />
                    </div>
                  )}

                  {/* Manual completion when the scan could not be read */}
                  {g.ocrStatus === 'unreadable' && !g.isScanning && (
                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>N° passeport / CIN *</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ padding: '8px 10px', fontSize: '0.9rem', textTransform: 'uppercase' }}
                          value={g.idNumber}
                          onChange={(e) => handleGuestFieldChange(idx, 'idNumber', e.target.value.toUpperCase())}
                          placeholder="Ex: AB123456"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Date de naissance *</label>
                        <input
                          type="date"
                          className="form-input"
                          style={{ padding: '8px 10px', fontSize: '0.9rem' }}
                          value={g.birthDate}
                          onChange={(e) => handleGuestFieldChange(idx, 'birthDate', e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Nationalité</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ padding: '8px 10px', fontSize: '0.9rem' }}
                          value={g.nationality}
                          onChange={(e) => handleGuestFieldChange(idx, 'nationality', e.target.value)}
                          placeholder="Ex: Française"
                        />
                      </div>
                    </div>
                  )}

                  {/* Extracted badges */}
                  {isGuestReady(g) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {g.idNumber && (
                        <span style={{ background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600 }}>
                          🪪 N° {g.idNumber}
                        </span>
                      )}
                      {g.nationality && (
                        <span style={{ background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600 }}>
                          🌍 {g.nationality}
                        </span>
                      )}
                      {g.birthDate && (
                        <span style={{ background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600 }}>
                          🎂 {g.birthDate}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
              <button 
                type="button" 
                onClick={() => setStep(2)} 
                className="btn btn-secondary"
              >
                <ArrowLeft size={16} />
                <span>Retour aux noms</span>
              </button>

              <div style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (!allGuestsReady) return;
                    setError('');
                    setStep(4); // Go to Signature
                  }}
                  className="btn btn-rausch"
                  disabled={!allGuestsReady}
                  style={!allGuestsReady ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  title={allGuestsReady ? '' : 'Scannez la pièce d\'identité de chaque voyageur pour continuer'}
                >
                  <span>{isScanningAny ? 'Lecture en cours…' : 'Passer à la signature'}</span>
                  <ArrowRight size={16} />
                </button>
                {!allGuestsReady && (
                  <div className="text-xs" style={{ marginTop: 8, color: '#C2410C', maxWidth: 300 }}>
                    {isScanningAny
                      ? 'Patientez pendant la lecture du document…'
                      : `Document manquant ou illisible pour : ${missingGuests.map((g) => g.fullName || `Voyageur ${guests.indexOf(g) + 1}`).join(', ')}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            STEP 4: ONE SINGLE GROUP SIGNATURE
            ================================================================ */}
        {step === 4 && (
          <div className="wizard-step-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <PenTool size={20} color="#81172E" />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Signature du Séjour</h3>
            </div>


            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: 14, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534', fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>
                <Users size={16} />
                <span>Document unique pour les {guests.length} voyageur(s)</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#14532D' }}>
                📜 <em>« Je soussigné(e) {guests[0].fullName || '(titulaire)'}, certifie sur l'honneur l'exactitude des renseignements ci-dessus pour l'ensemble des voyageurs du séjour. »</em>
              </p>
            </div>

            <label className="form-label">Signature manuscrite (doigt ou souris) :</label>
            <SignaturePad 
              onSave={(dataUrl) => setSignatureData(dataUrl)}
              onClear={() => setSignatureData(null)}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
              <button 
                type="button" 
                onClick={() => setStep(3)} 
                className="btn btn-secondary"
              >
                <ArrowLeft size={16} />
                <span>Retour aux scans</span>
              </button>

              <button 
                type="button" 
                onClick={handleSubmitAll} 
                className="btn btn-rausch"
                disabled={loading || !signatureData}
              >
                <span>{loading ? "Enregistrement…" : "Valider mon enregistrement"}</span>
                <Check size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================
            STEP 5: SUCCESS / SINGLE PDF DOWNLOAD
            ================================================================ */}
        {step === 5 && (
          <div className="wizard-step-body" style={{ textAlign: 'center', padding: '36px 24px' }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: '#EAF8EB',
              color: '#008A05',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <CheckCircle2 size={42} />
            </div>

            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: 8 }}>
              Merci, votre enregistrement est terminé !
            </h2>
            <p style={{ fontSize: '0.95rem', color: '#484848', marginBottom: 20 }}>
              Les informations des <strong>{guests.length} voyageur(s)</strong> ont bien été transmises à votre hôte. Vous n'avez plus rien à faire : il ne vous reste qu'à profiter de votre séjour. 🇲🇦
            </p>

            <div style={{ background: '#F8F9FA', border: '1px solid #EBEBEB', borderRadius: 12, padding: 18, marginBottom: 24, textAlign: 'left' }}>
              <div style={{ fontSize: '0.82rem', color: '#717171', marginBottom: 4 }}>Logement :</div>
              <div className="font-bold">{propertyData?.name}</div>
              <div className="text-xs text-muted" style={{ marginBottom: 12 }}>{propertyData?.address}</div>

              <div style={{ borderTop: '1px solid #EBEBEB', paddingTop: 10 }}>
                <span className="text-xs text-muted">Voyageurs enregistrés :</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {guests.map((g, i) => (
                    <span key={i} style={{ background: '#FFF', border: '1px solid #DDD', padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600 }}>
                      {g.fullName}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {offer && (offer.mapsUrl || offer.phone || offer.whatsapp) && (
              <div className="guest-offer-card">
                <div className="guest-offer-icon"><Car size={22} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="guest-offer-title">{offer.title || 'Besoin d\'une voiture ?'}</div>
                  <div className="guest-offer-agency">{offer.agencyName}</div>
                  {offer.description && <p className="guest-offer-text">{offer.description}</p>}
                  <div className="guest-offer-actions">
                    {offer.mapsUrl && (
                      <a href={offer.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-rausch btn-sm">
                        <MapPin size={14} /> Voir l'agence sur Google Maps
                      </a>
                    )}
                    {offer.phone && (
                      <a href={`tel:${offer.phone.replace(/[^+\d]/g, '')}`} className="btn btn-secondary btn-sm">
                        <Phone size={14} /> {offer.phone}
                      </a>
                    )}
                    {offer.whatsapp && (
                      <a href={`https://wa.me/${offer.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ color: '#128C7E' }}>
                        <MessageCircle size={14} /> WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-muted" style={{ marginBottom: 16 }}>
              Vous pouvez fermer cette page. Pour toute question, contactez votre hôte via votre messagerie de réservation.
            </p>

            {onExitToHost && (
              <button 
                type="button" 
                onClick={onExitToHost} 
                className="btn btn-secondary"
                style={{ width: '100%' }}
              >
                <Home size={16} />
                <span>Retour au tableau de bord Hôte</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
