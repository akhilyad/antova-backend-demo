'use client';

import React, { useState } from 'react';
import { Parameter, Vendor } from '../lib/types';
import { StatusTag } from './StatusTag';
import { formatEur, formatAdderEur } from '../lib/domain/money';
import { FileText, Filter, Search, X, ExternalLink, ShieldCheck, Edit3 } from 'lucide-react';

interface ComplianceMatrixProps {
  parameters?: Parameter[];
  vendors?: Vendor[];
  onOpenEvidence: (paramId: string, vendorId: string, which: 'primary' | 'secondary') => void;
  onOpenOverride: (vendorId: string, paramId: string) => void;
  onOpenReview?: (vendorId: string, paramId: string) => void;
}

export function ComplianceMatrix({
  parameters = [],
  vendors = [],
  onOpenEvidence,
  onOpenOverride,
  onOpenReview,
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
        (v: any) => v && (v.status !== 'COMPLIANT' && v.status !== 'DEVIATION_UPGRADE' || v.pricing_status === 'UNPRICED')
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
    <div className="border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] rounded-xl overflow-hidden text-xs shadow-2xs font-sans">
      {/* Controls Bar */}
      <div className="px-5 py-3.5 bg-[#FAF8F5] dark:bg-[#141210] border-b border-[#D9D4CC] dark:border-[#7A7266] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-zinc-900 dark:text-white tracking-wider uppercase">
              Requirements check
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#D9D4CC] dark:border-[#7A7266] bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono font-medium">
              Checked by code
            </span>
          </div>
          <p className="text-[11px] text-[#767067] dark:text-[#A39A8D] mt-0.5">
            Each requirement compared with each bid, with units converted before comparing.
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
              placeholder="Search requirements"
              className="pl-8 pr-7 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 w-44 shadow-2xs"
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
          <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md px-2.5 py-1 shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[#767067] dark:text-[#A39A8D] text-[11px]">Priority:</span>
            <select
              value={filterCriticality}
              onChange={(e) => setFilterCriticality(e.target.value)}
              className="bg-transparent text-zinc-800 dark:text-zinc-200 font-medium text-xs outline-none cursor-pointer"
              aria-label="Filter by priority"
            >
              <option value="ALL">All ({safeParameters.length})</option>
              <option value="MANDATORY">Mandatory</option>
              <option value="HIGH">High priority</option>
              <option value="MEDIUM">Medium priority</option>
              <option value="COMMERCIAL">Commercial</option>
            </select>
          </div>

          {/* Gaps Only Toggle */}
          <label className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-xs select-none shadow-2xs">
            <input
              type="checkbox"
              checked={showGapsOnly}
              onChange={(e) => setShowGapsOnly(e.target.checked)}
              className="rounded bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus:ring-0"
            />
            <span className="font-medium">Gaps only</span>
          </label>
        </div>
      </div>

      {/* Grid Table */}
      <div className="overflow-x-auto max-h-[750px]">
        <table className="w-full text-left border-collapse" aria-label="Requirements check">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#D9D4CC] dark:border-[#7A7266] bg-[#FAF8F5] dark:bg-[#141210] text-[#767067] dark:text-[#A39A8D] text-[10px] tracking-wider uppercase font-semibold">
              <th scope="col" className="py-3 px-3.5 min-w-[280px] max-w-[340px] bg-[#FAF8F5] dark:bg-[#141210]">
                Requirement
              </th>
              {safeVendors.map((vendor) => (
                <th key={vendor.id} scope="col" className="py-3 px-3.5 min-w-[260px] border-l border-[#D9D4CC] dark:border-[#7A7266]/40 bg-[#FAF8F5] dark:bg-[#141210]">
                  <div className="text-zinc-900 dark:text-zinc-100 font-bold text-xs">{vendor.name || vendor.id}</div>
                  <div className="text-[11px] text-[#767067] dark:text-[#A39A8D] font-mono font-normal">
                    {vendor.country || 'n/a'} · {formatEur(vendor.headline_price)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D9D4CC] dark:divide-[#7A7266]/40 bg-white dark:bg-[#1C1916]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={safeVendors.length + 1} className="py-12 text-center text-zinc-500 dark:text-zinc-400 font-sans">
                  No requirements match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((param) => {
                const vendorMap = param.vendors && typeof param.vendors === 'object' ? param.vendors : {};

                return (
                  <tr key={param.id} className="hover:bg-[#FAF8F5] dark:hover:bg-zinc-900/30 transition-colors">
                    {/* Clause / Requirement Column */}
                    <th scope="row" className="py-3.5 px-3.5 align-top font-normal bg-zinc-50/50 dark:bg-zinc-900/20">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded text-[10px]">
                          {param.id}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-[#767067] dark:text-[#A39A8D] font-mono">
                          {param.criticality}
                        </span>
                      </div>

                      <div className="font-bold text-zinc-900 dark:text-zinc-100 text-xs mb-1 font-sans">
                        {param.name}
                      </div>

                      <div className="text-[11px] text-[#767067] dark:text-[#A39A8D] leading-relaxed font-sans mb-1.5 line-clamp-3" title={param.mr_requirement}>
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
                      const costAdder = typeof ext?.cost_adder === 'number' ? ext.cost_adder : null;
                      const hasDeviation = (costAdder !== null && costAdder > 0) || status === 'DEVIATION_DOWNGRADE' || status === 'OMITTED';
                      const checks = Array.isArray(ext?.checks) ? ext.checks : [];

                      return (
                        <td
                          key={vendor.id}
                          className={`py-3.5 px-3.5 align-top border-l border-[#D9D4CC] dark:border-[#7A7266]/40 transition-colors ${
                            hasDeviation
                              ? 'bg-rose-50/30 dark:bg-rose-950/10'
                              : 'bg-white dark:bg-[#1C1916]'
                          }`}
                        >
                          {/* Status Badge & Adder Amount */}
                          <div className="flex items-center justify-between gap-1.5 pb-2 mb-2 border-b border-[#D9D4CC]/60 dark:border-[#7A7266]/40">
                            <StatusTag
                              status={status}
                              pricingStatus={ext?.pricing_status}
                            />

                            <span className="font-mono text-xs font-bold tabular-nums">
                              {costAdder !== null && costAdder > 0 ? (
                                <span className="text-[#9E2B1F] dark:text-[#E07A6A] font-bold">
                                  {formatAdderEur(costAdder)}
                                </span>
                              ) : costAdder === 0 ? (
                                <span className="text-zinc-600 dark:text-zinc-400 font-medium">€0</span>
                              ) : (
                                <span className="text-amber-700 dark:text-amber-400 font-mono text-[11px]">
                                  {ext?.pricing_status === 'UNPRICED' ? 'No price yet' : 'n/a'}
                                </span>
                              )}
                            </span>
                          </div>

                          {/* Pint Rule Checks */}
                          <div className="space-y-1 mb-2 font-mono text-[11px]">
                            {checks.length > 0 ? (
                              checks.map((chk, cIdx) => (
                                <div key={cIdx} className="flex items-center justify-between gap-1">
                                  <span className="text-zinc-600 dark:text-zinc-400 truncate max-w-[170px]" title={chk.offered}>
                                    {chk.offered || 'Not stated'}
                                  </span>
                                  {chk.passed ? (
                                    <span className="text-zinc-800 dark:text-zinc-200 font-bold text-[10px]">✓</span>
                                  ) : (
                                    <span className="text-[#9E2B1F] dark:text-[#E07A6A] font-bold text-[10px]">
                                      Required: {chk.required}
                                    </span>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="text-[11px] text-zinc-700 dark:text-zinc-300 font-sans line-clamp-2">
                                {ext?.extracted_text || <span className="text-zinc-400 italic">Not in the bid</span>}
                              </div>
                            )}
                          </div>

                          {/* Cell Footprint: Citation Link & Review Button */}
                          <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800 text-[10px]">
                            {ext?.citation ? (
                              <button
                                onClick={() => onOpenEvidence(param.id, vendor.id, 'primary')}
                                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:underline flex items-center gap-1 font-mono font-medium"
                              >
                                <span>p.{ext.citation.page}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            ) : (
                              <span className="text-zinc-400 font-mono">n/a</span>
                            )}

                            <button
                              onClick={() => {
                                if (onOpenReview) {
                                  onOpenReview(vendor.id, param.id);
                                } else {
                                  onOpenOverride(vendor.id, param.id);
                                }
                              }}
                              className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-semibold hover:underline text-[10px] flex items-center gap-0.5"
                            >
                              <span>Review</span>
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
