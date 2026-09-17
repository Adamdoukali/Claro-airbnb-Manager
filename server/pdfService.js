import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDF_DIR = path.join(__dirname, 'generated_pdfs');

if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

/**
 * Generate official Moroccan Police Guest Registration Form (Fiche Individuelle de Police)
 * Supports 1, 2, 3, 5+ guests in a single combined PDF with one signature
 */
export async function generatePolicePdf(registration, property) {
  const pdfDoc = await PDFDocument.create();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const primaryColor = rgb(0.1, 0.1, 0.1);
  const accentRed = rgb(0.85, 0.15, 0.2); // Moroccan Flag Red / Airbnb Rausch blend
  const moroccanGreen = rgb(0.0, 0.38, 0.24); // Moroccan Star Green
  const bgLight = rgb(0.96, 0.96, 0.97);
  const borderCol = rgb(0.75, 0.75, 0.78);
  const labelCol = rgb(0.35, 0.35, 0.35);

  const rawDetails = registration.guestDetails || {};
  // Handle both single guest and multiple guests array
  let guestList = [];
  if (Array.isArray(rawDetails.guests) && rawDetails.guests.length > 0) {
    guestList = rawDetails.guests;
  } else {
    guestList = [rawDetails];
  }

  const primaryGuest = guestList[0] || {};
  const leadGuestName = `${primaryGuest.lastName || registration.guestName || ''} ${primaryGuest.firstName || ''}`.trim();
  const commonStay = rawDetails.commonStay || {};
  const arrivalDate = commonStay.arrivalDate || primaryGuest.arrivalDate || registration.checkIn || '-';
  const departureDate = commonStay.departureDate || primaryGuest.departureDate || registration.checkOut || '-';
  const comingFrom = commonStay.comingFrom || primaryGuest.comingFrom || 'Étranger';
  const goingTo = commonStay.goingTo || primaryGuest.goingTo || 'Maroc';

  // Embed signature once if available
  let embeddedSig = null;
  if (registration.signaturePath && fs.existsSync(registration.signaturePath)) {
    try {
      const sigBytes = fs.readFileSync(registration.signaturePath);
      embeddedSig = await pdfDoc.embedPng(sigBytes);
    } catch (e) {
      console.error("Could not embed signature:", e.message);
    }
  }

  // Generate an official A4 page for EACH guest in the party
  for (let idx = 0; idx < guestList.length; idx++) {
    const guest = guestList[idx];
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 format
    const { width, height } = page.getSize();
    let y = height - 40;

    // 1. HEADER - Official Moroccan Kingdom Header
    page.drawRectangle({
      x: 35,
      y: y - 58,
      width: width - 70,
      height: 68,
      borderColor: borderCol,
      borderWidth: 1,
      color: bgLight
    });

    page.drawText("ROYAUME DU MAROC", {
      x: width / 2 - 65,
      y: y - 4,
      size: 11,
      font: fontBold,
      color: moroccanGreen
    });

    page.drawText("DIRECTION GÉNÉRALE DE LA SÛRETÉ NATIONALE / GENDARMERIE ROYALE", {
      x: width / 2 - 190,
      y: y - 18,
      size: 8.5,
      font: fontBold,
      color: primaryColor
    });

    const isPrimary = idx === 0;
    const guestBadge = guestList.length > 1 
      ? ` - VOYAGEUR ${idx + 1}/${guestList.length} (${isPrimary ? 'TITULAIRE RÉSERVATION' : 'ACCOMPAGNATEUR'})`
      : '';

    page.drawText(`FICHE INDIVIDUELLE DE POLICE - DÉCLARATION DE SÉJOUR${guestBadge}`, {
      x: width / 2 - (guestList.length > 1 ? 240 : 170),
      y: y - 34,
      size: guestList.length > 1 ? 9.5 : 11,
      font: fontBold,
      color: accentRed
    });

    page.drawText("BULLETIN INDIVIDUEL DE RENSEIGNEMENT (LOI N° 80-14 RÉGISSANT LES ÉTABLISSEMENTS TOURISTIQUES)", {
      x: width / 2 - 205,
      y: y - 48,
      size: 6.8,
      font: fontOblique,
      color: labelCol
    });

    y -= 76;

    // 2. ESTABLISHMENT DETAILS SECTION
    page.drawText("1. ÉTABLISSEMENT D'HÉBERGEMENT / RIAD / APPARTEMENT", {
      x: 35,
      y,
      size: 9,
      font: fontBold,
      color: primaryColor
    });

    y -= 12;

    const estBoxH = 46;
    page.drawRectangle({
      x: 35,
      y: y - estBoxH,
      width: width - 70,
      height: estBoxH,
      borderColor: borderCol,
      borderWidth: 0.8,
      color: rgb(0.99, 0.99, 0.99)
    });

    const p = property || {};
    page.drawText(`Établissement: ${p.name || 'Hébergement Touristique'}`, { x: 45, y: y - 13, size: 8.5, font: fontBold, color: primaryColor });
    page.drawText(`Type: ${p.type || 'Location Meublée / Riad'}`, { x: 340, y: y - 13, size: 8, font: fontRegular, color: primaryColor });
    page.drawText(`Adresse: ${p.address || 'Maroc'}`, { x: 45, y: y - 26, size: 7.8, font: fontRegular, color: primaryColor });
    page.drawText(`Ville: ${p.city || 'Marrakech'}`, { x: 340, y: y - 26, size: 8, font: fontRegular, color: primaryColor });
    page.drawText(`N° Autorisation / Patente: ${p.policeLicenseNumber || 'En cours'}`, { x: 45, y: y - 38, size: 7.8, font: fontRegular, color: primaryColor });
    page.drawText(`Nbre de personnes au dossier: ${guestList.length} voyageur(s)`, { x: 340, y: y - 38, size: 7.8, font: fontBold, color: accentRed });

    y -= estBoxH + 16;

    // 3. GUEST IDENTITY SECTION
    page.drawText(`2. IDENTITÉ DU VOYAGEUR N° ${idx + 1} (${isPrimary ? 'CHEF DE GROUPE / PRINCIPAL' : 'ACCOMPAGNATEUR'})`, {
      x: 35,
      y,
      size: 9,
      font: fontBold,
      color: primaryColor
    });

    y -= 12;

    const guestBoxH = 135;
    page.drawRectangle({
      x: 35,
      y: y - guestBoxH,
      width: width - 70,
      height: guestBoxH,
      borderColor: borderCol,
      borderWidth: 0.8,
      color: rgb(0.99, 0.99, 0.99)
    });

    const renderField = (label, val, xPos, yPos) => {
      page.drawText(label, { x: xPos, y: yPos, size: 7.2, font: fontRegular, color: labelCol });
      page.drawText(String(val || '-').toUpperCase(), { x: xPos, y: yPos - 11, size: 8.2, font: fontBold, color: primaryColor });
    };

    let rowY = y - 14;
    renderField("Nom de famille / Surname:", guest.lastName || (isPrimary ? registration.guestName : '-'), 45, rowY);
    renderField("Prénom / First name:", guest.firstName || '-', 220, rowY);
    renderField("Nationalité / Nationality:", guest.nationality || 'Étrangère', 395, rowY);

    rowY -= 26;
    renderField("Date de naissance / DOB:", guest.birthDate || '-', 45, rowY);
    renderField("Lieu de naissance / Place of birth:", guest.birthPlace || '-', 220, rowY);
    renderField("Profession / Occupation:", guest.profession || 'Touriste', 395, rowY);

    rowY -= 26;
    const guestAddress = guest.address || commonStay.address || primaryGuest.address || 'Résidence Habituelle';
    renderField("Domicile habituel / Permanent Address:", guestAddress, 45, rowY);
    renderField("Motif du voyage:", guest.travelPurpose || "Tourisme / Vacances", 395, rowY);

    rowY -= 26;
    renderField("Venant de / Origin:", comingFrom, 45, rowY);
    renderField("Allant à / Destination:", goingTo, 220, rowY);
    renderField("Mode de transport:", guest.transportMode || "Aérien / Vol", 395, rowY);

    rowY -= 26;
    renderField("Date d'arrivée / Arrival:", arrivalDate, 45, rowY);
    renderField("Date de départ prévue / Departure:", departureDate, 220, rowY);
    renderField("Type de document:", guest.idType === 'cin' ? "CIN Marocaine" : "Passeport", 395, rowY);

    y -= guestBoxH + 16;

    // 4. IDENTITY DOCUMENT DETAILS SECTION
    page.drawText("3. PIÈCE D'IDENTITÉ & SCAN / PHOTO NUMÉRISÉE", {
      x: 35,
      y,
      size: 9,
      font: fontBold,
      color: primaryColor
    });

    y -= 12;

    const docBoxH = 170;
    page.drawRectangle({
      x: 35,
      y: y - docBoxH,
      width: width - 70,
      height: docBoxH,
      borderColor: borderCol,
      borderWidth: 0.8,
      color: rgb(0.99, 0.99, 0.99)
    });

    // Sub-header for Document Number
    page.drawText(`N° DE LA PIÈCE : ${(guest.idNumber || '-').toUpperCase()}  |  TYPE : ${guest.idType === 'cin' ? "CARTE NATIONALE D'IDENTITÉ (C.I.N)" : "PASSEPORT INTERNATIONAL"}`, {
      x: 45,
      y: y - 14,
      size: 8.5,
      font: fontBold,
      color: accentRed
    });

    // Left Column: Embedded Image of ID
    let guestDocPath = guest.idDocumentPath || (isPrimary ? registration.idDocumentPath : null);
    let idImageEmbedded = false;

    if (guestDocPath && fs.existsSync(guestDocPath)) {
      try {
        const imgBytes = fs.readFileSync(guestDocPath);
        let embeddedImg;
        const lower = guestDocPath.toLowerCase();
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
          embeddedImg = await pdfDoc.embedJpg(imgBytes);
        } else if (lower.endsWith('.png')) {
          embeddedImg = await pdfDoc.embedPng(imgBytes);
        }

        if (embeddedImg) {
          const maxWidth = 250;
          const maxHeight = 125;
          const imgDims = embeddedImg.scaleToFit(maxWidth, maxHeight);

          page.drawImage(embeddedImg, {
            x: 45 + (maxWidth - imgDims.width) / 2,
            y: y - docBoxH + 10 + (maxHeight - imgDims.height) / 2,
            width: imgDims.width,
            height: imgDims.height
          });
          idImageEmbedded = true;
        }
      } catch (e) {
        console.error("Could not embed ID image for guest:", e.message);
      }
    }

    if (!idImageEmbedded) {
      page.drawRectangle({
        x: 45,
        y: y - docBoxH + 14,
        width: 250,
        height: 125,
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 1,
        color: rgb(0.97, 0.97, 0.97)
      });
      page.drawText("[Scan / Photo de la pièce d'identité]", {
        x: 65,
        y: y - 85,
        size: 8,
        font: fontOblique,
        color: labelCol
      });
    }

    // Right Column: Single Group Signature & Attestation
    const sigColX = 320;
    page.drawText("Signature officielle du séjour :", {
      x: sigColX,
      y: y - 30,
      size: 8.5,
      font: fontBold,
      color: labelCol
    });

    if (embeddedSig) {
      const maxSigW = 190;
      const maxSigH = 70;
      const sigDims = embeddedSig.scaleToFit(maxSigW, maxSigH);

      page.drawImage(embeddedSig, {
        x: sigColX + 10,
        y: y - 110,
        width: sigDims.width,
        height: sigDims.height
      });
    } else {
      page.drawRectangle({
        x: sigColX,
        y: y - 105,
        width: 200,
        height: 70,
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 1,
        color: rgb(0.97, 0.97, 0.97)
      });
      page.drawText("[Signature électronique]", {
        x: sigColX + 45,
        y: y - 72,
        size: 7.5,
        font: fontOblique,
        color: labelCol
      });
    }

    page.drawText("Je soussigné(e) certifie sur l'honneur l'exactitude des", {
      x: sigColX,
      y: y - 122,
      size: 6.8,
      font: fontOblique,
      color: labelCol
    });
    page.drawText(`renseignements pour les ${guestList.length} voyageur(s) de la réservation.`, {
      x: sigColX,
      y: y - 131,
      size: 6.8,
      font: fontOblique,
      color: labelCol
    });

    const signDate = registration.completedAt ? new Date(registration.completedAt).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR');
    page.drawText(`Signataire : ${leadGuestName}`, {
      x: sigColX,
      y: y - 144,
      size: 7.5,
      font: fontBold,
      color: primaryColor
    });
    page.drawText(`Signé numériquement le : ${signDate}`, {
      x: sigColX,
      y: y - 154,
      size: 7,
      font: fontRegular,
      color: primaryColor
    });
    page.drawText(`Code d'accès : ${registration.accessCode || registration.id}`, {
      x: sigColX,
      y: y - 163,
      size: 7,
      font: fontRegular,
      color: labelCol
    });

    y -= docBoxH + 24;

    // 5. FOOTER
    page.drawLine({
      start: { x: 35, y },
      end: { x: width - 35, y },
      thickness: 0.8,
      color: borderCol
    });

    page.drawText(`Document officiel généré pour les autorités marocaines (DGSN / Gendarmerie) - Page ${idx + 1} sur ${guestList.length}`, {
      x: 45,
      y: y - 12,
      size: 7,
      font: fontOblique,
      color: labelCol
    });
    page.drawText(`Dossier Réf: ${registration.id} - Date d'émission: ${new Date().toLocaleDateString('fr-FR')}`, {
      x: 45,
      y: y - 22,
      size: 6.5,
      font: fontRegular,
      color: labelCol
    });
  }

  const pdfBytes = await pdfDoc.save();
  const pdfFilename = `fiche_police_${registration.accessCode || registration.id}_${Date.now()}.pdf`;
  const pdfFilePath = path.join(PDF_DIR, pdfFilename);
  fs.writeFileSync(pdfFilePath, pdfBytes);

  return {
    filename: pdfFilename,
    filePath: pdfFilePath,
    downloadUrl: `/api/police/download/${pdfFilename}`,
    totalGuests: guestList.length
  };
}
