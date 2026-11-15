'use client';

import React, { useState } from 'react';
import { Parameter, Vendor } from '../lib/types';
import { formatEur, getStatusStyle, getCriticalityStyle } from '../lib/formatting';
import { FileText, Filter, Search, X, Check, AlertTriangle, ExternalLink, Edit2, ShieldAlert } from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState<string>('');

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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = param.id.toLowerCase().includes(q);
      const matchName = param.name.toLowerCase().includes(q);
      const matchReq = param.mr_requirement?.toLowerCase().includes(q);
      if (!matchId && !matchName && !matchReq) return false;
    }
    return true;
  });

  return (
    <div className="border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#09090B] rounded-xl overflow-hidden text-xs shadow-2xs font-sans">
      {/* Controls Bar */}
      <div className="px-5 py-3.5 bg-[#F8FAFC] dark:bg-[#111113] border-b border-[#DCE2E8] dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-[#182433] dark:text-white tracking-wider uppercase">
              Clause-by-Clause Compliance Matrix (Pint 0.26.2 Engine)
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#DCE2E8] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-cyan-700 dark:text-cyan-400 font-mono font-medium">
              Deterministic Dimensional Precedence
            </span>
          </div>
          <p className="text-[11px] text-[#667487] dark:text-zinc-400 mt-0.5">
            Technical specification parameters evaluated with mathematical unit conversions and clause-by-clause grounding.
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clause ID or name..."
              className="pl-8 pr-7 py-1 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-md text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 w-44 shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Criticality Selector */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-md px-2.5 py-1 shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-500 text-[11px]">Severity:</span>
            <select
              value={filterCriticality}
              onChange={(e) => setFilterCriticality(e.target.value)}
              className="bg-transparent text-zinc-800 dark:text-zinc-200 font-medium text-xs outline-none cursor-pointer"
              aria-label="Filter by criticality"
            >
              <option value="ALL">All Clauses ({safeParameters.length})</option>
              <option value="MANDATORY">Mandatory Only</option>
              <option value="HIGH">High Criticality</option>
              <option value="MEDIUM">Medium Criticality</option>
              <option value="COMMERCIAL">Commercial Only</option>
            </select>
          </div>

          {/* Gaps Only Toggle */}
          <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-md cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-xs select-none shadow-2xs">
            <input
              type="checkbox"
              checked={showGapsOnly}
              onChange={(e) => setShowGapsOnly(e.target.checked)}
              className="rounded bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-[#172536] dark:text-white focus:ring-0"
            />
            <span className="font-medium">Gaps Only</span>
          </label>
        </div>
      </div>

      {/* Grid Table */}
      <div className="overflow-x-auto max-h-[750px]">
        <table className="w-full text-left border-collapse" aria-label="Technical Compliance Matrix">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#DCE2E8] dark:border-zinc-800 bg-[#F4F6F8] dark:bg-black text-[#667487] dark:text-zinc-400 text-[10px] tracking-wider uppercase font-semibold">
              <th scope="col" className="py-3 px-3.5 min-w-[280px] max-w-[340px] bg-[#F4F6F8] dark:bg-black">
                Specification Clause & Requirement
              </th>
              {safeVendors.map((vendor) => (
                <th key={vendor.id} scope="col" className="py-3 px-3.5 min-w-[260px] border-l border-[#DCE2E8] dark:border-zinc-800/80 bg-[#F4F6F8] dark:bg-black">
                  <div className="text-[#182433] dark:text-zinc-100 font-bold text-xs">{vendor.name || vendor.id}</div>
                  <div className="text-[11px] text-[#667487] dark:text-zinc-400 font-mono font-normal">
                    {vendor.country || 'N/A'} · {formatEur(vendor.headline_price)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DCE2E8] dark:divide-zinc-800/80 bg-white dark:bg-[#09090B]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={safeVendors.length + 1} className="py-12 text-center text-zinc-500 dark:text-zinc-400 font-sans">
                  No technical parameters match the selected filter criteria.
                </td>
              </tr>
            ) : (
              filtered.map((param) => {
                const critStyle = getCriticalityStyle(param.criticality);
                const vendorMap = param.vendors && typeof param.vendors === 'object' ? param.vendors : {};

                return (
                  <tr key={param.id} className="hover:bg-[#F8FAFC] dark:hover:bg-zinc-900/30 transition-colors">
                    {/* Clause / Requirement Column */}
                    <th scope="row" className="py-3.5 px-3.5 align-top font-normal bg-zinc-50/40 dark:bg-zinc-900/10">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="font-mono font-bold text-[#172536] dark:text-cyan-400 bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded text-[10px]">
                          {param.id}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border ${critStyle.badge}`}
                        >
                          {critStyle.label}
                        </span>
                      </div>

                      <div className="font-bold text-[#182433] dark:text-zinc-100 text-xs mb-1 font-sans">
                        {param.name}
                      </div>

                      <div className="text-[11px] text-[#667487] dark:text-zinc-400 leading-relaxed font-sans mb-1.5 line-clamp-3" title={param.mr_requirement}>
                        {param.mr_requirement}
                      </div>

                      {param.requirement_citation && (
                        <div className="text-[10px] text-zinc-500 flex items-center gap-1 font-mono">
                          <FileText className="w-3 h-3 text-zinc-400" />
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
                      const hasDeviation = costAdder > 0 || status === 'DEVIATION_DOWNGRADE' || status === 'OMITTED';
                      const checks = Array.isArray(ext?.checks) ? ext.checks : [];

                      return (
                        <td
                          key={vendor.id}
                          className={`py-3.5 px-3.5 align-top border-l border-[#DCE2E8] dark:border-zinc-800/80 transition-colors ${
                            hasDeviation
                              ? 'bg-rose-50/30 dark:bg-rose-950/10'
                              : 'bg-white dark:bg-[#09090B]'
                          }`}
                        >
                          {/* Status Badge & Adder Amount */}
                          <div className="flex items-center justify-between gap-1.5 pb-2 mb-2 border-b border-[#DCE2E8]/60 dark:border-zinc-800/60">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                            >
                              {statusStyle.label}
                            </span>

                            <span className="font-mono text-xs font-bold tabular-nums">
                              {costAdder > 0 ? (
                                <span className="text-rose-600 dark:text-rose-400">+{formatEur(costAdder)}</span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">€0</span>
                              )}
                            </span>
                          </div>

                          {/* Pint Rule Checks */}
                          <div className="space-y-1 mb-2 font-mono text-[11px]">
                            {checks.length > 0 ? (
                              checks.map((chk, cIdx) => (
                                <div key={cIdx} className="flex items-center justify-between gap-1">
                                  <span className="text-zinc-600 dark:text-zinc-400 truncate max-w-[170px]" title={chk.offered}>
                                    {chk.offered || 'Not indicated'}
                                  </span>
                                  {chk.passed ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">✓</span>
                                  ) : (
                                    <span className="text-rose-600 dark:text-rose-400 font-bold text-[10px]">
                                      ✗ (Req: {chk.required})
                                    </span>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="text-[11px] text-zinc-700 dark:text-zinc-300 font-sans line-clamp-2">
                                {ext?.extracted_text || <span className="text-zinc-400 italic">No offer data</span>}
                              </div>
                            )}
                          </div>

                          {/* Cell Footprint: Citation Link & Override Button */}
                          <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-900 text-[10px]">
                            {ext?.citation ? (
                              <button
                                onClick={() => onOpenEvidence(param.id, vendor.id, 'primary')}
                                className="text-cyan-700 dark:text-cyan-400 hover:underline flex items-center gap-1 font-mono font-medium"
                              >
                                <span>p.{ext.citation.page}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            ) : (
                              <span className="text-zinc-400 font-mono">—</span>
                            )}

                            <button
                              onClick={() => onOpenOverride(vendor.id, param.id)}
                              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white font-medium hover:underline text-[10px]"
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
