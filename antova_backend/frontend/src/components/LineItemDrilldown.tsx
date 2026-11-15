'use client';

import React from 'react';
import { Parameter, VendorFinancials } from '../lib/types';
import { formatEur, getStatusStyle, getCriticalityStyle } from '../lib/formatting';
import { X, ExternalLink, Edit2, AlertTriangle, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';

interface LineItemDrilldownProps {
  vendorId: string;
  financials: VendorFinancials;
  parameters?: Parameter[];
  onClose: () => void;
  onOpenEvidence: (paramId: string, which: 'primary' | 'secondary') => void;
  onOpenOverride: (paramId: string) => void;
}

export function LineItemDrilldown({
  vendorId,
  financials,
  parameters = [],
  onClose,
  onOpenEvidence,
  onOpenOverride,
}: LineItemDrilldownProps) {
  const safeParameters = Array.isArray(parameters) ? parameters : [];
  const breakdown = Array.isArray(financials?.itemized_breakdown) ? financials.itemized_breakdown : [];

  return (
    <div className="border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#09090B] rounded-xl overflow-hidden text-xs shadow-md font-sans">
      {/* Header */}
      <div className="px-5 py-3.5 bg-[#F8FAFC] dark:bg-[#111113] border-b border-[#DCE2E8] dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#172536] dark:bg-cyan-400 shrink-0" />
          <div>
            <h3 className="text-xs font-bold text-[#182433] dark:text-white tracking-tight">
              Parameter Breakdown: {financials?.name || vendorId} ({financials?.country || 'N/A'})
            </h3>
            <p className="text-[11px] text-[#667487] dark:text-zinc-400 mt-0.5 font-mono">
              Base: <span className="text-zinc-900 dark:text-zinc-200 tabular-nums font-semibold">{formatEur(financials?.headline_price)}</span> · Adders: <span className="text-rose-600 dark:text-rose-400 tabular-nums font-semibold">+{formatEur(financials?.total_adders)}</span> · True Cost: <span className="text-[#182433] dark:text-white font-bold tabular-nums">{formatEur(financials?.true_evaluated_price)}</span>
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-md transition-colors"
          aria-label="Close parameter breakdown"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Line Items List */}
      <div className="p-4 space-y-3.5 max-h-[700px] overflow-y-auto">
        {safeParameters.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 dark:text-zinc-400 font-sans">
            No specification parameters available for drilldown.
          </div>
        ) : (
          safeParameters.map((param) => {
            const vendorMap = param.vendors && typeof param.vendors === 'object' ? param.vendors : {};
            const ext = vendorMap[vendorId];
            const adderItem = breakdown.find((b) => b && b.param_id === param.id);
            const critStyle = getCriticalityStyle(param.criticality);
            const status = ext?.status || 'MANUAL_INSPECTION_REQUIRED';
            const statusStyle = getStatusStyle(status);
            const costAdder = typeof ext?.cost_adder === 'number' ? ext.cost_adder : 0;
            const hasGap = costAdder > 0 || Boolean(adderItem?.is_overridden);

            return (
              <div
                key={param.id}
                className={`p-3.5 rounded-lg border transition-all ${
                  hasGap
                    ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20'
                    : 'border-[#DCE2E8] dark:border-zinc-800/80 bg-[#FFFFFF] dark:bg-[#111113]'
                }`}
              >
                {/* Row Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#DCE2E8] dark:border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold font-mono text-[#172536] dark:text-cyan-400 bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded">
                      {param.id}
                    </span>
                    <span className="text-xs font-bold text-[#182433] dark:text-zinc-100 font-sans">
                      {param.name}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${critStyle.badge}`}
                    >
                      {critStyle.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                    >
                      {statusStyle.label}
                    </span>

                    <span className="text-xs font-bold font-mono tabular-nums">
                      {costAdder > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400">+{formatEur(costAdder)}</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">€0</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Requirement & Verbatim Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs">
                  <div className="p-3 rounded-md bg-zinc-50 dark:bg-black border border-[#DCE2E8] dark:border-zinc-800/80 shadow-2xs">
                    <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                      Specification Clause
                    </div>
                    <div className="text-zinc-800 dark:text-zinc-200 leading-relaxed font-sans">{param.mr_requirement}</div>
                    {param.requirement_citation && (
                      <div className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1 font-mono">
                        <FileText className="w-3 h-3 text-zinc-400" />
                        <span>{param.requirement_citation.filename} · p.{param.requirement_citation.page}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-md bg-zinc-50 dark:bg-black border border-[#DCE2E8] dark:border-zinc-800/80 shadow-2xs">
                    <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-1 flex items-center justify-between">
                      <span>Proposal Extracted Verbatim</span>
                      {typeof ext?.confidence === 'number' && (
                        <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[10px]">
                          Confidence: {(ext.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-800 dark:text-zinc-200 leading-relaxed font-sans">
                      {ext?.extracted_text || <span className="text-zinc-400 italic">No explicit quotation identified in proposal</span>}
                    </div>
                    {ext?.citation && (
                      <div className="text-[10px] text-zinc-500 mt-2 flex items-center justify-between font-mono">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                          <span>{ext.citation.filename} · p.{ext.citation.page}</span>
                        </span>
                        <button
                          onClick={() => onOpenEvidence(param.id, 'primary')}
                          className="text-cyan-700 dark:text-cyan-400 hover:underline flex items-center gap-1 ml-2 font-sans text-xs font-semibold"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Inspect Evidence</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Scope Gap Adder Breakdown & Override Action */}
                {costAdder > 0 && (
                  <div className="mt-3 p-3 rounded-md bg-white dark:bg-black/80 border border-rose-200 dark:border-rose-900/60 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                    <div className="space-y-0.5">
                      <div className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 tracking-wider">
                        Scope Omission Price Adder
                      </div>
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono">
                        Formula: {ext?.adder_formula || 'Calculated scope omission adder'}
                      </div>
                    </div>
                    <button
                      onClick={() => onOpenOverride(param.id)}
                      className="px-2.5 py-1 rounded bg-[#172536] dark:bg-zinc-800 text-white font-semibold text-[11px] hover:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1 shadow-2xs"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Override Adder</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
