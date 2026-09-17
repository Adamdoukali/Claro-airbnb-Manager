import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { readDB, writeDB, initDB } from './database.js';
import { syncPropertyFeeds, generatePropertyIcal } from './icalService.js';
import { generatePolicePdf } from './pdfService.js';
import { scanDocumentWithOCR } from './ocrService.js';
import { 
  testHospitableConnection, 
  syncHospitableReservations, 
  handleHospitableWebhook, 
  sendHospitableMessage, 
  generateFullAutomatedMessage 
} from './hospitableService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize DB and folders
initDB();

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PDF_DIR = path.join(__dirname, 'generated_pdfs');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

// Setup Multer for document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { 
    fileSize: 15 * 1024 * 1024, // 15 MB file size
    fieldSize: 30 * 1024 * 1024 // 30 MB form field size (for base64 signatures/payloads)
  }
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/generated_pdfs', express.static(PDF_DIR));

// ==========================================
// PROPERTY ROUTES
// ==========================================
app.get('/api/properties', (req, res) => {
  const db = readDB();
  res.json(db.properties);
});

app.post('/api/properties', (req, res) => {
  const db = readDB();
  const newProp = {
    id: `prop_${Date.now()}`,
    name: req.body.name || 'Nouveau Logement',
    type: req.body.type || 'Appartement',
    city: req.body.city || 'Marrakech',
    address: req.body.address || '',
    airbnbUrl: req.body.airbnbUrl || '',
    airbnbIcalUrl: req.body.airbnbIcalUrl || '',
    bookingIcalUrl: req.body.bookingIcalUrl || '',
    policeLicenseNumber: req.body.policeLicenseNumber || '',
    hostName: req.body.hostName || '',
    hostPhone: req.body.hostPhone || '',
    policePrecinct: req.body.policePrecinct || '',
    lastSyncAt: null,
    createdAt: new Date().toISOString()
  };
  db.properties.push(newProp);
  writeDB(db);
  res.status(201).json(newProp);
});

app.put('/api/properties/:id', (req, res) => {
  const db = readDB();
  const idx = db.properties.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Property not found' });

  db.properties[idx] = { ...db.properties[idx], ...req.body };
  writeDB(db);
  res.json(db.properties[idx]);
});

// ==========================================
// CALENDAR & BOOKINGS ROUTES
// ==========================================
app.get('/api/bookings', (req, res) => {
  const db = readDB();
  const { propertyId } = req.query;
  let bookings = db.bookings;
  if (propertyId) {
    bookings = bookings.filter(b => b.propertyId === propertyId);
  }
  res.json(bookings);
});

app.post('/api/bookings', (req, res) => {
  const db = readDB();
  const { propertyId, guestName, guestEmail, guestPhone, checkIn, checkOut, source, notes, totalPrice } = req.body;

  if (!propertyId || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'Property ID, check-in, and check-out are required' });
  }

  const newBooking = {
    id: `bkg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    propertyId,
    source: source || 'direct',
    guestName: guestName || (source === 'blocked' ? 'Dates Bloquées' : 'Client Direct'),
    guestEmail: guestEmail || '',
    guestPhone: guestPhone || '',
    checkIn,
    checkOut,
    status: source === 'blocked' ? 'blocked' : 'confirmed',
    totalPrice: totalPrice || null,
    currency: 'MAD',
    notes: notes || '',
    externalUid: null,
    createdAt: new Date().toISOString()
  };

  db.bookings.push(newBooking);

  // If it's a confirmed guest booking, also generate an initial police check-in pass
  if (source !== 'blocked' && guestName) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const property = db.properties.find(p => p.id === propertyId);
    const baseUrl = req.headers.origin || `http://${req.get('host')}`;
    const portalUrl = `${baseUrl}/?guestCode=${code}`;
    const autoMessage = generateFullAutomatedMessage({
      guestName,
      propertyName: property?.name,
      city: property?.city,
      accessCode: code,
      portalUrl,
      hostName: property?.hostName,
      checkIn,
      checkOut,
      language: 'fr'
    });

    db.policeRegistrations.push({
      id: `reg_${Date.now()}`,
      accessCode: code,
      propertyId,
      bookingId: newBooking.id,
      guestName,
      guestPhone: guestPhone || '',
      status: 'pending',
      expiresAt: new Date(new Date(checkOut).getTime() + 86400000 * 2).toISOString(),
      automatedMessage: autoMessage,
      messageSentAt: null,
      guestDetails: null,
      idDocumentPath: null,
      signaturePath: null,
      pdfPath: null,
      createdAt: new Date().toISOString(),
      completedAt: null
    });
  }

  writeDB(db);
  res.status(201).json(newBooking);
});


app.delete('/api/bookings/:id', (req, res) => {
  const db = readDB();
  const idx = db.bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Booking not found' });

  const deleted = db.bookings.splice(idx, 1);
  writeDB(db);
  res.json(deleted[0]);
});

app.post('/api/calendar/sync', async (req, res) => {
  const { propertyId } = req.body;
  if (!propertyId) return res.status(400).json({ error: 'Property ID is required' });

  try {
    const syncResult = await syncPropertyFeeds(propertyId);
    res.json({ success: true, ...syncResult });
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: err.message });
  }
});

// RFC 5545 iCal export for Airbnb and Booking.com to subscribe to
app.get('/api/calendar/export/:propertyId.ics', (req, res) => {
  const { propertyId } = req.params;
  try {
    const icalContent = generatePropertyIcal(propertyId);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="calendar_${propertyId}.ics"`);
    res.send(icalContent);
  } catch (err) {
    console.error("iCal export error:", err);
    res.status(500).send("Error generating iCal feed");
  }
});

app.get('/api/calendar/logs', (req, res) => {
  const db = readDB();
  res.json(db.syncLogs || []);
});

// ==========================================
// MOROCCAN POLICE AUTOMATION ROUTES
// ==========================================
app.get('/api/police/registrations', (req, res) => {
  const db = readDB();
  const { propertyId } = req.query;
  let list = db.policeRegistrations;
  if (propertyId) {
    list = list.filter(r => r.propertyId === propertyId);
  }
  res.json(list.reverse()); // most recent first
});

// Host generates an access code / check-in link for a guest with automated messaging
app.post('/api/police/codes', async (req, res) => {
  const db = readDB();
  const { propertyId, guestName, bookingId, guestPhone, language = 'fr', autoSendHospitable, apiKey } = req.body;

  if (!propertyId) return res.status(400).json({ error: 'Property ID required' });

  const property = db.properties.find(p => p.id === propertyId);
  const booking = bookingId ? db.bookings.find(b => b.id === bookingId) : null;

  // Generate friendly 6-character code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const baseUrl = req.headers.origin || `http://${req.get('host')}`;
  const portalUrl = `${baseUrl}/?guestCode=${code}`;

  const autoMessage = generateFullAutomatedMessage({
    guestName: guestName || booking?.guestName || 'Voyageur invité',
    propertyName: property?.name,
    city: property?.city,
    accessCode: code,
    portalUrl,
    hostName: property?.hostName,
    checkIn: booking?.checkIn,
    checkOut: booking?.checkOut,
    language
  });

  const reg = {
    id: `reg_${Date.now()}`,
    accessCode: code,
    propertyId,
    bookingId: bookingId || null,
    hospitableReservationId: booking?.hospitableReservationId || null,
    guestName: guestName || booking?.guestName || 'Voyageur invité',
    guestPhone: guestPhone || booking?.guestPhone || '',
    status: 'pending',
    expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
    automatedMessage: autoMessage,
    messageSentAt: null,
    guestDetails: null,
    idDocumentPath: null,
    signaturePath: null,
    pdfPath: null,
    createdAt: new Date().toISOString(),
    completedAt: null
  };

  // If auto-send via Hospitable is requested and token is available
  let autoSent = false;
  if (autoSendHospitable && apiKey && booking?.hospitableReservationId) {
    try {
      await sendHospitableMessage(apiKey, booking.hospitableReservationId, autoMessage);
      reg.messageSentAt = new Date().toISOString();
      autoSent = true;
    } catch (err) {
      console.warn("Auto-send via Hospitable failed:", err.message);
    }
  }

  db.policeRegistrations.push(reg);
  writeDB(db);

  res.status(201).json({
    ...reg,
    portalUrl,
    autoSent
  });
});

// Preview or regenerate automated message in different languages
app.post('/api/police/message/preview', (req, res) => {
  const db = readDB();
  const { registrationId, bookingId, propertyId, language = 'fr' } = req.body;

  let reg = null;
  if (registrationId) {
    reg = db.policeRegistrations.find(r => r.id === registrationId);
  }

  const prop = db.properties.find(p => p.id === (reg?.propertyId || propertyId)) || db.properties[0];
  const booking = reg?.bookingId ? db.bookings.find(b => b.id === reg.bookingId) : (bookingId ? db.bookings.find(b => b.id === bookingId) : null);

  const baseUrl = req.headers.origin || `http://${req.get('host')}`;
  const code = reg?.accessCode || 'XXXXXX';
  const portalUrl = `${baseUrl}/?guestCode=${code}`;

  const message = generateFullAutomatedMessage({
    guestName: req.body.guestName || reg?.guestName || booking?.guestName || 'Cher voyageur',
    propertyName: prop?.name,
    city: prop?.city,
    accessCode: code,
    portalUrl,
    hostName: prop?.hostName,
    checkIn: booking?.checkIn,
    checkOut: booking?.checkOut,
    language
  });


  res.json({ message, accessCode: code, portalUrl });
});

// Dispatch message to guest (via Hospitable API or mark WhatsApp sent)
app.post('/api/police/message/send', async (req, res) => {
  const db = readDB();
  const { registrationId, messageText, channel = 'hospitable', apiKey } = req.body;

  const regIndex = db.policeRegistrations.findIndex(r => r.id === registrationId);
  if (regIndex === -1) {
    return res.status(404).json({ error: "Fiche d'enregistrement introuvable" });
  }

  const reg = db.policeRegistrations[regIndex];
  const booking = reg.bookingId ? db.bookings.find(b => b.id === reg.bookingId) : null;
  const finalMsg = messageText || reg.automatedMessage;

  if (channel === 'hospitable') {
    if (!apiKey) {
      return res.status(400).json({ error: "Clé API Hospitable requise pour l'envoi automatique" });
    }
    const hospResId = reg.hospitableReservationId || booking?.hospitableReservationId;
    if (!hospResId) {
      return res.status(400).json({ 
        error: "Cette réservation n'est pas liée à un identifiant Hospitable. Utilisez WhatsApp ou copiez le message." 
      });
    }

    try {
      await sendHospitableMessage(apiKey, hospResId, finalMsg);
      reg.messageSentAt = new Date().toISOString();
      reg.automatedMessage = finalMsg;
      writeDB(db);
      return res.json({ 
        success: true, 
        messageSentAt: reg.messageSentAt, 
        channel: 'hospitable' 
      });
    } catch (err) {
      return res.status(500).json({ error: `Erreur Hospitable: ${err.message}` });
    }
  } else {
    // WhatsApp or Manual confirmation
    reg.messageSentAt = new Date().toISOString();
    if (messageText) reg.automatedMessage = messageText;
    writeDB(db);
    return res.json({ 
      success: true, 
      messageSentAt: reg.messageSentAt, 
      channel: 'whatsapp' 
    });
  }
});


// Guest portal verifies code
app.get('/api/police/verify/:code', (req, res) => {
  const db = readDB();
  const code = req.params.code.trim().toUpperCase();
  const reg = db.policeRegistrations.find(r => r.accessCode.toUpperCase() === code);

  if (!reg) {
    return res.status(404).json({ error: 'Code de réservation invalide ou introuvable.' });
  }

  const property = db.properties.find(p => p.id === reg.propertyId);
  const booking = reg.bookingId ? db.bookings.find(b => b.id === reg.bookingId) : null;

  res.json({
    id: reg.id,
    accessCode: reg.accessCode,
    status: reg.status,
    guestName: reg.guestName,
    property: {
      name: property?.name || 'Hébergement Touristique',
      city: property?.city || 'Maroc',
      address: property?.address || ''
    },
    booking: booking ? {
      checkIn: booking.checkIn,
      checkOut: booking.checkOut
    } : null,
    existingDetails: reg.guestDetails
  });
});

// Open-source OCR Document Scanner (Passport & Moroccan CIN)
app.post('/api/police/ocr', upload.single('idDocument'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucun document fourni pour la numérisation' });
  }

  try {
    const ocrResult = await scanDocumentWithOCR(req.file.path);
    res.json({
      success: true,
      ...ocrResult,
      filePath: req.file.path,
      fileUrl: `/uploads/${path.basename(req.file.path)}`
    });
  } catch (err) {
    console.error("OCR API error:", err);
    res.status(500).json({ error: `Erreur lors de la lecture OCR: ${err.message}` });
  }
});

// Guest submits their details, photo, and digital signature
app.post('/api/police/submit', upload.single('idDocument'), async (req, res) => {
  try {
    const db = readDB();
    const { code, guestData, signatureData } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Access code is required' });
    }

    const regIndex = db.policeRegistrations.findIndex(r => r.accessCode.toUpperCase() === code.trim().toUpperCase());
    if (regIndex === -1) {
      return res.status(404).json({ error: 'Registration code not found' });
    }

    const registration = db.policeRegistrations[regIndex];
    const property = db.properties.find(p => p.id === registration.propertyId);

    // Parse guest fields
    let parsedGuestData = {};
    try {
      parsedGuestData = typeof guestData === 'string' ? JSON.parse(guestData) : guestData;
    } catch (e) {
      parsedGuestData = req.body;
    }

    // Save ID photo path
    let idDocPath = registration.idDocumentPath;
    if (req.file) {
      idDocPath = req.file.path;
    }

    // Save base64 signature as PNG file
    let sigPath = registration.signaturePath;
    if (signatureData && signatureData.startsWith('data:image')) {
      const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
      const sigFilename = `sig_${registration.accessCode}_${Date.now()}.png`;
      sigPath = path.join(UPLOADS_DIR, sigFilename);
      fs.writeFileSync(sigPath, Buffer.from(base64Data, 'base64'));
    }

    // Update registration object
    registration.guestDetails = parsedGuestData;
    const primaryGuest = (parsedGuestData.guests && parsedGuestData.guests[0]) || parsedGuestData;
    const totalCount = parsedGuestData.guests?.length || 1;
    const leadName = `${primaryGuest.lastName || ''} ${primaryGuest.firstName || ''}`.trim() || registration.guestName;
    registration.guestName = totalCount > 1 ? `${leadName} (+${totalCount - 1} pers.)` : leadName;
    registration.idDocumentPath = primaryGuest.idDocumentPath || idDocPath;
    registration.signaturePath = sigPath;
    registration.status = 'completed';
    registration.completedAt = new Date().toISOString();

    // Generate Police PDF immediately
    const pdfResult = await generatePolicePdf(registration, property);
    registration.pdfPath = pdfResult.filePath;
    registration.pdfUrl = pdfResult.downloadUrl;

    writeDB(db);

    res.json({
      success: true,
      message: 'Fiche de police enregistrée avec succès.',
      registration: {
        id: registration.id,
        status: registration.status,
        pdfUrl: pdfResult.downloadUrl
      }
    });
  } catch (err) {
    console.error("Police submit error:", err);
    res.status(500).json({ error: `Erreur lors de l'enregistrement: ${err.message}` });
  }
});

// Download generated official Police PDF
app.get('/api/police/download/:filename', (req, res) => {
  const filePath = path.join(PDF_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('PDF non trouvé');
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
  res.sendFile(filePath);
});

// Regenerate or Preview PDF for any registration
app.get('/api/police/pdf/:id', async (req, res) => {
  const db = readDB();
  const reg = db.policeRegistrations.find(r => r.id === req.params.id);
  if (!reg) return res.status(404).json({ error: 'Registration not found' });

  const property = db.properties.find(p => p.id === reg.propertyId);
  try {
    const pdfResult = await generatePolicePdf(reg, property);
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(pdfResult.filePath);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// HOSPITABLE (my.hospitable.com) INTEGRATION
// ==========================================

// Test Personal Access Token with Hospitable
app.post('/api/integrations/hospitable/test', async (req, res) => {
  const { apiKey } = req.body;
  try {
    const result = await testHospitableConnection(apiKey);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sync reservations from Hospitable API
app.post('/api/integrations/hospitable/sync', async (req, res) => {
  const { apiKey, propertyId } = req.body;
  try {
    const result = await syncHospitableReservations(apiKey, propertyId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Incoming Webhook from Hospitable (reservation.created / reservation.updated)
app.post('/api/integrations/hospitable/webhook', async (req, res) => {
  console.log("Hospitable Webhook received:", req.body?.event || req.body?.type);
  try {
    const result = await handleHospitableWebhook(req.body);
    res.json(result);
  } catch (err) {
    console.error("Hospitable Webhook processing error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Send direct message via Hospitable API
app.post('/api/integrations/hospitable/send-message', async (req, res) => {
  const { apiKey, reservationId, messageBody } = req.body;
  if (!apiKey || !reservationId || !messageBody) {
    return res.status(400).json({ error: "apiKey, reservationId et messageBody sont requis" });
  }
  try {
    const result = await sendHospitableMessage(apiKey, reservationId, messageBody);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Save logo helper
app.post('/api/save-logo', (req, res) => {
  const { base64Data, filename } = req.body;
  const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const targetPath = path.join(__dirname, '../client/public', filename);
  fs.writeFileSync(targetPath, buffer);
  res.json({ success: true, path: targetPath });
});

// Serve built React client in production
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

app.listen(PORT, () => {
  console.log(`Claro Airbnb Manager Server running on port ${PORT}`);
});



