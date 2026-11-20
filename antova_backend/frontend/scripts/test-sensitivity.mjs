// Parity of the browser's sensitivity preview with the Python engine. Run: npm run test:unit
// The fixture is written by scripts/gen_sensitivity_parity.py from antova_engine itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectFinancials, baseLabourRate, rankBy } from '../src/lib/domain/sensitivity.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.resolve(here, p), 'utf8'));
const sample = read('../src/lib/sample402.json');
const parity = read('./fixtures/sensitivity-parity.json');
const parameters = sample.tender.parameters;

for (const c of parity.cases) {
  test(`matches the engine to the cent: ${c.name}`, () => {
    const rows = projectFinancials(c.financials_applied, parameters, c.applied, c.staged);
    for (const row of rows) {
      assert.equal(row.projectedCost, c.expected[row.vendor_id], row.vendor_id);
    }
  });
}

test('no change in rates means no change in figures', () => {
  const rates = { copper_multiplier: 1, site_labor_rate: null, freight_multiplier: 1 };
  for (const row of projectFinancials(sample.financials, parameters, rates, rates)) {
    assert.equal(row.totalDelta, 0);
    assert.equal(row.projectedCost, row.baselineCost);
  }
});

test('a brief with no rate-sensitive lines invents nothing', () => {
  const rows = projectFinancials(sample.financials, [], { copper_multiplier: 1, freight_multiplier: 1 },
    { copper_multiplier: 2, site_labor_rate: 100, freight_multiplier: 2 });
  for (const row of rows) assert.equal(row.totalDelta, 0);
});

test('overridden cells ignore the sliders, as in the engine', () => {
  const financials = sample.financials.map((f) => ({
    ...f,
    itemized_breakdown: (f.itemized_breakdown || []).map((cell) =>
      cell.param_id === 'PARAM-02' ? { ...cell, is_overridden: true } : cell),
  }));
  const vendorB = projectFinancials(financials, parameters,
    { copper_multiplier: 1, freight_multiplier: 1 }, { copper_multiplier: 2, freight_multiplier: 1 })
    .find((r) => r.vendor_id === 'vendor-b');
  assert.equal(vendorB.delta.copper, 0);
});

test('a vendor with no evaluated price has no projection', () => {
  const rows = projectFinancials([{ vendor_id: 'vendor-x', true_evaluated_price: null }], parameters,
    { copper_multiplier: 1, freight_multiplier: 1 }, { copper_multiplier: 2, freight_multiplier: 1 });
  assert.equal(rows[0].projectedCost, null);
  assert.equal(rankBy([...rows, { vendor_id: 'y', projectedCost: 1 }], 'projectedCost')[0].vendor_id, 'y');
});

test('the base labour rate is read from the rate table lines', () => {
  assert.equal(baseLabourRate(parameters), 60);
  assert.equal(baseLabourRate([]), null);
});
