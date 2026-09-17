import { createWorker } from 'tesseract.js';
import * as mrz from 'mrz';

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng+fra');
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Convert YYMMDD to YYYY-MM-DD
 */
function parseYYMMDD(str, isExpiry = false) {
  if (!str || str.length !== 6) return '';
  const yy = parseInt(str.substring(0, 2), 10);
  const mm = str.substring(2, 4);
  const dd = str.substring(4, 6);
  const currentYear = new Date().getFullYear() % 100;
  
  let century;
  if (isExpiry) {
    century = yy <= currentYear + 30 ? 2000 : 1900;
  } else {
    century = yy <= currentYear ? 2000 : 1900;
  }
  
  return `${century + yy}-${mm}-${dd}`;
}

/**
 * Format DD.MM.YYYY or DD/MM/YYYY to YYYY-MM-DD
 */
function parseDateString(dateStr) {
  if (!dateStr) return '';
  const clean = dateStr.replace(/[^\d./-]/g, '').trim();
  const parts = clean.split(/[./-]/);
  if (parts.length === 3) {
    let day = parts[0].padStart(2, '0');
    let month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) year = '19' + year;
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

const COUNTRY_MAP = {
  GBR: 'Britannique',
  FRA: 'Française',
  MAR: 'Marocaine',
  ESP: 'Espagnole',
  NLD: 'Néerlandaise',
  BEL: 'Belge',
  DEU: 'Allemande',
  ITA: 'Italienne',
  USA: 'Américaine',
  CAN: 'Canadienne',
  CHE: 'Suisse',
  PRT: 'Portugaise'
};

/**
 * Extract data from Passport MRZ + Visual Text
 */
function extractPassportData(rawText, lines) {
  const textUpper = rawText.toUpperCase();
  const result = {
    documentType: 'passport',
    lastName: '',
    firstName: '',
    idNumber: '',
    nationality: '',
    birthDate: '',
    birthPlace: '',
    expiryDate: '',
    sex: ''
  };

  // Find candidate MRZ lines
  const cleanLines = lines.map(l => l.replace(/[^A-Z0-9<]/g, '').toUpperCase());

  // 1. Line 1: P<[COUNTRY][SURNAME]<<[GIVEN_NAMES]
  const line1 = cleanLines.find(l => l.includes('<<'));
  if (line1) {
    const parts = line1.split('<<');
    let left = parts[0].replace(/</g, '').trim();

    // Remove leading P or P<
    left = left.replace(/^P<?/, '');

    // Check if starts with a 3-letter country code
    for (const code of Object.keys(COUNTRY_MAP)) {
      if (left.startsWith(code)) {
        result.nationality = COUNTRY_MAP[code];
        left = left.substring(code.length);
        break;
      }
    }
    // Also strip single leading noise character like D or <
    left = left.replace(/^[A-Z]<+/, '').replace(/^[^A-Z]+/, '');
    if (left.startsWith('D') && left.length > 5 && !left.startsWith('DE')) {
      // e.g. DFIGAROA -> FIGAROA
      left = left.substring(1);
    }

    result.lastName = left;

    if (parts[1]) {
      result.firstName = parts[1].replace(/<+/g, ' ').trim();
    }
  }

  // Visual text check for clean names (e.g. MALIK or Figaroa)
  const surnameVisual = rawText.match(/(?:Surname|Nom|Naam)[^\w\n]*\n?\s*([A-Za-zÀ-ÿ\s-]{2,25})/i);
  if (surnameVisual && (!result.lastName || result.lastName.length < 3)) {
    result.lastName = surnameVisual[1].trim().toUpperCase();
  }

  // 2. Line 2: [PASSPORT_NO][check][COUNTRY][DOB][check][SEX][EXPIRY]
  const line2 = cleanLines.find(l => /([A-Z]{3})([0-9]{6})/.test(l));
  if (line2) {
    // Match Country + DOB + Sex + Expiry
    const match = line2.match(/([A-Z]{3})([0-9]{6})[0-9]?([MF<])([0-9]{6})/);
    if (match) {
      const natCode = match[1];
      result.nationality = COUNTRY_MAP[natCode] || natCode;
      result.birthDate = parseYYMMDD(match[2], false);
      result.sex = match[3] === '<' ? '' : match[3];
      result.expiryDate = parseYYMMDD(match[4], true);

      // Extract passport number before country code
      const prefix = line2.split(natCode)[0];
      const numMatch = prefix.match(/([A-Z0-9]{7,10})/);
      if (numMatch) {
        result.idNumber = numMatch[1];
      }
    }
  }

  // Visual text fallbacks for place of birth
  const placeMatch = rawText.match(/(?:Place of birth|Lieu de naissance|Geboorteplaats)[^\w]*([A-ZÀ-ÿ\s-]+)/i);
  if (placeMatch) {
    const placeLine = placeMatch[1].trim().split('\n')[0].replace(/[^\w\s-]/g, '').trim();
    if (placeLine && placeLine.length > 2 && placeLine.length < 30) {
      result.birthPlace = placeLine;
    }
  }

  // Visual fallback for passport number if MRZ was slightly noisy
  const passNumMatch = rawText.match(/(?:Passport No|Passeport No|Document no)[^\w]*([A-Z0-9]{7,10})/i);
  if (passNumMatch) {
    result.idNumber = passNumMatch[1].trim();
  }

  return (result.lastName || result.idNumber || result.birthDate) ? result : null;
}

/**
 * Extract data from Moroccan CIN
 */
function extractMoroccanCINData(rawText, lines) {
  const textUpper = rawText.toUpperCase();
  const isCIN = textUpper.includes('CARTE NATIONALE') || 
                textUpper.includes('ROYAUME DU MAROC') || 
                /[A-Z]{1,2}[0-9]{6}/.test(textUpper);

  if (!isCIN) return null;

  const result = {
    documentType: 'cin',
    nationality: 'Marocaine',
    lastName: '',
    firstName: '',
    idNumber: '',
    birthDate: '',
    birthPlace: '',
    expiryDate: ''
  };

  // 1. Extract CIN number: Moroccan CIN is 1 or 2 letters followed by 5 to 7 digits (e.g. NM851019)
  const cinMatch = textUpper.match(/\b([A-Z]{1,2}[0-9]{5,7})\b/);
  if (cinMatch) {
    result.idNumber = cinMatch[1];
  }

  // 2. Extract Date of Birth: 12.06.1994
  const dobMatch = rawText.match(/([0-3]?[0-9][./-][0-1][0-9][./-](?:19|20)[0-9]{2})/);
  if (dobMatch) {
    result.birthDate = parseDateString(dobMatch[1]);
  }

  // 3. Extract Place of Birth: à AMSTERDAM PAYS-BAS
  const placeMatch = rawText.match(/à\s+([A-ZÀ-ÿ\s-]+?)(?:\n|\r|\d|Valable|N°)/i);
  if (placeMatch) {
    result.birthPlace = placeMatch[1].trim().replace(/\s+/g, ' ');
  }

  // 4. Extract Expiry Date: Valable jusqu'au 10.12.2035
  const expMatch = rawText.match(/(?:Valable|Valable jusqu['’]au)[^\d]*([0-3]?[0-9][./-][0-1][0-9][./-](?:20)[0-9]{2})/i);
  if (expMatch) {
    result.expiryDate = parseDateString(expMatch[1]);
  }

  // 5. Extract Names: Look for clean uppercase words (e.g. ANOUAR, BENNAJEM)
  const candidateNames = lines
    .map(l => l.replace(/[^a-zA-Z\s-]/g, '').trim())
    .filter(l => l.length >= 3 && l === l.toUpperCase() && 
                 !l.includes('ROYAUME') && 
                 !l.includes('MAROC') && 
                 !l.includes('CARTE') && 
                 !l.includes('NATIONALE') && 
                 !l.includes('IDENTITE') && 
                 !l.includes('AMSTERDAM') && 
                 !l.includes('VALABLE'));

  if (candidateNames.length >= 2) {
    result.firstName = candidateNames[0];
    result.lastName = candidateNames[1];
  } else if (candidateNames.length === 1) {
    result.lastName = candidateNames[0];
  }

  return (result.idNumber || result.birthDate || result.lastName) ? result : null;
}

/**
 * Main OCR recognition function
 */
export async function scanDocumentWithOCR(filePath) {
  try {
    const worker = await getWorker();
    const ret = await worker.recognize(filePath);
    const rawText = ret.data.text || '';
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // 1. Try Passport MRZ
    const passportData = extractPassportData(rawText, lines);
    if (passportData && (passportData.idNumber || passportData.lastName)) {
      return {
        success: true,
        documentType: 'passport',
        data: passportData,
        rawText
      };
    }

    // 2. Try Moroccan CIN
    const cinData = extractMoroccanCINData(rawText, lines);
    if (cinData && (cinData.idNumber || cinData.birthDate || cinData.lastName)) {
      return {
        success: true,
        documentType: 'cin',
        data: cinData,
        rawText
      };
    }

    // 3. Fallback
    return {
      success: true,
      documentType: 'unknown',
      data: {
        documentType: 'passport',
        lastName: '',
        firstName: '',
        idNumber: '',
        nationality: '',
        birthDate: '',
        birthPlace: '',
        expiryDate: '',
        sex: ''
      },
      rawText
    };

  } catch (err) {
    console.error("OCR scan failed:", err);
    throw new Error(`Erreur OCR: ${err.message}`);
  }
}
