'use client';

import React, { useEffect, useState, use } from 'react';
import { getTenderBrief } from '../../../lib/api';
import { Brief } from '../../../lib/types';
import { formatEur, formatIsoDate } from '../../../lib/formatting';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ tenderId: string }>;
}

export default function PrintableAuditSheet({ params }: PageProps) {
  const resolvedParams = use(params);
  const tenderId = resolvedParams.tenderId;

  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTenderBrief(tenderId)
      .then(setBrief)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tenderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-black p-12 flex flex-col items-center justify-center font-sans space-y-2">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
        <span className="text-xs font-mono">Generating official printable procurement sign-off sheet...</span>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="min-h-screen bg-white text-black p-12 text-center font-sans text-xs text-rose-600">
        Failed to load tender audit data from Antova backend.
      </div>
    );
  }

  // Sort by true evaluated cost
  const sorted = [...brief.financials].sort((a, b) => {
    if (a.true_evaluated_price === null) return 1;
    if (b.true_evaluated_price === null) return -1;
    return a.true_evaluated_price - b.true_evaluated_price;
  });

  return (
    <div className="min-h-screen bg-white text-black p-8 font-sans text-xs selection:bg-zinc-200">
      {/* Top screen-only toolbar */}
      <div className="no-print flex items-center justify-between pb-6 mb-6 border-b border-zinc-300">
        <Link
          href={`/audit/${tenderId}`}
          className="flex items-center gap-1.5 text-zinc-600 hover:text-black font-semibold text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Interactive Workbench</span>
        </Link>

        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-black text-white rounded font-semibold text-xs flex items-center gap-2 hover:bg-zinc-800 transition-colors shadow-sm"
        >
          <Printer className="w-4 h-4" />
          <span>Print Official Sign-Off Report</span>
        </button>
      </div>

      {/* Official Audit Document Header */}
      <div className="border-b-2 border-black pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xl font-black uppercase tracking-tight">ANTOVA PROCUREMENT AUDIT REPORT</div>
            <div className="text-xs font-bold text-zinc-800 mt-0.5 tracking-wide">
              TECHNICAL BID EVALUATION & COMMERCIAL RECONCILIATION
            </div>
          </div>
          <div className="text-right text-[11px] font-mono">
            <div>Audit Status: <strong className="uppercase">{brief.status}</strong></div>
            <div>Generated: {new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC</div>
            <div>Engine Version: FastAPI 3.0.0 / Pint 0.26.2</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-zinc-200 text-xs">
          <div>
            <div><strong>Tender ID:</strong> <span className="font-mono">{brief.tender.id}</span></div>
            <div><strong>Project:</strong> {brief.tender.title}</div>
            <div><strong>Client:</strong> {brief.tender.client}</div>
          </div>
          <div>
            <div><strong>Equipment Package:</strong> <span className="font-mono">{brief.tender.equipment_class}</span></div>
            <div><strong>Baseline Spec Document:</strong> <span className="font-mono">{brief.tender.mr_doc}</span></div>
            <div><strong>Rate Table Applied:</strong> <span className="font-mono">{brief.tender.rate_table_version}</span></div>
          </div>
        </div>
      </div>

      {/* Reconciled True Job Cost Table */}
      <div className="mb-6">
        <h2 className="text-xs font-bold uppercase tracking-wider mb-2 border-b border-black pb-1">
          1. Commercial Bid Reconciled Ranking & Omission Summary
        </h2>
        <table className="w-full border-collapse border border-zinc-300 text-left text-xs">
          <thead>
            <tr className="bg-zinc-100 border-b border-zinc-300 text-[11px]">
              <th className="p-2 border border-zinc-300">Rank</th>
              <th className="p-2 border border-zinc-300">Vendor / Origin</th>
              <th className="p-2 border border-zinc-300 text-right">Quoted Price (Bid)</th>
              <th className="p-2 border border-zinc-300 text-right">Tech Adders</th>
              <th className="p-2 border border-zinc-300 text-right">Comm. Adders</th>
              <th className="p-2 border border-zinc-300 text-right">Total Omissions</th>
              <th className="p-2 border border-zinc-300 text-right font-bold bg-zinc-200">True Evaluated Cost</th>
              <th className="p-2 border border-zinc-300 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, idx) => (
              <tr key={item.vendor_id} className="border-b border-zinc-200">
                <td className="p-2 border border-zinc-300 font-bold font-mono text-center">#{idx + 1}</td>
                <td className="p-2 border border-zinc-300 font-semibold">
                  {item.name} <span className="text-zinc-500 font-normal">({item.country})</span>
                </td>
                <td className="p-2 border border-zinc-300 text-right font-mono tabular-nums">{formatEur(item.headline_price)}</td>
                <td className="p-2 border border-zinc-300 text-right font-mono tabular-nums">+{formatEur(item.total_tech_penalty)}</td>
                <td className="p-2 border border-zinc-300 text-right font-mono tabular-nums">+{formatEur(item.total_commercial_adder)}</td>
                <td className="p-2 border border-zinc-300 text-right font-mono tabular-nums font-bold">+{formatEur(item.total_adders)}</td>
                <td className="p-2 border border-zinc-300 text-right font-mono tabular-nums font-black bg-zinc-50">
                  {formatEur(item.true_evaluated_price)}
                </td>
                <td className="p-2 border border-zinc-300 text-center uppercase font-bold text-[10px]">
                  {idx === 0 ? 'Recommended Award' : 'Subordinate'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Findings & Audit Clearance */}
      <div className="mb-6 p-4 bg-zinc-50 border border-zinc-300 text-xs leading-relaxed">
        <h3 className="font-bold text-xs uppercase tracking-wide mb-1.5 text-zinc-900">
          Executive Summary & Commercial Reconciliation
        </h3>
        {(() => {
          const pricedBidders = [...brief.financials].filter((f) => f.headline_price !== null);
          const nominalLow = pricedBidders.sort(
            (a, b) => (a.headline_price || 0) - (b.headline_price || 0)
          )[0];
          const bestEvaluated = sorted[0];
          const hasReversal =
            nominalLow &&
            bestEvaluated &&
            nominalLow.vendor_id !== bestEvaluated.vendor_id;
          const unpriced = brief.financials.filter((f) => f.headline_price === null);

          return (
            <div className="space-y-2 text-zinc-800">
              {hasReversal ? (
                <p>
                  The nominal lowest bidder at quote submission was{' '}
                  <strong>
                    {nominalLow.name} ({formatEur(nominalLow.headline_price)})
                  </strong>
                  . Following systematic engineering clause audits against specification{' '}
                  <strong>{brief.tender.mr_doc}</strong>, {nominalLow.name} was assessed{' '}
                  <strong>+{formatEur(nominalLow.total_adders)} in mandatory cost add-backs</strong>{' '}
                  ({formatEur(nominalLow.total_tech_penalty)} technical scope omissions and{' '}
                  {formatEur(nominalLow.total_commercial_adder)} commercial terms adjustments). This
                  causes a commercial rank reversal, identifying{' '}
                  <strong>
                    {bestEvaluated.name} at {formatEur(bestEvaluated.true_evaluated_price)}
                  </strong>{' '}
                  as the true lowest evaluated cost package.
                </p>
              ) : bestEvaluated ? (
                <p>
                  The recommended lowest evaluated bidder is{' '}
                  <strong>
                    {bestEvaluated.name} ({formatEur(bestEvaluated.true_evaluated_price)})
                  </strong>
                  . Audited scope omissions and commercial terms adjustments total{' '}
                  <strong>+{formatEur(bestEvaluated.total_adders)}</strong>, evaluated against
                  specification {brief.tender.mr_doc} and benchmark rate table{' '}
                  {brief.tender.rate_table_version}.
                </p>
              ) : null}

              {unpriced.length > 0 && (
                <p className="text-zinc-600 border-t border-zinc-200 pt-1.5 text-[11px]">
                  <strong>Commercial Exception:</strong> {unpriced.map((u) => u.name).join(', ')}{' '}
                  submitted non-priced or incomplete commercial schedules and require formal price
                  submission before commercial ranking can be finalized.
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Signature Authorization Block */}
      <div className="pt-8 border-t-2 border-black mt-12">
        <div className="text-[11px] uppercase font-bold mb-6">Tender Evaluation Committee Sign-Off & Verification Signatures:</div>
        <div className="grid grid-cols-3 gap-8">
          <div className="border-t border-black pt-2">
            <div className="font-bold text-xs">Chief Procurement Officer</div>
            <div className="text-zinc-500 text-[11px]">EPC Consortium GmbH</div>
            <div className="mt-8 text-[11px] text-zinc-400 font-mono">Date: ________________________</div>
          </div>
          <div className="border-t border-black pt-2">
            <div className="font-bold text-xs">Senior Electrical Lead Engineer</div>
            <div className="text-zinc-500 text-[11px]">High Voltage Substation Dept</div>
            <div className="mt-8 text-[11px] text-zinc-400 font-mono">Date: ________________________</div>
          </div>
          <div className="border-t border-black pt-2">
            <div className="font-bold text-xs">Head of Estimating & Contracts</div>
            <div className="text-zinc-500 text-[11px]">Commercial Operations</div>
            <div className="mt-8 text-[11px] text-zinc-400 font-mono">Date: ________________________</div>
          </div>
        </div>
      </div>
    </div>
  );
}
