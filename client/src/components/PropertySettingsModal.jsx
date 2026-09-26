import React, { useState, useEffect } from 'react';
import { Home, Shield, Check, FileText, Trash2 } from 'lucide-react';
import { api } from '../api';

const PROPERTY_TYPES = ["Riad / Maison d'hôtes", 'Appartement meublé', 'Villa touristique', "Chambre d'hôtes", 'Hôtel'];

/**
 * Create (property === null) or edit a property, plus the agency header printed on police PDFs.
 */
export default function PropertySettingsModal({ property, onClose, onSave, onDelete }) {
  const isCreate = !property;

  const [formData, setFormData] = useState({
    name: property?.name || '',
    type: property?.type || 'Appartement meublé',
    city: property?.city || '',
    address: property?.address || '',
    hospitableId: property?.hospitableId || '',
    airbnbUrl: property?.airbnbUrl || '',
    policeLicenseNumber: property?.policeLicenseNumber || '',
    hostName: property?.hostName || '',
    hostPhone: property?.hostPhone || '',
    policePrecinct: property?.policePrecinct || ''
  });

  const [agency, setAgency] = useState({
    agencyName: '', agencyAddress: '', agencySubAddress: '', agencyCity: '', agencyPhone: '', agencyIce: ''
  });
  const [agencyLoaded, setAgencyLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/settings')
      .then(s => {
        setAgency({
          agencyName: s.agencyName || '',
          agencyAddress: s.agencyAddress || '',
          agencySubAddress: s.agencySubAddress || '',
          agencyCity: s.agencyCity || '',
          agencyPhone: s.agencyPhone || '',
          agencyIce: s.agencyIce || ''
        });
        setAgencyLoaded(true);
      })
      .catch(() => setAgencyLoaded(true));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAgencyChange = (e) => {
    const { name, value } = e.target;
    setAgency(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSave(isCreate ? formData : { ...property, ...formData });
      if (agencyLoaded) {
        await api('/api/settings', { method: 'PUT', body: agency });
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 900);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!property || !onDelete) return;
    if (!window.confirm(`Supprimer « ${property.name} » ainsi que toutes ses réservations et fiches de police ?`)) return;
    try {
      await onDelete(property.id);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Home size={20} color="#81172E" />
            <h3 style={{ fontSize: '1.2rem' }}>{isCreate ? 'Nouveau logement' : 'Paramètres du Logement & Police'}</h3>
          </div>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
            {error && <div className="alert-error" role="alert">{error}</div>}

            <h4 className="form-section-title" style={{ color: '#81172E' }}>🏠 Informations du Logement</h4>

            <div className="form-group">
              <label className="form-label">Nom de l'hébergement *</label>
              <input type="text" name="name" required className="form-input" value={formData.name} onChange={handleChange} placeholder="Ex: Appartement Marina Golf" />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Type d'établissement</label>
                <select name="type" className="form-input" value={formData.type} onChange={handleChange}>
                  {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Ville *</label>
                <input type="text" name="city" required className="form-input" value={formData.city} onChange={handleChange} placeholder="Ex: Assilah" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Adresse complète du logement</label>
              <input type="text" name="address" className="form-input" placeholder="Ex: Résidence Marina Golf, Apt 12" value={formData.address} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label className="form-label">Identifiant du logement Hospitable (UUID)</label>
              <input type="text" name="hospitableId" className="form-input" placeholder="Rempli automatiquement par « Importer logements »" value={formData.hospitableId} onChange={handleChange} />
              <span className="text-xs text-muted" style={{ marginTop: 4, display: 'block' }}>
                Associe les réservations Airbnb / Booking.com reçues d'Hospitable à ce logement.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Lien vers votre annonce ou calendrier Airbnb</label>
              <input type="url" name="airbnbUrl" className="form-input" placeholder="https://www.airbnb.com/hosting/calendar" value={formData.airbnbUrl} onChange={handleChange} />
            </div>

            <hr className="form-divider" />

            <h4 className="form-section-title" style={{ color: '#008A05' }}>
              <Shield size={16} /> Mentions Légales & Police Marocaine (DGSN)
            </h4>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">N° Autorisation / Patente touristique</label>
                <input type="text" name="policeLicenseNumber" className="form-input" placeholder="Ex: MA-TNG-2026-1234" value={formData.policeLicenseNumber} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Commissariat / District de police</label>
                <input type="text" name="policePrecinct" className="form-input" placeholder="Ex: Commissariat central" value={formData.policePrecinct} onChange={handleChange} />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Nom de l'exploitant / Hôte</label>
                <input type="text" name="hostName" className="form-input" placeholder="Ex: Adam Doukali" value={formData.hostName} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone de contact</label>
                <input type="tel" name="hostPhone" className="form-input" placeholder="Ex: +212 6 00 00 00 00" value={formData.hostPhone} onChange={handleChange} />
              </div>
            </div>

            <hr className="form-divider" />

            <h4 className="form-section-title" style={{ color: '#4338CA' }}>
              <FileText size={16} /> En-tête des fiches de police (PDF)
            </h4>
            <p className="text-xs text-muted" style={{ marginBottom: 12 }}>
              Ces informations sont imprimées en haut de chaque « Bulletin Individuel » et dans le cachet. Elles sont communes à tous vos logements.
            </p>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Nom de l'agence / société</label>
                <input type="text" name="agencyName" className="form-input" placeholder="Ex: Claro Conciergerie" value={agency.agencyName} onChange={handleAgencyChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Ville</label>
                <input type="text" name="agencyCity" className="form-input" placeholder="Ex: Tanger" value={agency.agencyCity} onChange={handleAgencyChange} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Adresse</label>
              <input type="text" name="agencyAddress" className="form-input" placeholder="Ex: Rue Hafid Ibn Abdelbar N°127" value={agency.agencyAddress} onChange={handleAgencyChange} />
            </div>
            <div className="form-group">
              <label className="form-label">Complément d'adresse</label>
              <input type="text" name="agencySubAddress" className="form-input" placeholder="Ex: Entresol N°43 - Tanger" value={agency.agencySubAddress} onChange={handleAgencyChange} />
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Téléphone</label>
                <input type="tel" name="agencyPhone" className="form-input" placeholder="Ex: 06 19 72 72 64" value={agency.agencyPhone} onChange={handleAgencyChange} />
              </div>
              <div className="form-group">
                <label className="form-label">ICE</label>
                <input type="text" name="agencyIce" className="form-input" placeholder="Ex: 003468249000157" value={agency.agencyIce} onChange={handleAgencyChange} />
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
            <div>
              {saved && (
                <span style={{ color: '#008A05', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={16} /> Enregistré !
                </span>
              )}
              {!saved && !isCreate && onDelete && (
                <button type="button" className="btn btn-secondary btn-sm" style={{ color: '#B91C1C' }} onClick={handleDelete}>
                  <Trash2 size={14} /> Supprimer ce logement
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn btn-rausch" disabled={saving}>
                {saving ? 'Enregistrement…' : (isCreate ? 'Créer le logement' : 'Enregistrer')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
