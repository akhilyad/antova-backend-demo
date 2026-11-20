'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { getTenderBrief } from '../../../lib/api';
import { Brief } from '../../../lib/types';
import { formatEur, formatAdderEur } from '../../../lib/domain/money';

interface PageProps {
  params: Promise<{ tenderId: string }>;
}

/** Printable award sheet: one ruled page, black on white, signature lines at the foot. */
export default function PrintableAuditSheet({ params }: PageProps) {
  const { tenderId } = use(params);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTenderBrief(tenderId)
      .then(setBrief)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tenderId]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-white text-xs text-zinc-500">Preparing the sign-off sheet</div>;
  }
  if (!brief) {
    return <div className="min-h-screen bg-white p-12 text-center text-xs text-[#9E2B1F]">Couldn't load this tender.</div>;
  }

  const sorted = [...brief.financials].sort((a, b) => {
    if (a.true_evaluated_price === null) return 1;
    if (b.true_evaluated_price === null) return -1;
    return a.true_evaluated_price - b.true_evaluated_price;
  });
  const best = sorted[0];
  const lowestQuote = brief.financials
    .filter((f) => f.headline_price !== null)
    .sort((a, b) => (a.headline_price || 0) - (b.headline_price || 0))[0];
  const reversal = lowestQuote && best && lowestQuote.vendor_id !== best.vendor_id ? lowestQuote : null;
  const unpriced = brief.financials.filter((f) => f.headline_price === null || f.price_status === 'UNPRICED_ITEMS');
  const lb = (f: (typeof sorted)[number]) => ({ isLowerBound: f.price_status === 'UNPRICED_ITEMS' });

  const meta: [string, React.ReactNode][] = [
    ['Tender', <span className="font-mono">{brief.tender.id}</span>],
    ['Client', brief.tender.client],
    ['Package', <span className="font-mono">{brief.tender.equipment_class}</span>],
    ['Spec', <span className="font-mono">{brief.tender.mr_doc}</span>],
    ['Rate table', <span className="font-mono">{brief.tender.rate_table_version}</span>],
    ['Status', brief.status === 'VERIFIED' ? 'Signed off' : 'Draft'],
  ];

  return (
    <div className="min-h-screen bg-white text-[#1A1714]">
      <div className="no-print flex items-center justify-between border-b border-zinc-200 px-8 py-3 text-xs">
        <Link href={`/audit/${tenderId}`} className="text-zinc-600 hover:text-black">
          ← Back to the tender
        </Link>
        <button onClick={() => window.print()} className="rounded bg-black px-3.5 py-1.5 font-medium text-white hover:opacity-90">
          Print
        </button>
      </div>

      <main className="mx-auto max-w-[900px] px-8 py-10 text-[13px]">
        <header className="flex items-end justify-between gap-8 border-b-2 border-black pb-4">
          <div>
            <p className="text-[11px] text-zinc-500">Bid evaluation and award recommendation</p>
            <h1 className="mt-1 text-xl font-semibold leading-7 tracking-tight">{brief.tender.title}</h1>
          </div>
          <p className="shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
            Generated {new Date().toISOString().slice(0, 10)}
          </p>
        </header>

        <dl className="grid grid-cols-3 gap-x-8 gap-y-2 border-b border-zinc-300 py-4 text-xs">
          {meta.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11px] text-zinc-500">{k}</dt>
              <dd className="truncate">{v}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-8">
          <h2 className="text-[13px] font-medium">Ranking by true job cost</h2>
          <table className="mt-2 w-full border-collapse">
            <thead>
              <tr className="border-b border-black text-[11px] text-zinc-500">
                <th className="w-8 py-1.5 text-left font-normal">#</th>
                <th className="py-1.5 text-left font-normal">Bidder</th>
                <th className="py-1.5 text-right font-normal">Quoted price</th>
                <th className="py-1.5 text-right font-normal">Technical</th>
                <th className="py-1.5 text-right font-normal">Commercial</th>
                <th className="py-1.5 text-right font-medium text-black">True job cost</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {sorted.map((f, i) => (
                <tr key={f.vendor_id} className="border-b border-zinc-300">
                  <td className="py-2 text-zinc-500">{i + 1}</td>
                  <td className={`py-2 ${i === 0 ? 'font-semibold' : ''}`}>
                    {f.name} <span className="font-normal text-zinc-500">{f.country}</span>
                    {i === 0 && <span className="ml-2 text-[11px] font-medium">Award</span>}
                  </td>
                  <td className="py-2 text-right">{formatEur(f.headline_price)}</td>
                  <td className="py-2 text-right">{formatAdderEur(f.total_tech_penalty)}</td>
                  <td className="py-2 text-right">{formatAdderEur(f.total_commercial_adder)}</td>
                  <td className="py-2 text-right font-semibold">{formatEur(f.true_evaluated_price, lb(f))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-8 space-y-2 text-[13px] leading-relaxed">
          <h2 className="font-medium">Summary</h2>
          {reversal && best ? (
            <p>
              {reversal.name} quoted lowest at {formatEur(reversal.headline_price)}. Checked against {brief.tender.mr_doc}, its
              missing scope and commercial gaps add {formatEur(reversal.total_adders)}, for a true job cost of{' '}
              {formatEur(reversal.true_evaluated_price, lb(reversal))}. {best.name} has the lowest true job cost at{' '}
              {formatEur(best.true_evaluated_price, lb(best))} and is the recommended award.
            </p>
          ) : best ? (
            <p>
              {best.name} has the lowest true job cost at {formatEur(best.true_evaluated_price, lb(best))}, with{' '}
              {formatEur(best.total_adders)} of adders priced from rate table {brief.tender.rate_table_version}.
            </p>
          ) : null}
          {unpriced.length > 0 && (
            <p className="text-xs text-zinc-600">
              Not fully priced: {unpriced.map((u) => u.name).join(', ')}. Ask for the missing prices before you award; a "+"
              marks a lower bound.
            </p>
          )}
        </section>

        <section className="mt-16 grid grid-cols-3 gap-8 text-xs">
          {['Procurement lead', 'Electrical lead', 'Commercial lead'].map((role) => (
            <div key={role} className="border-t border-black pt-2">
              <p className="font-medium">{role}</p>
              <p className="mt-10 text-[11px] text-zinc-400">Signature and date</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
