'use client';

import React from 'react';
import { VendorFinancials, Vendor } from '../lib/types';
import { formatEur, formatDelta } from '../lib/formatting';
import { AlertCircle, Eye, Edit3, CheckCircle2, TrendingDown, Award } from 'lucide-react';

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
    <div className="border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#09090B] rounded-xl overflow-hidden text-xs shadow-2xs font-sans">
      {/* Table Header Section */}
      <div className="px-5 py-3.5 border-b border-[#DCE2E8] dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-[#F8FAFC] dark:bg-[#111113]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-[#182433] dark:text-white tracking-wider uppercase">
              True Job Cost & Scope Omission Ledger
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#DCE2E8] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#667487] dark:text-zinc-300 font-mono font-medium">
              Deterministic Reconciliation
            </span>
          </div>
          <p className="text-[11px] text-[#667487] dark:text-zinc-400 mt-0.5">
            Nominal supplier quotes leveled against unquoted equipment omissions, transport boundaries, and warranty shortfalls.
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-[#667487] dark:text-zinc-400 font-sans">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-[#278765]" />
            <span className="text-[#182433] dark:text-zinc-300">L1 Recommended</span>
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-[#B94A48]" />
            <span className="text-[#182433] dark:text-zinc-300">Scope Gap Add-Back</span>
          </span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" aria-label="Bid Audit Ledger">
          <thead>
            <tr className="border-b border-[#DCE2E8] dark:border-zinc-800 bg-[#F4F6F8] dark:bg-black text-[#667487] dark:text-zinc-400 text-[10px] tracking-wider uppercase font-semibold">
              <th scope="col" className="py-3 px-3.5 w-14">Rank</th>
              <th scope="col" className="py-3 px-3.5 min-w-[210px]">Vendor Proposal</th>
              <th scope="col" className="py-3 px-3.5 text-right">Quoted Bid</th>
              <th scope="col" className="py-3 px-3.5 text-right">Technical Gaps</th>
              <th scope="col" className="py-3 px-3.5 text-right">Commercial Gaps</th>
              <th scope="col" className="py-3 px-3.5 text-right">Net Omissions</th>
              <th scope="col" className="py-3 px-3.5 font-bold text-right bg-zinc-200/50 dark:bg-zinc-900/60 text-[#182433] dark:text-white">
                True Job Cost
              </th>
              <th scope="col" className="py-3 px-3.5 text-right">Delta vs Quote</th>
              <th scope="col" className="py-3 px-3.5 text-center w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DCE2E8] dark:divide-zinc-800/80 bg-white dark:bg-[#09090B]">
            {sortedAll.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-zinc-500 dark:text-zinc-400 font-sans">
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
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectVendor(item.vendor_id);
                      }
                    }}
                    className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172536] dark:focus-visible:ring-zinc-400 ${
                      isSelected
                        ? 'bg-zinc-100/80 dark:bg-zinc-800/60 border-l-4 border-l-[#172536] dark:border-l-cyan-400 font-medium'
                        : 'hover:bg-[#F8FAFC] dark:hover:bg-zinc-900/40 border-l-4 border-l-transparent'
                    }`}
                  >
                    {/* Rank Badge */}
                    <td className="py-3.5 px-3.5 font-mono text-xs">
                      {isPriced ? (
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${
                            isBestValue
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                              : isLowestNominal
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
                          }`}
                        >
                          L{index + 1}
                        </span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-600">—</span>
                      )}
                    </td>

                    {/* Vendor Name & Origin */}
                    <td className="py-3.5 px-3.5 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#182433] dark:text-zinc-100 text-xs">
                          {item.name || vendor?.name || item.vendor_id}
                        </span>
                        {isBestValue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                            <Award className="w-3 h-3" />
                            Recommended
                          </span>
                        )}
                        {isLowestNominal && !isBestValue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                            Apparent Low Bidder
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#667487] dark:text-zinc-400 font-mono mt-0.5">
                        {item.country || vendor?.country || 'N/A'} · {vendor?.doc_name || 'Offer PDF'}
                      </div>
                    </td>

                    {/* Nominal Quoted Bid */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {item.headline_price !== null ? (
                        <span className="text-zinc-800 dark:text-zinc-200">{formatEur(item.headline_price)}</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 text-[11px] font-semibold font-sans">Unpriced</span>
                      )}
                    </td>

                    {/* Technical Adders */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {item.total_tech_penalty > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">+{formatEur(item.total_tech_penalty)}</span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">€0</span>
                      )}
                    </td>

                    {/* Commercial Adders */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {item.total_commercial_adder > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">+{formatEur(item.total_commercial_adder)}</span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">€0</span>
                      )}
                    </td>

                    {/* Net Omissions (Total Adders) */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap text-xs font-bold">
                      {item.total_adders > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400">+{formatEur(item.total_adders)}</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">€0</span>
                      )}
                    </td>

                    {/* True Job Cost */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap bg-zinc-100/50 dark:bg-zinc-900/40 text-xs font-bold">
                      {isPriced ? (
                        <span className={isBestValue ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-[#182433] dark:text-white'}>
                          {formatEur(item.true_evaluated_price)}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 text-[11px] font-semibold font-sans">Incomplete Bid</span>
                      )}
                    </td>

                    {/* Delta vs Lowest Quote */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {deltaVsLowestQuote !== null ? (
                        deltaVsLowestQuote > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">+{formatEur(deltaVsLowestQuote)}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Baseline</span>
                        )
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-600">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5 font-sans">
                        <button
                          onClick={() => onSelectVendor(item.vendor_id)}
                          className="px-2.5 py-1 rounded bg-white dark:bg-[#111113] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-[11px] font-medium transition-colors flex items-center gap-1 shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                          aria-label={`Inspect ${item.name} breakdown`}
                        >
                          <Eye className="w-3 h-3 text-zinc-500" />
                          <span>Inspect</span>
                        </button>
                        <button
                          onClick={() => onOpenOverride(item.vendor_id)}
                          title="Override adder amount"
                          className="p-1 rounded bg-white dark:bg-[#111113] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
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
      <div className="px-5 py-4 bg-[#F8FAFC] dark:bg-[#111113] border-t border-[#DCE2E8] dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 flex items-start gap-3 font-sans">
        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-[#182433] dark:text-white tracking-wider uppercase text-[11px]">
            Procurement Recommendation Analysis
          </div>
          {hasReversal ? (
            <p className="text-xs text-[#182433] dark:text-zinc-300 leading-relaxed">
              Nominal low bidder <strong className="text-zinc-900 dark:text-white">{lowestHeadlineVendor.name}</strong> ({formatEur(lowestHeadlineVendor.headline_price)}) carries{' '}
              <strong className="text-rose-600 dark:text-rose-400 font-semibold">+{formatEur(lowestHeadlineVendor.total_adders)} in unquoted scope omissions</strong> and delivery boundaries, elevating its true reconciled cost to{' '}
              <strong className="text-zinc-900 dark:text-white font-mono">{formatEur(lowestHeadlineVendor.true_evaluated_price)}</strong>.
              Recommended award is <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">{bestValueVendor.name}</strong> at{' '}
              <strong className="text-zinc-900 dark:text-white font-mono">{formatEur(bestValueVendor.true_evaluated_price)}</strong>, delivering verified specification compliance and the lowest true total cost of ownership.
            </p>
          ) : bestValueVendor ? (
            <p className="text-xs text-[#182433] dark:text-zinc-300 leading-relaxed">
              <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">{bestValueVendor.name}</strong> leads at{' '}
              <strong className="text-zinc-900 dark:text-white font-mono">{formatEur(bestValueVendor.true_evaluated_price)}</strong> with {bestValueVendor.total_adders === 0 ? 'zero unpriced gaps' : `+${formatEur(bestValueVendor.total_adders)} in leveled adders`}.
              {unpriced.length > 0 && (
                <span> Note: {unpriced.map((u) => u.name).join(', ')} submitted incomplete commercial terms and require formal clarification.</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-zinc-500">Awaiting commercial tender proposals for evaluation.</p>
          )}
        </div>
      </div>
    </div>
  );
}
