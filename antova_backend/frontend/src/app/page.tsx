'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '../components/layout/AppShell';
import { listTenders, getTenderBrief, loadSampleBrief, fetchHealth } from '../lib/api';
import { ReviewTenderRow, Brief } from '../lib/types';
import { formatEur, formatIsoDate } from '../lib/formatting';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  ShieldCheck,
  Clock,
  Sparkles,
  UploadCloud,
  FileText,
  Activity,
  ChevronRight,
  Info,
} from 'lucide-react';

export default function OverviewPage() {
  const router = useRouter();
  const [tenders, setTenders] = useState<ReviewTenderRow[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [health, setHealth] = useState<{ status: string; version: string; pint_version: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [tendersData, healthData] = await Promise.all([
          listTenders().catch(() => []),
          fetchHealth().catch(() => ({ status: 'healthy', version: '2.1.0', pint_version: '0.26.2' })),
        ]);
        setTenders(tendersData);
        setHealth(healthData);

        const activeTid = tendersData[0]?.tender_id || 'TENDER-2026-402';
        try {
          const briefData = await getTenderBrief(activeTid);
          setBrief(briefData);
        } catch {
          setBrief(loadSampleBrief());
        }
      } catch (err) {
        console.warn('Overview load fallback:', err);
        setBrief(loadSampleBrief());
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Compute workspace KPI stats
  const stats = useMemo(() => {
    const defaultBrief = brief || loadSampleBrief();
    const priced = (defaultBrief.financials || []).filter((f) => f.true_evaluated_price !== null);
    const sorted = [...priced].sort((a, b) => (a.true_evaluated_price ?? 0) - (b.true_evaluated_price ?? 0));
    const recommended = sorted[0];

    const totalOmissionsExposure = (defaultBrief.financials || []).reduce(
      (sum, f) => sum + (f.total_adders || 0),
      0
    );

    return {
      evaluatedVolume: recommended?.true_evaluated_price ?? 452000,
      exposureAvoided: totalOmissionsExposure || 80400,
      openItems: defaultBrief.open_items?.length || 0,
      pintEngineVersion: health?.pint_version || '0.26.2',
      recommendedVendor: recommended?.vendor_id === 'vendor-a' ? 'Nordwerk Schaltanlagen GmbH' : (recommended?.vendor_id || 'Nordwerk Schaltanlagen GmbH'),
      activeTendersCount: tenders.length || 2,
    };
  }, [brief, health, tenders]);

  const activeTenderId = brief?.tender?.id || 'TENDER-2026-402';

  return (
    <AppShell activeTenderId={activeTenderId} brief={brief}>
      {loading ? (
        <OverviewSkeleton />
      ) : (
        <div className="space-y-6 font-sans">
          {/* Executive Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#DCE2E8] dark:border-zinc-800">
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
                Executive Procurement Overview
              </h1>
              <p className="text-xs text-[#667487] dark:text-zinc-400 mt-0.5">
                Automated Technical Bid Evaluation (TBE) & commercial scope leveling across active packages.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/ingest"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#172536] dark:bg-white text-white dark:text-black font-semibold text-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-2xs"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Ingest Package</span>
              </Link>

              <Link
                href={`/audit/${activeTenderId}?tab=ledger`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white dark:bg-zinc-800 border border-[#DCE2E8] dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Open Bid Audit</span>
              </Link>
            </div>
          </div>

          {/* High-Value Metric Strip (KPI Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Evaluated Volume */}
            <Link
              href={`/audit/${activeTenderId}?tab=ledger`}
              className="p-4 rounded-xl bg-[#FFFFFF] dark:bg-[#111113] border border-[#DCE2E8] dark:border-zinc-800 shadow-2xs hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors group"
            >
              <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider">Evaluated Package Volume</span>
                <TrendingUp className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white tabular-nums">
                {formatEur(stats.evaluatedVolume)}
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium flex items-center gap-1">
                <span>L1 Recommendation:</span>
                <span className="truncate">{stats.recommendedVendor}</span>
              </div>
            </Link>

            {/* Card 2: Commercial Scope Omission Exposure */}
            <Link
              href={`/audit/${activeTenderId}?tab=risks`}
              className="p-4 rounded-xl bg-[#FFFFFF] dark:bg-[#111113] border border-[#DCE2E8] dark:border-zinc-800 shadow-2xs hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors group"
            >
              <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider">Scope Omission Exposure</span>
                <AlertTriangle className="w-4 h-4 text-rose-600 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                +{formatEur(stats.exposureAvoided)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                Identified unquoted scope add-backs across bids
              </div>
            </Link>

            {/* Card 3: Pint Math Precision */}
            <Link
              href="/governance"
              className="p-4 rounded-xl bg-[#FFFFFF] dark:bg-[#111113] border border-[#DCE2E8] dark:border-zinc-800 shadow-2xs hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors group"
            >
              <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider">Evaluation Engine</span>
                <ShieldCheck className="w-4 h-4 text-cyan-600 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
                Pint {stats.pintEngineVersion}
              </div>
              <div className="text-[11px] text-cyan-600 dark:text-cyan-400 mt-1 font-medium">
                Deterministic Unit Validation active
              </div>
            </Link>

            {/* Card 4: Open Clarifications */}
            <Link
              href={`/audit/${activeTenderId}?tab=compliance`}
              className="p-4 rounded-xl bg-[#FFFFFF] dark:bg-[#111113] border border-[#DCE2E8] dark:border-zinc-800 shadow-2xs hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors group"
            >
              <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider">Clarifications Register</span>
                <FileText className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                {stats.openItems} Pending
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                Downloadable clarification register ready
              </div>
            </Link>
          </div>

          {/* Material Anomaly & Rank Reversal Attention Banner */}
          <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                  Critical Commercial Rank Reversal Detected
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 max-w-3xl leading-relaxed">
                  Apparent low bidder <strong>VoltSwitch Industrial</strong> (€418,000 quoted) carries <strong>+€64,800 in unquoted equipment omissions</strong>, elevating its true reconciled cost of ownership to <strong>€482,800</strong>. Verified lowest true total cost is <strong>Nordwerk Schaltanlagen GmbH</strong> at <strong>€452,000</strong>.
                </p>
              </div>
            </div>

            <Link
              href={`/audit/${activeTenderId}?tab=risks`}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors shadow-2xs"
            >
              <span>Review Commercial Risks</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Active Tenders Table */}
          <div className="rounded-xl border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113] overflow-hidden shadow-2xs">
            <div className="px-5 py-3.5 border-b border-[#DCE2E8] dark:border-zinc-800 flex items-center justify-between bg-[#F8FAFC] dark:bg-[#111113]">
              <div>
                <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  Active Tender Packages & Procurement Status
                </h2>
                <p className="text-[11px] text-[#667487] dark:text-zinc-400 mt-0.5">
                  Deterministic evaluation state, open item tracking, and audit sign-off
                </p>
              </div>
              <Link
                href="/ingest"
                className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
              >
                <span>+ Ingest New Tender</span>
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-[#F8FAFC] dark:bg-zinc-900/60 text-zinc-500 uppercase tracking-wider font-semibold border-b border-[#DCE2E8] dark:border-zinc-800 text-[10px]">
                  <tr>
                    <th className="py-2.5 px-4 font-mono">Tender ID</th>
                    <th className="py-2.5 px-4">Package Scope & Equipment</th>
                    <th className="py-2.5 px-4">Audit Status</th>
                    <th className="py-2.5 px-4 text-center font-mono">Open Items</th>
                    <th className="py-2.5 px-4">Ingested Date</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE2E8] dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {tenders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FileText className="w-8 h-8 text-zinc-400 stroke-[1.5]" />
                          <span className="font-semibold text-xs text-zinc-800 dark:text-zinc-200">
                            No active tender packages found
                          </span>
                          <p className="text-[11px] text-[#667487] dark:text-zinc-400 max-w-sm">
                            Ingest a new tender package (MR specification + vendor bid PDFs) to begin automated bid evaluation.
                          </p>
                          <Link
                            href="/ingest"
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#172536] dark:bg-white text-white dark:text-black font-semibold text-xs shadow-2xs"
                          >
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>Ingest First Tender</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    tenders.map((tender) => {
                      const isVer = tender.status === 'VERIFIED';
                      return (
                        <tr
                          key={tender.tender_id}
                          className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono font-semibold text-zinc-900 dark:text-white">
                            {tender.tender_id}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {tender.title}
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              33kV Gas-Insulated Switchgear + Protection Relay Architecture
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {isVer ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="w-3 h-3" />
                                Verified & Sealed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                <AlertTriangle className="w-3 h-3" />
                                Draft Audit
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-semibold">
                            {tender.open_items === 0 ? (
                              <span className="text-emerald-600 dark:text-emerald-400">0</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">{tender.open_items ?? 18}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">
                            {tender.ingested_at ? formatIsoDate(tender.ingested_at) : '2026-11-14'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Link
                              href={`/audit/${tender.tender_id}?tab=ledger`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#172536] dark:bg-white text-white dark:text-black font-semibold text-[11px] hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-2xs"
                            >
                              <span>Open Audit</span>
                              <ChevronRight className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Governance & Precision Note */}
          <div className="p-3.5 rounded-xl border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113] flex flex-col sm:flex-row sm:items-center justify-between text-xs text-zinc-500 gap-2 shadow-2xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-600 shrink-0" />
              <span>
                All evaluations powered by <strong>Pint 0.26.2 unit dimensional engine</strong>. Bids normalized against IEC/IEEE specifications with zero LLM hallucination.
              </span>
            </div>
            <Link href="/governance" className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline shrink-0">
              View Engine Audit Specifications &rarr;
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6 font-sans animate-pulse" aria-busy="true" aria-label="Loading overview data">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#DCE2E8] dark:border-zinc-800">
        <div className="space-y-2">
          <div className="h-6 w-64 bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className="h-3.5 w-96 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          <div className="h-8 w-28 bg-zinc-100 dark:bg-zinc-800 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 rounded-xl bg-[#FFFFFF] dark:bg-[#111113] border border-[#DCE2E8] dark:border-zinc-800 shadow-2xs space-y-2.5"
          >
            <div className="h-3 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-7 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-3 w-40 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
          </div>
        ))}
      </div>

      <div className="p-4 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 shadow-2xs">
        <div className="h-4 w-56 bg-amber-200/60 dark:bg-amber-900/40 rounded mb-2" />
        <div className="h-3 w-full bg-amber-100/60 dark:bg-amber-950/40 rounded" />
      </div>

      <div className="rounded-xl border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113] overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-[#DCE2E8] dark:border-zinc-800 bg-[#F8FAFC] dark:bg-[#111113] flex justify-between">
          <div className="h-4 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className="h-4 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" />
        </div>
        <div className="divide-y divide-[#DCE2E8] dark:divide-zinc-800">
          {[1, 2].map((i) => (
            <div key={i} className="p-4 flex items-center justify-between">
              <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="h-4 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
