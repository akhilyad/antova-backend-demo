// The ingest phases shown on /ingest, from the engine's job status and stage. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { phaseFor, phaseIndex, INGEST_PHASES } from '../src/lib/ingest-phase.ts';

test('job status wins over the stage', () => {
  assert.equal(phaseFor({ status: 'QUEUED', stage: 'Price', progress_pct: 90 }), 'queued');
  assert.equal(phaseFor({ status: 'COMPLETED', stage: 'Persist', progress_pct: 100 }), 'complete');
  assert.equal(phaseFor({ status: 'FAILED', stage: 'Locate', progress_pct: 60 }), 'failed');
});

test("every stage the engine reports maps to a phase", () => {
  const cases = {
    Intake: 'parsing',
    Parse: 'parsing',
    Locate: 'extracting',
    'Check each quote is on its page': 'extracting',
    'Read values': 'extracting',
    'Check where documents disagree': 'pricing',
    Price: 'pricing',
    Persist: 'pricing',
  };
  for (const [stage, phase] of Object.entries(cases)) {
    assert.equal(phaseFor({ status: 'PROCESSING', stage, progress_pct: 50 }), phase, stage);
  }
});

test('an unknown stage falls back on the percentage', () => {
  assert.equal(phaseFor({ status: 'PROCESSING', stage: 'Something new', progress_pct: 0 }), 'queued');
  assert.equal(phaseFor({ status: 'PROCESSING', stage: '', progress_pct: 10 }), 'parsing');
  assert.equal(phaseFor({ status: 'PROCESSING', stage: null, progress_pct: 60 }), 'extracting');
  assert.equal(phaseFor({ status: 'PROCESSING', progress_pct: 95 }), 'pricing');
});

test('phases are ordered upload → complete', () => {
  assert.deepEqual(INGEST_PHASES.map((p) => p.id), ['uploading', 'queued', 'parsing', 'extracting', 'pricing', 'complete']);
  assert.ok(phaseIndex('parsing') < phaseIndex('extracting'));
  assert.equal(phaseIndex('failed'), -1);
});
