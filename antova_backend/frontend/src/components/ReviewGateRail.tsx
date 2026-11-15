'use client';

import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
  HelpCircle,
  FileQuestion,
  Lock,
} from 'lucide-react';
import type { OpenItem, ReviewSummary } from '../lib/types';

export interface ReviewGateRailProps {
  openItems: OpenItem[];
  review?: ReviewSummary;
  isVerified: boolean;
  onSelectOpenItem: (item: OpenItem) => void;
  onVerify: () => void;
  isVerifying: boolean;
  blockingMessage?: string | null;
}

export function ReviewGateRail({
  openItems,
  review,
  isVerified,
  onSelectOpenItem,
  onVerify,
  isVerifying,
  blockingMessage,
}: ReviewGateRailProps) {
  const openCount = openItems.length;

  // Group by kind
  const reviewFlags = openItems.filter((i) => i.kind === 'review_flag');
  const unpricedItems = openItems.filter((i) => i.kind === 'unpriced' || i.kind === 'missing_price');
  const inspectionItems = openItems.filter((i) => i.kind === 'needs_inspection');
  const projectItems = openItems.filter((i) => i.kind === 'project_field');

  return (
    <div className="rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] p-4 text-xs font-sans space-y-3.5 shadow-2xs">
      {/* Rail Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wider text-zinc-900 dark:text-white flex items-center gap-1.5">
            {isVerified ? (
              <ShieldCheck className="w-4 h-4 text-zinc-800 dark:text-zinc-200" />
            ) : openCount > 0 ? (
              <ShieldAlert className="w-4 h-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-zinc-800 dark:text-zinc-200" />
            )}
            Audit Verification Gate
          </span>
          <span
            className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-bold border ${
              isVerified
                ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200'
                : openCount > 0
                ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200'
            }`}
          >
            {isVerified ? 'SEALED' : openCount > 0 ? `${openCount} BLOCKING` : 'CLEARED'}
          </span>
        </div>

        {review && (
          <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] text-[#767067] dark:text-[#A39A8D]">
            <span>Reviewed: {review.reviewed}</span>
            <span>·</span>
            <span>Flags: {review.open_flags}</span>
            <span>·</span>
            <span>Stale: {review.stale}</span>
          </div>
        )}
      </div>

      {/* Blocking Notice or Action Items List */}
      {!isVerified && openCount > 0 && (
        <div className="space-y-2">
          <p className="text-[#767067] dark:text-[#A39A8D] text-[11px]">
            Every unpriced gap, review flag, and manual inspection item must be audited before the brief can be verified.
          </p>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {/* Review Flags */}
            {reviewFlags.map((item, idx) => (
              <button
                key={`rf-${idx}`}
                type="button"
                onClick={() => onSelectOpenItem(item)}
                className="w-full text-left p-2 rounded-lg border border-amber-200 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/30 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2 truncate">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="font-mono text-[10px] font-bold text-amber-900 dark:text-amber-200">
                    {item.param_id || 'FLAG'}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">{item.message}</span>
                </div>
                <span className="font-semibold text-amber-800 dark:text-amber-300 text-[10px] flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
                  <span>Review</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </button>
            ))}

            {/* Unpriced gaps */}
            {unpricedItems.map((item, idx) => (
              <button
                key={`up-${idx}`}
                type="button"
                onClick={() => onSelectOpenItem(item)}
                className="w-full text-left p-2 rounded-lg border border-[#E8C5C1] dark:border-[#7A2B22] bg-[#FDF1F0] dark:bg-[#3A1F1A]/40 hover:bg-[#F9E5E3] dark:hover:bg-[#4D241E]/50 transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-mono text-[10px] font-bold text-[#9E2B1F] dark:text-[#E07A6A] px-1 py-0.2 rounded bg-white dark:bg-zinc-900 border border-[#E8C5C1] dark:border-[#7A2B22]">
                    €? UNPRICED
                  </span>
                  <span className="font-mono text-[10px] font-bold text-zinc-900 dark:text-zinc-100">
                    {item.param_id}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">{item.message}</span>
                </div>
                <span className="font-semibold text-[#9E2B1F] dark:text-[#E07A6A] text-[10px] flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
                  <span>Price / Accept</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </button>
            ))}

            {/* Needs inspection */}
            {inspectionItems.map((item, idx) => (
              <button
                key={`ni-${idx}`}
                type="button"
                onClick={() => onSelectOpenItem(item)}
                className="w-full text-left p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2 truncate">
                  <HelpCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="font-mono text-[10px] font-bold text-zinc-900 dark:text-zinc-100">
                    {item.param_id}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">{item.message}</span>
                </div>
                <span className="font-semibold text-zinc-700 dark:text-zinc-300 text-[10px] flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
                  <span>Inspect</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </button>
            ))}

            {/* Project baseline fields */}
            {projectItems.map((item, idx) => (
              <button
                key={`pj-${idx}`}
                type="button"
                onClick={() => onSelectOpenItem(item)}
                className="w-full text-left p-2 rounded-lg border border-cyan-200 dark:border-cyan-800/80 bg-cyan-50/50 dark:bg-cyan-950/30 hover:bg-cyan-100/50 transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileQuestion className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                  <span className="font-mono text-[10px] font-bold text-cyan-900 dark:text-cyan-200">
                    {item.param_id}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">{item.message}</span>
                </div>
                <span className="font-semibold text-cyan-800 dark:text-cyan-300 text-[10px] flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
                  <span>Confirm</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Blocking Error Notice if verify failed */}
      {blockingMessage && (
        <div className="p-2.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 text-[11px] flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{blockingMessage}</span>
        </div>
      )}

      {/* Verify Action Footer */}
      <div className="pt-1 flex items-center justify-between border-t border-[#D9D4CC] dark:border-[#7A7266]">
        <div className="text-[11px] text-[#767067] dark:text-[#A39A8D]">
          {isVerified ? (
            <span className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
              <Lock className="w-3.5 h-3.5" />
              <span>Audit sealed · TBE workbook & commercial exports unlocked</span>
            </span>
          ) : openCount > 0 ? (
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              {openCount} unresolved {openCount === 1 ? 'item blocks' : 'items block'} verification
            </span>
          ) : (
            <span className="text-zinc-800 dark:text-zinc-200 font-medium">
              Zero blockers remaining · Ready for verified seal
            </span>
          )}
        </div>

        {!isVerified && (
          <button
            type="button"
            onClick={onVerify}
            disabled={openCount > 0 || isVerifying}
            className={`px-4 py-2 rounded-lg font-semibold text-xs flex items-center gap-2 transition-colors shadow-2xs ${
              openCount > 0
                ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                : 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white cursor-pointer'
            }`}
          >
            {isVerifying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            <span>Verify & Seal Audit</span>
          </button>
        )}
      </div>
    </div>
  );
}
