'use client';

import React, { useState } from 'react';
import { Parameter, Vendor } from '../lib/types';
import { formatEur, getStatusStyle, getCriticalityStyle } from '../lib/formatting';
import { FileText, Filter, ExternalLink, Check, AlertTriangle } from 'lucide-react';

interface ComplianceMatrixProps {
  parameters: Parameter[];
  vendors: Vendor[];
  onOpenEvidence: (paramId: string, vendorId: string, which: 'primary' | 'secondary') => void;
  onOpenOverride: (vendorId: string, paramId: string) => void;
}

export function ComplianceMatrix({
  parameters,
  vendors,
  onOpenEvidence,
  onOpenOverride,
}: ComplianceMatrixProps) {
  const [filterCriticality, setFilterCriticality] = useState<string>('ALL');
  const [showGapsOnly, setShowGapsOnly] = useState<boolean>(false);

  const filtered = parameters.filter((param) => {
    if (filterCriticality !== 'ALL' && param.criticality !== filterCriticality) {
      return false;
    }
    if (showGapsOnly) {
      const hasGap = Object.values(param.vendors).some(
        (v) => v.status !== 'COMPLIANT' && v.status !== 'DEVIATION_UPGRADE'
      );
      if (!hasGap) return false;
    }
    return true;
  });

  return (
    <div className="border border-zinc-800 bg-[#09090B] rounded overflow-hidden text-xs shadow-sm font-sans">
      {/* Controls Bar */}
      <div className="px-4 py-3 bg-[#111113] border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-white tracking-wide uppercase">
            Clause-by-Clause Compliance Matrix
          </h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Technical specification parameters evaluated with Pint unit conversions and deterministic precedence.
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-black border border-zinc-800 rounded px-2.5 py-1">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500 text-[11px]">Filter:</span>
            <select
              value={filterCriticality}
              onChange={(e) => setFilterCriticality(e.target.value)}
              className="bg-transparent text-zinc-200 font-medium text-xs outline-none cursor-pointer"
              aria-label="Filter by criticality"
            >
              <option value="ALL" className="bg-zinc-950">All Clauses ({parameters.length})</option>
              <option value="MANDATORY" className="bg-zinc-950">Mandatory Only</option>
              <option value="HIGH" className="bg-zinc-950">High Criticality</option>
              <option value="MEDIUM" className="bg-zinc-950">Medium Criticality</option>
              <option value="COMMERCIAL" className="bg-zinc-950">Commercial Only</option>
            </select>
          </div>

          <label className="flex items-center gap-1.5 px-2.5 py-1 bg-black border border-zinc-800 rounded cursor-pointer text-zinc-300 hover:text-white text-xs select-none">
            <input
              type="checkbox"
              checked={showGapsOnly}
              onChange={(e) => setShowGapsOnly(e.target.checked)}
              className="rounded bg-zinc-900 border-zinc-700 text-white focus:ring-0"
            />
            <span>Gaps Only</span>
          </label>
        </div>
      </div>

      {/* Grid Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" aria-label="Technical Compliance Matrix">
          <thead>
            <tr className="border-b border-zinc-800 bg-black text-zinc-400 text-[10px] tracking-wider uppercase font-sans">
              <th scope="col" className="py-2.5 px-3 font-medium min-w-[260px] max-w-[340px]">
                Specification Clause & Requirement
              </th>
              {vendors.map((vendor) => (
                <th key={vendor.id} scope="col" className="py-2.5 px-3 font-medium min-w-[240px] border-l border-zinc-800/80">
                  <div className="text-zinc-100 font-semibold text-xs">{vendor.name}</div>
                  <div className="text-[11px] text-zinc-500 font-mono font-normal">
                    {vendor.country} · {formatEur(vendor.headline_price)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900 bg-[#09090B]">
            {filtered.map((param) => {
              const critStyle = getCriticalityStyle(param.criticality);

              return (
                <tr key={param.id} className="hover:bg-zinc-900/30 transition-colors">
                  {/* Spec requirement */}
                  <th scope="row" className="py-3 px-3 align-top bg-[#111113]/40 font-normal">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold font-mono text-cyan-400 text-xs bg-black px-1.5 py-0.5 rounded border border-zinc-800">
                        {param.id}
                      </span>
                      <span className="text-zinc-100 font-semibold text-xs font-sans">{param.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded border font-medium ${critStyle.badge}`}>
                        {critStyle.label}
                      </span>
                    </div>

                    <div className="text-zinc-300 text-xs mb-1.5 leading-relaxed font-sans">
                      {param.mr_requirement}
                    </div>

                    {param.requirement_citation && (
                      <div className="text-[10px] text-zinc-500 flex items-center gap-1 font-mono">
                        <FileText className="w-3 h-3 text-zinc-600" />
                        <span>{param.requirement_citation.filename} · p.{param.requirement_citation.page}</span>
                      </div>
                    )}
                  </th>

                  {/* Vendors columns */}
                  {vendors.map((vendor) => {
                    const ext = param.vendors[vendor.id];
                    const status = ext?.status || 'MANUAL_INSPECTION_REQUIRED';
                    const statusStyle = getStatusStyle(status);
                    const costAdder = ext?.cost_adder || 0;

                    return (
                      <td
                        key={vendor.id}
                        className={`py-3 px-3 align-top border-l border-zinc-800/80 ${
                          costAdder > 0 ? 'bg-rose-950/10' : ''
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
                              <span className="text-rose-400">+{formatEur(costAdder)}</span>
                            ) : (
                              <span className="text-emerald-400">€0</span>
                            )}
                          </span>
                        </div>

                        {/* Extracted claim */}
                        <div className="text-zinc-200 text-xs leading-relaxed mb-2 line-clamp-3 font-sans" title={ext?.extracted_text}>
                          {ext?.extracted_text || <span className="text-zinc-600 italic">No quotation found</span>}
                        </div>

                        {/* Checked parameters with Pint unit rules */}
                        {ext?.checks && ext.checks.length > 0 && (
                          <div className="space-y-0.5 mb-2 font-mono text-[10px]">
                            {ext.checks.map((chk, idx) => (
                              <div
                                key={idx}
                                className={`px-1.5 py-0.5 rounded flex items-center justify-between ${
                                  chk.passed
                                    ? 'bg-black text-zinc-400 border border-zinc-900'
                                    : 'bg-rose-950/40 text-rose-300 font-semibold border border-rose-900/40'
                                }`}
                              >
                                <span>{chk.field}: {chk.offered}</span>
                                <span>{chk.passed ? '✓' : `✗ (Req: ${chk.required})`}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Citation & Action */}
                        <div className="pt-1.5 border-t border-zinc-900 flex items-center justify-between text-[11px] font-sans">
                          {ext?.citation ? (
                            <button
                              onClick={() => onOpenEvidence(param.id, vendor.id, 'primary')}
                              className="text-cyan-400 hover:text-cyan-300 underline flex items-center gap-1 font-mono text-[11px]"
                            >
                              <FileText className="w-3 h-3 text-cyan-500" />
                              <span>p.{ext.citation.page}</span>
                            </button>
                          ) : (
                            <span className="text-zinc-600 text-[10px] font-mono">No citation</span>
                          )}

                          <button
                            onClick={() => onOpenOverride(vendor.id, param.id)}
                            className="text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px]"
                          >
                            Override
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
