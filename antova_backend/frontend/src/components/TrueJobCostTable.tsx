'use client';

import React from 'react';
import { VendorFinancials, Vendor } from '../lib/types';
import { formatEur, formatAdderEur } from '../lib/domain/money';
import { AlertCircle, Eye, Edit3, Award, Info } from 'lucide-react';

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
    <div className="border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] rounded-xl overflow-hidden text-xs shadow-2xs font-sans">
      {/* Table Header Section */}
      <div className="px-5 py-3.5 border-b border-[#D9D4CC] dark:border-[#7A7266] flex flex-wrap items-center justify-between gap-3 bg-[#FAF8F5] dark:bg-[#141210]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-zinc-900 dark:text-white tracking-wider uppercase">
              Evaluated totals by bidder
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#D9D4CC] dark:border-[#7A7266] bg-white dark:bg-zinc-800 text-[#767067] dark:text-[#A39A8D] font-mono font-medium">
              Calculated from the rate table
            </span>
          </div>
          <p className="text-[11px] text-[#767067] dark:text-[#A39A8D] mt-0.5">
            Each base bid plus the cost to close its missing scope, delivery terms and warranty shortfalls.
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-[#767067] dark:text-[#A39A8D] font-sans">
          <span className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
            <span className="w-2 h-2 rounded-full bg-zinc-800 dark:bg-zinc-200" />
            <span>Recommended award</span>
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="flex items-center gap-1.5 font-medium text-[#9E2B1F] dark:text-[#E07A6A]">
            <span className="w-2 h-2 rounded-full bg-[#9E2B1F] dark:bg-[#E07A6A]" />
            <span>Cost adjustment</span>
          </span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" aria-label="Evaluated totals by bidder">
          <thead>
            <tr className="border-b border-[#D9D4CC] dark:border-[#7A7266] bg-[#FAF8F5] dark:bg-[#141210] text-[#767067] dark:text-[#A39A8D] text-[10px] tracking-wider uppercase font-semibold">
              <th scope="col" className="py-3 px-3.5 w-14">Rank</th>
              <th scope="col" className="py-3 px-3.5 min-w-[210px]">Bidder</th>
              <th scope="col" className="py-3 px-3.5 text-right">Quoted price</th>
              <th scope="col" className="py-3 px-3.5 text-right">Technical gaps</th>
              <th scope="col" className="py-3 px-3.5 text-right">Commercial gaps</th>
              <th scope="col" className="py-3 px-3.5 text-right">Total cost adjustments</th>
              <th scope="col" className="py-3 px-3.5 font-bold text-right bg-zinc-100/60 dark:bg-zinc-900/60 text-zinc-900 dark:text-white">
                Evaluated total
              </th>
              <th scope="col" className="py-3 px-3.5 text-right">Difference vs lowest bid</th>
              <th scope="col" className="py-3 px-3.5 text-center w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D9D4CC] dark:divide-[#7A7266]/40 bg-white dark:bg-[#1C1916]">
            {sortedAll.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-zinc-500 dark:text-zinc-400 font-sans">
                  No bids have been evaluated for this tender yet.
                </td>
              </tr>
            ) : (
              sortedAll.map((item, index) => {
                const vendor = safeVendors.find((v) => v && v.id === item.vendor_id);
                const isSelected = selectedVendorId === item.vendor_id;
                const isPriced = item.headline_price !== null && item.true_evaluated_price !== null;
                const isLowestNominal = isPriced && item.headline_price === lowestHeadline;
                const isBestValue = isPriced && index === 0;
                const isUnpricedItems = item.price_status === 'UNPRICED_ITEMS';

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
                    className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                      isSelected
                        ? 'bg-zinc-100/80 dark:bg-zinc-800/60 border-l-4 border-l-zinc-900 dark:border-l-zinc-100 font-medium'
                        : 'hover:bg-[#FAF8F5] dark:hover:bg-zinc-900/40 border-l-4 border-l-transparent'
                    }`}
                  >
                    {/* Rank Badge */}
                    <td className="py-3.5 px-3.5 font-mono text-xs">
                      {isPriced ? (
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${
                            isBestValue
                              ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border border-zinc-900 dark:border-zinc-200'
                              : isLowestNominal
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
                          }`}
                        >
                          L{index + 1}
                        </span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-600">Not ranked</span>
                      )}
                    </td>

                    {/* Vendor Name & Origin */}
                    <td className="py-3.5 px-3.5 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                          {item.name || vendor?.name || item.vendor_id}
                        </span>
                        {isBestValue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border border-zinc-900">
                            <Award className="w-3 h-3" />
                            Recommended award
                          </span>
                        )}
                        {isLowestNominal && !isBestValue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                            Lowest base bid
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#767067] dark:text-[#A39A8D] font-mono mt-0.5">
                        {item.country || vendor?.country || 'N/A'} · {vendor?.doc_name || 'Bid document'}
                      </div>
                    </td>

                    {/* Nominal Quoted Bid */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {item.headline_price !== null ? (
                        <span className="text-zinc-800 dark:text-zinc-200">{formatEur(item.headline_price)}</span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400 text-[11px] font-semibold font-sans">No price</span>
                      )}
                    </td>

                    {/* Technical Adders */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {item.total_tech_penalty > 0 ? (
                        <span className="text-[#9E2B1F] dark:text-[#E07A6A] font-semibold">+{formatEur(item.total_tech_penalty)}</span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">€0</span>
                      )}
                    </td>

                    {/* Commercial Adders */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {item.total_commercial_adder > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400 font-semibold">+{formatEur(item.total_commercial_adder)}</span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">€0</span>
                      )}
                    </td>

                    {/* Net Omissions (Total Adders) */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap text-xs font-bold">
                      {item.total_adders > 0 ? (
                        <span className="text-[#9E2B1F] dark:text-[#E07A6A]">+{formatEur(item.total_adders)}</span>
                      ) : (
                        <span className="text-zinc-700 dark:text-zinc-300">€0</span>
                      )}
                    </td>

                    {/* True Job Cost */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap bg-zinc-100/50 dark:bg-zinc-900/40 text-xs font-bold">
                      {isPriced ? (
                        <div className="space-y-0.5">
                          <span
                            className={
                              isBestValue
                                ? 'text-zinc-950 dark:text-white font-black underline decoration-zinc-400'
                                : 'text-zinc-900 dark:text-white'
                            }
                          >
                            {formatEur(item.true_evaluated_price, { isLowerBound: isUnpricedItems })}
                          </span>
                          {isUnpricedItems && (
                            <div className="text-[10px] text-amber-700 dark:text-amber-400 font-sans font-medium">
                              at least · 1 unpriced
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400 text-[11px] font-semibold font-sans">Bid price missing</span>
                      )}
                    </td>

                    {/* Delta vs Lowest Quote */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {deltaVsLowestQuote !== null ? (
                        deltaVsLowestQuote > 0 ? (
                          <span className="text-[#9E2B1F] dark:text-[#E07A6A] font-semibold">+{formatEur(deltaVsLowestQuote)}</span>
                        ) : (
                          <span className="text-zinc-700 dark:text-zinc-300 font-semibold">Lowest bid</span>
                        )
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-600">n/a</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5 font-sans">
                        <button
                          onClick={() => onSelectVendor(item.vendor_id)}
                          className="px-2.5 py-1 rounded bg-white dark:bg-[#1C1916] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-[11px] font-medium transition-colors flex items-center gap-1 shadow-2xs"
                          aria-label={`Show line items for ${item.name}`}
                        >
                          <Eye className="w-3 h-3 text-zinc-500" />
                          <span>Line items</span>
                        </button>
                        <button
                          onClick={() => onOpenOverride(item.vendor_id)}
                          title="Edit cost adjustments"
                          className="p-1 rounded bg-white dark:bg-[#1C1916] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors shadow-2xs"
                          aria-label={`Edit cost adjustments for ${item.name}`}
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

      {/* Rank Reversal & Leveling Summary Callout */}
      {hasReversal && (
        <div className="p-4 border-t border-[#D9D4CC] dark:border-[#7A7266] bg-[#FAF8F5] dark:bg-[#141210] flex items-start gap-3">
          <Info className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px]">
              Award recommendation
            </span>
            <p className="text-[#767067] dark:text-[#A39A8D] leading-relaxed text-[11px]">
              {lowestHeadlineVendor.price_status === 'UNPRICED_ITEMS' ? (
                <>
                  <strong className="text-zinc-900 dark:text-zinc-100">{lowestHeadlineVendor.name}</strong> has the lowest base bid at {formatEur(lowestHeadlineVendor.headline_price)}. Missing scope and commercial gaps add {formatEur(lowestHeadlineVendor.total_adders)} ({formatEur(lowestHeadlineVendor.total_tech_penalty)} technical, {formatEur(lowestHeadlineVendor.total_commercial_adder)} commercial), for an evaluated total of at least {formatEur(lowestHeadlineVendor.true_evaluated_price, { isLowerBound: true })}. 1 gap still has no price, so the real total is higher. <strong className="text-zinc-900 dark:text-zinc-100">{bestValueVendor.name}</strong> has the lowest evaluated total at {formatEur(bestValueVendor.true_evaluated_price)}, which is at least {bestValueVendor.true_evaluated_price !== null && lowestHeadlineVendor.true_evaluated_price !== null ? formatEur(Math.abs(lowestHeadlineVendor.true_evaluated_price - bestValueVendor.true_evaluated_price)) : '€27,650'} less. Recommended award: <strong className="text-zinc-900 dark:text-zinc-100">{bestValueVendor.name}</strong>.
                </>
              ) : (
                <>
                  <strong className="text-zinc-900 dark:text-zinc-100">{lowestHeadlineVendor.name}</strong> has the lowest base bid at {formatEur(lowestHeadlineVendor.headline_price)}. Missing scope and commercial gaps add {formatEur(lowestHeadlineVendor.total_adders)} ({formatEur(lowestHeadlineVendor.total_tech_penalty)} technical, {formatEur(lowestHeadlineVendor.total_commercial_adder)} commercial), for an evaluated total of {formatEur(lowestHeadlineVendor.true_evaluated_price)}. <strong className="text-zinc-900 dark:text-zinc-100">{bestValueVendor.name}</strong> has the lowest evaluated total at {formatEur(bestValueVendor.true_evaluated_price)}, which is {bestValueVendor.true_evaluated_price !== null && lowestHeadlineVendor.true_evaluated_price !== null ? formatEur(Math.abs(lowestHeadlineVendor.true_evaluated_price - bestValueVendor.true_evaluated_price)) : ''} less. Recommended award: <strong className="text-zinc-900 dark:text-zinc-100">{bestValueVendor.name}</strong>.
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
