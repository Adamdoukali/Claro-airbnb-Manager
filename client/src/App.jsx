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
import TodayView from './components/TodayView';
import TasksView from './components/TasksView';
import CleanerTaskPage from './components/CleanerTaskPage';
import MetricsView from './components/MetricsView';
import { Calendar, ShieldCheck, UserCheck, Home, Zap, Plus, Sun, ClipboardList, BarChart3 } from 'lucide-react';
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
  const [portalOpenedByHost, setPortalOpenedByHost] = useState(false); // guests never see host controls

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsPropertyMode, setSettingsPropertyMode] = useState('edit'); // 'edit' | 'create'
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [isHospitableOpen, setIsHospitableOpen] = useState(false);
  const [isAutomationOpen, setIsAutomationOpen] = useState(false);
  const [automationActive, setAutomationActive] = useState(false);
  const [liveStatus, setLiveStatus] = useState(null);
  const [features, setFeatures] = useState({}); // beta switches from Paramètres > Fonctionnalités
  const [taskToken, setTaskToken] = useState('');   // public cleaner page (?taskToken=…)
  const tabChosenRef = React.useRef(false); // { lastSyncAt, lastWebhookAt, autoSyncEnabled, scheduler }
  const [isAddBookingOpen, setIsAddBookingOpen] = useState(false);
  const [isGenerateCodeOpen, setIsGenerateCodeOpen] = useState(false);
  const [selectedBookingForCode, setSelectedBookingForCode] = useState(null);
  const [addBookingInitialDate, setAddBookingInitialDate] = useState(null);

  // Guest link (?guestCode=123456) opens the portal directly, no login needed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const task = params.get('taskToken');
    if (task) setTaskToken(task);
    const code = params.get('guestCode') || params.get('code');
    if (code) {
      setGuestPortalCode(code);
      setPortalOpenedByHost(false);
      setActiveTab('guest_portal');
    }
  }, []);

  // Session check + global 401 handling
  useEffect(() => {
    api('/api/auth/me')
      .then(data => {
        setUser(data.user);
        setFeatures(data.features || {});
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

  const refreshFeatures = useCallback(() => {
    api('/api/auth/me').then(d => { if (d.user) { setUser(d.user); setFeatures(d.features || {}); } }).catch(() => {});
  }, []);

  const refreshAutomationBadge = useCallback(() => {
    api('/api/settings')
      .then(s => {
        const a = s.automation || {};
        setAutomationActive(Boolean(a.autoMessageEnabled || a.reminderEnabled || a.autoSyncEnabled));
      })
      .catch(() => {});
    api('/api/automation/status').then(setLiveStatus).catch(() => {});
  }, []);

  // Live dashboard: while the tab is visible, re-read bookings/registrations every 30 s so
  // changes pushed by the Hospitable webhook or the every-minute sync show up without a reload.
  const currentPropertyRef = React.useRef(null);
  currentPropertyRef.current = currentProperty;
  useEffect(() => {
    if (authStatus !== 'authenticated') return undefined;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const prop = currentPropertyRef.current;
      if (prop) loadPropertyData(prop).catch(() => {});
      api('/api/automation/status').then(setLiveStatus).catch(() => {});
    };
    const timer = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [authStatus, loadPropertyData]);

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
    if (authStatus !== 'authenticated' || tabChosenRef.current) return;
    if (user?.role === 'cleaner') { setActiveTab('tasks'); tabChosenRef.current = true; }
    else if (features.todayView && activeTab === 'calendar') { setActiveTab('today'); tabChosenRef.current = true; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, features.todayView, user?.role]);

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

  // ---- Cleaner page (public, by task link) ----
  if (taskToken) {
    return <CleanerTaskPage token={taskToken} />;
  }

  // ---- Guest portal (public) ----
  if (activeTab === 'guest_portal') {
    return (
      <GuestCheckin
        initialCode={guestPortalCode}
        onExitToHost={portalOpenedByHost && authStatus === 'authenticated' ? () => {
          setActiveTab('calendar');
          if (authStatus === 'authenticated') fetchData();
        } : undefined}
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
        onLogin={(u, f) => { setUser(u); setFeatures(f || {}); setAuthStatus('authenticated'); refreshFeatures(); }}
        onGuestAccess={() => { setGuestPortalCode(''); setPortalOpenedByHost(false); setActiveTab('guest_portal'); }}
      />
    );
  }

  const pendingPoliceCount = policeRegistrations.filter(r => r.status === 'pending').length;
  const isCleaner = user?.role === 'cleaner';
  const choose = (tab) => { tabChosenRef.current = true; setActiveTab(tab); };
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
        role={user?.role || 'admin'}
        automationActive={automationActive}
        onOpenSync={() => setIsSyncOpen(true)}
        onOpenHospitable={() => setIsHospitableOpen(true)}
        onLogout={handleLogout}
        setActiveTab={setActiveTab}
        onSwitchToGuestPortal={() => { setGuestPortalCode(''); setPortalOpenedByHost(true); setActiveTab('guest_portal'); }}
      />

      <nav className="sub-nav">
        <div className="sub-nav-container">
          {features.todayView && !isCleaner && (
            <button type="button" className={`nav-tab ${activeTab === 'today' ? 'active' : ''}`} onClick={() => choose('today')}>
              <Sun size={18} color="#B45309" />
              <span>Aujourd'hui</span>
            </button>
          )}
          {!isCleaner && (
          <button type="button" className={`nav-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => choose('calendar')}>
            <Calendar size={18} />
            <span>Calendrier Multi-Canaux</span>
            <span className="badge-count" style={{ background: '#F0F0F0', color: '#222' }}>{activeBookings.length}</span>
          </button>
          )}

          {!isCleaner && (
          <button type="button" className={`nav-tab ${activeTab === 'police' ? 'active' : ''}`} onClick={() => choose('police')}>
            <ShieldCheck size={18} color="#008A05" />
            <span>Fiches de Police Marocaine</span>
            {pendingPoliceCount > 0 && <span className="badge-count">{pendingPoliceCount} en attente</span>}
          </button>
          )}

          {features.tasks && (
            <button type="button" className={`nav-tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => choose('tasks')}>
              <ClipboardList size={18} color="#0369A1" />
              <span>Ménage & Tâches</span>
            </button>
          )}

          {features.metrics && !isCleaner && (
            <button type="button" className={`nav-tab ${activeTab === 'metrics' ? 'active' : ''}`} onClick={() => choose('metrics')}>
              <BarChart3 size={18} color="#4338CA" />
              <span>Statistiques</span>
            </button>
          )}

          {!isCleaner && (
          <button type="button" className="nav-tab" onClick={() => { setGuestPortalCode(''); setPortalOpenedByHost(true); setActiveTab('guest_portal'); }}>
            <UserCheck size={18} color="#81172E" />
            <span>Aperçu Portail Voyageurs</span>
          </button>
          )}
        </div>
      </nav>

      <main className="main-content">
        {loadError && (
          <div className="alert-error" role="alert">{loadError}</div>
        )}

        {activeTab === 'today' && features.todayView && (
          <TodayView
            features={features}
            onOpenPortalWithCode={(code) => { setGuestPortalCode(code); setPortalOpenedByHost(true); setActiveTab('guest_portal'); }}
            onGoToTasks={() => choose('tasks')}
            onRefreshAll={() => fetchData(currentProperty?.id)}
          />
        )}
        {activeTab === 'tasks' && features.tasks && <TasksView properties={properties} role={user?.role || 'admin'} />}
        {activeTab === 'metrics' && features.metrics && <MetricsView />}

        {['today', 'tasks', 'metrics'].includes(activeTab) ? null : !currentProperty ? (
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
                liveStatus={liveStatus}
                features={features}
                onGeneratePoliceCode={(booking) => { setSelectedBookingForCode(booking || null); setIsGenerateCodeOpen(true); }}
                onDeleteBooking={handleDeleteBooking}
              />
            )}

            {activeTab === 'police' && (
              <PoliceDashboard
                registrations={policeRegistrations}
                property={currentProperty}
                onOpenCodeGenerator={() => { setSelectedBookingForCode(null); setIsGenerateCodeOpen(true); }}
                onOpenGuestPortalWithCode={(code) => { setGuestPortalCode(code); setPortalOpenedByHost(true); setActiveTab('guest_portal'); }}
                onRefresh={() => fetchData(currentProperty.id)}
                features={features}
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
          onClose={() => { setIsAutomationOpen(false); refreshAutomationBadge(); refreshFeatures(); }}
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
          onOpenPortalWithCode={(code) => { setGuestPortalCode(code); setPortalOpenedByHost(true); setActiveTab('guest_portal'); }}
        />
      )}
    </div>
  );
}
