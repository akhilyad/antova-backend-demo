'use client';

import React, { useState } from 'react';
import { Parameter, Vendor } from '../lib/types';
import { formatEur, getStatusStyle, getCriticalityStyle } from '../lib/formatting';
import { FileText, Filter, AlertTriangle } from 'lucide-react';

interface ComplianceMatrixProps {
  parameters?: Parameter[];
  vendors?: Vendor[];
  onOpenEvidence: (paramId: string, vendorId: string, which: 'primary' | 'secondary') => void;
  onOpenOverride: (vendorId: string, paramId: string) => void;
}

export function ComplianceMatrix({
  parameters = [],
  vendors = [],
  onOpenEvidence,
  onOpenOverride,
}: ComplianceMatrixProps) {
  const [filterCriticality, setFilterCriticality] = useState<string>('ALL');
  const [showGapsOnly, setShowGapsOnly] = useState<boolean>(false);

  const safeParameters = Array.isArray(parameters) ? parameters : [];
  const safeVendors = Array.isArray(vendors) ? vendors : [];

  const filtered = safeParameters.filter((param) => {
    if (!param) return false;
    if (filterCriticality !== 'ALL' && param.criticality !== filterCriticality) {
      return false;
    }
    if (showGapsOnly) {
      const vendorDict = param.vendors && typeof param.vendors === 'object' ? param.vendors : {};
      const vendorList = Object.values(vendorDict);
      const hasGap = vendorList.some(
        (v: any) => v && v.status !== 'COMPLIANT' && v.status !== 'DEVIATION_UPGRADE'
      );
      if (!hasGap) return false;
    }
    return true;
  });

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] rounded-xl overflow-hidden text-xs shadow-sm font-sans">
      {/* Controls Bar */}
      <div className="px-4 py-3 bg-zinc-50 dark:bg-[#111113] border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-zinc-900 dark:text-white tracking-wide uppercase">
            Clause-by-Clause Compliance Matrix
          </h2>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
            Technical specification parameters evaluated with Pint unit conversions and deterministic precedence.
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded px-2.5 py-1">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500 text-[11px]">Filter:</span>
            <select
              value={filterCriticality}
              onChange={(e) => setFilterCriticality(e.target.value)}
              className="bg-transparent text-zinc-800 dark:text-zinc-200 font-medium text-xs outline-none cursor-pointer"
              aria-label="Filter by criticality"
            >
              <option value="ALL" className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">All Clauses ({safeParameters.length})</option>
              <option value="MANDATORY" className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">Mandatory Only</option>
              <option value="HIGH" className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">High Criticality</option>
              <option value="MEDIUM" className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">Medium Criticality</option>
              <option value="COMMERCIAL" className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">Commercial Only</option>
            </select>
          </div>

          <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-xs select-none">
            <input
              type="checkbox"
              checked={showGapsOnly}
              onChange={(e) => setShowGapsOnly(e.target.checked)}
              className="rounded bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:ring-0"
            />
            <span>Gaps Only</span>
          </label>
        </div>
      </div>

      {/* Grid Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" aria-label="Technical Compliance Matrix">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-black text-zinc-600 dark:text-zinc-400 text-[10px] tracking-wider uppercase font-sans">
              <th scope="col" className="py-2.5 px-3 font-medium min-w-[260px] max-w-[340px]">
                Specification Clause & Requirement
              </th>
              {safeVendors.map((vendor) => (
                <th key={vendor.id} scope="col" className="py-2.5 px-3 font-medium min-w-[240px] border-l border-zinc-200 dark:border-zinc-800/80">
                  <div className="text-zinc-900 dark:text-zinc-100 font-semibold text-xs">{vendor.name || vendor.id}</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono font-normal">
                    {vendor.country || 'N/A'} · {formatEur(vendor.headline_price)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80 bg-white dark:bg-[#09090B]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={safeVendors.length + 1} className="py-8 text-center text-zinc-500 dark:text-zinc-400 font-sans">
                  No technical parameters match the selected filter criteria.
                </td>
              </tr>
            ) : (
              filtered.map((param) => {
                const critStyle = getCriticalityStyle(param.criticality);
                const vendorMap = param.vendors && typeof param.vendors === 'object' ? param.vendors : {};

                return (
                  <tr key={param.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors">
                    {/* Clause / Requirement Column */}
                    <th scope="row" className="py-3 px-3 align-top font-normal">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-black border border-cyan-200 dark:border-zinc-800 px-1 py-0.5 rounded text-[10px]">
                          {param.id}
                        </span>
                        <span
                          className={`text-[9px] px-1 py-0.5 rounded font-semibold border ${critStyle.badge}`}
                        >
                          {critStyle.label}
                        </span>
                      </div>

                      <div className="font-medium text-zinc-900 dark:text-zinc-200 text-xs mb-1.5 font-sans">
                        {param.name}
                      </div>

                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans mb-1.5 line-clamp-3" title={param.mr_requirement}>
                        {param.mr_requirement}
                      </div>

                      {param.requirement_citation && (
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 font-mono">
                          <FileText className="w-3 h-3 text-zinc-400 dark:text-zinc-600" />
                          <span>{param.requirement_citation.filename} · p.{param.requirement_citation.page}</span>
                        </div>
                      )}
                    </th>

                    {/* Vendors columns */}
                    {safeVendors.map((vendor) => {
                      const ext = vendorMap[vendor.id];
                      const status = ext?.status || 'MANUAL_INSPECTION_REQUIRED';
                      const statusStyle = getStatusStyle(status);
                      const costAdder = typeof ext?.cost_adder === 'number' ? ext.cost_adder : 0;
                      const checks = Array.isArray(ext?.checks) ? ext.checks : [];

                      return (
                        <td
                          key={vendor.id}
                          className={`py-3 px-3 align-top border-l border-zinc-200 dark:border-zinc-800/80 ${
                            costAdder > 0 ? 'bg-rose-50/50 dark:bg-rose-950/10' : ''
                          }`}
                        >
                          {/* Status Badge & Adder */}
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                            >
                              {statusStyle.label}
                            </span>

                            <span className="font-mono tabular-nums font-bold text-xs">
                              {costAdder > 0 ? (
                                <span className="text-rose-600 dark:text-rose-400">+{formatEur(costAdder)}</span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">€0</span>
                              )}
                            </span>
                          </div>

                          {/* Extracted claim */}
                          <div className="text-zinc-800 dark:text-zinc-200 text-xs leading-relaxed mb-2 line-clamp-3 font-sans" title={ext?.extracted_text}>
                            {ext?.extracted_text || <span className="text-zinc-400 dark:text-zinc-600 italic">No quotation found</span>}
                          </div>

                          {/* Checked parameters with Pint unit rules */}
                          {checks.length > 0 && (
                            <div className="space-y-0.5 mb-2 font-mono text-[10px]">
                              {checks.map((chk, idx) => (
                                <div
                                  key={idx}
                                  className={`px-1.5 py-0.5 rounded flex items-center justify-between ${
                                    chk.passed
                                      ? 'bg-zinc-100 dark:bg-black text-zinc-700 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-900'
                                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold border border-rose-200 dark:border-rose-900/40'
                                  }`}
                                >
                                  <span>{chk.field}: {chk.offered}</span>
                                  <span>{chk.passed ? '✓' : `✗ (Req: ${chk.required})`}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Citation & Action */}
                          <div className="pt-1.5 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between text-[11px] font-sans">
                            {ext?.citation ? (
                              <button
                                onClick={() => onOpenEvidence(param.id, vendor.id, 'primary')}
                                className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline flex items-center gap-1 font-mono text-[11px]"
                              >
                                <FileText className="w-3 h-3 text-cyan-500" />
                                <span>p.{ext.citation.page}</span>
                              </button>
                            ) : (
                              <span className="text-zinc-400 dark:text-zinc-600 text-[10px] font-mono">No citation</span>
                            )}

                            <button
                              onClick={() => onOpenOverride(vendor.id, param.id)}
                              className="text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-2 py-0.5 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-800 text-[10px] shadow-xs"
                            >
                              Override
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
