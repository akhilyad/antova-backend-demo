// End-to-end check of the built-in engine through the real /api routes, as the browser calls them.
// Needs a running app with the built-in engine configured (LLM_* set, BACKEND_URL unset):
//   node scripts/test-native-e2e.mjs [base-url]          default http://localhost:3000
// Uploads the synthetic sample tender's PDFs under a new tender ID, processes them with the configured
// model, checks the brief against the dashboard's schema, then exercises evaluate, reviews, overrides,
// sign-off, the source PDF and the clarification CSV. REVIEW_TOKEN in the environment is sent if set.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Brief } from '../src/lib/schemas.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || process.env.E2E_BASE || 'http://localhost:3000').replace(/\/$/, '');
const TENDER = `TENDER-E2E-${Date.now().toString(36).toUpperCase()}`;
const SAMPLES = path.resolve(here, '../public/samples/TENDER-2026-402');
const token = process.env.REVIEW_TOKEN || '';
const auth = token ? { 'X-Antova-Review-Token': token } : {};

async function call(method, url, body, headers = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { ...auth, ...(body && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, headers: res.headers };
}

const step = (msg) => console.log(`- ${msg}`);
const t0 = Date.now();

const health = await call('GET', '/api/health');
step(`health ${health.status}: ${JSON.stringify(health.data)}`);
assert.equal(health.status, 200, 'health must be 200');
assert.equal(health.data.status, 'healthy');
assert.equal(health.data.engine, 'native');

const files = ['MR-33kV-GIS-Rev4.pdf', 'Bid_vendor-a_Nordwerk.pdf', 'Bid_vendor-b_VoltSwitch.pdf', 'Bid_vendor-c_Deltaport.pdf'];
for (const f of files) {
  const r = await call('PUT', `/api/review/tenders/${TENDER}/files/${encodeURIComponent(f)}`, new Uint8Array(fs.readFileSync(path.join(SAMPLES, f))), { 'Content-Type': 'application/pdf' });
  assert.equal(r.status, 201, `upload ${f}: ${JSON.stringify(r.data)}`);
  step(`uploaded ${f}: ${r.data.pages} pages`);
}
const listed = await call('GET', `/api/review/tenders/${TENDER}/files`);
assert.equal(listed.data.files.length, 4);

const manifest = await call('PUT', `/api/review/tenders/${TENDER}/manifest`, {
  tender_id: TENDER,
  title: '33 kV GIS switchgear package (e2e)',
  client: 'E2E test',
  equipment_class: 'mv_gis_switchgear',
  rate_table: 'mv_gis_switchgear_v2',
  documents: [
    { file: files[0], role: 'mr_spec' },
    { file: files[1], role: 'vendor_bid', vendor_id: 'vendor-a', vendor_name: 'Nordwerk', country: 'Germany' },
    { file: files[2], role: 'vendor_bid', vendor_id: 'vendor-b', vendor_name: 'VoltSwitch', country: 'Turkey' },
    { file: files[3], role: 'vendor_bid', vendor_id: 'vendor-c', vendor_name: 'Deltaport', country: 'Netherlands' },
  ],
  engineering_estimates: { busbar_cu_kg: 1800, heavy_haul_loads: 3 },
  synthetic: true,
});
assert.equal(manifest.status, 200, JSON.stringify(manifest.data));
step('manifest saved');

const started = await call('POST', '/api/jobs/ingest', { tender_id: TENDER, mode: 'auto' });
assert.equal(started.status, 200, JSON.stringify(started.data));
const jobId = started.data.job_id;
step(`job ${jobId} started`);

let job;
for (let i = 0; i < 400; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  job = (await call('GET', `/api/jobs/${jobId}`)).data;
  if (i % 4 === 0) step(`  ${job.status} ${job.progress_pct}% ${job.stage}`);
  if (job.status === 'COMPLETED' || job.status === 'FAILED') break;
}
assert.equal(job.status, 'COMPLETED', `job ended ${job.status}: ${job.error}`);
step(`job completed in ${((Date.now() - t0) / 1000).toFixed(1)} s; warnings: ${JSON.stringify(job.result?.warnings ?? [])}`);

const brief = await call('GET', `/api/review/tenders/${TENDER}`);
assert.equal(brief.status, 200);
assert.equal(brief.headers.get('x-antova-source'), 'live');
const parsed = Brief.safeParse(brief.data);
assert.ok(parsed.success, `brief does not match the dashboard schema: ${JSON.stringify(parsed.error?.issues?.slice(0, 5))}`);
const b = brief.data;
step(`brief: ${b.tender.parameters.length} parameters × ${b.tender.vendors.length} vendors, ${b.open_items.length} open items`);
for (const f of b.financials) {
  step(`  ${f.vendor_id} ${f.name}: headline ${f.headline_price} + adders ${f.total_adders} = ${f.true_evaluated_price} (${f.price_status}) [${f.badge}]`);
}
for (const p of b.tender.parameters) {
  step(`  ${p.id} req "${p.pint_rule}": ` + Object.entries(p.vendors).map(([v, c]) => `${v}=${c.status}${c.cost_adder ? ` €${c.cost_adder}` : ''}${c.pricing_status === 'UNPRICED' ? ' UNPRICED' : ''}`).join(' '));
}

const evaluated = await call('POST', `/api/review/tenders/${TENDER}/evaluate`, { copper_multiplier: 1.5, freight_multiplier: 1, site_labor_rate: 80 });
assert.equal(evaluated.status, 200);
assert.equal(evaluated.data.financials.length, b.financials.length);
step('evaluate with new rates: ok');

const doc = await fetch(`${BASE}/api/review/tenders/${TENDER}/documents/${encodeURIComponent(files[1])}`, { headers: auth });
assert.equal(doc.status, 200);
assert.equal(doc.headers.get('content-type'), 'application/pdf');
step('source PDF served');

const csv = await call('GET', `/api/review/tenders/${TENDER}/clarifications.csv`);
assert.equal(csv.status, 200);
step(`clarifications.csv: ${csv.data.trim().split('\n').length - 1} rows`);

const flagged = b.tender.parameters.flatMap((p) => Object.entries(p.vendors).filter(([, c]) => (c.flags || []).length).map(([v]) => [p.id, v]));
if (flagged.length) {
  const [pid, vid] = flagged[0];
  const review = await call('PUT', `/api/review/tenders/${TENDER}/reviews/${pid}/${vid}`, { action: 'approve', note: 'e2e' });
  assert.equal(review.status, 200, JSON.stringify(review.data));
  assert.equal(review.data.state, 'reviewed');
  step(`review on ${pid}/${vid}: ${review.data.state}`);
}
const gap = b.open_items.find((o) => o.kind === 'unpriced');
if (gap) {
  const o = await call('PUT', `/api/review/tenders/${TENDER}/overrides/${gap.param_id}/${gap.vendor_id}`, { adder_eur: '1234.50', note: 'e2e estimate' });
  assert.equal(o.status, 204);
  const after = (await call('GET', `/api/review/tenders/${TENDER}`)).data;
  assert.ok(after.overrides.some((x) => x.param_id === gap.param_id && x.adder_eur === '1234.50'));
  step(`override on ${gap.param_id}/${gap.vendor_id}: saved`);
}

const verify = await call('POST', `/api/review/tenders/${TENDER}/verify`, { run_id: b.ingest_stats.run_id });
step(`verify: ${verify.status} ${verify.status === 409 ? `(${verify.data.open_items?.length} open items, as expected while gaps remain)` : ''}`);
assert.ok(verify.status === 200 || verify.status === 409);

const list = await call('GET', '/api/review/tenders');
assert.ok(list.data.some((r) => r.tender_id === TENDER));
step('tender list includes the new tender');

const sample = await call('GET', '/api/review/tenders/TENDER-2026-402');
assert.equal(sample.status, 200);
assert.equal(sample.headers.get('x-antova-source'), 'replay');
step('the saved sample still opens');

console.log(`\nPASS ${TENDER} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
