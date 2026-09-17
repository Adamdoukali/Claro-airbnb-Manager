import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import CalendarView from './components/CalendarView';
import PoliceDashboard from './components/PoliceDashboard';
import GuestCheckin from './components/GuestCheckin';
import SyncModal from './components/SyncModal';
import AddBookingModal from './components/AddBookingModal';
import GenerateCodeModal from './components/GenerateCodeModal';
import PropertySettingsModal from './components/PropertySettingsModal';
import HospitableModal from './components/HospitableModal';
import { Calendar, ShieldCheck, UserCheck, ExternalLink, RefreshCw } from 'lucide-react';

export default function App() {
  const [properties, setProperties] = useState([]);
  const [currentProperty, setCurrentProperty] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [policeRegistrations, setPoliceRegistrations] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'police' | 'guest_portal'
  const [isSyncing, setIsSyncing] = useState(false);
  const [guestPortalCode, setGuestPortalCode] = useState('');

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [isHospitableOpen, setIsHospitableOpen] = useState(false);
  const [isAddBookingOpen, setIsAddBookingOpen] = useState(false);
  const [isGenerateCodeOpen, setIsGenerateCodeOpen] = useState(false);
  const [selectedBookingForCode, setSelectedBookingForCode] = useState(null);
  const [addBookingInitialDate, setAddBookingInitialDate] = useState(null);


  // Check URL query parameters for direct guest check-in (e.g. ?guestCode=MAR892)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('guestCode') || urlParams.get('code');
    if (code) {
      setGuestPortalCode(code);
      setActiveTab('guest_portal');
    }
  }, []);

  // Fetch initial data
  const fetchData = async () => {
    try {
      // 1. Fetch properties
      const propRes = await fetch('/api/properties');
      const props = await propRes.json();
      setProperties(props);
      const activeProp = props[0] || null;
      setCurrentProperty(activeProp);

      if (activeProp) {
        // 2. Fetch bookings
        const bkgRes = await fetch(`/api/bookings?propertyId=${activeProp.id}`);
        const bkgs = await bkgRes.json();
        setBookings(bkgs);

        // 3. Fetch police registrations
        const regRes = await fetch(`/api/police/registrations?propertyId=${activeProp.id}`);
        const regs = await regRes.json();
        setPoliceRegistrations(regs);

        // 4. Fetch sync logs
        const logRes = await fetch('/api/calendar/logs');
        const logs = await logRes.json();
        setSyncLogs(logs);
      }
    } catch (err) {
      console.error("Error loading app data:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle saving property settings
  const handleSaveProperty = async (updated) => {
    try {
      const res = await fetch(`/api/properties/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      setCurrentProperty(data);
      setProperties(prev => prev.map(p => p.id === data.id ? data : p));
    } catch (err) {
      alert("Erreur lors de l'enregistrement: " + err.message);
    }
  };

  // Handle sync trigger
  const handleTriggerSync = async () => {
    if (!currentProperty) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: currentProperty.id })
      });
      const data = await res.json();
      
      // Refresh data
      await fetchData();
      alert(`Synchronisation terminée ! ${data.results?.airbnb || 0} Airbnb, ${data.results?.booking || 0} Booking.com`);
    } catch (err) {
      alert("Erreur de synchronisation: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle add booking
  const handleCreateBooking = async (bookingData) => {
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });
      const newBkg = await res.json();
      setBookings(prev => [...prev, newBkg]);

      // Re-fetch police registrations in case a pass was created
      const regRes = await fetch(`/api/police/registrations?propertyId=${currentProperty.id}`);
      const regs = await regRes.json();
      setPoliceRegistrations(regs);
    } catch (err) {
      alert("Erreur lors de l'ajout: " + err.message);
    }
  };

  // Handle delete booking
  const handleDeleteBooking = async (id) => {
    try {
      await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
      setBookings(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      alert("Erreur lors de la suppression: " + err.message);
    }
  };

  // If in Guest Portal mode
  if (activeTab === 'guest_portal') {
    return (
      <GuestCheckin 
        initialCode={guestPortalCode}
        onExitToHost={() => {
          setActiveTab('calendar');
          fetchData();
        }}
      />
    );
  }

  const pendingPoliceCount = policeRegistrations.filter(r => r.status === 'pending').length;

  return (
    <div className="airbnb-app-layout">
      {/* Top Airbnb-style Header */}
      <Header 
        currentProperty={currentProperty}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSync={() => setIsSyncOpen(true)}
        onOpenHospitable={() => setIsHospitableOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSwitchToGuestPortal={() => {
          setGuestPortalCode('');
          setActiveTab('guest_portal');
        }}
      />

      {/* Sub-Navigation Tabs */}
      <nav className="sub-nav">
        <div className="sub-nav-container">
          <button 
            type="button"
            className={`nav-tab ${activeTab === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveTab('calendar')}
          >
            <Calendar size={18} />
            <span>Calendrier Multi-Canaux</span>
            <span className="badge-count" style={{ background: '#F0F0F0', color: '#222' }}>
              {bookings.length}
            </span>
          </button>

          <button 
            type="button"
            className={`nav-tab ${activeTab === 'police' ? 'active' : ''}`}
            onClick={() => setActiveTab('police')}
          >
            <ShieldCheck size={18} color="#008A05" />
            <span>Fiches de Police Marocaine</span>
            {pendingPoliceCount > 0 && (
              <span className="badge-count">
                {pendingPoliceCount} en attente
              </span>
            )}
          </button>

          <button 
            type="button"
            className="nav-tab"
            onClick={() => {
              setGuestPortalCode('');
              setActiveTab('guest_portal');
            }}
          >
            <UserCheck size={18} color="#81172E" />
            <span>Aperçu Portail Voyageurs</span>
          </button>

        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'calendar' && (
          <CalendarView 
            bookings={bookings}
            property={currentProperty}
            onAddBookingClick={(dateStr) => {
              setAddBookingInitialDate(dateStr || null);
              setIsAddBookingOpen(true);
            }}
            onSyncClick={handleTriggerSync}
            isSyncing={isSyncing}
            onGeneratePoliceCode={(booking) => {
              setSelectedBookingForCode(booking || null);
              setIsGenerateCodeOpen(true);
            }}
            onDeleteBooking={handleDeleteBooking}
          />
        )}

        {activeTab === 'police' && (
          <PoliceDashboard 
            registrations={policeRegistrations}
            property={currentProperty}
            onOpenCodeGenerator={() => {
              setSelectedBookingForCode(null);
              setIsGenerateCodeOpen(true);
            }}
            onOpenGuestPortalWithCode={(code) => {
              setGuestPortalCode(code);
              setActiveTab('guest_portal');
            }}
            onRefresh={fetchData}
          />
        )}
      </main>

      {/* MODALS */}
      {isSyncOpen && (
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
          onSyncSuccess={fetchData}
        />
      )}

      {isSettingsOpen && (
        <PropertySettingsModal 
          property={currentProperty}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSaveProperty}
        />
      )}

      {isAddBookingOpen && (
        <AddBookingModal 
          initialDate={addBookingInitialDate}
          propertyId={currentProperty?.id}
          onClose={() => setIsAddBookingOpen(false)}
          onSave={handleCreateBooking}
        />
      )}

      {isGenerateCodeOpen && (
        <GenerateCodeModal 
          property={currentProperty}
          bookings={bookings}
          initialBooking={selectedBookingForCode}
          onClose={() => {
            setIsGenerateCodeOpen(false);
            setSelectedBookingForCode(null);
          }}
          onCreatedCode={(newReg) => {
            setPoliceRegistrations(prev => [newReg, ...prev]);
          }}
          onOpenPortalWithCode={(code) => {
            setGuestPortalCode(code);
            setActiveTab('guest_portal');
          }}
        />
      )}

    </div>
  );
}
