'use client';

import React from 'react';
import { Parameter, Vendor, VendorFinancials } from '../lib/types';
import { formatEur, formatAdderEur } from '../lib/domain/money';
import { Truck, ShieldAlert, Wrench, AlertTriangle, AlertCircle } from 'lucide-react';

interface CommercialRiskTableProps {
  parameters?: Parameter[];
  vendors?: Vendor[];
  financials?: VendorFinancials[];
}

export function CommercialRiskTable({
  parameters = [],
  vendors = [],
  financials = [],
}: CommercialRiskTableProps) {
  const safeParameters = Array.isArray(parameters) ? parameters : [];
  const safeVendors = Array.isArray(vendors) ? vendors : [];
  const safeFinancials = Array.isArray(financials) ? financials : [];

  // Resilient parameter matching
  const paramFat = safeParameters.find(
    (p) => p && (p.id === 'PARAM-05' || p.name?.toLowerCase().includes('fat') || p.name?.toLowerCase().includes('acceptance'))
  );
  const paramComm = safeParameters.find(
    (p) => p && (p.id === 'PARAM-06' || p.name?.toLowerCase().includes('incoterm') || p.name?.toLowerCase().includes('delivery') || p.name?.toLowerCase().includes('commercial'))
  );

  return (
    <div className="border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] rounded-xl overflow-hidden text-xs shadow-2xs font-sans">
      <div className="px-5 py-3.5 border-b border-[#D9D4CC] dark:border-[#7A7266] flex items-center justify-between bg-[#FAF8F5] dark:bg-[#141210]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-zinc-900 dark:text-white tracking-wider uppercase">
              Commercial terms
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#D9D4CC] dark:border-[#7A7266] bg-white dark:bg-zinc-800 text-amber-800 dark:text-amber-300 font-mono font-medium">
              Delivery, warranty and testing
            </span>
          </div>
          <p className="text-[11px] text-[#767067] dark:text-[#A39A8D] mt-0.5">
            Delivery terms, warranty period and witnessed factory tests, compared with your spec.
          </p>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-white dark:bg-[#1C1916]">
        {safeVendors.length === 0 ? (
          <div className="col-span-full py-12 text-center text-zinc-500 dark:text-zinc-400 font-sans">
            No bids to compare yet.
          </div>
        ) : (
          safeVendors.map((vendor) => {
            const fin = safeFinancials.find((f) => f && f.vendor_id === vendor.id);
            const fatExt = paramFat?.vendors?.[vendor.id];
            const commExt = paramComm?.vendors?.[vendor.id];

            const commercialAdder = typeof fin?.total_commercial_adder === 'number' ? fin.total_commercial_adder : 0;
            const isUnpricedItems = fin?.price_status === 'UNPRICED_ITEMS';

            // Find check values
            const commChecks = Array.isArray(commExt?.checks) ? commExt.checks : [];
            const fatChecks = Array.isArray(fatExt?.checks) ? fatExt.checks : [];

            const incotermCheck = commChecks.find((c) => c?.field === 'incoterm');
            const warrantyCheck = commChecks.find((c) => c?.field === 'warranty_months');
            const fatCheck = fatChecks.find((c) => c?.field === 'witnessed_fat_days_included');

            return (
              <div
                key={vendor.id}
                className={`p-4 rounded-xl border flex flex-col justify-between transition-all shadow-2xs ${
                  commercialAdder > 0
                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20'
                    : 'border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916]'
                }`}
              >
                <div>
                  {/* Vendor Header */}
                  <div className="flex items-start justify-between pb-3 border-b border-[#D9D4CC] dark:border-[#7A7266]">
                    <div>
                      <div className="text-zinc-900 dark:text-zinc-100 font-bold text-xs">{vendor.name || vendor.id}</div>
                      <div className="text-[#767067] dark:text-[#A39A8D] text-[10px] font-mono mt-0.5">{vendor.country || 'n/a'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-[#767067] dark:text-[#A39A8D] uppercase font-semibold">Commercial cost adjustments</div>
                      <div className={`text-xs font-bold font-mono tabular-nums ${commercialAdder > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {commercialAdder > 0 ? `+${formatEur(commercialAdder)}` : '€0'}
                      </div>
                    </div>
                  </div>

                  {/* Risk Factors */}
                  <div className="space-y-3 mt-3 text-xs">
                    {/* Delivery & Incoterm */}
                    <div className="p-3 rounded-md bg-[#FAF8F5] dark:bg-[#141210] border border-[#D9D4CC] dark:border-[#7A7266] shadow-2xs">
                      <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <Truck className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Delivery terms (Incoterms 2020)</span>
                      </div>
                      <div className="text-zinc-800 dark:text-zinc-200">
                        {incotermCheck ? (
                          <div className="flex items-center justify-between font-mono text-[11px]">
                            <span>Offered: <strong className="text-zinc-900 dark:text-white">{incotermCheck.offered}</strong></span>
                            {incotermCheck.passed ? (
                              <span className="text-zinc-700 dark:text-zinc-300 text-[10px] font-semibold font-sans">Meets spec</span>
                            ) : (
                              <span className="text-[#9E2B1F] dark:text-[#E07A6A] text-[10px] font-semibold font-sans">
                                Required: {incotermCheck.required}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500">{commExt?.extracted_text || 'See the bid'}</span>
                        )}
                      </div>
                    </div>

                    {/* Warranty & Defect Liability */}
                    <div className="p-3 rounded-md bg-[#FAF8F5] dark:bg-[#141210] border border-[#D9D4CC] dark:border-[#7A7266] shadow-2xs">
                      <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                        <span>Warranty period</span>
                      </div>
                      <div className="text-zinc-800 dark:text-zinc-200">
                        {warrantyCheck ? (
                          <div>
                            <div className="flex items-center justify-between font-mono text-[11px]">
                              <span>Offered: <strong className="text-zinc-900 dark:text-white">{warrantyCheck.offered}</strong></span>
                              {warrantyCheck.passed ? (
                                <span className="text-zinc-700 dark:text-zinc-300 text-[10px] font-semibold font-sans">Meets spec</span>
                              ) : (
                                <span className="text-amber-800 dark:text-amber-300 text-[10px] font-semibold font-sans">
                                  Required: {warrantyCheck.required}
                                </span>
                              )}
                            </div>
                            {warrantyCheck.offered_basis && (
                              <div className="text-[10px] text-[#767067] dark:text-[#A39A8D] mt-1 font-sans">
                                Starts at: {warrantyCheck.offered_basis}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500">Standard warranty</span>
                        )}
                      </div>
                    </div>

                    {/* Factory Testing (I-FAT) */}
                    <div className="p-3 rounded-md bg-[#FAF8F5] dark:bg-[#141210] border border-[#D9D4CC] dark:border-[#7A7266] shadow-2xs">
                      <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <Wrench className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Witnessed factory test (FAT)</span>
                      </div>
                      <div className="text-zinc-800 dark:text-zinc-200">
                        {fatCheck ? (
                          <div className="flex items-center justify-between font-mono text-[11px]">
                            <span>Offered: <strong className="text-zinc-900 dark:text-white">{fatCheck.offered}</strong></span>
                            {fatCheck.passed ? (
                              <span className="text-zinc-700 dark:text-zinc-300 text-[10px] font-semibold font-sans">Meets spec</span>
                            ) : (
                              <span className="text-[#9E2B1F] dark:text-[#E07A6A] text-[10px] font-semibold font-sans">
                                Short by: required {fatCheck.required}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500">Included in the bid</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footprint */}
                <div className="pt-3 mt-3 border-t border-[#D9D4CC] dark:border-[#7A7266] flex items-center justify-between text-[11px]">
                  <span className="text-[#767067] dark:text-[#A39A8D]">Evaluated total:</span>
                  <span className="font-bold font-mono text-zinc-900 dark:text-white tabular-nums">
                    {formatEur(fin?.true_evaluated_price, { isLowerBound: isUnpricedItems })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
