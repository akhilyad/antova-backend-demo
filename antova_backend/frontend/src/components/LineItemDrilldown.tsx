'use client';

import React from 'react';
import { Parameter, VendorFinancials } from '../lib/types';
import { formatEur, getStatusStyle, getCriticalityStyle } from '../lib/formatting';
import { X, ExternalLink, Edit2, AlertTriangle, FileText } from 'lucide-react';

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
    <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] rounded-xl overflow-hidden text-xs shadow-lg font-sans">
      {/* Header */}
      <div className="px-4 py-3 bg-zinc-50 dark:bg-[#111113] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-cyan-500" />
          <div>
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-white tracking-tight">
              Parameter Breakdown: {financials?.name || vendorId} ({financials?.country || 'N/A'})
            </h3>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 font-mono">
              Base: <span className="text-zinc-800 dark:text-zinc-200 tabular-nums">{formatEur(financials?.headline_price)}</span> · Adders: <span className="text-rose-600 dark:text-rose-400 tabular-nums">+{formatEur(financials?.total_adders)}</span> · True Cost: <span className="text-zinc-900 dark:text-white font-semibold tabular-nums">{formatEur(financials?.true_evaluated_price)}</span>
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          aria-label="Close parameter breakdown"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Line Items List */}
      <div className="p-3.5 space-y-3 max-h-[680px] overflow-y-auto">
        {safeParameters.length === 0 ? (
          <div className="py-8 text-center text-zinc-500 dark:text-zinc-400 font-sans">
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
            const costLines = Array.isArray(ext?.cost_lines) ? ext.cost_lines : [];

            return (
              <div
                key={param.id}
                className={`p-3 rounded-lg border transition-colors ${
                  hasGap
                    ? 'border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/10'
                    : 'border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-[#111113]'
                }`}
              >
                {/* Row Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-black border border-cyan-200 dark:border-zinc-800 px-1.5 py-0.5 rounded">
                      {param.id}
                    </span>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 font-sans">
                      {param.name}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${critStyle.badge}`}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2.5 text-xs">
                  <div className="p-2.5 rounded bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800/80 shadow-xs">
                    <div className="text-[10px] text-zinc-500 uppercase font-semibold mb-1">
                      Specification Clause
                    </div>
                    <div className="text-zinc-800 dark:text-zinc-200 leading-relaxed font-sans">{param.mr_requirement}</div>
                    {param.requirement_citation && (
                      <div className="text-[10px] text-zinc-500 mt-1.5 flex items-center gap-1 font-mono">
                        <FileText className="w-3 h-3 text-zinc-400 dark:text-zinc-600" />
                        <span>{param.requirement_citation.filename} · p.{param.requirement_citation.page}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 rounded bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800/80 shadow-xs">
                    <div className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 flex items-center justify-between">
                      <span>Proposal Extracted Verbatim</span>
                      {ext?.confidence !== undefined && (
                        <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[10px]">
                          Confidence: {(ext.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-800 dark:text-zinc-200 leading-relaxed font-sans">
                      {ext?.extracted_text || <span className="text-zinc-500 dark:text-zinc-600 italic">No quotation found in proposal</span>}
                    </div>
                    {ext?.citation && (
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1.5 flex items-center justify-between font-mono">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3 text-cyan-500 dark:text-cyan-400" />
                          <span>{ext.citation.filename} · p.{ext.citation.page}</span>
                        </span>
                        <button
                          onClick={() => onOpenEvidence(param.id, 'primary')}
                          className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline flex items-center gap-1 ml-2 font-sans text-xs"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Inspect Evidence BBox</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cost Adder Lines */}
                {costLines.length > 0 && (
                  <div className="mt-2.5 p-2 rounded bg-zinc-100/70 dark:bg-black border border-zinc-200 dark:border-zinc-800/80 text-xs font-mono">
                    <div className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium mb-1 font-sans">
                      Audited Gap Adder Formula ({ext?.rate_table_version || 'standard'}):
                    </div>
                    <div className="space-y-1">
                      {costLines.map((line, idx) => (
                        <div key={idx} className="flex items-center justify-between text-zinc-700 dark:text-zinc-300 text-[11px]">
                          <span>
                            {line.label}: {line.qty} {line.unit} × {formatEur(line.rate)}/{line.unit} ({line.driver})
                          </span>
                          <span className="text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                            +{formatEur(parseFloat(line.qty) * parseFloat(line.rate))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Founder Override Note */}
                {adderItem?.is_overridden && (
                  <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300 flex items-start justify-between font-sans">
                    <div>
                      <span className="font-semibold">Reviewer Override Active: </span>
                      <span>{adderItem.override_note}</span>
                    </div>
                    <span className="text-amber-700 dark:text-amber-400 font-bold ml-2 font-mono tabular-nums">
                      +{formatEur(adderItem.adder_eur)}
                    </span>
                  </div>
                )}

                {/* Actions Footer */}
                <div className="mt-2.5 pt-2 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                  <div>
                    {ext?.flags && ext.flags.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-sans">
                        <AlertTriangle className="w-3 h-3" />
                        {ext.flags[0].message}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onOpenOverride(param.id)}
                    className="px-2.5 py-1 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded text-xs transition-colors flex items-center gap-1 font-sans shadow-xs"
                  >
                    <Edit2 className="w-3 h-3 text-zinc-500 dark:text-zinc-400" />
                    <span>{adderItem?.is_overridden ? 'Edit Override' : 'Override Adder'}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
