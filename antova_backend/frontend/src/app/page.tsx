'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '../components/layout/AppShell';
import { KpiStrip, KpiItem } from '../components/audit/KpiStrip';
import { listTenders, getTenderBrief, loadSampleBrief, deleteTender } from '../lib/api';
import { SAMPLE_TENDER_IDS } from '../lib/replay';
import { ActionButton, ConfirmDialog } from '../components/ui/actions';
import { ReviewTenderRow, Brief } from '../lib/types';
import { formatEur, formatAdderEur } from '../lib/domain/money';
import { ChevronRight, Trash2, Upload } from 'lucide-react';

function formatDay(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '–' : d.toISOString().slice(0, 10);
}

export default function OverviewPage() {
  const router = useRouter();
  const [tenders, setTenders] = useState<ReviewTenderRow[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ReviewTenderRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await deleteTender(pendingDelete.tender_id);
      const remaining = tenders.filter((t) => t.tender_id !== pendingDelete.tender_id);
      setTenders(remaining);
      if (brief?.tender?.id === pendingDelete.tender_id) {
        const next = remaining[0]?.tender_id;
        setBrief(next ? await getTenderBrief(next).catch(() => loadSampleBrief()) : loadSampleBrief());
      }
      setPendingDelete(null);
    } catch (err: any) {
      setDeleteError(err?.message || "Couldn't delete the tender. Try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const tendersData = await listTenders().catch(() => []);
        setTenders(tendersData);
        const activeTid = tendersData[0]?.tender_id || 'TENDER-2026-402';
        try {
          setBrief(await getTenderBrief(activeTid));
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

  // Every figure comes from the loaded brief (live or the saved sample). No invented fallbacks.
  const stats = useMemo(() => {
    const b = brief || loadSampleBrief();
    const financials = b.financials || [];
    const priced = financials
      .filter((f) => f.true_evaluated_price !== null)
      .sort((a, b2) => (a.true_evaluated_price ?? 0) - (b2.true_evaluated_price ?? 0));
    const lowestQuote = [...financials]
      .filter((f) => f.headline_price != null)
      .sort((a, b2) => (a.headline_price ?? 0) - (b2.headline_price ?? 0))[0];
    return {
      best: priced[0] ?? null,
      lowestQuote: lowestQuote ?? null,
      excludedAll: financials.reduce((sum, f) => sum + (f.total_adders || 0), 0),
      bids: financials.length,
      openItems: b.open_items?.length || 0,
    };
  }, [brief]);

  const activeTenderId = brief?.tender?.id || 'TENDER-2026-402';
  const signedOff = tenders.filter((t) => t.status === 'VERIFIED').length;

  const kpis: KpiItem[] = [
    {
      label: 'Tenders',
      value: String(tenders.length),
      context: tenders.length ? `${signedOff} signed off` : 'None uploaded',
    },
    {
      label: 'Lowest true job cost',
      value: formatEur(stats.best?.true_evaluated_price),
      context: stats.best ? stats.best.name : 'Not decided',
      onClick: () => router.push(`/audit/${activeTenderId}`),
    },
    {
      label: 'Excluded scope, all bids',
      value: formatAdderEur(stats.excludedAll),
      tone: stats.excludedAll > 0 ? 'gap' : 'ink',
      context: `${stats.bids} bids in ${activeTenderId}`,
      onClick: () => router.push(`/audit/${activeTenderId}`),
    },
    {
      label: 'Open items',
      value: String(stats.openItems),
      tone: stats.openItems > 0 ? 'open' : 'ink',
      context: stats.openItems > 0 ? 'Before sign-off' : 'Ready to sign off',
      onClick: () => router.push(`/audit/${activeTenderId}?tab=signoff`),
    },
  ];

  const reversal =
    stats.lowestQuote && stats.best && stats.lowestQuote.vendor_id !== stats.best.vendor_id ? stats.lowestQuote : null;

  return (
    <AppShell activeTenderId={activeTenderId} brief={brief}>
      {loading ? (
        <OverviewSkeleton />
      ) : (
        <div className="text-ink">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold leading-7 tracking-tight">Overview</h1>
              <p className="mt-1 text-xs text-muted">Every tender, its status and its award.</p>
            </div>
            <Link
              href="/ingest"
              className="inline-flex h-8 items-center gap-1.5 rounded bg-ink px-3 text-xs font-medium text-paper hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Upload tender
            </Link>
          </header>

          <div className="mt-8">
            <KpiStrip items={kpis} />
          </div>

          {reversal && stats.best && (
            <p className="mt-4 text-xs text-muted">
              <span className="text-ink-2">{reversal.name}</span> quoted lowest at {formatEur(reversal.headline_price)}; priced
              against the spec it costs{' '}
              <span className="text-gap tabular-nums">
                {formatEur(reversal.true_evaluated_price, { isLowerBound: reversal.price_status === 'UNPRICED_ITEMS' })}
              </span>
              .{' '}
              <Link href={`/audit/${activeTenderId}`} className="text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
                See the bids
              </Link>
            </p>
          )}

          <section className="mt-10">
            <h2 className="text-[13px] font-medium">Tenders</h2>
            <table className="mt-3 w-full table-fixed border-collapse text-[13px]" aria-label="Tenders">
              <colgroup>
                <col className="w-44" />
                <col />
                <col className="w-24" />
                <col className="w-24" />
                <col className="w-28" />
                <col className="w-16" />
              </colgroup>
              <thead>
                <tr className="border-b border-rule-strong text-[11px] text-muted">
                  <th scope="col" className="py-2 pr-4 text-left font-normal">Tender</th>
                  <th scope="col" className="py-2 pr-4 text-left font-normal">Package</th>
                  <th scope="col" className="py-2 pr-4 text-left font-normal">Status</th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">Open items</th>
                  <th scope="col" className="py-2 text-right font-normal">Uploaded</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {tenders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted">
                      No tenders yet.{' '}
                      <Link href="/ingest" className="text-ink underline decoration-rule-strong underline-offset-2">
                        Upload your spec and bids
                      </Link>
                    </td>
                  </tr>
                ) : (
                  tenders.map((t) => {
                    const isVer = t.status === 'VERIFIED';
                    const go = () => router.push(`/audit/${t.tender_id}`);
                    return (
                      <tr key={t.tender_id} onClick={go} className="cursor-pointer border-b border-rule hover:bg-sheet">
                        <td className="py-3 pr-4 font-mono text-xs">
                          <Link href={`/audit/${t.tender_id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                            {t.tender_id}
                          </Link>
                        </td>
                        <td className="truncate py-3 pr-4 text-ink-2" title={t.title}>{t.title}</td>
                        <td className={`py-3 pr-4 ${isVer ? 'text-ink-2' : 'text-open'}`}>{isVer ? 'Signed off' : 'Draft'}</td>
                        <td className={`py-3 pr-4 text-right tabular-nums ${t.open_items ? 'text-open' : 'text-faint'}`}>
                          {t.open_items ?? '–'}
                        </td>
                        <td className="py-3 text-right tabular-nums text-muted">{formatDay(t.ingested_at)}</td>
                        <td className="py-2 text-right text-faint" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            {!SAMPLE_TENDER_IDS.has(t.tender_id) && (
                              <ActionButton
                                icon={Trash2}
                                iconOnly
                                tone="destructive"
                                label={isVer ? 'Signed off: reopen it before deleting' : `Delete ${t.tender_id}`}
                                disabled={isVer}
                                onClick={() => {
                                  setDeleteError(null);
                                  setPendingDelete(t);
                                }}
                              />
                            )}
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>

          <ConfirmDialog
            open={Boolean(pendingDelete)}
            title={`Delete ${pendingDelete?.tender_id ?? ''}?`}
            body={
              <>
                This removes the spec, every bid PDF, the evaluated brief and its review history from storage. It
                cannot be undone.
              </>
            }
            confirmLabel="Delete tender"
            busy={isDeleting}
            error={deleteError}
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
          />

          <p className="mt-10 text-[11px] text-faint">
            Code checks every unit and does every sum. AI only finds the quotes, and each quote links to its page.{' '}
            <Link href="/governance" className="underline decoration-rule-strong underline-offset-2 hover:text-ink">
              How the checks work
            </Link>
          </p>
        </div>
      )}
    </AppShell>
  );
}

function OverviewSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-40 rounded-sm bg-rule" />
      <div className="mt-2 h-3 w-64 rounded-sm bg-rule" />
      <div className="mt-8 grid grid-cols-2 border-y border-rule lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`space-y-2 py-5 ${i ? 'border-l border-rule px-5' : ''}`}>
            <div className="h-3 w-24 rounded-sm bg-rule" />
            <div className="h-7 w-32 rounded-sm bg-rule" />
          </div>
        ))}
      </div>
    </div>
  );
}
