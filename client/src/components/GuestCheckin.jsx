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
  FileText, 
  PenTool, 
  Home, 
  Check, 
  AlertCircle, 
  Users,
  Key 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import SignaturePad from './SignaturePad';

export default function GuestCheckin({ initialCode, onExitToHost }) {
  const [step, setStep] = useState(1);
  const [code, setCode] = useState(initialCode || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [propertyData, setPropertyData] = useState(null);
  const [bookingData, setBookingData] = useState(null);

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
      isScanning: false
    }
  ]);

  const [signatureData, setSignatureData] = useState(null);
  const [submittedPdfUrl, setSubmittedPdfUrl] = useState(null);

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
      const res = await fetch(`/api/police/verify/${cleanCode}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Code de réservation invalide");
      }

      setPropertyData(data.property);
      setBookingData(data.booking);

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
      updated[index].isScanning = true;
      return updated;
    });
    setError('');

    try {
      const uploadData = new FormData();
      uploadData.append('idDocument', file);

      const res = await fetch('/api/police/ocr', {
        method: 'POST',
        body: uploadData
      });
      const resJson = await res.json();

      if (!res.ok) {
        throw new Error(resJson.error || "Erreur de lecture OCR");
      }

      if (resJson.success && resJson.data) {
        const d = resJson.data;
        setGuests(prev => {
          const updated = [...prev];
          const curr = updated[index];
          
          // Auto-fill full name if not already entered
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
            isScanning: false
          };
          return updated;
        });
      }
    } catch (err) {
      console.warn("OCR recognition error:", err);
      setGuests(prev => {
        const updated = [...prev];
        updated[index].isScanning = false;
        return updated;
      });
    }
  };

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
        return {
          ...g,
          lastName,
          firstName,
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

      const res = await fetch('/api/police/submit', {
        method: 'POST',
        body: submitForm
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Erreur lors de l'enregistrement");
      }

      setSubmittedPdfUrl(resData.registration?.pdfUrl);
      setStep(5); // Success screen

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
            Fiche Police
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
        {error && (
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
                Fiche officielle de police touristique (DGSN Maroc)
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
                Scanner les pièces d'identité
              </h3>
              <p className="text-muted text-sm">
                Prenez en photo le passeport ou la carte nationale (CIN) pour chaque voyageur. Toutes les informations sont capturées automatiquement.
              </p>
            </div>

            {/* Cards for each guest to scan */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {guests.map((g, idx) => (
                <div 
                  key={g.id}
                  style={{
                    background: g.ocrScanned ? '#F0FDF4' : '#FDF2F4',
                    border: `1.5px ${g.ocrScanned ? 'solid #86EFAC' : 'dashed #81172E'}`,
                    borderRadius: 14,
                    padding: 16

                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div className="font-bold text-base" style={{ color: '#222222' }}>
                        {idx + 1}. {g.fullName || `Voyageur ${idx + 1}`}
                      </div>
                      <div className="text-xs text-muted">
                        {g.ocrScanned ? "Document numérisé avec succès ✅" : "Passeport ou Carte Nationale requis"}
                      </div>
                    </div>

                    {/* Scan/Upload Button */}
                    <label 
                      className={`btn ${g.ocrScanned ? 'btn-secondary' : 'btn-rausch'} btn-sm`}
                      style={{ cursor: g.isScanning ? 'not-allowed' : 'pointer' }}
                    >
                      <Camera size={15} />
                      <span>{g.isScanning ? "Lecture..." : g.ocrScanned ? "Reprendre photo" : "Scanner / Photo"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={g.isScanning}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleScanForGuest(idx, e.target.files[0]);
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
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

                  {/* Extracted badges */}
                  {g.ocrScanned && (
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

              <button 
                type="button" 
                onClick={() => {
                  setError('');
                  setStep(4); // Go to Signature
                }} 
                className="btn btn-rausch"
              >
                <span>Passer à la signature</span>
                <ArrowRight size={16} />
              </button>
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
                <span>{loading ? "Génération du PDF..." : "Valider et Télécharger"}</span>
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
              Enregistrement Validé !
            </h2>
            <p style={{ fontSize: '0.95rem', color: '#484848', marginBottom: 20 }}>
              La fiche de police pour les <strong>{guests.length} voyageur(s)</strong> a été générée en <strong>1 seul PDF</strong> avec votre signature unique.
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

            {submittedPdfUrl && (
              <a 
                href={submittedPdfUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-rausch"
                style={{ width: '100%', marginBottom: 12 }}
              >
                <FileText size={16} />
                <span>Télécharger la Fiche de Police Unique (PDF)</span>
              </a>
            )}

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
