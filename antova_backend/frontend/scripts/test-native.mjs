// Unit tests for the built-in engine's deterministic parts: units, checks, money, quotes, pricing.
// Run: node --test scripts/test-native.mjs (part of npm run test:unit)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseValue, check } from '../src/lib/native/values.ts';
import { PARAMETERS, EXTENDED_PARAMETERS, RATE_TABLES, deviationClasses } from '../src/lib/native/ontology.ts';
import { parseMoney } from '../src/lib/native/pipeline.ts';
import { locateQuote } from '../src/lib/native/pdftext.ts';
import { parseJsonObject } from '../src/lib/native/llm.ts';
import { evaluateFinancials, stableJson } from '../src/lib/native/evaluate.ts';

const all = [...PARAMETERS, ...EXTENDED_PARAMETERS];
const field = (id, name) => all.find((p) => p.id === id).fields.find((f) => f.name === name);
function run(id, name, required, offered) {
  const f = field(id, name);
  return check(f, parseValue(f.kind, required, f.operator), parseValue(f.kind, offered, f.operator));
}

test('units are converted to the requirement before comparing', () => {
  let r = run('PARAM-02', 'rated_current', '2500 A', 'copper Cu-ETP, 2.5 kA continuous');
  assert.equal(r.passed, true);
  assert.equal(r.offered_canonical, '2500 A');
  r = run('PARAM-01', 'ik', '31,5 kA', '25000 A');
  assert.equal(r.passed, false);
  assert.equal(r.offered_canonical, '25 kA');
  assert.equal(run('PARAM-08', 'max_ambient', '45 °C', '113 °F').passed, true);
  assert.equal(run('PARAM-06', 'warranty_months', '36 months', '2 years').shortfall, 12);
  assert.equal(run('PARAM-14', 'site_altitude', '2000 m', '6562 ft').passed, true);
  assert.equal(run('PARAM-07', 'rated_voltage', '36 kV', '36,000 V').passed, true);
});

test('a number is never cut out of a longer one', () => {
  assert.equal(run('PARAM-02', 'rated_current', '2500 A', '2000 A').passed, false);
  assert.equal(parseValue('current', '2500 A').base, 2500);
  assert.equal(parseValue('current', '2,500 A').base, 2500);
});

test('ranges: an at-least field reads the top, an at-most field the bottom', () => {
  assert.equal(parseValue('temperature', '-25 °C to +40 °C', 'ge').base, 40);
  assert.equal(parseValue('lead_time', '20 to 26 weeks', 'le').base, 20);
  assert.equal(run('PARAM-08', 'max_ambient', '+40 °C', 'from -25 °C to +40 °C').passed, true);
});

test('classes, codes and words', () => {
  assert.equal(run('PARAM-03', 'ip', 'IP54', 'IP4X').passed, false);
  assert.equal(run('PARAM-03', 'iac_class', 'IAC AFLR', 'IAC A-FL').passed, false);
  assert.equal(run('PARAM-03', 'iac_class', 'IAC AFL', 'AFLR').passed, true);
  assert.equal(run('PARAM-06', 'incoterm', 'DDP site', 'Ex Works Hamburg').passed, false);
  assert.equal(run('PARAM-06', 'incoterm', 'DAP', 'Delivered Duty Paid').passed, true);
  assert.equal(run('PARAM-02', 'material', 'Cu-ETP', 'E-AlMgSi0.5 aluminium alloy').passed, false);
  assert.equal(run('PARAM-04', 'protocol', 'IEC 61850 Ed.2 with PRP', 'IEC 61850 Ed.2 PRP dual-port fibre').passed, true);
  assert.equal(run('PARAM-04', 'protocol', 'IEC 61850 Ed.2 with PRP', 'IEC 61850 via RJ45, no PRP').passed, false);
  assert.equal(run('PARAM-04', 'marshalling', 'pre-wired RTU marshalling', 'marshalling terminals by the purchaser').passed, false);
  assert.equal(run('PARAM-05', 'witnessed_fat_days_included', 'A 5-day witnessed I-FAT', 'Witnessed FAT charged extra').shortfall, 5);
  assert.equal(run('PARAM-05', 'witnessed_fat_days_included', '3 days', 'one witnessed day included').shortfall, 2);
  assert.equal(run('PARAM-12', 'spares_included', 'included', 'quoted separately').passed, false);
  assert.equal(run('PARAM-15', 'standards', 'IEC 62271-200:2021', 'IEC 62271-200:2011').passed, false);
});

test('money: symbols, separators and scale words', () => {
  assert.deepEqual(parseMoney('€452,000', null, ''), { amount: 452000, currency: 'EUR' });
  assert.deepEqual(parseMoney('452.000,00', 'EUR', ''), { amount: 452000, currency: 'EUR' });
  assert.deepEqual(parseMoney('1.2 million', null, 'Total EUR 1.2 million'), { amount: 1200000, currency: 'EUR' });
  assert.deepEqual(parseMoney('$390,000', null, ''), { amount: 390000, currency: 'USD' });
});

test('a quote is found on its page, on another page, or not at all', () => {
  const pages = [
    { page: 1, width: 595, height: 842, text: 'Cover', runs: [{ s: 'Cover letter', r: [56, 50, 200, 60] }] },
    {
      page: 2,
      width: 595,
      height: 842,
      text: 'Main busbars: copper, 2.5 kA continuous.',
      runs: [
        { s: 'Main busbars: copper,', r: [56, 70, 150, 80] },
        { s: '2.5 kA continuous.', r: [152, 70, 240, 80] },
      ],
    },
  ];
  const hit = locateQuote(pages, 'Main busbars:  copper, 2.5 kA continuous.', 1);
  assert.equal(hit.page, 2);
  assert.equal(hit.match, 'exact');
  assert.deepEqual(hit.bbox, [56, 70, 240, 80]);
  assert.equal(locateQuote(pages, 'aluminium busbars rated 4000 A', 2), null);
});

test('model replies: fenced or bare JSON parses, prose does not', () => {
  assert.deepEqual(parseJsonObject('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonObject('Here you go: {"a": {"b": 2}}'), { a: { b: 2 } });
  assert.throws(() => parseJsonObject('I could not find it.'));
});

test('deviation classes and rate lines follow the Python engine', () => {
  const p1 = all.find((p) => p.id === 'PARAM-01');
  assert.deepEqual(deviationClasses(p1, new Set(['ik', 'ik_duration']), {}, {}), ['PARAM-01.ik_rating_short']);
  const p6 = all.find((p) => p.id === 'PARAM-06');
  assert.deepEqual(deviationClasses(p6, new Set(['incoterm']), { incoterm: 'EXW' }, { incoterm: 'DDP' }), ['PARAM-06.incoterm_exw_to_ddp']);
  assert.ok(RATE_TABLES.mv_gis_switchgear_v2.deviation_rates['PARAM-01.ik_rating_short']);
});

test('financials: headline + adders, an unpriced gap marks the total as a minimum', () => {
  const cell = (over) => ({ extracted_text: '', status: 'COMPLIANT', confidence: 1, bbox: '', snippet: '', conflict_note: null, cost_adder: 0, adder_formula: '', cost_lines: [], pricing_status: 'NONE', citation: null, secondary_citation: null, checks: [], rate_table_version: 'v', ...over });
  const tender = {
    vendors: [
      { id: 'a', name: 'A', country: '', headline_price: 1000, badge: 'Bidder' },
      { id: 'b', name: 'B', country: '', headline_price: null, headline_status: 'FX_MISSING', badge: 'Bidder' },
    ],
    parameters: [
      { id: 'P1', name: 'p1', criticality: 'MANDATORY', vendors: { a: cell({ status: 'DEVIATION_DOWNGRADE', pricing_status: 'PRICED', cost_lines: [{ label: 'x', qty: '2', unit: 'kg', rate: '10.005', driver: 'copper' }] }), b: cell({}) } },
      { id: 'P2', name: 'p2', criticality: 'COMMERCIAL', vendors: { a: cell({ status: 'OMITTED', pricing_status: 'UNPRICED' }), b: cell({}) } },
    ],
  };
  const [a, b] = evaluateFinancials(tender, { copper_multiplier: 2, freight_multiplier: 1, site_labor_rate: null });
  assert.equal(a.total_tech_penalty, 40.02);
  assert.equal(a.true_evaluated_price, 1040.02);
  assert.equal(a.price_status, 'UNPRICED_ITEMS');
  assert.equal(b.true_evaluated_price, null);
  assert.equal(b.price_status, 'FX_MISSING');
  assert.equal(stableJson({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
});
