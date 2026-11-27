'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FilePlus2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { addTenderBid, removeTenderDocument, replaceTenderDocument } from '../lib/api';
import type { SourceDocument, Vendor } from '../lib/types';
import { ActionButton, ConfirmDialog } from './ui/actions';

interface TenderFilesPanelProps {
  tenderId: string;
  documents: SourceDocument[];
  vendors: Vendor[];
  /** Signed off or the saved sample: files are shown but cannot change. */
  readOnly: boolean;
  readOnlyReason?: string;
  /** Called after any change; the files on the server now differ from the evaluated brief. */
  onChanged: (message: string) => void;
}

const ROLE: Record<string, string> = { mr_spec: 'Spec', vendor_bid: 'Bid' };

/**
 * The tender's source PDFs. Replace swaps in a new revision under the same slot (Rev B for Rev A);
 * Add bid and Remove change the file list. Each change waits for "Re-run audit" to be evaluated.
 */
export function TenderFilesPanel({ tenderId, documents, vendors, readOnly, readOnlyReason, onChanged }: TenderFilesPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<SourceDocument | null>(null);
  const [adding, setAdding] = useState(false);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newName, setNewName] = useState('');
  // Changes since the evaluated brief, shown at once and marked until the audit is re-run.
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Array<SourceDocument & { vendor_name: string }>>([]);
  const [replaced, setReplaced] = useState<Record<string, string>>({});
  // A fresh brief (after a re-run) already holds these changes.
  useEffect(() => {
    setRemoved(new Set());
    setAdded([]);
    setReplaced({});
  }, [documents]);
  const rows = [
    ...documents.filter((d) => !removed.has(d.filename)),
    ...added.filter((d) => !removed.has(d.filename)),
  ];
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  const vendorName = (id: string | null) =>
    vendors.find((v) => v.id === id)?.name ?? added.find((d) => d.vendor_id === id)?.vendor_name ?? id ?? '';

  const nextVendorId = () => {
    const used = new Set([...documents, ...added].map((d) => d.vendor_id).filter(Boolean));
    for (let i = 0; i < 26; i++) {
      const id = `vendor-${String.fromCharCode(97 + i)}`;
      if (!used.has(id)) return id;
    }
    return `vendor-${Date.now().toString(36)}`;
  };

  const run = async (key: string, fn: () => Promise<void>, message: string) => {
    try {
      setBusy(key);
      setError(null);
      await fn();
      onChanged(message);
      return true;
    } catch (err: any) {
      setError(err?.message || 'That did not work. Try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const onReplacePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slot = replaceTarget.current;
    e.target.value = '';
    if (!file || !slot) return;
    const ok = await run(`replace:${slot}`, () => replaceTenderDocument(tenderId, slot, file), `${slot} replaced with ${file.name}. Re-run the audit to evaluate it.`);
    if (ok) setReplaced((m) => ({ ...m, [slot]: file.name }));
  };

  const submitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFile) return;
    const name = newName.trim() || newFile.name.replace(/\.pdf$/i, '');
    if (rows.some((d) => d.filename === newFile.name)) {
      setError(`${newFile.name} is already in the file list. Use Replace to swap it.`);
      return;
    }
    const vendorId = nextVendorId();
    const ok = await run(
      'add',
      () => addTenderBid(tenderId, newFile, { vendorId, vendorName: name }),
      `${name} added. Re-run the audit to evaluate it.`
    );
    if (ok) {
      setAdded((a) => [...a, { filename: newFile.name, role: 'vendor_bid', vendor_id: vendorId, page_count: 0, vendor_name: name }]);
      setRemoved((r0) => {
        const n = new Set(r0);
        n.delete(newFile.name);
        return n;
      });
      setAdding(false);
      setNewFile(null);
      setNewName('');
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    const doc = pendingRemove;
    const ok = await run(`remove:${doc.filename}`, () => removeTenderDocument(tenderId, doc.filename), `${doc.filename} removed. Re-run the audit to update the ranking.`);
    if (ok) {
      setRemoved((r0) => new Set(r0).add(doc.filename));
      setPendingRemove(null);
    }
  };

  return (
    <section aria-label="Source files">
      <input ref={replaceInput} type="file" accept=".pdf" className="sr-only" tabIndex={-1} onChange={onReplacePicked} />
      <table className="w-full table-fixed border-collapse text-[13px]">
        <colgroup>
          <col />
          <col className="w-16" />
          <col className="w-40" />
          <col className="w-16" />
          <col className="w-36" />
        </colgroup>
        <thead>
          <tr className="border-b border-rule-strong text-[11px] text-muted">
            <th scope="col" className="py-2 pr-4 text-left font-normal">File</th>
            <th scope="col" className="py-2 pr-4 text-left font-normal">Role</th>
            <th scope="col" className="py-2 pr-4 text-left font-normal">Bidder</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">Pages</th>
            <th scope="col" className="py-2 text-right font-normal"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const isSpec = d.role === 'mr_spec';
            const isNew = added.some((a) => a.filename === d.filename);
            const swapped = replaced[d.filename];
            const bidCount = rows.filter((x) => x.role === 'vendor_bid').length;
            return (
              <tr key={d.filename} className="border-b border-rule">
                <td className="truncate py-2 pr-4 font-mono text-xs text-ink-2" title={swapped ? `${d.filename} ← ${swapped}` : d.filename}>
                  {d.filename}
                  {(isNew || swapped) && (
                    <span className="ml-2 font-sans text-[11px] text-open">{isNew ? 'Not yet audited' : `Replaced · ${swapped}`}</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-ink-2">{ROLE[d.role] ?? d.role}</td>
                <td className="truncate py-2 pr-4 text-ink-2">{isSpec ? '–' : vendorName(d.vendor_id)}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-muted">{d.page_count || '–'}</td>
                <td className="py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <ActionButton
                      icon={RefreshCw}
                      size="xs"
                      label="Replace"
                      title={readOnly ? readOnlyReason : `Upload a new revision of ${d.filename}`}
                      disabled={readOnly || Boolean(busy)}
                      busy={busy === `replace:${d.filename}`}
                      onClick={() => {
                        replaceTarget.current = d.filename;
                        replaceInput.current?.click();
                      }}
                    />
                    {!isSpec && (
                      <ActionButton
                        icon={Trash2}
                        iconOnly
                        tone="destructive"
                        label={readOnly ? readOnlyReason || 'Read only' : `Remove ${d.filename}`}
                        disabled={readOnly || Boolean(busy) || bidCount <= 1}
                        title={bidCount <= 1 ? 'A tender needs at least one bid' : undefined}
                        onClick={() => setPendingRemove(d)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {adding ? (
        <form onSubmit={submitBid} className="mt-3 flex flex-wrap items-center gap-2 border-b border-rule pb-3 text-xs" onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}>
          <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded border border-dashed border-rule-strong px-2.5 text-ink-2 hover:bg-sheet focus-within:ring-2 focus-within:ring-ink">
            <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="max-w-[16rem] truncate">{newFile ? newFile.name : 'Choose bid PDF'}</span>
            <input type="file" accept=".pdf" className="sr-only" onChange={(e) => setNewFile(e.target.files?.[0] ?? null)} />
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Bidder name"
            aria-label="Bidder name"
            className="h-7 w-48 rounded border border-rule-strong bg-paper px-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
          />
          <ActionButton type="submit" tone="primary" icon={Plus} label="Add bid" disabled={!newFile} busy={busy === 'add'} />
          <ActionButton icon={X} label="Cancel" tone="default" onClick={() => setAdding(false)} disabled={busy === 'add'} />
        </form>
      ) : (
        <div className="mt-3">
          <ActionButton
            icon={Plus}
            label="Add bid"
            title={readOnly ? readOnlyReason : 'Upload another bidder’s PDF'}
            disabled={readOnly || Boolean(busy)}
            onClick={() => {
              setError(null);
              setAdding(true);
            }}
          />
        </div>
      )}

      {error && <p className="mt-2 text-xs text-gap" role="alert">{error}</p>}
      <p className="mt-4 text-[11px] leading-4 text-faint">
        Replacing, adding or removing a file does not change the evaluation until you re-run the audit. Overrides stay where
        the quoted evidence is unchanged.
      </p>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title={`Remove ${pendingRemove?.filename ?? ''}?`}
        body="The PDF is deleted and the bid leaves the file list. Re-run the audit to update the ranking."
        confirmLabel="Remove bid"
        busy={Boolean(busy)}
        error={pendingRemove ? error : null}
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </section>
  );
}
