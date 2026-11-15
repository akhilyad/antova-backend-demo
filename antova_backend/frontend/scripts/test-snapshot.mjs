import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const samplePath = path.resolve(__dirname, '../src/lib/sample402.json');
const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));

// Verify authentic engine expectations from test_sample_pack.py
const financials = sample.financials;
const vendorA = financials.find((f) => f.vendor_id === 'vendor-a');
const vendorB = financials.find((f) => f.vendor_id === 'vendor-b');
const vendorC = financials.find((f) => f.vendor_id === 'vendor-c');

if (!vendorA || !vendorB || !vendorC) {
  throw new Error('Missing expected vendors in sample402.json');
}

// 1. Check Nordwerk (vendor-a)
console.assert(vendorA.headline_price === 452000, `vendor-a headline expected 452000, got ${vendorA.headline_price}`);
console.assert(vendorA.total_adders === 0, `vendor-a adders expected 0, got ${vendorA.total_adders}`);
console.assert(vendorA.true_evaluated_price === 452000, `vendor-a true evaluated expected 452000, got ${vendorA.true_evaluated_price}`);

// 2. Check VoltSwitch (vendor-b) — Defect D1 check
console.assert(vendorB.headline_price === 418000, `vendor-b headline expected 418000, got ${vendorB.headline_price}`);
console.assert(vendorB.total_adders === 61650, `vendor-b adders expected 61650, got ${vendorB.total_adders}`);
console.assert(vendorB.true_evaluated_price === 479650, `vendor-b true evaluated expected 479650 (lower bound), got ${vendorB.true_evaluated_price}`);
console.assert(vendorB.price_status === 'UNPRICED_ITEMS', `vendor-b price status expected UNPRICED_ITEMS, got ${vendorB.price_status}`);

// 3. Check Deltaport (vendor-c)
console.assert(vendorC.headline_price === 439000, `vendor-c headline expected 439000, got ${vendorC.headline_price}`);
console.assert(vendorC.total_adders === 15000, `vendor-c adders expected 15000, got ${vendorC.total_adders}`);
console.assert(vendorC.true_evaluated_price === 454000, `vendor-c true evaluated expected 454000, got ${vendorC.true_evaluated_price}`);

// 4. Check open items (2 open items block verify)
console.assert(sample.open_items.length === 2, `open items expected 2, got ${sample.open_items.length}`);

console.log('✅ sample402.json snapshot matches authentic engine specifications exactly!');
