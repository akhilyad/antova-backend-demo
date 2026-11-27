'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Extraction, ReviewRow } from '../lib/types';
import { statusTag } from '../lib/domain/status';
import { formatEur, formatAdderEur } from '../lib/domain/money';
import {
  submitReviewDecision,
  putOverride,
  listReviewHistory,
} from '../lib/api';

export interface CellReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tenderId: string;
  paramId: string;
  paramName: string;
  mrRequirement: string;
  vendorId: string;
  vendorName: string;
  extraction: Extraction | null;
  currentAdder: number | null;
  currentNote: string | null;
  isOverridden: boolean;
  isVerified: boolean;
  initialAction?: 'approve' | 'override' | 'reject';
  onDecisionSuccess: () => void;
  onOpenEvidence: (paramId: string, which: 'primary' | 'secondary') => void;
}

export function CellReviewPanel({
  isOpen,
  onClose,
  tenderId,
  paramId,
  paramName,
  mrRequirement,
  vendorId,
  vendorName,
  extraction,
  currentAdder,
  currentNote,
  isOverridden,
  isVerified,
  initialAction,
  onDecisionSuccess,
  onOpenEvidence,
}: CellReviewPanelProps) {
  const [activeAction, setActiveAction] = useState<'approve' | 'override' | 'reject'>('approve');
  const [note, setNote] = useState('');
  const [overrideAmount, setOverrideAmount] = useState(
    currentAdder !== null ? currentAdder.toString() : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<ReviewRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setNote(currentNote || '');
    setOverrideAmount(currentAdder !== null ? currentAdder.toString() : '');
    setActiveAction(initialAction || (isOverridden ? 'override' : 'approve'));

    // Fetch review history
    let isSubscribed = true;
    setLoadingHistory(true);
    listReviewHistory(tenderId)
      .then((rows) => {
        if (!isSubscribed) return;
        const cellHistory = rows.filter(
          (r) => r.param_id === paramId && r.vendor_id === vendorId
        );
        setHistory(cellHistory);
      })
      .catch((err) => {
        console.warn('Could not load review history:', err);
      })
      .finally(() => {
        if (isSubscribed) setLoadingHistory(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, tenderId, paramId, vendorId, currentAdder, currentNote, isOverridden, initialAction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      setErrorMsg('Add a reason. It is saved with your decision.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);

      if (activeAction === 'override') {
        const val = parseFloat(overrideAmount);
        if (isNaN(val) || val < 0) {
          setErrorMsg('Enter an amount in euros, for example 18500 or 18500.50.');
          setSubmitting(false);
          return;
        }
        await putOverride(tenderId, paramId, vendorId, val, note.trim());
      } else {
        await submitReviewDecision(tenderId, paramId, vendorId, activeAction, note.trim());
      }

      onDecisionSuccess();
      onClose();
    } catch (err: any) {
      console.error('Review action failed:', err);
      setErrorMsg(err.message || "Couldn't save your decision. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const tag = extraction ? statusTag(extraction.status, extraction.pricing_status, isOverridden) : null;
  const label = 'text-[11px] text-muted';
  const field =
    'w-full rounded border border-rule-strong bg-sheet px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${paramName}, ${vendorName}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-rule bg-paper font-sans text-ink"
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule px-6 py-4">
          <div className="min-w-0">
            <p className={label}>
              {vendorName} · <span className="font-mono">{paramId}</span>
            </p>
            <h2 className="mt-0.5 text-base font-semibold leading-6 tracking-tight">{paramName}</h2>
          </div>
          <button onClick={onClose} className="-mr-1 p-1 text-faint hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 divide-y divide-rule overflow-y-auto px-6 text-[13px]">
          {extraction && tag && (
            <section className="flex items-baseline justify-between gap-4 py-4">
              <div>
                <p className={label}>Result</p>
                <p className={`mt-0.5 font-medium ${tag.severity === 'ok' ? 'text-ink' : tag.severity === 'open' ? 'text-open' : 'text-gap'}`}>
                  {tag.word}
                  {isOverridden && <span className="font-normal text-faint"> · amount edited</span>}
                </p>
              </div>
              <div className="text-right">
                <p className={label}>Cost to close</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums text-gap">
                  {formatAdderEur(currentAdder ?? extraction.cost_adder)}
                </p>
              </div>
            </section>
          )}

          <section className="py-4">
            <p className={label}>Spec requirement</p>
            <p className="mt-1 leading-relaxed text-ink-2">{mrRequirement || 'No requirement text found in the spec.'}</p>
          </section>

          <section className="py-4">
            <div className="flex items-baseline justify-between">
              <p className={label}>Bidder's text</p>
              {typeof extraction?.confidence === 'number' && (
                <p className="text-[11px] tabular-nums text-faint">Match {(extraction.confidence * 100).toFixed(0)}%</p>
              )}
            </div>
            <blockquote className="mt-1.5 border-l-2 border-rule-strong pl-3 font-mono text-xs leading-relaxed text-ink">
              {extraction?.extracted_text || 'Not found in the bid'}
            </blockquote>
            {extraction?.citation && (
              <div className="mt-2 flex items-baseline justify-between gap-4 text-xs">
                <span className="truncate font-mono text-faint">
                  {extraction.citation.filename} · p. {extraction.citation.page}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenEvidence(paramId, 'primary')}
                  className="shrink-0 font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
                >
                  View page
                </button>
              </div>
            )}
          </section>

          {extraction?.conflict_note && (
            <section className="py-4">
              <p className="text-[11px] text-gap">Documents disagree</p>
              <p className="mt-1 leading-relaxed text-ink-2">{extraction.conflict_note}</p>
            </section>
          )}

          <section className="py-4">
            <p className={label}>Decision history</p>
            {loadingHistory ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-faint">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading
              </p>
            ) : history.length === 0 ? (
              <p className="mt-1 text-xs text-faint">None yet.</p>
            ) : (
              <ul className="mt-1.5 space-y-2">
                {history.map((row) => (
                  <li key={row.id} className="text-xs">
                    <p className="text-muted">
                      <span className="text-ink-2">{row.reviewer}</span> · {row.action} ·{' '}
                      <span className="tabular-nums">{new Date(row.created_at).toLocaleString()}</span>
                    </p>
                    <p className="mt-0.5 text-ink-2">{row.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isVerified ? (
            <section className="py-4 text-xs text-muted">Signed off. Reopen the tender to change decisions or amounts.</section>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-[13px] font-medium">Your decision</p>
                <div className="flex gap-4 text-xs" role="radiogroup" aria-label="Decision">
                  {(
                    [
                      ['approve', 'Accept'],
                      ['override', 'Edit amount'],
                      ['reject', 'Reject'],
                    ] as const
                  ).map(([key, text]) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={activeAction === key}
                      onClick={() => setActiveAction(key)}
                      className={`border-b pb-0.5 ${
                        activeAction === key ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              {activeAction === 'override' && (
                <label className="block space-y-1">
                  <span className={label}>New added cost (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={overrideAmount}
                    onChange={(e) => setOverrideAmount(e.target.value)}
                    placeholder="0.00"
                    className={`${field} font-mono tabular-nums`}
                    required
                  />
                  <span className="block text-[11px] text-faint">
                    Rate table: {formatEur(extraction?.cost_adder || 0)}
                  </span>
                </label>
              )}

              <label className="block space-y-1">
                <span className={label}>Reason (required)</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={
                    activeAction === 'approve'
                      ? 'Example: Datasheet p.4 confirms 50 kA for 3 s.'
                      : activeAction === 'override'
                      ? 'Example: Vendor quoted €6,150 freight in clarification of 12 Nov.'
                      : 'Example: Quote is from a different product range.'
                  }
                  className={`${field} leading-relaxed`}
                  required
                />
              </label>

              {errorMsg && <p className="text-xs text-gap">{errorMsg}</p>}

              <div className="flex items-center justify-end gap-3 text-xs">
                <button type="button" onClick={onClose} className="px-2 py-1.5 text-muted hover:text-ink">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 rounded bg-ink px-3.5 py-1.5 font-medium text-paper hover:opacity-90 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {activeAction === 'approve' ? 'Accept' : activeAction === 'override' ? 'Save new amount' : 'Reject'}
                </button>
              </div>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}
