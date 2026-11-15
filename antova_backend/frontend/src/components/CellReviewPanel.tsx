'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  User,
  ShieldCheck,
  Edit3,
  XCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import type { Extraction, ReviewRow } from '../lib/types';
import { StatusTag } from './StatusTag';
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
    setActiveAction(isOverridden ? 'override' : 'approve');

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
  }, [isOpen, tenderId, paramId, vendorId, currentAdder, currentNote, isOverridden]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      setErrorMsg('A reviewer justification note is required for institutional audit trail.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);

      if (activeAction === 'override') {
        const val = parseFloat(overrideAmount);
        if (isNaN(val) || val < 0) {
          setErrorMsg('Please enter a valid numeric adder amount in EUR.');
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
      setErrorMsg(err.message || 'Action failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-2xs transition-opacity animate-in fade-in">
      <div className="w-full max-w-xl h-full bg-[#FAF8F5] dark:bg-[#141210] border-l border-[#D9D4CC] dark:border-[#7A7266] shadow-2xl flex flex-col font-sans text-zinc-900 dark:text-zinc-100 overflow-hidden">
        {/* Panel Header */}
        <div className="p-4 border-b border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200">
                {paramId}
              </span>
              <span className="text-sm font-semibold">{paramName}</span>
            </div>
            <div className="text-xs text-[#767067] dark:text-[#A39A8D] mt-0.5">
              Bidder: <strong className="text-zinc-900 dark:text-zinc-100">{vendorName}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close review panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Status & Pricing Banner */}
          {extraction && (
            <div className="p-3.5 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] flex items-center justify-between shadow-2xs">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#767067] dark:text-[#A39A8D] tracking-wider">
                  Compliance Status
                </span>
                <div>
                  <StatusTag
                    status={extraction.status}
                    pricingStatus={extraction.pricing_status}
                    overridden={isOverridden}
                  />
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-[#767067] dark:text-[#A39A8D] tracking-wider">
                  Cost to Close
                </span>
                <div className="font-mono text-sm font-bold text-[#9E2B1F] dark:text-[#E07A6A]">
                  {formatAdderEur(currentAdder ?? extraction.cost_adder)}
                </div>
              </div>
            </div>
          )}

          {/* Specification Clause */}
          <div className="p-3.5 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] space-y-1.5 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-[#767067] dark:text-[#A39A8D] tracking-wider">
              Employer Requirement Clause
            </span>
            <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed font-sans">
              {mrRequirement || 'No specification text recorded.'}
            </p>
          </div>

          {/* Proposal Extracted Verbatim */}
          <div className="p-3.5 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-[#767067] dark:text-[#A39A8D] tracking-wider">
                Extracted Proposal Verbatim
              </span>
              {typeof extraction?.confidence === 'number' && (
                <span className="font-mono text-[10px] text-[#767067] dark:text-[#A39A8D]">
                  Confidence: {(extraction.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <p className="text-zinc-900 dark:text-zinc-100 font-mono text-[11px] bg-zinc-50 dark:bg-zinc-900/60 p-2.5 rounded border border-zinc-200 dark:border-zinc-800 leading-relaxed">
              &ldquo;{extraction?.extracted_text || 'No explicit text identified in proposal'}&rdquo;
            </p>

            {/* Citations & Evidence Button */}
            {extraction?.citation && (
              <div className="flex items-center justify-between pt-1 font-mono text-[11px] text-[#767067] dark:text-[#A39A8D]">
                <span className="flex items-center gap-1.5 truncate">
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="truncate">{extraction.citation.filename} · p.{extraction.citation.page}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onOpenEvidence(paramId, 'primary')}
                  className="px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 font-sans font-semibold flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Inspect Crop</span>
                </button>
              </div>
            )}
          </div>

          {/* Contradiction Note if present */}
          {extraction?.conflict_note && (
            <div className="p-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                Contradiction Detected
              </span>
              <p className="leading-relaxed">{extraction.conflict_note}</p>
            </div>
          )}

          {/* Review Decision History */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold text-[#767067] dark:text-[#A39A8D] tracking-wider">
              Audit Decision Record
            </span>
            {loadingHistory ? (
              <div className="flex items-center justify-center p-4 text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span>Loading decision history...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="p-3 rounded-lg border border-dashed border-[#D9D4CC] dark:border-[#7A7266] text-zinc-500 text-center">
                No previous human review decisions recorded for this cell.
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((row) => (
                  <div
                    key={row.id}
                    className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1C1916] space-y-1 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 font-semibold uppercase text-[10px] tracking-wide text-zinc-800 dark:text-zinc-200">
                        <User className="w-3 h-3 text-zinc-400" />
                        {row.reviewer} · <span className="font-mono text-zinc-500">{row.action}</span>
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(row.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-zinc-700 dark:text-zinc-300 italic">&ldquo;{row.note}&rdquo;</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Review Action Form */}
          {isVerified ? (
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/60 text-center text-zinc-600 dark:text-zinc-400">
              <ShieldCheck className="w-5 h-5 mx-auto mb-1 text-zinc-400" />
              <span>Tender is verified and sealed. Review decisions and overrides are locked.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                  Record Review Decision
                </span>
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => setActiveAction('approve')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                      activeAction === 'approve'
                        ? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white shadow-2xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
                    <span>Approve</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveAction('override')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                      activeAction === 'override'
                        ? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white shadow-2xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                    <span>Override</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveAction('reject')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                      activeAction === 'reject'
                        ? 'bg-white dark:bg-zinc-950 text-[#9E2B1F] dark:text-[#E07A6A] shadow-2xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5 text-[#9E2B1F]" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>

              {/* Conditional Override Amount input */}
              {activeAction === 'override' && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-500">
                    Override True Cost Adder (EUR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 font-mono text-zinc-400">€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={overrideAmount}
                      onChange={(e) => setOverrideAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-mono text-xs focus:ring-1 focus:ring-zinc-900 outline-none"
                      required
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    Original rate table adder: {formatEur(extraction?.cost_adder || 0)}
                  </span>
                </div>
              )}

              {/* Justification Note */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-zinc-500">
                  Audit Justification Note (Required)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={
                    activeAction === 'approve'
                      ? 'Confirm specification compliance or approved variance rationale...'
                      : activeAction === 'override'
                      ? 'State pricing basis, commercial agreement, or rate revision source...'
                      : 'State technical or commercial deficiency leading to rejection...'
                  }
                  className="w-full p-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-xs focus:ring-1 focus:ring-zinc-900 outline-none leading-relaxed"
                  required
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white font-semibold flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {activeAction === 'approve'
                      ? 'Approve Cell'
                      : activeAction === 'override'
                      ? 'Save Override'
                      : 'Reject Claim'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
