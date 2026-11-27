// Regression tests for the dimensional review (docs/DIMENSIONAL-REVIEW.md): money parsing, per-unit
// headlines and LD rates in the built-in engine, matched to the Python engine's behaviour.
// Run: node --test scripts/test-units.mjs (part of npm run test:unit)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, perUnitBasis } from '../src/lib/native/pipeline.ts';
import { parseValue, check } from '../src/lib/native/values.ts';
import { PARAMETERS, EXTENDED_PARAMETERS } from '../src/lib/native/ontology.ts';
import { formatEur } from '../src/lib/domain/money.ts';

test('a dot that groups thousands in a price is not a decimal point (DIM-201)', () => {
  assert.equal(parseMoney('452.000 €', 'EUR', '').amount, 452000);
  assert.equal(parseMoney('€ 1.234.567', 'EUR', '').amount, 1234567);
  assert.equal(parseMoney('452.000,50 €', 'EUR', '').amount, 452000.5);
  assert.equal(parseMoney('€452,000.00', 'EUR', '').amount, 452000);
  assert.equal(parseMoney('2.5', 'EUR', '').amount, 2.5); // a real decimal stays a decimal
});

test('a scale word in the quote applies when the amount has none (TS-M02)', () => {
  assert.equal(parseMoney('1.2', 'EUR', 'Total price: EUR 1.2 million for the complete scope').amount, 1_200_000);
  assert.equal(parseMoney('452', 'EUR', 'Total: €452k').amount, 452_000);
  assert.equal(parseMoney('EUR 1.2 million', 'EUR', '').amount, 1_200_000);
  // A different number in the quote does not lend its scale.
  assert.equal(parseMoney('452,000', 'EUR', 'Bond of EUR 1.2 million').amount, 452_000);
});

test('a per-bay or per-unit price is recognised, the way the Python engine does (PY-M01/TS-M01)', () => {
  assert.equal(perUnitBasis('Price per bay: €38,000'), 'per bay');
  assert.equal(perUnitBasis('Unit price €38,000 each'), 'each');
  assert.equal(perUnitBasis('€38,000 per panel, 11 panels'), 'per panel');
  assert.equal(perUnitBasis('€38,000 / bay'), '/ bay');
  assert.equal(perUnitBasis('Total lump-sum price for the complete scope: €418,000'), null);
});

const all = [...PARAMETERS, ...EXTENDED_PARAMETERS];
const ldRate = all.flatMap((p) => p.fields).find((f) => f.name === 'ld_rate');

test('an LD rate per day or per month is read per week, as in Python (VAL-TS-M01)', () => {
  const v = (text) => parseValue('percent', text, ldRate.operator);
  assert.equal(v('0.5 % per day of delay').base, 3.5);
  assert.equal(v('0.5 % per week').base, 0.5);
  assert.ok(Math.abs(v('2 % per month').base - 24 / 52) < 1e-9);
  assert.equal(v('1 %').base, 1); // no period stated: read as written
  const required = parseValue('percent', '1 % per week', ldRate.operator);
  assert.equal(check(ldRate, required, v('0.5 % per day')).passed, true);
  assert.equal(check(ldRate, required, v('1 % per month')).passed, false);
});

test('formatEur carries rounding into the euros (MONEY-M02)', () => {
  assert.equal(formatEur(2.999), '€3.00');
  assert.equal(formatEur(452000.995), '€452,001.00');
  assert.equal(formatEur(12.34), '€12.34');
});
