import { scanDocumentWithOCR } from './ocrService.js';
import path from 'path';

const userUploadedDir = 'C:\\Users\\Claro\\.gemini\\antigravity-ide\\brain\\f91ff54a-3cb6-44f1-beb1-18095368038a\\.user_uploaded';
const files = [
  path.join(userUploadedDir, 'media_1789645142101.png'), // Moroccan CIN
  path.join(userUploadedDir, 'media_1789645241028.jpg'), // UK Passport
  path.join(userUploadedDir, 'media_1789645245815.png')  // Dutch Passport
];

async function main() {
  for (const f of files) {
    console.log("\n=================================");
    console.log("Testing:", path.basename(f));
    const res = await scanDocumentWithOCR(f);
    console.log("Parsed result:", JSON.stringify(res, null, 2));
  }
  process.exit(0);
}

main().catch(console.error);
