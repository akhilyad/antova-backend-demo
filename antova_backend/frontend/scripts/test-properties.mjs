// Property and parity tests for the built-in engine's leveling math (src/lib/native/evaluate.ts).
// Run: node --test scripts/test-properties.mjs (part of npm run test:unit)
//
// 1. Parity: for 200 seeded tenders from the Python engine (scripts/gen_financials_parity.py),
//    evaluateFinancials returns exactly what antova_engine.evaluate_vendor_financials returns.
// 2. Properties (fast-check): rules that hold for every tender, shrunk to the smallest failing case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import Decimal from 'decimal.js-light';
import { evaluateFinancials } from '../src/lib/native/evaluate.ts';

const parity = JSON.parse(readFileSync(new URL('./fixtures/financials-parity.json', import.meta.url), 'utf8'));

test('built-in engine matches the Python engine on every seeded tender', () => {
  assert.ok(parity.cases.length >= 200);
  for (const [i, c] of parity.cases.entries()) {
    const got = evaluateFinancials(c.tender, c.sensitivity, c.overrides);
    assert.deepEqual(got, c.expected, `case ${i} (${c.tender.id}) differs from the Python engine`);
  }
});

// --- Generators ------------------------------------------------------------------------------
const money = (max) => fc.integer({ min: 0, max: max * 100 }).map((c) => (c / 100).toFixed(2));
const factor = fc.integer({ min: 0, max: 1000 }).map((m) => m / 1000);
const costLine = fc
  .record({ qty: fc.integer({ min: 0, max: 500_000 }).map((m) => (m / 1000).toFixed(3)), rate: money(20_000),
    driver: fc.constantFrom('fixed', 'copper', 'labour', 'freight'), ranged: fc.boolean(), lo: factor, hi: factor })
  .map(({ qty, rate, driver, ranged, lo, hi }) => ({
    label: 'line', qty, unit: 'u', rate, driver,
    rate_low: ranged ? new Decimal(rate).times(1 - lo).toFixed(4) : null,
    rate_high: ranged ? new Decimal(rate).times(1 + hi).toFixed(4) : null,
  }));
const cell = fc
  .record({ lines: fc.array(costLine, { maxLength: 3 }), legacy: money(50_000),
    pricing: fc.constantFrom('NONE', 'PRICED', 'UNPRICED') })
  .map(({ lines, legacy, pricing }) => ({ status: 'COMPLIANT', cost_lines: lines,
    cost_adder: lines.length ? 0 : Number(legacy), pricing_status: pricing }));
const tender = fc.integer({ min: 1, max: 4 }).chain((n) => {
  const ids = Array.from({ length: n }, (_, i) => `V${i}`);
  return fc.record({
    vendors: fc.tuple(...ids.map((id) => fc.option(money(5_000_000).filter((m) => m !== '0.00').map(Number))
      .map((h) => ({ id, name: id, country: 'DE', badge: '', headline_price: h })))),
    parameters: fc.array(
      fc.record({ criticality: fc.constantFrom('MANDATORY', 'HIGH', 'MEDIUM', 'COMMERCIAL'),
        cells: fc.tuple(...ids.map(() => fc.option(cell, { nil: undefined }))) }), { maxLength: 6 }),
  }).map(({ vendors, parameters }) => ({
    vendors,
    parameters: parameters.map((p, k) => ({ id: `P${k}`, name: `P${k}`, criticality: p.criticality,
      vendors: Object.fromEntries(ids.flatMap((id, j) => (p.cells[j] ? [[id, p.cells[j]]] : []))) })),
  }));
});
const sensitivity = fc.record({
  copper_multiplier: fc.integer({ min: 0, max: 3000 }).map((m) => m / 1000),
  site_labor_rate: fc.option(fc.integer({ min: 0, max: 25_000 }).map((c) => c / 100), { nil: null }),
  freight_multiplier: fc.integer({ min: 0, max: 3000 }).map((m) => m / 1000),
});
const dec = (x) => new Decimal(String(x));
const RUNS = { numRuns: 300 };

test('low <= base <= high for every vendor', () => {
  fc.assert(fc.property(tender, sensitivity, (t, s) => {
    for (const r of evaluateFinancials(t, s)) {
      assert.ok(dec(r.total_adders_low).lte(dec(r.total_adders)) && dec(r.total_adders).lte(dec(r.total_adders_high)));
      if (r.true_evaluated_price !== null) {
        assert.ok(r.true_evaluated_low <= r.true_evaluated_price && r.true_evaluated_price <= r.true_evaluated_high);
      }
    }
  }), RUNS);
});

test('price = headline + adders, and adders = tech + commercial', () => {
  fc.assert(fc.property(tender, sensitivity, (t, s) => {
    for (const r of evaluateFinancials(t, s)) {
      assert.ok(dec(r.total_adders).eq(dec(r.total_tech_penalty).plus(dec(r.total_commercial_adder))));
      if (r.true_evaluated_price === null) assert.equal(r.headline_price, null);
      else assert.ok(dec(r.true_evaluated_price).eq(dec(r.headline_price).plus(dec(r.total_adders))));
    }
  }), RUNS);
});

test('overriding a cell with its own adder changes no total', () => {
  fc.assert(fc.property(tender, sensitivity, fc.nat(), (t, s, pick) => {
    const cells = t.parameters.flatMap((p) => Object.keys(p.vendors).map((v) => [p.id, v]));
    fc.pre(cells.length > 0);
    const [pid, vid] = cells[pick % cells.length];
    const before = evaluateFinancials(t, s).find((r) => r.vendor_id === vid);
    const own = before.itemized_breakdown.find((i) => i.param_id === pid).adder_eur;
    const after = evaluateFinancials(t, s, { [`${pid}|${vid}`]: { adder_eur: own.toFixed(2), note: '' } })
      .find((r) => r.vendor_id === vid);
    for (const k of ['total_adders', 'total_tech_penalty', 'total_commercial_adder', 'true_evaluated_price']) {
      assert.equal(after[k], before[k], k);
    }
  }), RUNS);
});

test('reordering vendors changes no vendor', () => {
  fc.assert(fc.property(tender, sensitivity, (t, s) => {
    const byId = (rows) => Object.fromEntries(rows.map((r) => [r.vendor_id, r]));
    const reversed = { ...t, vendors: [...t.vendors].reverse() };
    assert.deepEqual(byId(evaluateFinancials(reversed, s)), byId(evaluateFinancials(t, s)));
  }), RUNS);
});
