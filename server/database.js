import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'data.json');

// Initial seed data
const DEFAULT_DATA = {
  properties: [
    {
      id: "prop_marrakech_01",
      name: "Riad Dar Anbar - Medina Suite",
      type: "Riad / Maison d'hôtes",
      city: "Marrakech",
      address: "Derb Sidi Bouloukate N° 45, Médina, 40000 Marrakech",
      airbnbUrl: "https://www.airbnb.com/rooms/sample-listing-marrakech",
      airbnbIcalUrl: "",
      bookingIcalUrl: "",
      policeLicenseNumber: "MA-MRK-2024-8842",
      hostName: "Karim Benali",
      hostPhone: "+212 661 234567",
      policePrecinct: "3ème Arrondissement de Police - Médina Marrakech",
      lastSyncAt: null,
      createdAt: new Date().toISOString()
    }
  ],
  bookings: [
    {
      id: "bkg_01",
      propertyId: "prop_marrakech_01",
      source: "airbnb",
      guestName: "Sophie Martin",
      guestEmail: "sophie.martin@example.fr",
      guestPhone: "+33 6 12 34 56 78",
      checkIn: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
      checkOut: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0], // +5 days
      status: "confirmed",
      totalPrice: 4200,
      currency: "MAD",
      notes: "Arrivée vers 15h, transfert aéroport demandé",
      externalUid: "airbnb_res_774921",
      createdAt: new Date().toISOString()
    },
    {
      id: "bkg_02",
      propertyId: "prop_marrakech_01",
      source: "booking",
      guestName: "Liam Johnson",
      guestEmail: "liam.j@example.co.uk",
      guestPhone: "+44 7700 900123",
      checkIn: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
      checkOut: new Date(Date.now() + 86400000 * 11).toISOString().split('T')[0],
      status: "confirmed",
      totalPrice: 3800,
      currency: "MAD",
      notes: "Client Genius Booking.com",
      externalUid: "booking_bkg_992014",
      createdAt: new Date().toISOString()
    },
    {
      id: "bkg_03",
      propertyId: "prop_marrakech_01",
      source: "direct",
      guestName: "Youssef Alaoui",
      guestEmail: "youssef.alaoui@example.ma",
      guestPhone: "+212 6 70 88 99 00",
      checkIn: new Date(Date.now() + 86400000 * 13).toISOString().split('T')[0],
      checkOut: new Date(Date.now() + 86400000 * 16).toISOString().split('T')[0],
      status: "confirmed",
      totalPrice: 2700,
      currency: "MAD",
      notes: "Réservation directe WhatsApp",
      externalUid: "direct_001",
      createdAt: new Date().toISOString()
    }
  ],
  policeRegistrations: [
    {
      id: "reg_demo_01",
      accessCode: "MAR892",
      propertyId: "prop_marrakech_01",
      bookingId: "bkg_01",
      guestName: "Sophie Martin",
      status: "pending",
      expiresAt: new Date(Date.now() + 86400000 * 10).toISOString(),
      guestDetails: null,
      idDocumentPath: null,
      signaturePath: null,
      pdfPath: null,
      createdAt: new Date().toISOString(),
      completedAt: null
    }
  ],
  syncLogs: [
    {
      id: "log_init",
      propertyId: "prop_marrakech_01",
      timestamp: new Date().toISOString(),
      source: "system",
      status: "success",
      message: "Système de synchronisation initialisé.",
      eventsCount: 3
    }
  ]
};

// Ensure data file exists
export function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
  }
}

export function readDB() {
  initDB();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading database:", err);
    return DEFAULT_DATA;
  }
}

export function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error writing database:", err);
  }
}
