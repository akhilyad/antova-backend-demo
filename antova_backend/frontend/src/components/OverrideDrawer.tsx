'use client';

import React, { useState } from 'react';
import { putOverride, deleteOverride } from '../lib/api';
import { formatEur } from '../lib/formatting';
import { X, Check, Trash2, AlertCircle, Loader2 } from 'lucide-react';

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const num = parseFloat(adder);
    if (isNaN(num) || num < 0 || num > 10000000) {
      setError('Adder must be between €0.00 and €10,000,000.00');
      return;
    }
    if (!note.trim()) {
      setError('A mandatory engineering audit note is required for the procurement record');
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 selection:bg-zinc-800 selection:text-white"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Procurement Cost Override"
    >
      <div
        className="bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-md w-full overflow-hidden shadow-2xl text-xs font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-zinc-50 dark:bg-[#111113] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-white uppercase tracking-wider">
              Procurement Cost Override
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4">
          <div className="p-3 bg-zinc-50 dark:bg-[#111113] rounded border border-zinc-200 dark:border-zinc-800 text-xs space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase font-semibold">Target Item:</div>
            <div className="text-zinc-900 dark:text-white font-semibold">{vendorName || vendorId}</div>
            <div className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">{paramId} · {paramName}</div>
          </div>

          <div>
            <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1 text-xs">
              Override Cost Adder (€ EUR, max 2 decimals)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-zinc-400 font-mono">€</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max="10000000"
                value={adder}
                onChange={(e) => setAdder(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded text-zinc-900 dark:text-white font-mono text-xs focus:border-zinc-500 focus:outline-none shadow-xs"
                required
              />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Replaces the engine&apos;s automated rate table adder for this specific cell.
            </p>
          </div>

          <div>
            <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1 text-xs">
              Audit Justification / Commercial Reason
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Quoted freight rate confirmed directly with logistics carrier; 18-month warranty gap priced via insurance policy."
              rows={3}
              className="w-full p-2.5 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded text-zinc-900 dark:text-zinc-200 text-xs focus:border-zinc-500 focus:outline-none resize-none font-sans shadow-xs"
              required
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Recorded under your reviewer identity in the audit trail and official TBE workbook.
            </p>
          </div>

          {error && (
            <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
            {currentNote ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="px-2.5 py-1.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded text-xs transition-colors flex items-center gap-1 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Revert</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-3.5 py-1.5 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-black font-semibold rounded text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply Override</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
