// Copies pdf.js's worker next to the app so the Evidence Inspector loads it from this origin, at the
// exact version of the installed library (a mismatched worker throws "API version does not match").
// Runs before `next dev` and `next build` (package.json pre-scripts). The copy is gitignored.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const source = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const version = require('pdfjs-dist/package.json').version;
const targetDir = path.resolve(here, '../public/pdfjs');
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, path.join(targetDir, 'pdf.worker.min.mjs'));
fs.writeFileSync(path.join(targetDir, 'VERSION'), `${version}\n`);
console.log(`pdf.js worker ${version} copied to public/pdfjs/`);
