// The Sensitivity Workbench's Monte Carlo. Run: npm run test:unit
// Its engine drivers must agree with the cent-exact preview (lib/domain/sensitivity.ts), which is
// itself pinned to the Python engine by test-sensitivity.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildVendorModels,
  defaultDrivers,
  density,
  quantile,
  rng,
  sampleDriver,
  simulate,
  sortedFinite,
  summariseBands,
  vendorCost,
} from '../src/lib/domain/simulation.ts';
import { projectFinancials, baseLabourRate } from '../src/lib/domain/sensitivity.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.resolve(here, '../src/lib/sample402.json'), 'utf8'));
const parameters = sample.tender.parameters;
const financials = sample.financials;
const applied = { copper_multiplier: 1, site_labor_rate: null, freight_multiplier: 1 };
const models = buildVendorModels(financials, parameters);
const labourBase = baseLabourRate(parameters) ?? 60;
const neutral = { copper: 1, freight: 1, labour: null, addback_realisation: 100, unpriced_allowance: 0, delay_weeks: 0, delay_cost_week: 0 };

test('at the applied rates every bidder costs exactly what the engine says', () => {
  for (const m of models) {
    const f = financials.find((x) => x.vendor_id === m.vendor_id);
    const c = vendorCost(m, applied, neutral);
    assert.equal(c[0], f.true_evaluated_price);
    assert.equal(c[1], f.true_evaluated_price);
  }
});

test('engine drivers match the cent-exact projection', () => {
  for (const staged of [
    { copper_multiplier: 1.3, site_labor_rate: 90, freight_multiplier: 1.4 },
    { copper_multiplier: 0.85, site_labor_rate: 45, freight_multiplier: 0.9 },
  ]) {
    const exact = projectFinancials(financials, parameters, applied, staged);
    for (const row of exact) {
      const m = models.find((x) => x.vendor_id === row.vendor_id);
      const c = vendorCost(m, applied, { ...neutral, copper: staged.copper_multiplier, freight: staged.freight_multiplier, labour: staged.site_labor_rate });
      // Float vs per-cell cent rounding: within a cent per cell.
      assert.ok(Math.abs(c[0] - row.projectedCost) <= 0.01 * parameters.length, `${row.vendor_id}: ${c[0]} vs ${row.projectedCost}`);
    }
  }
});

test('scenario assumptions move only the risk-adjusted figure', () => {
  const m = models.find((x) => x.pricedAdders > 0);
  const [t, r] = vendorCost(m, applied, { ...neutral, addback_realisation: 110, delay_weeks: 2, delay_cost_week: 1000 });
  assert.equal(t, m.base);
  assert.ok(Math.abs(r - (m.base + m.pricedAdders * 0.1 + 2000)) < 1e-6);
});

test('defaults are neutral: the risk-adjusted award equals the engine award at base values', () => {
  const drivers = defaultDrivers(models, applied, labourBase);
  const res = simulate(models, drivers, applied, { target: 'award', kind: 'true' }, 200);
  const lowest = Math.min(...financials.map((f) => f.true_evaluated_price ?? Infinity));
  assert.ok(Math.abs(res.baseline - lowest) < 0.01);
  for (const d of drivers.filter((d) => !d.engine)) {
    assert.ok(d.base === 0 || d.base === 100, `${d.id} base should be neutral`);
  }
});

test('same seed, same simulation; a zero-width driver set gives one value', () => {
  const drivers = defaultDrivers(models, applied, labourBase);
  const a = simulate(models, drivers, applied, { target: 'award', kind: 'risk' }, 300, 7);
  const b = simulate(models, drivers, applied, { target: 'award', kind: 'risk' }, 300, 7);
  assert.deepEqual(Array.from(a.values), Array.from(b.values));

  const flat = drivers.map((d) => ({ ...d, min: d.base, max: d.base }));
  const c = simulate(models, flat, applied, { target: 'award', kind: 'risk' }, 100);
  assert.equal(new Set(Array.from(c.values)).size, 1);
});

test('samples stay inside each driver range for every distribution', () => {
  const rand = rng(1);
  for (const distribution of ['normal', 'uniform', 'triangular', 'fixed']) {
    const d = { id: 'x', base: 1.1, min: 0.9, max: 1.4, distribution };
    for (let i = 0; i < 2000; i++) {
      const x = sampleDriver(d, rand);
      assert.ok(x >= 0.9 && x <= 1.4, `${distribution}: ${x}`);
    }
  }
});

test('bands partition the samples and their shares add up to 1', () => {
  const drivers = defaultDrivers(models, applied, labourBase);
  // vendor-c: the sample's award (vendor-a) has no rate-sensitive lines, so its figure never moves.
  const res = simulate(models, drivers, applied, { target: 'vendor-c', kind: 'risk' }, 2000);
  const sorted = sortedFinite(res.values);
  const [lo, mid, hi] = summariseBands(res, quantile(sorted, 0.2), quantile(sorted, 0.8));
  assert.equal(lo.count + mid.count + hi.count, sorted.length);
  assert.ok(Math.abs(lo.share + mid.share + hi.share - 1) < 1e-9);
  assert.ok(lo.mean < mid.mean && mid.mean < hi.mean);

  // A degenerate output (every sample equal) leaves the outer bands empty, with null means.
  const flat = simulate(models, drivers, applied, { target: 'award', kind: 'risk' }, 200);
  const bands = summariseBands(flat, 452000, 452000);
  assert.equal(bands[1].share, 1);
  assert.equal(bands[0].mean, null);
  const { points } = density(sorted);
  assert.ok(points.length > 10 && points.every((p) => p.y >= 0));
});

test('labour at its base is neutral even when lines carry different own rates (SIM-M03)', () => {
  // 10 h at €80/h + 10 h at €100/h; the table's base rate (first labour line) is €80/h.
  const m = { vendor_id: 'V', name: 'V', base: 500_000, copperBase: 0, freightBase: 0,
    labourHours: 20, labourOwnCost: 1800, pricedAdders: 0, unpricedGaps: 0 };
  const [atBase] = vendorCost(m, applied, { ...neutral, labour: 80 }, 80);
  assert.equal(atBase, 500_000);
  // Above the base, each line's own rate scales by the same ratio: 1800 × 88/80 = 1980, so +180.
  const [higher] = vendorCost(m, applied, { ...neutral, labour: 88 }, 80);
  assert.ok(Math.abs(higher - 500_180) < 1e-6);
  // With a labour rate applied, the engine uses hours × rate, so the sample does too.
  const appliedRate = { ...applied, site_labor_rate: 70 };
  const [same] = vendorCost(m, appliedRate, { ...neutral, labour: 70 }, 80);
  assert.equal(same, 500_000);
});

test('the simulation baseline equals the engine award with mixed labour rates', () => {
  const mixed = [
    { vendor_id: 'A', name: 'A', base: 500_000, copperBase: 0, freightBase: 0, labourHours: 20, labourOwnCost: 1800, pricedAdders: 0, unpricedGaps: 0 },
    { vendor_id: 'B', name: 'B', base: 500_100, copperBase: 0, freightBase: 0, labourHours: 20, labourOwnCost: 2000, pricedAdders: 0, unpricedGaps: 0 },
  ];
  const drivers = defaultDrivers(mixed, applied, 80);
  const res = simulate(mixed, drivers, applied, { target: 'award', kind: 'true' }, 50);
  assert.equal(res.baseline, 500_000);
});
