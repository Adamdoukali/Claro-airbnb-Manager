import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import CalendarView from './components/CalendarView';
import PoliceDashboard from './components/PoliceDashboard';
import GuestCheckin from './components/GuestCheckin';
import SyncModal from './components/SyncModal';
import AddBookingModal from './components/AddBookingModal';
import GenerateCodeModal from './components/GenerateCodeModal';
import PropertySettingsModal from './components/PropertySettingsModal';
import HospitableModal from './components/HospitableModal';
import SettingsModal from './components/SettingsModal';
import LoginScreen from './components/LoginScreen';
import { Calendar, ShieldCheck, UserCheck, Home, Zap, Plus } from 'lucide-react';
import { api } from './api';

const CURRENT_PROPERTY_KEY = 'claro_current_property';

function readStoredPropertyId() {
  try { return localStorage.getItem(CURRENT_PROPERTY_KEY) || ''; } catch { return ''; }
}

export default function App() {
  // Auth: 'loading' | 'anonymous' | 'authenticated'
  const [authStatus, setAuthStatus] = useState('loading');
  const [user, setUser] = useState(null);

  const [properties, setProperties] = useState([]);
  const [currentProperty, setCurrentProperty] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [policeRegistrations, setPoliceRegistrations] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [loadError, setLoadError] = useState('');

  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'police' | 'guest_portal'
  const [isSyncing, setIsSyncing] = useState(false);
  const [guestPortalCode, setGuestPortalCode] = useState('');

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsPropertyMode, setSettingsPropertyMode] = useState('edit'); // 'edit' | 'create'
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [isHospitableOpen, setIsHospitableOpen] = useState(false);
  const [isAutomationOpen, setIsAutomationOpen] = useState(false);
  const [automationActive, setAutomationActive] = useState(false);
  const [isAddBookingOpen, setIsAddBookingOpen] = useState(false);
  const [isGenerateCodeOpen, setIsGenerateCodeOpen] = useState(false);
  const [selectedBookingForCode, setSelectedBookingForCode] = useState(null);
  const [addBookingInitialDate, setAddBookingInitialDate] = useState(null);

  // Guest link (?guestCode=123456) opens the portal directly, no login needed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('guestCode') || params.get('code');
    if (code) {
      setGuestPortalCode(code);
      setActiveTab('guest_portal');
    }
  }, []);

  // Session check + global 401 handling
  useEffect(() => {
    api('/api/auth/me')
      .then(data => {
        setUser(data.user);
        setAuthStatus(data.user ? 'authenticated' : 'anonymous');
      })
      .catch(() => setAuthStatus('anonymous'));

    const onUnauthorized = () => {
      setUser(null);
      setAuthStatus('anonymous');
    };
    window.addEventListener('claro:unauthorized', onUnauthorized);
    return () => window.removeEventListener('claro:unauthorized', onUnauthorized);
  }, []);

  const loadPropertyData = useCallback(async (property) => {
    if (!property) {
      setBookings([]);
      setPoliceRegistrations([]);
      return;
    }
    const [bkgs, regs, logs] = await Promise.all([
      api(`/api/bookings?propertyId=${encodeURIComponent(property.id)}`),
      api(`/api/police/registrations?propertyId=${encodeURIComponent(property.id)}`),
      api('/api/calendar/logs')
    ]);
    setBookings(bkgs);
    setPoliceRegistrations(regs);
    setSyncLogs(logs);
  }, []);

  const refreshAutomationBadge = useCallback(() => {
    api('/api/settings')
      .then(s => {
        const a = s.automation || {};
        setAutomationActive(Boolean(a.autoMessageEnabled || a.reminderEnabled || a.autoSyncEnabled));
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async (preferredId) => {
    try {
      setLoadError('');
      const props = await api('/api/properties');
      setProperties(props);
      refreshAutomationBadge();

      const wantedId = preferredId || currentProperty?.id || readStoredPropertyId();
      const active = props.find(p => p.id === wantedId) || props[0] || null;
      setCurrentProperty(active);
      await loadPropertyData(active);
    } catch (err) {
      if (err.status !== 401) setLoadError(err.message);
      console.error('Error loading app data:', err);
    }
  }, [currentProperty?.id, loadPropertyData, refreshAutomationBadge]);

  useEffect(() => {
    if (authStatus === 'authenticated') fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  const handleSelectProperty = async (propertyId) => {
    const prop = properties.find(p => p.id === propertyId);
    if (!prop) return;
    try { localStorage.setItem(CURRENT_PROPERTY_KEY, prop.id); } catch { /* ignore */ }
    setCurrentProperty(prop);
    try {
      await loadPropertyData(prop);
    } catch (err) {
      setLoadError(err.message);
    }
  };

  const handleLogout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setUser(null);
    setAuthStatus('anonymous');
    setProperties([]);
    setCurrentProperty(null);
  };

  // Create or update a property
  const handleSaveProperty = async (data) => {
    try {
      let saved;
      if (data.id) {
        saved = await api(`/api/properties/${data.id}`, { method: 'PUT', body: data });
        setProperties(prev => prev.map(p => (p.id === saved.id ? saved : p)));
        if (currentProperty?.id === saved.id) setCurrentProperty(saved);
      } else {
        saved = await api('/api/properties', { method: 'POST', body: data });
        setProperties(prev => [...prev, saved]);
        try { localStorage.setItem(CURRENT_PROPERTY_KEY, saved.id); } catch { /* ignore */ }
        setCurrentProperty(saved);
        await loadPropertyData(saved);
      }
      return saved;
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + err.message);
      throw err;
    }
  };

  const handleDeleteProperty = async (propertyId) => {
    await api(`/api/properties/${propertyId}`, { method: 'DELETE' });
    try { localStorage.removeItem(CURRENT_PROPERTY_KEY); } catch { /* ignore */ }
    setCurrentProperty(null);
    await fetchData('');
  };

  const handleTriggerSync = async () => {
    if (!currentProperty) return;
    setIsSyncing(true);
    try {
      const data = await api('/api/calendar/sync', { method: 'POST', body: { propertyId: currentProperty.id } });
      await fetchData(currentProperty.id);
      if (data.source === 'hospitable') {
        alert(`Synchronisation Hospitable terminée : ${data.totalReservations || 0} réservation(s) reçue(s), ${data.addedCount || 0} nouvelle(s).`);
      } else {
        const errors = data.results?.errors?.length ? `\n${data.results.errors.join('\n')}` : '';
        alert(`Synchronisation iCal terminée : ${data.results?.airbnb || 0} Airbnb, ${data.results?.booking || 0} Booking.com.${errors}`);
      }
    } catch (err) {
      alert('Erreur de synchronisation : ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateBooking = async (bookingData, force = false) => {
    try {
      const created = await api('/api/bookings', { method: 'POST', body: { ...bookingData, force } });
      setBookings(prev => [...prev, created]);
      if (created.registration) {
        setPoliceRegistrations(prev => [created.registration, ...prev]);
      }
    } catch (err) {
      if (err.status === 409 && window.confirm(`${err.message}\n\nVoulez-vous quand même enregistrer cette réservation ?`)) {
        return handleCreateBooking(bookingData, true);
      }
      if (err.status !== 409) alert("Erreur lors de l'ajout : " + err.message);
    }
  };

  const handleDeleteBooking = async (id) => {
    try {
      await api(`/api/bookings/${id}`, { method: 'DELETE' });
      setBookings(prev => prev.filter(b => b.id !== id));
      setPoliceRegistrations(prev => prev.filter(r => !(r.bookingId === id && r.status !== 'completed')));
    } catch (err) {
      alert('Erreur lors de la suppression : ' + err.message);
    }
  };

  const openCreateProperty = () => {
    setSettingsPropertyMode('create');
    setIsSettingsOpen(true);
  };

  // ---- Guest portal (public) ----
  if (activeTab === 'guest_portal') {
    return (
      <GuestCheckin
        initialCode={guestPortalCode}
        onExitToHost={() => {
          setActiveTab('calendar');
          if (authStatus === 'authenticated') fetchData();
        }}
      />
    );
  }

  // ---- Auth gate ----
  if (authStatus === 'loading') {
    return <div className="app-loading">Chargement…</div>;
  }
  if (authStatus !== 'authenticated') {
    return (
      <LoginScreen
        onLogin={(u) => { setUser(u); setAuthStatus('authenticated'); }}
        onGuestAccess={() => { setGuestPortalCode(''); setActiveTab('guest_portal'); }}
      />
    );
  }

  const pendingPoliceCount = policeRegistrations.filter(r => r.status === 'pending').length;
  // Cancelled channel bookings stay in the store (audit) but never occupy the calendar.
  const activeBookings = bookings.filter(b => b.status !== 'cancelled');

  return (
    <div className="airbnb-app-layout">
      <Header
        user={user}
        properties={properties}
        currentProperty={currentProperty}
        onSelectProperty={handleSelectProperty}
        onAddProperty={openCreateProperty}
        onOpenSettings={() => { setSettingsPropertyMode('edit'); setIsSettingsOpen(true); }}
        onOpenAutomation={() => setIsAutomationOpen(true)}
        automationActive={automationActive}
        onOpenSync={() => setIsSyncOpen(true)}
        onOpenHospitable={() => setIsHospitableOpen(true)}
        onLogout={handleLogout}
        setActiveTab={setActiveTab}
        onSwitchToGuestPortal={() => { setGuestPortalCode(''); setActiveTab('guest_portal'); }}
      />

      <nav className="sub-nav">
        <div className="sub-nav-container">
          <button type="button" className={`nav-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
            <Calendar size={18} />
            <span>Calendrier Multi-Canaux</span>
            <span className="badge-count" style={{ background: '#F0F0F0', color: '#222' }}>{activeBookings.length}</span>
          </button>

          <button type="button" className={`nav-tab ${activeTab === 'police' ? 'active' : ''}`} onClick={() => setActiveTab('police')}>
            <ShieldCheck size={18} color="#008A05" />
            <span>Fiches de Police Marocaine</span>
            {pendingPoliceCount > 0 && <span className="badge-count">{pendingPoliceCount} en attente</span>}
          </button>

          <button type="button" className="nav-tab" onClick={() => { setGuestPortalCode(''); setActiveTab('guest_portal'); }}>
            <UserCheck size={18} color="#81172E" />
            <span>Aperçu Portail Voyageurs</span>
          </button>
        </div>
      </nav>

      <main className="main-content">
        {loadError && (
          <div className="alert-error" role="alert">{loadError}</div>
        )}

        {!currentProperty ? (
          <div className="empty-state card">
            <div className="empty-state-icon"><Home size={32} /></div>
            <h2>Bienvenue sur votre espace hôte</h2>
            <p className="text-muted">
              Commencez par ajouter votre premier logement, ou importez vos annonces Airbnb &amp; Booking.com depuis Hospitable.
            </p>
            <div className="empty-state-actions">
              <button type="button" className="btn btn-rausch" onClick={openCreateProperty}>
                <Plus size={18} /> Ajouter un logement
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setIsHospitableOpen(true)}>
                <Zap size={18} color="#4F46E5" /> Importer depuis Hospitable
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'calendar' && (
              <CalendarView
                bookings={activeBookings}
                property={currentProperty}
                onAddBookingClick={(dateStr) => { setAddBookingInitialDate(dateStr || null); setIsAddBookingOpen(true); }}
                onSyncClick={handleTriggerSync}
                isSyncing={isSyncing}
                onGeneratePoliceCode={(booking) => { setSelectedBookingForCode(booking || null); setIsGenerateCodeOpen(true); }}
                onDeleteBooking={handleDeleteBooking}
              />
            )}

            {activeTab === 'police' && (
              <PoliceDashboard
                registrations={policeRegistrations}
                property={currentProperty}
                onOpenCodeGenerator={() => { setSelectedBookingForCode(null); setIsGenerateCodeOpen(true); }}
                onOpenGuestPortalWithCode={(code) => { setGuestPortalCode(code); setActiveTab('guest_portal'); }}
                onRefresh={() => fetchData(currentProperty.id)}
              />
            )}
          </>
        )}
      </main>

      {isSyncOpen && currentProperty && (
        <SyncModal
          property={currentProperty}
          onClose={() => setIsSyncOpen(false)}
          onSaveProperty={handleSaveProperty}
          onTriggerSync={handleTriggerSync}
          isSyncing={isSyncing}
          syncLogs={syncLogs}
        />
      )}

      {isHospitableOpen && (
        <HospitableModal
          property={currentProperty}
          onClose={() => setIsHospitableOpen(false)}
          onSyncSuccess={() => fetchData(currentProperty?.id)}
          onOpenAutomation={() => { setIsHospitableOpen(false); setIsAutomationOpen(true); }}
        />
      )}

      {isAutomationOpen && (
        <SettingsModal
          properties={properties}
          onClose={() => { setIsAutomationOpen(false); refreshAutomationBadge(); }}
        />
      )}

      {isSettingsOpen && (
        <PropertySettingsModal
          property={settingsPropertyMode === 'create' ? null : currentProperty}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSaveProperty}
          onDelete={handleDeleteProperty}
        />
      )}

      {isAddBookingOpen && currentProperty && (
        <AddBookingModal
          initialDate={addBookingInitialDate}
          propertyId={currentProperty.id}
          onClose={() => setIsAddBookingOpen(false)}
          onSave={handleCreateBooking}
        />
      )}

      {isGenerateCodeOpen && currentProperty && (
        <GenerateCodeModal
          property={currentProperty}
          bookings={activeBookings}
          initialBooking={selectedBookingForCode}
          onClose={() => { setIsGenerateCodeOpen(false); setSelectedBookingForCode(null); }}
          onCreatedCode={(newReg) => {
            setPoliceRegistrations(prev => {
              const exists = prev.some(r => r.id === newReg.id);
              return exists ? prev.map(r => (r.id === newReg.id ? { ...r, ...newReg } : r)) : [newReg, ...prev];
            });
          }}
          onOpenPortalWithCode={(code) => { setGuestPortalCode(code); setActiveTab('guest_portal'); }}
        />
      )}
    </div>
  );
}
