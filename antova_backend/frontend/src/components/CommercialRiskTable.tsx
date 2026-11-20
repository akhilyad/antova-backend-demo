'use client';

import React from 'react';
import { Check, Parameter, Vendor, VendorFinancials } from '../lib/types';
import { formatEur, formatAdderEur } from '../lib/domain/money';

interface CommercialRiskTableProps {
  parameters?: Parameter[];
  vendors?: Vendor[];
  financials?: VendorFinancials[];
}

/** Delivery terms, warranty and witnessed FAT per bidder, as one term x bidder table. */
export function CommercialRiskTable({ parameters = [], vendors = [], financials = [] }: CommercialRiskTableProps) {
  const safeParameters = Array.isArray(parameters) ? parameters : [];
  const safeVendors = Array.isArray(vendors) ? vendors : [];
  const safeFinancials = Array.isArray(financials) ? financials : [];

  // Resilient parameter matching
  const paramFat = safeParameters.find(
    (p) => p && (p.id === 'PARAM-05' || p.name?.toLowerCase().includes('fat') || p.name?.toLowerCase().includes('acceptance'))
  );
  const paramComm = safeParameters.find(
    (p) =>
      p &&
      (p.id === 'PARAM-06' ||
        p.name?.toLowerCase().includes('incoterm') ||
        p.name?.toLowerCase().includes('delivery') ||
        p.name?.toLowerCase().includes('commercial'))
  );

  const checkFor = (param: Parameter | undefined, vendorId: string, field: string): Check | undefined => {
    const checks = param?.vendors?.[vendorId]?.checks;
    return Array.isArray(checks) ? checks.find((c) => c?.field === field) : undefined;
  };

  const rows: { label: string; param?: Parameter; field: string; fallback: (vendorId: string) => string }[] = [
    {
      label: 'Delivery terms (Incoterms 2020)',
      param: paramComm,
      field: 'incoterm',
      fallback: (vid) => paramComm?.vendors?.[vid]?.extracted_text || 'Not stated',
    },
    { label: 'Warranty period', param: paramComm, field: 'warranty_months', fallback: () => 'Not stated' },
    { label: 'Witnessed FAT days', param: paramFat, field: 'witnessed_fat_days_included', fallback: () => 'Not stated' },
  ];

  if (safeVendors.length === 0) {
    return <p className="py-10 text-center text-[13px] text-muted">No bids to compare.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-[13px]" aria-label="Commercial terms">
        <colgroup>
          <col className="w-[28%]" />
          {safeVendors.map((v) => (
            <col key={v.id} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-rule-strong text-[11px] text-muted">
            <th scope="col" className="py-2 pr-4 text-left font-normal">Term</th>
            {safeVendors.map((v) => (
              <th key={v.id} scope="col" className="truncate px-3 py-2 text-left font-normal" title={v.name}>
                {v.name || v.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-rule">
              <th scope="row" className="py-2.5 pr-4 text-left font-normal text-ink">{row.label}</th>
              {safeVendors.map((v) => {
                const chk = checkFor(row.param, v.id, row.field);
                return (
                  <td key={v.id} className="px-3 py-2.5 align-baseline">
                    {chk ? (
                      <>
                        <span className={chk.passed ? 'text-ink-2' : 'text-gap'}>{chk.offered || 'Not stated'}</span>
                        {!chk.passed && <span className="ml-2 text-xs text-muted">need {chk.required}</span>}
                        {chk.offered_basis && <span className="block text-[11px] text-faint">from {chk.offered_basis}</span>}
                      </>
                    ) : (
                      <span className="text-faint">{row.fallback(v.id)}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-b border-rule">
            <th scope="row" className="py-2.5 pr-4 text-left font-normal text-muted">Commercial adders</th>
            {safeVendors.map((v) => {
              const fin = safeFinancials.find((f) => f?.vendor_id === v.id);
              const adder = fin?.total_commercial_adder ?? 0;
              return (
                <td key={v.id} className={`px-3 py-2.5 tabular-nums ${adder > 0 ? 'text-gap' : 'text-faint'}`}>
                  {adder > 0 ? formatAdderEur(adder) : '€0'}
                </td>
              );
            })}
          </tr>
          <tr>
            <th scope="row" className="py-2.5 pr-4 text-left font-medium text-ink">True job cost</th>
            {safeVendors.map((v) => {
              const fin = safeFinancials.find((f) => f?.vendor_id === v.id);
              return (
                <td key={v.id} className="px-3 py-2.5 font-semibold tabular-nums text-ink">
                  {formatEur(fin?.true_evaluated_price, { isLowerBound: fin?.price_status === 'UNPRICED_ITEMS' })}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
