'use client';

import React from 'react';
import { Parameter, Vendor, VendorFinancials } from '../lib/types';
import { formatEur } from '../lib/formatting';
import { Truck, ShieldAlert, Wrench, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';

interface CommercialRiskTableProps {
  parameters: Parameter[];
  vendors: Vendor[];
  financials: VendorFinancials[];
}

export function CommercialRiskTable({
  parameters,
  vendors,
  financials,
}: CommercialRiskTableProps) {
  // Resilient parameter matching
  const paramFat = parameters.find(
    (p) => p.id === 'PARAM-05' || p.name.toLowerCase().includes('fat') || p.name.toLowerCase().includes('acceptance')
  );
  const paramComm = parameters.find(
    (p) => p.id === 'PARAM-06' || p.name.toLowerCase().includes('incoterm') || p.name.toLowerCase().includes('delivery') || p.name.toLowerCase().includes('commercial')
  );

  return (
    <div className="border border-zinc-800 bg-[#09090B] rounded overflow-hidden text-xs shadow-sm font-sans">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-[#111113]">
        <div>
          <h2 className="text-xs font-semibold text-white tracking-wide uppercase">
            Commercial, Warranty & Logistics Risk Exposure
          </h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Cross-examination of Incoterms delivery liabilities, defect liability periods, and witnessed factory acceptance tests.
          </p>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 bg-[#09090B]">
        {vendors.map((vendor) => {
          const fin = financials.find((f) => f.vendor_id === vendor.id);
          const fatExt = paramFat?.vendors[vendor.id];
          const commExt = paramComm?.vendors[vendor.id];

          const commercialAdder = fin?.total_commercial_adder || 0;
          const isPriced = fin?.headline_price !== null;

          // Find check values
          const incotermCheck = commExt?.checks?.find((c) => c.field === 'incoterm');
          const warrantyCheck = commExt?.checks?.find((c) => c.field === 'warranty_months');
          const fatCheck = fatExt?.checks?.find((c) => c.field === 'witnessed_fat_days_included');

          return (
            <div
              key={vendor.id}
              className={`p-3.5 rounded border flex flex-col justify-between transition-colors ${
                commercialAdder > 0
                  ? 'border-amber-900/40 bg-amber-950/10'
                  : !isPriced
                  ? 'border-zinc-800/70 bg-[#111113]'
                  : 'border-zinc-800 bg-[#111113]'
              }`}
            >
              <div>
                {/* Vendor Header */}
                <div className="flex items-start justify-between pb-2 border-b border-zinc-800">
                  <div>
                    <div className="text-zinc-100 font-semibold text-xs">{vendor.name}</div>
                    <div className="text-zinc-500 text-[10px] font-mono">{vendor.country}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-zinc-500 uppercase font-sans">Comm. Adders</div>
                    <div className={`text-xs font-bold font-mono tabular-nums ${commercialAdder > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                      {commercialAdder > 0 ? `+${formatEur(commercialAdder)}` : '€0'}
                    </div>
                  </div>
                </div>

                {/* Risk Factors */}
                <div className="space-y-2.5 mt-3 text-xs">
                  {/* Delivery & Incoterm */}
                  <div className="p-2.5 rounded bg-black border border-zinc-800/80">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-medium mb-1">
                      <Truck className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Delivery Term (Incoterms 2020)</span>
                    </div>
                    <div className="text-zinc-200">
                      {incotermCheck ? (
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span>Offered: <strong className="text-white">{incotermCheck.offered}</strong></span>
                          {incotermCheck.passed ? (
                            <span className="text-emerald-400 text-[10px] font-sans">Compliant</span>
                          ) : (
                            <span className="text-rose-400 text-[10px] font-semibold font-sans">Req: {incotermCheck.required}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-400">{commExt?.extracted_text || 'See proposal terms'}</span>
                      )}
                    </div>
                  </div>

                  {/* Warranty & Defect Liability */}
                  <div className="p-2.5 rounded bg-black border border-zinc-800/80">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-medium mb-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      <span>Defect Liability Period</span>
                    </div>
                    <div className="text-zinc-200">
                      {warrantyCheck ? (
                        <div>
                          <div className="flex items-center justify-between font-mono text-[11px]">
                            <span>Offered: <strong className="text-white">{warrantyCheck.offered}</strong></span>
                            {warrantyCheck.passed ? (
                              <span className="text-emerald-400 text-[10px] font-sans">Compliant</span>
                            ) : (
                              <span className="text-amber-400 text-[10px] font-semibold font-sans">Req: {warrantyCheck.required}</span>
                            )}
                          </div>
                          {warrantyCheck.offered_basis && (
                            <div className="text-[10px] text-zinc-500 mt-0.5 font-sans">
                              Basis: from {warrantyCheck.offered_basis}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-400">Standard vendor warranty</span>
                      )}
                    </div>
                  </div>

                  {/* Factory Testing (I-FAT) */}
                  <div className="p-2.5 rounded bg-black border border-zinc-800/80">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-medium mb-1">
                      <Wrench className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Witnessed I-FAT Testing</span>
                    </div>
                    <div className="text-zinc-200">
                      {fatExt?.cost_adder && fatExt.cost_adder > 0 ? (
                        <div className="text-rose-400 font-mono text-[11px] font-medium">
                          +{formatEur(fatExt.cost_adder)} omitted testing add-back
                        </div>
                      ) : (
                        <span className="text-zinc-300">
                          {fatExt?.extracted_text || 'Included in base proposal'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Footer */}
              <div className="mt-3 pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">Risk Assessment:</span>
                {!isPriced ? (
                  <span className="text-amber-400 font-medium flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" /> Incomplete Proposal
                  </span>
                ) : commercialAdder === 0 ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Fully Backed
                  </span>
                ) : (
                  <span className="text-amber-400 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Exposure Flagged
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
