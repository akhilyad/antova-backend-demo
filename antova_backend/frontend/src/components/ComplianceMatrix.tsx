'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Parameter, Vendor } from '../lib/types';
import { formatAdderEur } from '../lib/domain/money';
import { statusTag } from '../lib/domain/status';

interface ComplianceMatrixProps {
  parameters?: Parameter[];
  vendors?: Vendor[];
  onOpenEvidence: (paramId: string, vendorId: string, which: 'primary' | 'secondary') => void;
  onOpenOverride: (vendorId: string, paramId: string) => void;
  onOpenReview?: (vendorId: string, paramId: string) => void;
}

const CRIT: Record<string, string> = { MANDATORY: 'Mandatory', HIGH: 'High', MEDIUM: 'Medium', COMMERCIAL: 'Commercial' };

/**
 * Requirement x bidder matrix. Each cell is one line (status and adder). A row opens to show the
 * spec clause and the code checks per bidder; a cell opens the review drawer for that bidder.
 */
export function ComplianceMatrix({ parameters = [], vendors = [], onOpenEvidence, onOpenOverride, onOpenReview }: ComplianceMatrixProps) {
  const [filterCriticality, setFilterCriticality] = useState<string>('ALL');
  const [showGapsOnly, setShowGapsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const safeParameters = Array.isArray(parameters) ? parameters : [];
  const safeVendors = Array.isArray(vendors) ? vendors : [];
  const review = (vendorId: string, paramId: string) => (onOpenReview ?? onOpenOverride)(vendorId, paramId);

  const filtered = safeParameters.filter((param) => {
    if (!param) return false;
    if (filterCriticality !== 'ALL' && param.criticality !== filterCriticality) return false;
    if (showGapsOnly) {
      const cells = Object.values(param.vendors || {});
      const hasGap = cells.some(
        (v) => v && ((v.status !== 'COMPLIANT' && v.status !== 'DEVIATION_UPGRADE') || v.pricing_status === 'UNPRICED')
      );
      if (!hasGap) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (![param.id, param.name, param.mr_requirement || ''].some((t) => t.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const control = 'rounded border border-rule-strong bg-paper px-2 py-1 text-xs text-ink outline-none focus:border-ink';

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search requirements"
          className={`${control} w-48`}
          aria-label="Search requirements"
        />
        <select
          value={filterCriticality}
          onChange={(e) => setFilterCriticality(e.target.value)}
          className={`${control} cursor-pointer`}
          aria-label="Filter by priority"
        >
          <option value="ALL">All priorities</option>
          <option value="MANDATORY">Mandatory</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="COMMERCIAL">Commercial</option>
        </select>
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-muted hover:text-ink">
          <input type="checkbox" checked={showGapsOnly} onChange={(e) => setShowGapsOnly(e.target.checked)} className="accent-current" />
          Gaps only
        </label>
        <span className="ml-auto tabular-nums text-faint">
          {filtered.length} of {safeParameters.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-[13px]" aria-label="Requirements check">
          <colgroup>
            <col className="w-[34%]" />
            {safeVendors.map((v) => (
              <col key={v.id} />
            ))}
            <col className="w-8" />
          </colgroup>
          <thead>
            <tr className="border-b border-rule-strong text-[11px] text-muted">
              <th scope="col" className="py-2 pr-4 text-left font-normal">Requirement</th>
              {safeVendors.map((v) => (
                <th key={v.id} scope="col" className="truncate px-3 py-2 text-left font-normal" title={v.name}>
                  {v.name || v.id}
                </th>
              ))}
              <th scope="col"><span className="sr-only">Expand</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={safeVendors.length + 2} className="py-10 text-center text-muted">No requirements match.</td>
              </tr>
            )}
            {filtered.map((param) => {
              const isOpen = expanded === param.id;
              const toggle = () => setExpanded(isOpen ? null : param.id);
              return (
                <React.Fragment key={param.id}>
                  <tr className={`cursor-pointer border-b border-rule hover:bg-sheet ${isOpen ? 'bg-sheet' : ''}`} onClick={toggle}>
                    <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle();
                        }}
                        className="flex w-full min-w-0 items-baseline gap-2 text-left focus-visible:outline-none focus-visible:underline"
                      >
                        <span className="truncate text-ink" title={param.name}>{param.name}</span>
                        <span className="shrink-0 text-[11px] text-faint">{CRIT[param.criticality] ?? param.criticality}</span>
                      </button>
                    </th>
                    {safeVendors.map((vendor) => {
                      const ext = param.vendors?.[vendor.id];
                      const tag = statusTag(ext?.status ?? 'MANUAL_INSPECTION_REQUIRED', ext?.pricing_status ?? 'NONE', false);
                      const adder = typeof ext?.cost_adder === 'number' ? ext.cost_adder : null;
                      const tone = tag.severity === 'ok' ? 'text-ink-2' : tag.severity === 'open' ? 'text-open' : 'text-gap';
                      return (
                        <td key={vendor.id} className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              review(vendor.id, param.id);
                            }}
                            className={`flex w-full items-baseline justify-between gap-2 text-left tabular-nums hover:underline ${tone}`}
                            aria-label={`${param.name}, ${vendor.name}: ${tag.word}`}
                          >
                            <span className="truncate">{tag.word}</span>
                            {adder !== null && adder > 0 && <span className="shrink-0 text-xs">{formatAdderEur(adder)}</span>}
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-2.5 text-right text-faint">
                      <ChevronRight className={`ml-auto h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90 text-ink' : ''}`} aria-hidden="true" />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-rule bg-sheet align-top text-xs">
                      <td className="pb-4 pr-4 pt-1">
                        <p className="leading-relaxed text-ink-2">{param.mr_requirement}</p>
                        {param.requirement_citation && (
                          <p className="mt-1.5 font-mono text-[11px] text-faint">
                            {param.requirement_citation.filename} · p. {param.requirement_citation.page}
                          </p>
                        )}
                      </td>
                      {safeVendors.map((vendor) => {
                        const ext = param.vendors?.[vendor.id];
                        const checks = Array.isArray(ext?.checks) ? ext.checks : [];
                        return (
                          <td key={vendor.id} className="px-3 pb-4 pt-1">
                            {checks.length > 0 ? (
                              <ul className="space-y-0.5 font-mono text-[11px]">
                                {checks.map((chk, i) => (
                                  <li key={i} className="flex justify-between gap-2">
                                    <span className="truncate text-ink-2" title={chk.offered}>{chk.offered || 'Not stated'}</span>
                                    <span className={`shrink-0 ${chk.passed ? 'text-faint' : 'text-gap'}`}>
                                      {chk.passed ? 'ok' : `need ${chk.required}`}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="line-clamp-3 text-ink-2">{ext?.extracted_text || <span className="text-faint">Not in the bid</span>}</p>
                            )}
                            {ext?.citation && (
                              <button
                                type="button"
                                onClick={() => onOpenEvidence(param.id, vendor.id, 'primary')}
                                className="mt-1.5 font-mono text-[11px] text-faint underline decoration-rule-strong underline-offset-2 hover:text-ink"
                              >
                                p. {ext.citation.page}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
