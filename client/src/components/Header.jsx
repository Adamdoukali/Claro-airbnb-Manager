import React from 'react';
import { ExternalLink, RefreshCw, ShieldCheck, Home, Settings, UserCheck, Zap } from 'lucide-react';

export default function Header({ 
  currentProperty, 
  onOpenSettings, 
  onOpenSync, 
  onOpenHospitable,
  activeTab, 
  setActiveTab,
  onSwitchToGuestPortal
}) {
  return (
    <header className="airbnb-header">
      <div className="header-container">
        {/* Left: Claro Brand & Airbnb Manager */}
        <div className="logo-area" onClick={() => setActiveTab('calendar')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Claro Logo */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img 
              src="/claro.png" 
              alt="Claro Digital" 
              style={{ height: 32, width: 'auto', objectFit: 'contain' }} 
            />
          </div>

          <div style={{ width: 1, height: 26, background: '#E5E7EB' }} />

          {/* Airbnb Manager */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="#81172E" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 1c2.008 0 3.463.963 4.751 3.269l.533 1.025c1.954 3.83 4.14 8.784 5.394 13.064 1.258 4.293.992 7.788-.737 9.873C24.195 30.334 21.436 31 18.067 31c-2.316 0-4.32-.47-6.07-1.402-1.748.932-3.753 1.402-6.064 1.402-3.37 0-6.128-.666-7.874-2.769-1.73-2.085-1.996-5.58-.738-9.873 1.254-4.28 3.44-9.234 5.394-13.064l.533-1.025C4.537 1.963 5.992 1 8 1c2.25 0 3.882 1.246 5.25 3.52C14.618 2.246 16.25 1 18.5 1zm-.5 18.5c-2.209 0-4 1.791-4 4s1.791 4 4 4 4-1.791 4-4-1.791-4-4-4z"/>
            </svg>
            <div className="logo-text" style={{ color: '#81172E' }}>
              airbnb <span style={{ color: '#1C1917', fontWeight: 600, fontSize: '0.95rem' }}>Manager</span>
            </div>
            <span className="logo-sub" style={{ background: '#FDF2F4', color: '#81172E', borderColor: '#F5D5DC' }}>Maroc 🇲🇦</span>
          </div>
        </div>

        {/* Center: Current Property Capsule */}
        <div className="property-capsule" onClick={onOpenSettings} title="Cliquez pour configurer ce logement">
          <Home size={18} color="#81172E" />
          <span className="property-name">{currentProperty?.name || "Riad Dar Anbar"}</span>
          <span className="property-tag">{currentProperty?.city || "Marrakech"}</span>
        </div>


        {/* Right: Actions & Switch to Airbnb */}
        <div className="header-actions">
          {/* Quick Switch to Airbnb Calendar Button */}
          {currentProperty?.airbnbUrl && (
            <a 
              href={currentProperty.airbnbUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="switch-airbnb-btn"
              title="Basculer vers le calendrier Airbnb"
            >
              <span>Basculer sur Airbnb</span>
              <ExternalLink size={14} />
            </a>
          )}

          {/* Hospitable Integration */}
          <button 
            type="button" 
            className="btn btn-secondary btn-sm btn-pill" 
            onClick={onOpenHospitable}
            title="Intégration Hospitable (my.hospitable.com)"
            style={{ borderColor: '#C7D2FE', background: '#EEF2FF', color: '#4338CA' }}
          >
            <Zap size={14} color="#4F46E5" />
            <span>Hospitable</span>
          </button>

          {/* Sync Trigger Modal Button */}
          <button 
            type="button" 
            className="btn btn-secondary btn-sm btn-pill" 
            onClick={onOpenSync}
            title="Gérer la synchronisation des calendriers Airbnb et Booking"
          >
            <RefreshCw size={15} color="#003580" />
            <span>Sync iCal</span>
          </button>

          {/* Test Guest Check-in portal directly */}
          <button 
            type="button" 
            className="btn btn-rausch btn-sm btn-pill"
            onClick={onSwitchToGuestPortal}
            title="Tester le portail d'enregistrement voyageur"
          >
            <UserCheck size={16} />
            <span>Portail Voyageur</span>
          </button>

          {/* Settings */}
          <button 
            type="button"
            className="btn btn-secondary btn-icon" 
            onClick={onOpenSettings}
            title="Paramètres de l'hébergement et police"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
