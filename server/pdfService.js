import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getSettings } from './database.js';
import { config } from './config.js';
import { readFile, saveFile, deleteFile, mimeForKey } from './storage.js';

/**
 * Locate a Chromium-based browser for HTML -> PDF rendering (Windows, Linux, macOS).
 * Returns null when none is available; the pdf-lib fallback is then used.
 */
function getBrowserExecutable() {
  const candidates = [
    config.chromePath,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    // Windows
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    // Linux (Render / Railway / Docker)
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * Fonts embedded in the HTML so the layout (incl. Arabic labels) renders identically on
 * Windows, Linux containers and serverless Chromium, none of which share system fonts.
 */
let fontCssCache = null;
function embeddedFontCss() {
  if (fontCssCache !== null) return fontCssCache;
  const fontsDir = path.join(config.serverDir, 'fonts');
  const faces = [
    { family: 'Claro Sans', file: 'NotoSans.ttf', weight: '100 900' },
    { family: 'Claro Arabic', file: 'NotoNaskhArabic.ttf', weight: '100 900' }
  ];
  let css = '';
  for (const f of faces) {
    const p = path.join(fontsDir, f.file);
    try {
      if (fs.existsSync(p)) {
        const b64 = fs.readFileSync(p).toString('base64');
        css += `@font-face { font-family: '${f.family}'; src: url(data:font/ttf;base64,${b64}) format('truetype'); font-weight: ${f.weight}; }\n`;
      }
    } catch (err) {
      console.warn(`[pdf] Police ${f.file} illisible :`, err.message);
    }
  }
  fontCssCache = css;
  return css;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getArabicCity(city = '') {
  const c = city.toLowerCase().trim();
  if (c.includes('tang') || c.includes('tanj')) return 'طنجة';
  if (c.includes('marrak')) return 'مراكش';
  if (c.includes('assilah') || c.includes('asila')) return 'أصيلة';
  if (c.includes('casa')) return 'الدار البيضاء';
  if (c.includes('rabat')) return 'الرباط';
  if (c.includes('agadir')) return 'أكادير';
  if (c.includes('fes') || c.includes('fez')) return 'فاس';
  if (c.includes('tetouan')) return 'تطوان';
  if (c.includes('essaouira')) return 'الصويرة';
  return city || 'المغرب';
}

/** Resolve the values printed on one bulletin for one guest. */
function bulletinModel({ guest, primaryGuest, commonStay, property, settings, companionsCount, totalGuests, guestIndex, todayStr }) {
  const city = property.city || settings.agencyCity || '';
  const idNumber = guest.idNumber || guest.cin || guest.passportNumber || '';
  const isCin = (guest.idType || '').toLowerCase() === 'cin';
  return {
    agencyName: settings.agencyName || property.hostName || 'Hébergement touristique',
    agencyAddress: settings.agencyAddress || property.address || '',
    agencySub: settings.agencySubAddress || [city, property.hostPhone ? `Tél.: ${property.hostPhone}` : ''].filter(Boolean).join(' - '),
    agencyPhone: settings.agencyPhone || property.hostPhone || '',
    agencyIce: settings.agencyIce || '',
    licenseNumber: property.policeLicenseNumber || '',
    city,
    cityAr: getArabicCity(city),
    lastName: (guest.lastName || '').toUpperCase(),
    firstName: guest.firstName || '',
    birthDate: guest.birthDate || '-',
    birthPlace: guest.birthPlace || '',
    nationality: guest.nationality || 'Marocaine',
    address: guest.address || commonStay.address || primaryGuest.address || '-',
    cinNumber: isCin ? idNumber : (guest.cin || '-'),
    passportNumber: !isCin ? (idNumber || guest.passportNumber || '-') : (guest.passportNumber || '-'),
    arrivalDate: commonStay.arrivalDate || guest.arrivalDate || '-',
    departureDate: commonStay.departureDate || '',
    apartmentNum: commonStay.apartmentNumber || property.name || '',
    comingFrom: commonStay.comingFrom || guest.comingFrom || '-',
    goingTo: commonStay.goingTo || guest.goingTo || (city ? `${city}, Maroc` : 'Maroc'),
    idNumber,
    companionsCount,
    totalGuests,
    guestIndex,
    todayStr
  };
}

function buildBulletinHtml(m, signatureBase64, idDocumentBase64) {
  const row = (fr, sub, value, ar) => `
      <div class="field-row">
        <div class="label-left"><span class="main-txt">${fr}</span>${sub ? `<span class="sub-txt">${sub}</span>` : ''}</div>
        <div class="dots-line"><span class="val-txt">${escapeHtml(value)}</span></div>
        <div class="label-right">${ar}</div>
      </div>`;

  return `
  <div class="page-container">
    <div class="header">
      <div class="header-main">${escapeHtml(m.agencyName)}</div>
      ${m.agencyAddress ? `<div class="header-sub">${escapeHtml(m.agencyAddress)}</div>` : ''}
      ${m.agencySub ? `<div class="header-sub">${escapeHtml(m.agencySub)}</div>` : ''}
      ${m.licenseNumber ? `<div class="header-sub">N° d'autorisation : ${escapeHtml(m.licenseNumber)}</div>` : ''}
      <div class="divider"></div>
      <div class="title">BULLETIN INDIVIDUEL <span class="title-idx">— voyageur ${m.guestIndex} / ${m.totalGuests}</span></div>
      <div class="title-ar">بطاقة فردية</div>
    </div>

    <div class="box">
      ${row('Nom :', 'Surname', m.lastName, 'الإسم العائلي :')}
      ${row('Prénom :', 'Name', m.firstName, 'الإسم الشخصي :')}
      ${row('Date de Naissance :', 'Date of Birth', m.birthDate, 'تاريخ الإزدياد :')}
      ${row('Lieu de Naissance :', 'Place of Birth', m.birthPlace || '-', 'مكان الإزدياد :')}
      ${row('Nationalité :', 'Nationality', m.nationality, 'الجنسية :')}
      <div class="cin-section">
        <div class="cin-branch-left">N° C.I.N. / Carte de Séjour<br>ou date d'entrée au Maroc</div>
        <div class="cin-box">${escapeHtml(m.cinNumber !== '-' ? m.cinNumber : '')}</div>
        <div class="cin-branch-right">رقم ب.ت.و / بطاقة الإقامة<br>أو تاريخ الدخول</div>
      </div>
      ${row('Domicile Habituel :', 'Address', m.address, 'العنوان الدائم :')}
      ${row('N° du Passeport :', 'Passport N°', m.passportNumber, 'رقم الجواز :')}
    </div>

    <div class="box">
      ${row("Date d'arrivée", 'Arrival', m.arrivalDate, 'تاريخ الوصول')}
      ${row('Date de départ', 'Departure', m.departureDate || '-', 'تاريخ المغادرة')}
      <div class="field-row" style="margin: 10px 0;">
        <div class="label-left"><span class="main-txt">Logement / N° Appartement</span></div>
        <div class="cin-box" style="min-width: 170px; margin: 0 16px;">${escapeHtml(m.apartmentNum)}</div>
        <div class="label-right">رقم الشقة</div>
      </div>
      <div class="field-row" style="margin: 10px 0;">
        <div class="label-left">
          <span class="main-txt">Nombre de voyageurs</span>
          <span class="sub-txt">Total guests${m.companionsCount ? ` · dont ${m.companionsCount} accompagnant${m.companionsCount > 1 ? 's' : ''}` : ''}</span>
        </div>
        <div class="cin-box" style="min-width: 170px; margin: 0 16px;">${m.totalGuests}</div>
        <div class="label-right">عدد المسافرين</div>
      </div>
      ${row('Lieu de Provenance', 'Coming from', m.comingFrom, 'أتى من')}
      ${row('Destination', 'Going to', m.goingTo, 'متوجها إلى')}

      <div class="sig-section">
        <div class="stamp-box">
          <div class="stamp-title">${escapeHtml(m.agencyName)}</div>
          ${m.agencyAddress ? `<div>${escapeHtml(m.agencyAddress)}</div>` : ''}
          ${m.city || m.agencyPhone ? `<div>${escapeHtml(m.city)}${m.agencyPhone ? ` - Tél.: ${escapeHtml(m.agencyPhone)}` : ''}</div>` : ''}
          ${m.agencyIce ? `<div>ICE: ${escapeHtml(m.agencyIce)}</div>` : ''}
        </div>
        <div class="sig-box">
          <div class="sig-ar">إمضاء الزبون</div>
          <div class="sig-fr">Signature du Client</div>
          <div class="sig-display">
            ${signatureBase64
              ? `<img src="${signatureBase64}" style="max-width: 130px; max-height: 48px; object-fit: contain;" />`
              : '<span style="color: #888; font-size: 8pt; font-style: italic;">[Signé électroniquement]</span>'}
          </div>
        </div>
      </div>

      <div class="field-row" style="margin-top: 14px;">
        <div class="label-left"><span class="main-txt">Fait à ${escapeHtml(m.city || 'Maroc')} le</span></div>
        <div class="dots-line" style="max-width: 280px;"><span class="val-txt">${m.todayStr}</span></div>
        <div class="label-right">${m.cityAr} في</div>
      </div>
    </div>

    <div class="footer-notice">
      <div class="ar">البطاقة الوطنية إجبارية بالنسبة للمغاربة</div>
      <div class="fr">Carte d'Identité Nationale obligatoire pour les Marocains</div>
    </div>
  </div>

  ${idDocumentBase64 ? `
    <div class="annex-page">
      <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 13pt; text-transform: uppercase;">Annexe : Copie Pièce d'Identité / Passeport</h3>
        <p style="margin: 4px 0 0 0; font-size: 9pt; color: #555;">Voyageur ${m.guestIndex} / ${m.totalGuests} : <strong>${escapeHtml(m.lastName)} ${escapeHtml(m.firstName)}</strong>${m.idNumber ? ` · N° ${escapeHtml(m.idNumber)}` : ''}</p>
      </div>
      <div style="display: flex; justify-content: center; align-items: center; margin-top: 20px;">
        <img src="${idDocumentBase64}" style="max-width: 90%; max-height: 520px; border: 1px solid #ccc; border-radius: 8px;" />
      </div>
    </div>` : ''}
  `;
}

const PAGE_CSS = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: 'Claro Sans', Arial, 'DejaVu Sans', sans-serif; margin: 0; padding: 0; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label-right, .cin-branch-right, .sig-ar, .title-ar, .footer-notice .ar { font-family: 'Claro Arabic', 'Traditional Arabic', 'Segoe UI', Tahoma, 'DejaVu Sans', sans-serif !important; }
  .page-container, .annex-page { width: 100%; max-width: 650px; margin: 0 auto; padding: 12mm 14mm; page-break-after: always; }
  .title-idx { font-size: 9pt; font-weight: normal; letter-spacing: 0; color: #444; }
  .header { text-align: center; margin-bottom: 10px; }
  .header-main { font-size: 26pt; font-weight: 900; margin: 2px 0 3px 0; letter-spacing: 2px; }
  .header-sub { font-size: 9.5pt; margin: 1px 0; color: #333; }
  .divider { border-bottom: 2px solid #000; width: 70px; margin: 8px auto; }
  .title { text-align: center; font-size: 15.5pt; font-weight: bold; letter-spacing: 2px; margin: 8px 0 2px 0; }
  .title-ar { text-align: center; font-size: 13pt; font-weight: bold; direction: rtl; margin-bottom: 10px; font-family: 'Traditional Arabic', 'Segoe UI', Tahoma, 'DejaVu Sans', sans-serif; }
  .box { border: 1.6px solid #000; padding: 10px 14px; margin-bottom: 14px; }
  .field-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; font-size: 10pt; }
  .label-left { display: flex; flex-direction: column; white-space: nowrap; min-width: 120px; }
  .label-left .main-txt { font-weight: bold; font-size: 10pt; }
  .label-left .sub-txt { font-size: 7.2pt; font-style: italic; color: #555; margin-top: -1px; }
  .label-right { direction: rtl; white-space: nowrap; font-family: 'Traditional Arabic', 'Segoe UI', Tahoma, 'DejaVu Sans', sans-serif; font-size: 11pt; font-weight: bold; min-width: 90px; text-align: right; }
  .dots-line { flex-grow: 1; border-bottom: 1px dotted #444; margin: 0 8px; height: 14px; position: relative; top: -3px; display: flex; align-items: flex-end; padding: 0 6px; }
  .val-txt { font-weight: bold; font-size: 9.8pt; }
  .cin-section { display: flex; justify-content: space-between; align-items: center; margin: 10px 0; }
  .cin-branch-left { font-size: 9pt; line-height: 1.25; }
  .cin-box { border: 1.6px solid #000; min-width: 150px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10.5pt; letter-spacing: 1px; padding: 0 8px; }
  .cin-branch-right { direction: rtl; text-align: right; font-family: 'Traditional Arabic', 'Segoe UI', Tahoma, 'DejaVu Sans', sans-serif; font-size: 10.5pt; line-height: 1.25; font-weight: bold; }
  .sig-section { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; padding-top: 6px; }
  .stamp-box { border: 2px solid #1a365d; color: #1a365d; padding: 6px 12px; border-radius: 6px; display: inline-block; font-size: 7.8pt; font-weight: bold; text-align: center; transform: rotate(-5deg); line-height: 1.22; max-width: 260px; }
  .stamp-box .stamp-title { font-size: 12pt; letter-spacing: 1.5px; margin-bottom: 2px; font-weight: 900; }
  .sig-box { text-align: center; }
  .sig-ar { font-size: 11pt; font-weight: bold; font-family: 'Traditional Arabic', 'Segoe UI', Tahoma, 'DejaVu Sans', sans-serif; }
  .sig-fr { font-size: 8.5pt; font-style: italic; color: #444; margin-bottom: 4px; }
  .sig-display { border: 1px dashed #aaa; width: 140px; height: 52px; display: flex; align-items: center; justify-content: center; background: #fafafa; }
  .footer-notice { text-align: center; margin-top: 14px; }
  .footer-notice .ar { direction: rtl; font-weight: bold; font-size: 10.5pt; font-family: 'Traditional Arabic', 'Segoe UI', Tahoma, 'DejaVu Sans', sans-serif; }
  .footer-notice .fr { font-style: italic; font-size: 8.8pt; margin-top: 2px; color: #333; }
`;

/**
 * Serverless (Vercel / AWS Lambda): render with @sparticuz/chromium + puppeteer-core.
 * Both are loaded lazily so local/Windows runs never touch them.
 */
let lastRenderError = null;

async function renderWithServerlessChromium(html) {
  if (!config.isServerless) return null;
  let browser = null;
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = await import('puppeteer-core');
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true
    });
    const page = await browser.newPage();
    // Fonts are inlined as data: URIs (several MB): give the page time to decode them.
    await page.setContent(html, { waitUntil: 'load', timeout: 45000 });
    await page.evaluateHandle('document.fonts.ready');
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, timeout: 45000 });
    lastRenderError = null;
    return Buffer.from(pdf);
  } catch (err) {
    lastRenderError = `${err.name || 'Error'}: ${err.message}`;
    console.error('[pdf] Chromium serverless indisponible, repli pdf-lib :', err.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/** Render HTML to PDF with a headless Chromium browser. Returns bytes or null on failure. */
async function renderWithBrowser(html) {
  if (config.isServerless) return renderWithServerlessChromium(html);
  const browserPath = getBrowserExecutable();
  if (!browserPath) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claro-pdf-'));
  const htmlPath = path.join(tmpDir, 'bulletin.html');
  const pdfPath = path.join(tmpDir, 'bulletin.pdf');

  try {
    fs.writeFileSync(htmlPath, html, 'utf-8');
    execFileSync(browserPath, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
      '--run-all-compositor-stages-before-draw',
      `--print-to-pdf=${pdfPath}`, htmlPath
    ], { stdio: 'ignore', timeout: 60000 });

    if (!fs.existsSync(pdfPath)) return null;

    // Belt and braces: white out any browser header/footer strip.
    const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
    for (const page of pdfDoc.getPages()) {
      const { width, height } = page.getSize();
      page.drawRectangle({ x: 0, y: height - 30, width, height: 30, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: 0, y: 0, width, height: 30, color: rgb(1, 1, 1) });
    }
    return await pdfDoc.save();
  } catch (err) {
    console.error('[pdf] Rendu navigateur impossible, repli pdf-lib :', err.message);
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Standard PDF fonts only support Latin-1: strip anything else (Arabic labels are omitted here).
const latin = value => String(value ?? '').replace(/[^\u0000-\u00FF]/g, '').trim();

/** Pure pdf-lib rendering (no browser needed). French/English labels only. */
async function renderWithPdfLib(models, images) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const { signature, idDocument } = images[i];
    const page = doc.addPage([595.28, 841.89]);
    const { width } = page.getSize();
    const margin = 50;
    let y = 790;

    const center = (text, f, size) => {
      const t = latin(text);
      page.drawText(t, { x: (width - f.widthOfTextAtSize(t, size)) / 2, y, size, font: f });
      y -= size + 6;
    };
    center(m.agencyName, bold, 20);
    if (m.agencyAddress) center(m.agencyAddress, font, 9);
    if (m.agencySub) center(m.agencySub, font, 9);
    if (m.licenseNumber) center(`N° d'autorisation : ${m.licenseNumber}`, font, 9);
    y -= 6;
    page.drawLine({ start: { x: width / 2 - 35, y }, end: { x: width / 2 + 35, y }, thickness: 1.5 });
    y -= 20;
    center('BULLETIN INDIVIDUEL', bold, 15);
    center(`Voyageur ${m.guestIndex} / ${m.totalGuests}`, font, 9);
    y -= 8;

    const drawBox = rows => {
      const rowH = 24;
      const boxTop = y;
      const boxH = rows.length * rowH + 16;
      page.drawRectangle({ x: margin, y: boxTop - boxH, width: width - margin * 2, height: boxH, borderWidth: 1.4, borderColor: rgb(0, 0, 0) });
      let ry = boxTop - 20;
      for (const [label, sub, value] of rows) {
        page.drawText(latin(label), { x: margin + 12, y: ry, size: 9.5, font: bold });
        if (sub) page.drawText(latin(sub), { x: margin + 12, y: ry - 9, size: 6.5, font: italic, color: rgb(0.35, 0.35, 0.35) });
        const v = latin(value).slice(0, 70);
        page.drawText(v, { x: margin + 165, y: ry, size: 10, font: bold });
        page.drawLine({ start: { x: margin + 160, y: ry - 3 }, end: { x: width - margin - 12, y: ry - 3 }, thickness: 0.5, color: rgb(0.4, 0.4, 0.4), dashArray: [1, 2] });
        ry -= rowH;
      }
      y = boxTop - boxH - 14;
    };

    drawBox([
      ['Nom :', 'Surname', m.lastName],
      ['Prénom :', 'Name', m.firstName],
      ['Date de Naissance :', 'Date of Birth', m.birthDate],
      ['Lieu de Naissance :', 'Place of Birth', m.birthPlace || '-'],
      ['Nationalité :', 'Nationality', m.nationality],
      ['N° C.I.N. / Séjour :', 'ID / Residence card', m.cinNumber],
      ['Domicile Habituel :', 'Address', m.address],
      ['N° du Passeport :', 'Passport N°', m.passportNumber]
    ]);

    drawBox([
      ["Date d'arrivée :", 'Arrival', m.arrivalDate],
      ['Date de départ :', 'Departure', m.departureDate || '-'],
      ['Logement :', 'Apartment', m.apartmentNum],
      ['Nb. de voyageurs :', m.companionsCount ? `dont ${m.companionsCount} accompagnant(s)` : 'Total guests', String(m.totalGuests)],
      ['Lieu de Provenance :', 'Coming from', m.comingFrom],
      ['Destination :', 'Going to', m.goingTo]
    ]);

    // Signature block
    page.drawText('Signature du Client', { x: width - margin - 150, y, size: 9, font: italic });
    page.drawRectangle({ x: width - margin - 150, y: y - 60, width: 140, height: 52, borderWidth: 0.8, borderColor: rgb(0.6, 0.6, 0.6), borderDashArray: [3, 2] });
    if (signature) {
      try {
        const img = await doc.embedPng(signature);
        const scale = Math.min(130 / img.width, 44 / img.height);
        page.drawImage(img, { x: width - margin - 145, y: y - 56, width: img.width * scale, height: img.height * scale });
      } catch (err) {
        console.warn('[pdf] Signature illisible :', err.message);
      }
    }
    page.drawText(latin(`Fait à ${m.city || 'Maroc'} le ${m.todayStr}`), { x: margin, y: y - 40, size: 10, font: bold });
    page.drawText("Carte d'Identité Nationale obligatoire pour les Marocains", { x: margin, y: y - 80, size: 8.5, font: italic });

    if (idDocument) {
      try {
        const isPng = idDocument.mime === 'image/png';
        const img = isPng ? await doc.embedPng(idDocument.buffer) : await doc.embedJpg(idDocument.buffer);
        const annex = doc.addPage([595.28, 841.89]);
        annex.drawText("Annexe : Copie Pièce d'Identité / Passeport", { x: margin, y: 790, size: 13, font: bold });
        annex.drawText(latin(`Voyageur ${m.guestIndex} / ${m.totalGuests} : ${m.lastName} ${m.firstName}${m.idNumber ? ` · N° ${m.idNumber}` : ''}`), { x: margin, y: 772, size: 9, font });
        const maxW = width - margin * 2, maxH = 680;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        annex.drawImage(img, { x: margin, y: 760 - img.height * scale, width: img.width * scale, height: img.height * scale });
      } catch (err) {
        console.warn('[pdf] Image du document illisible (format non supporté ?) :', err.message);
      }
    }
  }

  return doc.save();
}

/**
 * Diagnostics: which PDF engine is available on this host, and why the others are not.
 */
export async function checkPdfEngine() {
  const result = {
    serverless: config.isServerless,
    fonts: ['NotoSans.ttf', 'NotoNaskhArabic.ttf'].map(f => ({ file: f, present: fs.existsSync(path.join(config.serverDir, 'fonts', f)) })),
    localBrowser: config.isServerless ? null : getBrowserExecutable(),
    serverlessChromium: null,
    engine: 'pdf-lib'
  };

  if (config.isServerless) {
    // Full test render with the embedded fonts: exactly what a real bulletin does.
    const started = Date.now();
    const sample = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${embeddedFontCss()}${PAGE_CSS}</style></head><body><div class="page-container"><div class="title">TEST</div><div class="title-ar">اختبار</div></div></body></html>`;
    const bytes = await renderWithServerlessChromium(sample);
    result.serverlessChromium = bytes
      ? { ok: true, pdfBytes: bytes.length, ms: Date.now() - started }
      : { ok: false, error: lastRenderError, ms: Date.now() - started };
    if (bytes) result.engine = 'chromium-serverless';
  } else if (result.localBrowser) {
    result.engine = 'browser';
  }
  return result;
}

/**
 * Generate the official "Bulletin Individuel" PDF for every guest of a registration.
 * Returns { key, fileName, downloadUrl } and stores the file through the storage adapter.
 */
export async function generatePolicePdf(registration, property = {}) {
  const settings = getSettings();
  const details = registration.guestDetails || {};
  const guestList = Array.isArray(details.guests) && details.guests.length ? details.guests : [details];
  const primaryGuest = guestList[0] || {};
  const commonStay = details.commonStay || {};
  const companionsCount = Math.max(0, guestList.length - 1);
  const now = new Date();
  const todayStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const signature = registration.signaturePath ? await readFile(registration.signaturePath) : null;

  const models = [];
  const images = [];
  let html = '';

  for (let idx = 0; idx < guestList.length; idx++) {
    const guest = guestList[idx];
    const docKey = guest.idDocumentPath || (idx === 0 ? registration.idDocumentPath : null);
    const docBuffer = docKey ? await readFile(docKey) : null;
    const idDocument = docBuffer ? { buffer: docBuffer, mime: mimeForKey(docKey) } : null;

    const m = bulletinModel({
      guest, primaryGuest, commonStay, property, settings, companionsCount,
      totalGuests: guestList.length, guestIndex: idx + 1, todayStr
    });
    models.push(m);
    images.push({ signature, idDocument });

    html += buildBulletinHtml(
      m,
      signature ? `data:image/png;base64,${signature.toString('base64')}` : null,
      idDocument ? `data:${idDocument.mime};base64,${idDocument.buffer.toString('base64')}` : null
    );
  }

  const fullHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>${embeddedFontCss()}${PAGE_CSS}</style></head><body>${html}</body></html>`;

  let bytes = await renderWithBrowser(fullHtml);
  let engine = 'browser';
  if (!bytes) {
    bytes = await renderWithPdfLib(models, images);
    engine = 'pdf-lib';
  }

  const fileName = `bulletin_police_${registration.accessCode || 'mar'}_${Date.now()}.pdf`;
  const key = await saveFile('pdfs', fileName, Buffer.from(bytes), 'application/pdf');

  if (registration.pdfPath && registration.pdfPath !== key) {
    deleteFile(registration.pdfPath).catch(() => {});
  }

  return {
    key,
    fileName,
    engine,
    downloadUrl: `/api/police/download/${fileName}` // host session required
  };
}
