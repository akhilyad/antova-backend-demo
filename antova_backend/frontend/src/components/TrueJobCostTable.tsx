'use client';

import React from 'react';
import { VendorFinancials, Vendor } from '../lib/types';
import { formatEur, formatDelta } from '../lib/formatting';
import { AlertCircle, Eye, Edit3 } from 'lucide-react';

interface TrueJobCostTableProps {
  financials?: VendorFinancials[];
  vendors?: Vendor[];
  onSelectVendor: (vendorId: string) => void;
  onOpenOverride: (vendorId: string, paramId?: string) => void;
  selectedVendorId?: string | null;
}

export function TrueJobCostTable({
  financials = [],
  vendors = [],
  onSelectVendor,
  onOpenOverride,
  selectedVendorId,
}: TrueJobCostTableProps) {
  const safeFinancials = Array.isArray(financials) ? financials : [];
  const safeVendors = Array.isArray(vendors) ? vendors : [];

  // Split into priced vs unquoted/incomplete bids
  const priced = safeFinancials.filter((f) => f && f.headline_price !== null && f.true_evaluated_price !== null);
  const unpriced = safeFinancials.filter((f) => f && (f.headline_price === null || f.true_evaluated_price === null));

  // Sort priced by true evaluated price ascending
  priced.sort((a, b) => (a.true_evaluated_price ?? 0) - (b.true_evaluated_price ?? 0));

  const sortedAll = [...priced, ...unpriced];

  // Lowest nominal quote among priced bids
  const lowestHeadlineVendor = [...priced].sort((a, b) => (a.headline_price ?? 0) - (b.headline_price ?? 0))[0];
  const lowestHeadline = lowestHeadlineVendor?.headline_price ?? null;

  // Best value (lowest true cost)
  const bestValueVendor = priced[0];

  // Has rank reversal occurred?
  const hasReversal =
    lowestHeadlineVendor &&
    bestValueVendor &&
    lowestHeadlineVendor.vendor_id !== bestValueVendor.vendor_id;

  return (
    <div className="border border-zinc-800 bg-[#09090B] rounded overflow-hidden text-xs shadow-sm font-sans">
      {/* Table Header Section */}
      <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-[#111113]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-white tracking-wide uppercase">
              True Job Cost & Scope Omission Ledger
            </h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-800 bg-black text-zinc-400 font-mono">
              Reconciled Comparison
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Quoted nominal bids leveled against unquoted equipment omissions, transport boundaries, and warranty shortfalls.
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-zinc-400 font-sans">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>L1 Recommended</span>
          </span>
          <span className="text-zinc-700">·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>Scope Gap Add-back</span>
          </span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" aria-label="Bid Audit Ledger">
          <thead>
            <tr className="border-b border-zinc-800 bg-black text-zinc-400 text-[10px] tracking-wider uppercase font-sans">
              <th scope="col" className="py-2.5 px-3 font-medium w-14">Rank</th>
              <th scope="col" className="py-2.5 px-3 font-medium min-w-[200px]">Vendor Proposal</th>
              <th scope="col" className="py-2.5 px-3 font-medium text-right">Quoted Bid</th>
              <th scope="col" className="py-2.5 px-3 font-medium text-right">Technical Gaps</th>
              <th scope="col" className="py-2.5 px-3 font-medium text-right">Commercial Gaps</th>
              <th scope="col" className="py-2.5 px-3 font-medium text-right">Net Omissions</th>
              <th scope="col" className="py-2.5 px-3 font-semibold text-right bg-zinc-900/60 text-zinc-100">
                True Job Cost
              </th>
              <th scope="col" className="py-2.5 px-3 font-medium text-right">Delta vs Quote</th>
              <th scope="col" className="py-2.5 px-3 font-medium text-center w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900 bg-[#09090B]">
            {sortedAll.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-zinc-500 font-sans">
                  No evaluated vendor bids available in this tender.
                </td>
              </tr>
            ) : (
              sortedAll.map((item, index) => {
                const vendor = safeVendors.find((v) => v && v.id === item.vendor_id);
                const isSelected = selectedVendorId === item.vendor_id;
                const isPriced = item.headline_price !== null && item.true_evaluated_price !== null;
                const isLowestNominal = isPriced && item.headline_price === lowestHeadline;
                const isBestValue = isPriced && index === 0;

                const deltaVsLowestQuote =
                  lowestHeadline !== null && item.true_evaluated_price !== null
                    ? item.true_evaluated_price - lowestHeadline
                    : null;

                return (
                  <tr
                    key={item.vendor_id}
                    onClick={() => onSelectVendor(item.vendor_id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-zinc-800/40 ring-1 ring-inset ring-cyan-500/40'
                        : 'hover:bg-zinc-900/40'
                    }`}
                  >
                    {/* Rank */}
                    <td className="py-3 px-3 font-mono text-xs">
                      {isPriced ? (
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${
                            isBestValue
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : isLowestNominal
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                          }`}
                        >
                          L{index + 1}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>

                    {/* Vendor Name & Origin */}
                    <td className="py-3 px-3 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100 text-xs">
                          {item.name || vendor?.name || item.vendor_id}
                        </span>
                        {isBestValue && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Recommended Award
                          </span>
                        )}
                        {isLowestNominal && !isBestValue && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Apparent Low Bidder
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                        {item.country || vendor?.country || 'N/A'} · {vendor?.doc_name || 'Offer PDF'}
                      </div>
                    </td>

                    {/* Nominal Quoted Bid */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {item.headline_price !== null ? (
                        <span className="text-zinc-300">{formatEur(item.headline_price)}</span>
                      ) : (
                        <span className="text-amber-400 text-[11px] font-semibold font-sans">Unpriced</span>
                      )}
                    </td>

                    {/* Technical Adders */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {item.total_tech_penalty > 0 ? (
                        <span className="text-rose-400 font-medium">+{formatEur(item.total_tech_penalty)}</span>
                      ) : (
                        <span className="text-zinc-600">€0</span>
                      )}
                    </td>

                    {/* Commercial Adders */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {item.total_commercial_adder > 0 ? (
                        <span className="text-amber-400 font-medium">+{formatEur(item.total_commercial_adder)}</span>
                      ) : (
                        <span className="text-zinc-600">€0</span>
                      )}
                    </td>

                    {/* Net Omissions (Total Adders) */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap text-xs font-semibold">
                      {item.total_adders > 0 ? (
                        <span className="text-rose-400">+{formatEur(item.total_adders)}</span>
                      ) : (
                        <span className="text-emerald-400">€0</span>
                      )}
                    </td>

                    {/* True Job Cost */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap bg-zinc-900/40 text-xs font-bold">
                      {isPriced ? (
                        <span className={isBestValue ? 'text-emerald-400 font-black' : 'text-white'}>
                          {formatEur(item.true_evaluated_price)}
                        </span>
                      ) : (
                        <span className="text-amber-400 text-[11px] font-semibold font-sans">Incomplete Bid</span>
                      )}
                    </td>

                    {/* Delta vs Lowest Quote */}
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {deltaVsLowestQuote !== null ? (
                        deltaVsLowestQuote > 0 ? (
                          <span className="text-rose-400">+{formatEur(deltaVsLowestQuote)}</span>
                        ) : (
                          <span className="text-emerald-400">Baseline</span>
                        )
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5 font-sans">
                        <button
                          onClick={() => onSelectVendor(item.vendor_id)}
                          className="px-2 py-1 rounded bg-[#111113] hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[11px] transition-colors flex items-center gap-1"
                          aria-label={`Inspect ${item.name} breakdown`}
                        >
                          <Eye className="w-3 h-3 text-zinc-400" />
                          <span>Inspect</span>
                        </button>
                        <button
                          onClick={() => onOpenOverride(item.vendor_id)}
                          title="Override adder amount"
                          className="p-1 rounded bg-[#111113] hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                          aria-label={`Override adder for ${item.name}`}
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Dynamic Procurement Audit Verdict Footer */}
      <div className="px-4 py-3 bg-[#111113] border-t border-zinc-800 text-xs text-zinc-300 flex items-start gap-2.5 font-sans">
        <AlertCircle className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-white tracking-tight uppercase text-[11px]">
            Procurement Recommendation Analysis
          </div>
          {hasReversal ? (
            <p className="text-xs text-zinc-300 leading-relaxed">
              Nominal low bidder <strong className="text-white">{lowestHeadlineVendor.name}</strong> ({formatEur(lowestHeadlineVendor.headline_price)}) carries{' '}
              <strong className="text-rose-400">+{formatEur(lowestHeadlineVendor.total_adders)} in unquoted scope omissions</strong> and delivery boundaries, elevating its true reconciled cost to{' '}
              <strong className="text-white font-mono">{formatEur(lowestHeadlineVendor.true_evaluated_price)}</strong>.
              Recommended award is <strong className="text-emerald-400">{bestValueVendor.name}</strong> at{' '}
              <strong className="text-white font-mono">{formatEur(bestValueVendor.true_evaluated_price)}</strong>, delivering verified specification compliance and the lowest true total cost of ownership.
            </p>
          ) : bestValueVendor ? (
            <p className="text-xs text-zinc-300 leading-relaxed">
              <strong className="text-emerald-400">{bestValueVendor.name}</strong> leads at{' '}
              <strong className="text-white font-mono">{formatEur(bestValueVendor.true_evaluated_price)}</strong> with {bestValueVendor.total_adders === 0 ? 'zero unpriced gaps' : `+${formatEur(bestValueVendor.total_adders)} in leveled adders`}.
              {unpriced.length > 0 && (
                <span> Note: {unpriced.map((u) => u.name).join(', ')} submitted incomplete commercial terms and require formal clarification.</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-zinc-400">Awaiting commercial tender proposals for evaluation.</p>
          )}
        </div>
      </div>
    </div>
  );
}
