'use client';

import React, { useState, useEffect, useRef } from 'react';
import { putOverride, deleteOverride } from '../lib/api';
import { formatEur } from '../lib/formatting';
import {
  X,
  Check,
  Trash2,
  AlertCircle,
  Loader2,
  FileText,
  Clock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface OverrideDrawerProps {
  tenderId: string;
  paramId: string;
  vendorId: string;
  paramName?: string;
  vendorName?: string;
  currentAdderEur?: number | string;
  currentNote?: string | null;
  onSuccess: () => void;
  onClose: () => void;
}

export function OverrideDrawer({
  tenderId,
  paramId,
  vendorId,
  paramName,
  vendorName,
  currentAdderEur,
  currentNote,
  onSuccess,
  onClose,
}: OverrideDrawerProps) {
  const [adder, setAdder] = useState<string>(
    currentAdderEur !== undefined ? String(currentAdderEur) : '0.00'
  );
  const [note, setNote] = useState<string>(currentNote || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const num = parseFloat(adder);
    if (isNaN(num) || num < 0 || num > 10000000) {
      setError('Adder must be between €0.00 and €10,000,000.00');
      return;
    }
    if (!note.trim() || note.trim().length < 8) {
      setError('A mandatory engineering audit note (minimum 8 characters) is required for compliance traceability');
      return;
    }

    // Format with exactly 2 decimal places
    const formattedAdder = num.toFixed(2);

    try {
      setIsSubmitting(true);
      await putOverride(tenderId, paramId, vendorId, formattedAdder, note.trim());
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to apply override');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Revert this line item to the automated rate table adder?')) return;
    try {
      setIsSubmitting(true);
      await deleteOverride(tenderId, paramId, vendorId);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete override');
    } finally {
      setIsSubmitting(false);
    }
  };

  const originalAdderNum = typeof currentAdderEur === 'number' ? currentAdderEur : parseFloat(String(currentAdderEur || 0));
  const proposedAdderNum = parseFloat(adder) || 0;
  const deltaNum = proposedAdderNum - originalAdderNum;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-label="Procurement Cost Override">
      {/* Semi-transparent Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Slide-over Right Sheet */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-[500px] bg-white dark:bg-[#09090B] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col font-sans text-xs">
          {/* Fixed Sheet Header */}
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#111113] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-amber-500/20" />
              <div>
                <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  Procurement Cost Override
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Line item scope gap adjustment & formal audit note
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Content / Body */}
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Target Item Summary */}
            <div className="p-3.5 bg-zinc-50 dark:bg-[#111113] rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                Audited Scope Item
              </div>
              <div>
                <div className="text-zinc-900 dark:text-white font-semibold text-sm">
                  {vendorName || vendorId}
                </div>
                <div className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px] mt-0.5">
                  <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{paramId}</span> · {paramName}
                </div>
              </div>
            </div>

            {/* Comparison Grid: Automated Adder vs Proposed Override */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
                <div className="text-[10px] uppercase text-zinc-500 font-medium">Automated Rate</div>
                <div className="text-sm font-mono font-bold text-zinc-800 dark:text-zinc-200 mt-1 tabular-nums">
                  {formatEur(originalAdderNum)}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">Calculated by engine</div>
              </div>

              <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20">
                <div className="text-[10px] uppercase text-amber-700 dark:text-amber-400 font-medium">Proposed Value</div>
                <div className="text-sm font-mono font-bold text-amber-900 dark:text-amber-300 mt-1 tabular-nums">
                  {formatEur(proposedAdderNum)}
                </div>
                <div className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                  {deltaNum >= 0 ? `+${formatEur(deltaNum)}` : `-${formatEur(Math.abs(deltaNum))}`} delta
                </div>
              </div>
            </div>

            {/* Cost Input */}
            <div>
              <label className="block text-zinc-800 dark:text-zinc-200 font-semibold mb-1 text-xs">
                Override Adder Amount (€ EUR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-zinc-400 font-mono text-xs">€</span>
                <input
                  ref={inputRef}
                  type="number"
                  step="0.01"
                  min="0"
                  max="10000000"
                  value={adder}
                  onChange={(e) => setAdder(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white font-mono text-xs focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 shadow-2xs"
                  required
                />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Replaces the engine&apos;s automated formula adder for this parameter cell.
              </p>
            </div>

            {/* Audit Justification */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-zinc-800 dark:text-zinc-200 font-semibold text-xs flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  Mandatory Engineering Justification
                </label>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {note.length} characters (min 8)
                </span>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Quoted freight rate confirmed directly with logistics carrier; 18-month warranty gap priced via insurance policy."
                rows={4}
                className="w-full p-2.5 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-zinc-200 text-xs focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-none font-sans shadow-2xs leading-relaxed"
                required
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                This explanation is stamped permanently in the TBE export and procurement audit log.
              </p>
            </div>

            {/* Audit History / Compliance Protocol Note */}
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 font-semibold text-[11px]">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Governance & Audit Trail</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Applying an override marks the tender brief as modified. Overridden cells are flagged in red within the True Job Cost Ledger and export workbooks.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-md text-rose-700 dark:text-rose-400 flex items-start gap-2 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}
          </form>

          {/* Fixed Action Footer */}
          <div className="p-4 bg-zinc-50 dark:bg-[#111113] border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
            {currentAdderEur !== undefined ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="px-3 py-2 bg-transparent text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors flex items-center gap-1.5 font-medium text-xs disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Revert to Auto</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 font-medium transition-colors text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md bg-[#172536] dark:bg-white text-white dark:text-black font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center gap-1.5 text-xs shadow-2xs disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Override</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
