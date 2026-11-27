/**
 * Tender housekeeping for the built-in engine: delete a tender, rename it, and add or remove a bid
 * in its file list. Pure store operations (no HTTP), so scripts/test-manage.mjs can run them on disk.
 *
 * Changing the file list does not touch the evaluated brief. The workbench offers "Re-run audit"
 * afterwards, which processes the new list; overrides survive where their evidence is unchanged.
 */
import type { Store } from './store.ts';
import { keys, type FileEntry, type Manifest } from './pipeline.ts';
import type { TenderState } from './evaluate.ts';

export class ManageError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Removes every stored trace of a tender: PDFs, page text, file list, brief, and its index entry. */
export async function deleteTender(store: Store, tenderId: string): Promise<{ removed_files: number }> {
  const state = await store.getJson<TenderState>(keys.state(tenderId));
  if (state?.meta.status === 'VERIFIED') throw new ManageError(409, 'This brief is signed off. Reopen it before you delete it.');
  const index = (await store.getJson<Record<string, FileEntry>>(keys.fileIndex(tenderId))) ?? {};
  const manifest = await store.getJson<Manifest>(keys.manifest(tenderId));
  if (!state && !manifest && Object.keys(index).length === 0) throw new ManageError(404, `No tender ${tenderId}.`);
  const names = new Set(Object.keys(index));
  for (const d of manifest?.documents ?? []) names.add(d.file);
  for (const name of names) {
    await store.remove(keys.file(tenderId, name));
    await store.remove(keys.pages(tenderId, name));
  }
  await store.remove(keys.fileIndex(tenderId));
  await store.remove(keys.manifest(tenderId));
  await store.remove(keys.state(tenderId));
  const ids = (await store.getJson<string[]>(keys.tenderIndex())) ?? [];
  if (ids.includes(tenderId)) await store.putJson(keys.tenderIndex(), ids.filter((id) => id !== tenderId));
  return { removed_files: names.size };
}

/** Edits the package title and client shown on the brief. */
export function renameTender(state: TenderState, patch: { title?: unknown; client?: unknown }): TenderState {
  if (state.meta.status === 'VERIFIED') throw new ManageError(409, 'This brief is signed off. Reopen it before you change anything.');
  const title = patch.title === undefined ? undefined : String(patch.title).trim().slice(0, 200);
  const client = patch.client === undefined ? undefined : String(patch.client).trim().slice(0, 200);
  if (title === undefined && client === undefined) throw new ManageError(422, 'Send a title or a client.');
  if (title !== undefined && !title) throw new ManageError(422, 'The title cannot be empty.');
  const next: TenderState = { ...state, meta: { ...state.meta }, tender: { ...state.tender } };
  if (title !== undefined) {
    next.meta.title = title;
    next.tender.title = title;
  }
  if (client !== undefined) next.tender.client = client;
  return next;
}

/** Keeps the stored file list's title and client in step, so a re-run does not undo a rename. */
export async function renameManifest(store: Store, tenderId: string, patch: { title?: string; client?: string }) {
  const manifest = await store.getJson<Manifest>(keys.manifest(tenderId));
  if (!manifest) return;
  await store.putJson(keys.manifest(tenderId), {
    ...manifest,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.client !== undefined ? { client: patch.client } : {}),
  });
}

const VENDOR_ID = /^[A-Za-z0-9._-]{1,32}$/;

/** Adds an uploaded PDF to the file list as a bid. */
export async function addBid(
  store: Store,
  tenderId: string,
  raw: { file?: unknown; vendor_id?: unknown; vendor_name?: unknown; country?: unknown },
  maxBids: number,
): Promise<Manifest> {
  const manifest = await store.getJson<Manifest>(keys.manifest(tenderId));
  if (!manifest) throw new ManageError(404, `No file list for ${tenderId}. Upload the tender first.`);
  const index = (await store.getJson<Record<string, FileEntry>>(keys.fileIndex(tenderId))) ?? {};
  const file = String(raw.file || '');
  if (!index[file]) throw new ManageError(422, `${file || 'The file'} was not uploaded.`);
  if (manifest.documents.some((d) => d.file === file)) throw new ManageError(409, `${file} is already in the file list.`);
  const vid = String(raw.vendor_id || '');
  if (!VENDOR_ID.test(vid)) throw new ManageError(422, `Vendor ID "${vid}" must be letters, digits, dots, dashes or underscores.`);
  if (manifest.documents.some((d) => d.vendor_id === vid)) throw new ManageError(409, `Vendor ID ${vid} is already used.`);
  const bids = manifest.documents.filter((d) => d.role === 'vendor_bid').length;
  if (bids >= maxBids) throw new ManageError(422, `The built-in engine evaluates up to ${maxBids} bids per tender.`);
  const next: Manifest = {
    ...manifest,
    documents: [
      ...manifest.documents,
      {
        file,
        role: 'vendor_bid',
        vendor_id: vid,
        vendor_name: String(raw.vendor_name || vid).trim().slice(0, 120) || vid,
        country: String(raw.country || '').slice(0, 60),
      },
    ],
  };
  await store.putJson(keys.manifest(tenderId), next);
  return next;
}

/** Takes a bid out of the file list and deletes its PDF. The spec can only be replaced, not removed. */
export async function removeDocument(store: Store, tenderId: string, file: string): Promise<Manifest> {
  const manifest = await store.getJson<Manifest>(keys.manifest(tenderId));
  if (!manifest) throw new ManageError(404, `No file list for ${tenderId}.`);
  const doc = manifest.documents.find((d) => d.file === file);
  if (!doc) throw new ManageError(404, `${file} is not in the file list.`);
  if (doc.role === 'mr_spec') throw new ManageError(409, 'The spec cannot be removed. Replace it with the new revision instead.');
  if (manifest.documents.filter((d) => d.role === 'vendor_bid').length <= 1) {
    throw new ManageError(409, 'A tender needs at least one bid. Add another before removing this one.');
  }
  const next: Manifest = { ...manifest, documents: manifest.documents.filter((d) => d.file !== file) };
  await store.putJson(keys.manifest(tenderId), next);
  const index = (await store.getJson<Record<string, FileEntry>>(keys.fileIndex(tenderId))) ?? {};
  delete index[file];
  await store.putJson(keys.fileIndex(tenderId), index);
  await store.remove(keys.file(tenderId, file));
  await store.remove(keys.pages(tenderId, file));
  return next;
}
