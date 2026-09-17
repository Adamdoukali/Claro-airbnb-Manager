import { createWorker } from 'tesseract.js';
import * as mrz from 'mrz';
import fs from 'fs';
import path from 'path';

const userUploadedDir = 'C:\\Users\\Claro\\.gemini\\antigravity-ide\\brain\\f91ff54a-3cb6-44f1-beb1-18095368038a\\.user_uploaded';
const files = fs.readdirSync(userUploadedDir).map(f => path.join(userUploadedDir, f));

async function run() {
  console.log("Initializing Tesseract worker...");
  const worker = await createWorker('eng+fra');

  for (const file of files) {
    console.log(`\n========================================`);
    console.log(`Analyzing file: ${file}`);
    console.log(`========================================`);

    const ret = await worker.recognize(file);
    const text = ret.data.text;
    console.log("Extracted raw text:\n", text);
  }

  await worker.terminate();
}

run().catch(console.error);
