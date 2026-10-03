import React from 'react';
import { ExternalLink, Home, UserCheck, Zap, LogOut, Plus, ChevronDown, SlidersHorizontal } from 'lucide-react';

export default function Header({
  user,
  properties = [],
  currentProperty,
  onSelectProperty,
  onAddProperty,
  onOpenSettings,
  onOpenAutomation,
  automationActive = false,
  role = 'admin',
  onOpenHospitable,
  onLogout,
  setActiveTab,
  onSwitchToGuestPortal
}) {
  const isAdmin = role === 'admin';
  const isCleaner = role === 'cleaner';
  return (
    <header className="airbnb-header">
      <div className="header-container">
        {/* Left: brand */}
        <div className="logo-area" onClick={() => setActiveTab('calendar')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="/claro.png" alt="Claro Digital" style={{ height: 32, width: 'auto', objectFit: 'contain' }} />
          <div style={{ width: 1, height: 26, background: '#E5E7EB' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="#81172E" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M16 1c2.008 0 3.463.963 4.751 3.269l.533 1.025c1.954 3.83 4.14 8.784 5.394 13.064 1.258 4.293.992 7.788-.737 9.873C24.195 30.334 21.436 31 18.067 31c-2.316 0-4.32-.47-6.07-1.402-1.748.932-3.753 1.402-6.064 1.402-3.37 0-6.128-.666-7.874-2.769-1.73-2.085-1.996-5.58-.738-9.873 1.254-4.28 3.44-9.234 5.394-13.064l.533-1.025C4.537 1.963 5.992 1 8 1c2.25 0 3.882 1.246 5.25 3.52C14.618 2.246 16.25 1 18.5 1zm-.5 18.5c-2.209 0-4 1.791-4 4s1.791 4 4 4 4-1.791 4-4-1.791-4-4-4z"/>
            </svg>
            <div className="logo-text" style={{ color: '#81172E' }}>
              airbnb <span style={{ color: '#1C1917', fontWeight: 600, fontSize: '0.95rem' }}>Manager</span>
            </div>
            <span className="logo-sub" style={{ background: '#FDF2F4', color: '#81172E', borderColor: '#F5D5DC' }}>Maroc 🇲🇦</span>
          </div>
        </div>

        {/* Center: property switcher */}
        <div className="property-switcher" style={isCleaner ? { visibility: 'hidden' } : undefined}>
          {properties.length > 1 ? (
            <label className="property-capsule" title="Changer de logement">
              <Home size={18} color="#81172E" />
              <select
                className="property-select"
                value={currentProperty?.id || ''}
                onChange={(e) => onSelectProperty(e.target.value)}
                aria-label="Logement actif"
              >
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.nickname ? `${p.nickname} · ` : ''}{p.name}{p.hospitableMissing ? ' (retiré de Hospitable)' : ''}</option>
                ))}
              </select>
              <ChevronDown size={16} color="#717171" />
            </label>
          ) : (
            <div className="property-capsule" onClick={currentProperty ? onOpenSettings : onAddProperty} title={currentProperty ? 'Configurer ce logement' : 'Ajouter un logement'}>
              <Home size={18} color="#81172E" />
              <span className="property-name">{currentProperty?.name || 'Ajouter un logement'}</span>
              {currentProperty?.nickname && <span className="property-tag">{currentProperty.nickname}</span>}
              {currentProperty?.city && <span className="property-tag">{currentProperty.city}</span>}
            </div>
          )}
          {isAdmin && (
            <button type="button" className="btn btn-secondary btn-icon btn-sm" onClick={onAddProperty} title="Ajouter un logement">
              <Plus size={16} />
            </button>
          )}
        </div>

        {/* Right: actions */}
        <div className="header-actions">
          {currentProperty?.airbnbUrl && (
            <a href={currentProperty.airbnbUrl} target="_blank" rel="noopener noreferrer" className="switch-airbnb-btn" title="Ouvrir l'annonce Airbnb">
              <span>Basculer sur Airbnb</span>
              <ExternalLink size={14} />
            </a>
          )}

          {isAdmin && (
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-pill"
            onClick={onOpenHospitable}
            title="Intégration Hospitable (Airbnb & Booking.com)"
            style={{ borderColor: '#C7D2FE', background: '#EEF2FF', color: '#4338CA', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Zap size={14} color="#4F46E5" />
            <span>Hospitable</span>
          </button>
          )}

          {!isCleaner && (
          <button type="button" className="btn btn-rausch btn-sm btn-pill" onClick={onSwitchToGuestPortal} title="Tester le portail voyageur">
            <UserCheck size={16} />
            <span>Portail Voyageur</span>
          </button>
          )}

          {currentProperty && isAdmin && (
            <button type="button" className="btn btn-secondary btn-icon" onClick={onOpenSettings} title="Paramètres du logement et fiches de police">
              <Home size={18} />
            </button>
          )}

          {isAdmin && (
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={onOpenAutomation}
            title="Paramètres & automatisations (messages automatiques, rappels, synchronisation)"
            style={{ position: 'relative' }}
          >
            <SlidersHorizontal size={18} />
            {automationActive && (
              <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: '#16A34A', border: '2px solid #FFF' }} aria-label="Automatisations actives" />
            )}
          </button>
          )}

          <button type="button" className="btn btn-secondary btn-icon" onClick={onLogout} title={`Se déconnecter (${user?.email || ''})`}>
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
