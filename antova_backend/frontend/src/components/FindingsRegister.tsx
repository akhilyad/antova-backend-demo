'use client';

import React, { useState, useMemo } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  FileText,
  ExternalLink,
  Coins,
  ShieldAlert,
  Filter,
} from 'lucide-react';
import type { Finding, Vendor, Parameter, Citation } from '../lib/types';
import { formatEur } from '../lib/domain/money';

export interface FindingsRegisterProps {
  findings?: Finding[] | Record<string, Finding> | null;
  vendors: Vendor[];
  parameters: Parameter[];
  onOpenEvidence: (paramId: string, which: 'primary' | 'secondary', citation?: Citation) => void;
}

export function FindingsRegister({
  findings,
  vendors,
  parameters,
  onOpenEvidence,
}: FindingsRegisterProps) {
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('ALL');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>('ALL');

  // Normalize findings list
  const allFindings = useMemo<Finding[]>(() => {
    let list: Finding[] = [];
    if (Array.isArray(findings)) {
      list = [...findings];
    } else if (findings && typeof findings === 'object') {
      list = Object.values(findings);
    }

    // If no findings array is explicitly attached (e.g. standard class before extended run),
    // synthesize findings from deviations, conflicts, and omissions in parameters
    if (list.length === 0) {
      for (const param of parameters) {
        for (const [vId, ext] of Object.entries(param.vendors || {})) {
          if (ext.status === 'DEVIATION_DOWNGRADE' || ext.status === 'OMITTED' || ext.status === 'CONFLICT_DOWNGRADE') {
            const isCommercial = param.criticality === 'COMMERCIAL';
            const severity: 'critical' | 'major' | 'minor' =
              param.criticality === 'MANDATORY'
                ? 'critical'
                : param.criticality === 'HIGH'
                ? 'major'
                : 'minor';

            list.push({
              vendor_id: vId,
              param_id: param.id,
              kind: ext.status === 'CONFLICT_DOWNGRADE' ? 'conflict' : ext.status === 'OMITTED' ? 'omitted' : 'deviation',
              severity,
              message:
                ext.conflict_note ||
                `${param.name}: bid says ${ext.extracted_text || 'nothing'}, spec requires ${param.mr_requirement}`,
              citations: ext.citation ? [ext.citation] : [],
              money: [
                {
                  basis: isCommercial ? 'exposure' : 'adder',
                  kind: param.category,
                  amount: ext.cost_adder !== null ? ext.cost_adder.toString() : null,
                  formula: ext.adder_formula,
                  reason: ext.pricing_status === 'UNPRICED' ? 'No price in the rate table' : undefined,
                  lines: (ext.cost_lines || []).map((l) => ({
                    label: l.label,
                    qty: l.qty,
                    unit: l.unit,
                    rate: l.rate,
                    driver: l.driver,
                  })),
                  inputs: [],
                },
              ],
            });
          }
        }
      }
    }

    // Sort by severity: critical -> major -> minor
    const severityOrder = { critical: 1, major: 2, minor: 3 };
    list.sort((a, b) => {
      const orderA = severityOrder[a.severity] || 4;
      const orderB = severityOrder[b.severity] || 4;
      if (orderA !== orderB) return orderA - orderB;
      return a.param_id.localeCompare(b.param_id);
    });

    return list;
  }, [findings, parameters]);

  // Filtered findings
  const filteredFindings = useMemo(() => {
    return allFindings.filter((f) => {
      if (selectedVendorFilter !== 'ALL' && f.vendor_id !== selectedVendorFilter) return false;
      if (selectedSeverityFilter !== 'ALL' && f.severity !== selectedSeverityFilter) return false;
      return true;
    });
  }, [allFindings, selectedVendorFilter, selectedSeverityFilter]);

  const vendorMap = useMemo(() => {
    const map = new Map<string, Vendor>();
    for (const v of vendors) map.set(v.id, v);
    return map;
  }, [vendors]);

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Filters and Summary Bar */}
      <div className="p-3.5 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wider text-zinc-900 dark:text-white flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-zinc-800 dark:text-zinc-200" />
            Findings
          </span>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-semibold text-zinc-700 dark:text-zinc-300">
            {filteredFindings.length} of {allFindings.length} findings
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Vendor Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[#767067] dark:text-[#A39A8D] text-[11px]">Bidder:</span>
            <select
              value={selectedVendorFilter}
              onChange={(e) => setSelectedVendorFilter(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 px-2 py-1 rounded text-xs outline-none cursor-pointer"
            >
              <option value="ALL">All bidders</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[#767067] dark:text-[#A39A8D] text-[11px]">Priority:</span>
            <select
              value={selectedSeverityFilter}
              onChange={(e) => setSelectedSeverityFilter(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 px-2 py-1 rounded text-xs outline-none cursor-pointer"
            >
              <option value="ALL">All priorities</option>
              <option value="critical">Critical</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          </div>
        </div>
      </div>

      {/* Findings List */}
      {filteredFindings.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-[#D9D4CC] dark:border-[#7A7266] text-center text-zinc-500 bg-white dark:bg-[#1C1916]">
          No findings match these filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFindings.map((finding, idx) => {
            const vendor = vendorMap.get(finding.vendor_id);
            const isCritical = finding.severity === 'critical';
            const isMajor = finding.severity === 'major';

            return (
              <div
                key={`finding-${idx}`}
                className="p-4 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] space-y-3 shadow-2xs"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    {/* Severity Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${
                        isCritical
                          ? 'bg-[#FDF1F0] dark:bg-[#3A1F1A]/60 text-[#9E2B1F] dark:text-[#E07A6A] border-[#E8C5C1] dark:border-[#7A2B22]'
                          : isMajor
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      {isCritical ? (
                        <AlertOctagon className="w-3 h-3 text-[#9E2B1F] dark:text-[#E07A6A]" />
                      ) : isMajor ? (
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                      ) : (
                        <Info className="w-3 h-3 text-zinc-500" />
                      )}
                      <span>{finding.severity}</span>
                    </span>

                    <span className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      {finding.param_id}
                    </span>
                    <span className="text-[#767067] dark:text-[#A39A8D]">·</span>
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      {vendor?.name || finding.vendor_id}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono text-[10px] uppercase">
                      {finding.kind.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Money Badge */}
                  <div className="flex items-center gap-2">
                    {finding.money.map((m, mIdx) => {
                      const isAdder = m.basis === 'adder';
                      return (
                        <div
                          key={`m-${mIdx}`}
                          className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold flex items-center gap-1.5 ${
                            isAdder
                              ? 'bg-[#FDF1F0] dark:bg-[#3A1F1A]/50 text-[#9E2B1F] dark:text-[#E07A6A] border-[#E8C5C1] dark:border-[#7A2B22]'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700'
                          }`}
                        >
                          <Coins className="w-3.5 h-3.5" />
                          <span>
                            {m.amount !== null
                              ? isAdder
                                ? `+${formatEur(m.amount)}`
                                : formatEur(m.amount)
                              : 'No price'}
                          </span>
                          <span className="text-[10px] font-sans font-medium text-[#767067] dark:text-[#A39A8D]">
                            ({isAdder ? 'Added to total' : 'Risk only'})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Finding Description Message */}
                <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed font-sans text-xs">
                  {finding.message}
                </p>

                {/* Detailed Money Formula or Unpriced Reason */}
                {finding.money.map((m, mIdx) => (
                  <div key={`m-details-${mIdx}`} className="space-y-1">
                    {m.amount === null && m.reason && (
                      <div className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                        No price yet. Not counted as €0. {m.reason}
                      </div>
                    )}
                    {m.formula && (
                      <div className="font-mono text-[11px] text-[#767067] dark:text-[#A39A8D] bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                        Formula: {m.formula}
                      </div>
                    )}
                  </div>
                ))}

                {/* Citations into Evidence Modal */}
                {finding.citations.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[10px] font-bold uppercase text-[#767067] dark:text-[#A39A8D] tracking-wider">
                      Sources:
                    </span>
                    {finding.citations.map((cite, cIdx) => (
                      <button
                        key={`cite-${cIdx}`}
                        type="button"
                        onClick={() => onOpenEvidence(finding.param_id, 'primary', cite)}
                        className="px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-mono text-[10px] flex items-center gap-1 transition-colors"
                      >
                        <FileText className="w-3 h-3 text-zinc-500" />
                        <span>{cite.filename} · p.{cite.page}</span>
                        <ExternalLink className="w-2.5 h-2.5 text-zinc-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
