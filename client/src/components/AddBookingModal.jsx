import React, { useState } from 'react';
import { Calendar, User, Lock, DollarSign, FileText } from 'lucide-react';

export default function AddBookingModal({ initialDate, propertyId, onClose, onSave }) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const inThreeDays = new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0];

  const [bookingType, setBookingType] = useState('direct'); // 'direct' or 'blocked'
  const [formData, setFormData] = useState({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    checkIn: initialDate || tomorrow,
    checkOut: initialDate ? new Date(new Date(initialDate).getTime() + 86400000 * 2).toISOString().split('T')[0] : inThreeDays,
    totalPrice: '',
    notes: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      propertyId,
      source: bookingType,
      ...formData,
      totalPrice: formData.totalPrice ? parseFloat(formData.totalPrice) : null
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1.2rem' }}>
            {bookingType === 'blocked' ? "Bloquer des dates sur le calendrier" : "Ajouter une réservation directe"}
          </h3>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Mode Switcher */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <button
                type="button"
                className={`btn ${bookingType === 'direct' ? 'btn-rausch' : 'btn-secondary'}`}
                onClick={() => setBookingType('direct')}
              >
                <User size={16} />
                <span>Client Direct</span>
              </button>
              <button
                type="button"
                className={`btn ${bookingType === 'blocked' ? 'btn-outline' : 'btn-secondary'}`}
                style={bookingType === 'blocked' ? { background: '#222', color: '#FFF' } : {}}
                onClick={() => setBookingType('blocked')}
              >
                <Lock size={16} />
                <span>Bloquer dates</span>
              </button>
            </div>

            {bookingType === 'direct' && (
              <>
                <div className="form-group">
                  <label className="form-label">Nom complet du voyageur *</label>
                  <input
                    type="text"
                    name="guestName"
                    required
                    className="form-input"
                    placeholder="Ex: Alexandre Dupont"
                    value={formData.guestName}
                    onChange={handleChange}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Téléphone / WhatsApp</label>
                    <input
                      type="tel"
                      name="guestPhone"
                      className="form-input"
                      placeholder="Ex: +33 6 12 34 56 78"
                      value={formData.guestPhone}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      name="guestEmail"
                      className="form-input"
                      placeholder="alexandre@example.com"
                      value={formData.guestEmail}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Date d'arrivée (Check-in) *</label>
                <input
                  type="date"
                  name="checkIn"
                  required
                  className="form-input"
                  value={formData.checkIn}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Date de départ (Check-out) *</label>
                <input
                  type="date"
                  name="checkOut"
                  required
                  className="form-input"
                  value={formData.checkOut}
                  onChange={handleChange}
                />
              </div>
            </div>

            {bookingType === 'direct' && (
              <div className="form-group">
                <label className="form-label">Montant total du séjour (MAD)</label>
                <input
                  type="number"
                  name="totalPrice"
                  className="form-input"
                  placeholder="Ex: 3500"
                  value={formData.totalPrice}
                  onChange={handleChange}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Notes & instructions internes</label>
              <textarea
                name="notes"
                rows={3}
                className="form-input"
                placeholder={bookingType === 'blocked' ? "Raison du blocage (travaux, usage personnel...)" : "Informations d'arrivée, clés, demandes spéciales..."}
                value={formData.notes}
                onChange={handleChange}
              />
            </div>

            {bookingType === 'direct' && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12, fontSize: '0.8rem', color: '#166534' }}>
                💡 En enregistrant ce voyageur, un code d'accès sera automatiquement créé pour lui envoyer la Fiche de Police marocaine.
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-rausch">
              {bookingType === 'blocked' ? "Bloquer ces dates" : "Enregistrer la réservation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
