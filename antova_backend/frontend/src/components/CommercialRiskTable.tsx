'use client';

import React from 'react';
import { Parameter, Vendor, VendorFinancials } from '../lib/types';
import { formatEur } from '../lib/formatting';
import { Truck, ShieldAlert, Wrench, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

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
    <div className="border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#09090B] rounded-xl overflow-hidden text-xs shadow-2xs font-sans">
      <div className="px-5 py-3.5 border-b border-[#DCE2E8] dark:border-zinc-800 flex items-center justify-between bg-[#F8FAFC] dark:bg-[#111113]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-[#182433] dark:text-white tracking-wider uppercase">
              Commercial, Warranty & Logistics Risk Exposure
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#DCE2E8] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-amber-700 dark:text-amber-400 font-mono font-medium">
              Incoterms & Liability Audits
            </span>
          </div>
          <p className="text-[11px] text-[#667487] dark:text-zinc-400 mt-0.5">
            Cross-examination of Incoterms delivery liabilities, defect liability periods, and witnessed factory acceptance tests.
          </p>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-white dark:bg-[#09090B]">
        {safeVendors.length === 0 ? (
          <div className="col-span-full py-12 text-center text-zinc-500 dark:text-zinc-400 font-sans">
            No vendor proposals currently available for commercial risk cross-examination.
          </div>
        ) : (
          safeVendors.map((vendor) => {
            const fin = safeFinancials.find((f) => f && f.vendor_id === vendor.id);
            const fatExt = paramFat?.vendors?.[vendor.id];
            const commExt = paramComm?.vendors?.[vendor.id];

            const commercialAdder = typeof fin?.total_commercial_adder === 'number' ? fin.total_commercial_adder : 0;
            const isPriced = fin && fin.headline_price !== null;

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
                    ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/20'
                    : 'border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113]'
                }`}
              >
                <div>
                  {/* Vendor Header */}
                  <div className="flex items-start justify-between pb-3 border-b border-[#DCE2E8] dark:border-zinc-800">
                    <div>
                      <div className="text-[#182433] dark:text-zinc-100 font-bold text-xs">{vendor.name || vendor.id}</div>
                      <div className="text-[#667487] dark:text-zinc-400 text-[10px] font-mono mt-0.5">{vendor.country || 'N/A'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-zinc-500 uppercase font-semibold">Commercial Adders</div>
                      <div className={`text-xs font-bold font-mono tabular-nums ${commercialAdder > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                        {commercialAdder > 0 ? `+${formatEur(commercialAdder)}` : '€0'}
                      </div>
                    </div>
                  </div>

                  {/* Risk Factors */}
                  <div className="space-y-3 mt-3 text-xs">
                    {/* Delivery & Incoterm */}
                    <div className="p-3 rounded-md bg-zinc-50 dark:bg-black border border-[#DCE2E8] dark:border-zinc-800/80 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <Truck className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Delivery Incoterm (2020)</span>
                      </div>
                      <div className="text-zinc-800 dark:text-zinc-200">
                        {incotermCheck ? (
                          <div className="flex items-center justify-between font-mono text-[11px]">
                            <span>Offered: <strong className="text-[#182433] dark:text-white">{incotermCheck.offered}</strong></span>
                            {incotermCheck.passed ? (
                              <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold font-sans">Compliant</span>
                            ) : (
                              <span className="text-rose-600 dark:text-rose-400 text-[10px] font-semibold font-sans">
                                Req: {incotermCheck.required}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500">{commExt?.extracted_text || 'See proposal terms'}</span>
                        )}
                      </div>
                    </div>

                    {/* Warranty & Defect Liability */}
                    <div className="p-3 rounded-md bg-zinc-50 dark:bg-black border border-[#DCE2E8] dark:border-zinc-800/80 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                        <span>Defect Liability Period</span>
                      </div>
                      <div className="text-zinc-800 dark:text-zinc-200">
                        {warrantyCheck ? (
                          <div>
                            <div className="flex items-center justify-between font-mono text-[11px]">
                              <span>Offered: <strong className="text-[#182433] dark:text-white">{warrantyCheck.offered}</strong></span>
                              {warrantyCheck.passed ? (
                                <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold font-sans">Compliant</span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 text-[10px] font-semibold font-sans">
                                  Req: {warrantyCheck.required}
                                </span>
                              )}
                            </div>
                            {warrantyCheck.offered_basis && (
                              <div className="text-[10px] text-zinc-500 mt-1 font-sans">
                                Clock origin: from {warrantyCheck.offered_basis}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500">Standard vendor warranty</span>
                        )}
                      </div>
                    </div>

                    {/* Factory Testing (I-FAT) */}
                    <div className="p-3 rounded-md bg-zinc-50 dark:bg-black border border-[#DCE2E8] dark:border-zinc-800/80 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <Wrench className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Witnessed Factory Testing (I-FAT)</span>
                      </div>
                      <div className="text-zinc-800 dark:text-zinc-200">
                        {fatCheck ? (
                          <div className="flex items-center justify-between font-mono text-[11px]">
                            <span>Offered: <strong className="text-[#182433] dark:text-white">{fatCheck.offered}</strong></span>
                            {fatCheck.passed ? (
                              <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold font-sans">Compliant</span>
                            ) : (
                              <span className="text-rose-600 dark:text-rose-400 text-[10px] font-semibold font-sans">
                                Shortfall: Req {fatCheck.required}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500">Included per standard offer</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footprint */}
                <div className="pt-3 mt-3 border-t border-[#DCE2E8] dark:border-zinc-800 flex items-center justify-between text-[11px]">
                  <span className="text-[#667487] dark:text-zinc-400">Total True Cost:</span>
                  <span className="font-bold font-mono text-zinc-900 dark:text-white tabular-nums">
                    {formatEur(fin?.true_evaluated_price)}
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
