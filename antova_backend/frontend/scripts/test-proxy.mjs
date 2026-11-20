// Tests for the /api proxy's replay and token rules. Run: npm run test:proxy
// Needs Node 22.18+ (TypeScript type stripping is on by default).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { replayResponse, SAMPLE_TENDER_IDS } from '../src/lib/replay.ts';
import { buildUpstreamHeaders, resolveBackendBase, REVIEW_HEADER, upstreamTimeoutMs, isTimeout } from '../src/lib/proxy-policy.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.resolve(here, '../src/lib/sample402.json'), 'utf8'));

const replay = (method, subPath) => replayResponse(method, subPath, sample);

// --- P0-1: only the saved sample tender is served -------------------------------------------

test('the sample tender is served and marked replay', () => {
  const r = replay('GET', 'review/tenders/TENDER-2026-402');
  assert.equal(r.status, 200);
  assert.equal(r.body.tender.id, 'TENDER-2026-402');
  assert.equal(r.headers['x-antova-source'], 'replay');
});

test('another or unknown tender id is a 404, never the sample brief', () => {
  for (const id of ['TENDER-2026-417', 'TENDER-2026-418', 'DOES-NOT-EXIST', 'my-upload']) {
    const r = replay('GET', `review/tenders/${id}`);
    assert.equal(r.status, 404, id);
    assert.equal(r.body.code, 'not_in_sample');
  }
});

test('the tender list holds only tenders that can actually be opened', () => {
  const r = replay('GET', 'review/tenders');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.map((t) => t.tender_id), [...SAMPLE_TENDER_IDS]);
});

test('evaluate never returns saved totals as if recalculated', () => {
  const r = replay('POST', 'review/tenders/TENDER-2026-402/evaluate');
  assert.equal(r.status, 405);
  assert.equal(r.body.code, 'replay_no_recalc');
});

test('evaluate and reviews answer for the sample only', () => {
  assert.equal(replay('POST', 'review/tenders/TENDER-2026-417/evaluate').status, 404);
  assert.equal(replay('GET', 'review/tenders/TENDER-2026-402/reviews').status, 200);
  assert.equal(replay('GET', 'review/tenders/TENDER-2026-417/reviews').status, 404);
});

test('evidence images and unknown paths are 404, not a JSON "ok"', () => {
  assert.equal(replay('GET', 'review/tenders/TENDER-2026-402/evidence/PARAM-01/vendor-a/primary.png').status, 404);
  assert.equal(replay('GET', 'something/else').status, 404);
  assert.equal(replay('GET', 'jobs/job-replay-demo').status, 404);
});

test('health says the engine is not connected', () => {
  const r = replay('GET', 'health');
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'replay');
  assert.notEqual(r.body.status, 'healthy');
});

// --- P0-2: no fake writes -------------------------------------------------------------------

test('uploads, manifests, ingests and decisions are refused with 405', () => {
  const writes = [
    ['PUT', 'review/tenders/TENDER-2026-402/files/evil.pdf'],
    ['PUT', 'review/tenders/my-upload/files/bid.pdf'],
    ['PUT', 'review/tenders/TENDER-2026-402/manifest'],
    ['POST', 'jobs/ingest'],
    ['POST', 'review/tenders/TENDER-2026-402/verify'],
    ['POST', 'review/tenders/TENDER-2026-402/withdraw'],
    ['PUT', 'review/tenders/TENDER-2026-402/overrides/PARAM-01/vendor-b'],
    ['DELETE', 'review/tenders/TENDER-2026-402/overrides/PARAM-01/vendor-b'],
    ['PUT', 'review/tenders/TENDER-2026-402/reviews/PARAM-01/vendor-b'],
  ];
  for (const [method, p] of writes) {
    const r = replay(method, p);
    assert.equal(r.status, 405, `${method} ${p}`);
    assert.equal(r.body.code, 'replay_read_only');
  }
});

// --- P0-3: token handling -------------------------------------------------------------------

test('no token is invented when neither the browser nor the server has one', () => {
  for (const method of ['GET', 'POST', 'PUT']) {
    const h = buildUpstreamHeaders(new Headers(), method, undefined);
    assert.equal(h.has(REVIEW_HEADER), false, method);
  }
});

test('the server read token is added to reads only', () => {
  assert.equal(buildUpstreamHeaders(new Headers(), 'GET', 'srv').get(REVIEW_HEADER), 'srv');
  assert.equal(buildUpstreamHeaders(new Headers(), 'HEAD', 'srv').get(REVIEW_HEADER), 'srv');
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    assert.equal(buildUpstreamHeaders(new Headers(), method, 'srv').has(REVIEW_HEADER), false, method);
  }
});

test("a reviewer's own token is forwarded unchanged, for reads and writes", () => {
  for (const method of ['GET', 'POST', 'PUT']) {
    const h = buildUpstreamHeaders(new Headers({ [REVIEW_HEADER]: 'mine' }), method, 'srv');
    assert.equal(h.get(REVIEW_HEADER), 'mine', method);
  }
});

test('a blank client token does not count as a token', () => {
  assert.equal(buildUpstreamHeaders(new Headers({ [REVIEW_HEADER]: '  ' }), 'POST', 'srv').has(REVIEW_HEADER), false);
});

test('hop-by-hop headers are dropped', () => {
  const h = buildUpstreamHeaders(new Headers({ host: 'x', connection: 'keep-alive', expect: '100-continue', accept: 'a' }), 'PUT', undefined);
  assert.equal(h.has('host'), false);
  assert.equal(h.has('connection'), false);
  assert.equal(h.has('expect'), false);
  assert.equal(h.get('accept'), 'a');
});

// --- P0-4: no localhost backend in production -----------------------------------------------

test('production without BACKEND_URL means replay, not 127.0.0.1', () => {
  assert.equal(resolveBackendBase({ NODE_ENV: 'production' }), null);
  assert.equal(resolveBackendBase({ NODE_ENV: 'development' }), 'http://127.0.0.1:8000');
  assert.equal(resolveBackendBase({ NODE_ENV: 'production', BACKEND_URL: 'https://api.example.com/' }), 'https://api.example.com');
  assert.equal(resolveBackendBase({ NODE_ENV: 'production', BACKEND_URL: 'api.example.com' }), null);
});

// --- P1-1: timeouts -------------------------------------------------------------------------

test('uploads and exports get longer timeouts than plain reads, all under 60 s', () => {
  const upload = upstreamTimeoutMs('PUT', 'review/tenders/T-1/files/bid.pdf');
  const exportXlsx = upstreamTimeoutMs('GET', 'review/tenders/T-1/export-tbe.xlsx');
  const read = upstreamTimeoutMs('GET', 'review/tenders/T-1');
  assert.ok(upload > exportXlsx && exportXlsx > read);
  for (const t of [upload, exportXlsx, read]) assert.ok(t < 60_000);
});

test('an aborted request counts as a timeout, a refused connection does not', () => {
  const abort = new Error('aborted'); abort.name = 'AbortError';
  assert.equal(isTimeout(abort), true);
  assert.equal(isTimeout(new TypeError('fetch failed')), false);
});
