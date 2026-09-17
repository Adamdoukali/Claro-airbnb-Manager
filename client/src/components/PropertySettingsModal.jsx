import React, { useState } from 'react';
import { Home, Shield, ExternalLink, Check } from 'lucide-react';

export default function PropertySettingsModal({ property, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: property?.name || '',
    type: property?.type || "Riad / Maison d'hôtes",
    city: property?.city || 'Marrakech',
    address: property?.address || '',
    airbnbUrl: property?.airbnbUrl || '',
    policeLicenseNumber: property?.policeLicenseNumber || '',
    hostName: property?.hostName || '',
    hostPhone: property?.hostPhone || '',
    policePrecinct: property?.policePrecinct || ''
  });

  const [saved, setSaved] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSave({ ...property, ...formData });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Home size={20} color="#81172E" />
            <h3 style={{ fontSize: '1.2rem' }}>Paramètres du Logement & Police</h3>
          </div>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h4 style={{ fontSize: '0.9rem', color: '#81172E', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              🏠 Informations du Logement
            </h4>


            <div className="form-group">
              <label className="form-label">Nom de l'hébergement *</label>
              <input
                type="text"
                name="name"
                required
                className="form-input"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Type d'établissement</label>
                <select
                  name="type"
                  className="form-input"
                  value={formData.type}
                  onChange={handleChange}
                >
                  <option value="Riad / Maison d'hôtes">Riad / Maison d'hôtes</option>
                  <option value="Appartement meublé">Appartement meublé</option>
                  <option value="Villa touristique">Villa touristique</option>
                  <option value="Chambre d'hôtes">Chambre d'hôtes</option>
                  <option value="Hôtel">Hôtel</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Ville *</label>
                <input
                  type="text"
                  name="city"
                  required
                  className="form-input"
                  value={formData.city}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Adresse complète du logement *</label>
              <input
                type="text"
                name="address"
                required
                className="form-input"
                placeholder="Ex: Derb Sidi Bouloukate N° 45, Médina"
                value={formData.address}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Lien vers votre annonce ou calendrier Airbnb</label>
              <input
                type="url"
                name="airbnbUrl"
                className="form-input"
                placeholder="https://www.airbnb.com/hosting/calendar"
                value={formData.airbnbUrl}
                onChange={handleChange}
              />
              <span className="text-xs text-muted" style={{ marginTop: 4, display: 'block' }}>
                Ce lien alimente le bouton « Basculer sur Airbnb » dans la barre supérieure.
              </span>
            </div>

            <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #EBEBEB' }} />

            <h4 style={{ fontSize: '0.9rem', color: '#008A05', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={16} /> Mentions Légales & Police Marocaine (DGSN)
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">N° Autorisation / Patente touristique</label>
                <input
                  type="text"
                  name="policeLicenseNumber"
                  className="form-input"
                  placeholder="Ex: MA-MRK-2024-8842"
                  value={formData.policeLicenseNumber}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Commissariat / District de police</label>
                <input
                  type="text"
                  name="policePrecinct"
                  className="form-input"
                  placeholder="Ex: 3ème Arrondissement Médina"
                  value={formData.policePrecinct}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Nom de l'exploitant / Hôte</label>
                <input
                  type="text"
                  name="hostName"
                  className="form-input"
                  placeholder="Ex: Karim Benali"
                  value={formData.hostName}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Téléphone de contact</label>
                <input
                  type="tel"
                  name="hostPhone"
                  className="form-input"
                  placeholder="Ex: +212 661 234567"
                  value={formData.hostPhone}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
            {saved ? (
              <span style={{ color: '#008A05', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={16} /> Paramètres sauvegardés !
              </span>
            ) : <div />}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn btn-rausch">Enregistrer</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
