// Tender housekeeping on the disk store: delete, rename, add and remove bids.
// Run: node --test scripts/test-manage.mjs (part of npm run test:unit)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.ANTOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'antova-manage-'));
const { getStore } = await import('../src/lib/native/store.ts');
const { keys } = await import('../src/lib/native/pipeline.ts');
const { addBid, deleteTender, removeDocument, renameTender, ManageError } = await import('../src/lib/native/manage.ts');

const store = getStore();
const pdf = new TextEncoder().encode('%PDF-1.4 test');

async function seed(t, files = ['spec.pdf', 'a.pdf', 'b.pdf']) {
  const index = {};
  for (const f of files) {
    await store.putBytes(keys.file(t, f), pdf, 'application/pdf');
    await store.putJson(keys.pages(t, f), { pages: [] });
    index[f] = { filename: f, size_bytes: pdf.length, sha256: 'x', pages: 1, no_text_pages: [], uploaded_at: '' };
  }
  await store.putJson(keys.fileIndex(t), index);
  await store.putJson(keys.manifest(t), {
    tender_id: t, title: t, client: '', equipment_class: 'mv_gis_switchgear', rate_table: 'x', engineering_estimates: {}, synthetic: false,
    documents: [
      { file: 'spec.pdf', role: 'mr_spec' },
      { file: 'a.pdf', role: 'vendor_bid', vendor_id: 'vendor-a', vendor_name: 'A', country: 'EU' },
    ],
  });
  const state = { meta: { tender_id: t, title: t, status: 'DRAFT' }, tender: { id: t, title: t, client: '' }, documents: [], overrides: {}, reviews: [] };
  await store.putJson(keys.state(t), state);
  await store.putJson(keys.tenderIndex(), [t, ...((await store.getJson(keys.tenderIndex())) ?? [])]);
  return state;
}

test('delete removes files, brief and index entry', async () => {
  await seed('T-DEL');
  await seed('T-KEEP');
  const r = await deleteTender(store, 'T-DEL');
  assert.equal(r.removed_files, 3);
  assert.equal(await store.getJson(keys.state('T-DEL')), null);
  assert.equal(await store.getBytes(keys.file('T-DEL', 'a.pdf')), null);
  assert.deepEqual(await store.getJson(keys.tenderIndex()), ['T-KEEP']);
  await assert.rejects(deleteTender(store, 'T-DEL'), (e) => e instanceof ManageError && e.status === 404);
});

test('a signed-off tender cannot be deleted or renamed', async () => {
  const state = await seed('T-VER');
  state.meta.status = 'VERIFIED';
  await store.putJson(keys.state('T-VER'), state);
  await assert.rejects(deleteTender(store, 'T-VER'), (e) => e.status === 409);
  assert.throws(() => renameTender(state, { title: 'x' }), (e) => e.status === 409);
});

test('rename trims and refuses an empty title', async () => {
  const state = await seed('T-REN');
  const next = renameTender(state, { title: '  New title ', client: 'Grid Co' });
  assert.equal(next.meta.title, 'New title');
  assert.equal(next.tender.client, 'Grid Co');
  assert.equal(state.meta.title, 'T-REN');
  assert.throws(() => renameTender(state, { title: ' ' }), (e) => e.status === 422);
});

test('add and remove a bid', async () => {
  await seed('T-BID');
  await assert.rejects(addBid(store, 'T-BID', { file: 'a.pdf', vendor_id: 'vendor-x' }, 8), (e) => e.status === 409);
  await assert.rejects(addBid(store, 'T-BID', { file: 'missing.pdf', vendor_id: 'vendor-x' }, 8), (e) => e.status === 422);
  await assert.rejects(addBid(store, 'T-BID', { file: 'b.pdf', vendor_id: 'vendor-a' }, 8), (e) => e.status === 409);
  const m = await addBid(store, 'T-BID', { file: 'b.pdf', vendor_id: 'vendor-b', vendor_name: 'B' }, 8);
  assert.equal(m.documents.length, 3);
  await assert.rejects(removeDocument(store, 'T-BID', 'spec.pdf'), (e) => e.status === 409);
  const after = await removeDocument(store, 'T-BID', 'a.pdf');
  assert.deepEqual(after.documents.map((d) => d.file), ['spec.pdf', 'b.pdf']);
  assert.equal(await store.getBytes(keys.file('T-BID', 'a.pdf')), null);
  await assert.rejects(removeDocument(store, 'T-BID', 'b.pdf'), (e) => e.status === 409);
});
