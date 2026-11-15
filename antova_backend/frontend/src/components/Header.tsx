'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { listTenders, downloadTbeExport } from '../lib/api';
import { ReviewTenderRow } from '../lib/types';
import {
  ChevronDown,
  Printer,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';

interface HeaderProps {
  tenderId?: string;
  tenderTitle?: string;
  status?: 'DRAFT' | 'VERIFIED';
  openItemsCount?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Header({
  tenderId,
  tenderTitle,
  status = 'DRAFT',
  openItemsCount = 0,
  onRefresh,
  isRefreshing = false,
}: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [tenders, setTenders] = useState<ReviewTenderRow[]>([]);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    listTenders()
      .then(setTenders)
      .catch((err) => console.warn('Could not load tenders list:', err));
  }, []);

  const activeTenderId = tenderId || tenders[0]?.tender_id || 'TENDER-2026-402';

  const displayTenders = tenders.length > 0 ? tenders : [
    {
      tender_id: 'TENDER-2026-402',
      title: '350 MWp Solar + BESS Substation — 33kV GIS Switchgear Package',
      status: 'VERIFIED' as const,
      share_id: 'XmlZsvxPn-QxV260E0ZmPg',
      ingested_at: '2026-11-14T23:40:04.593260+00:00',
      verified_at: '2026-11-15T00:08:13.053137+00:00',
      open_items: 0,
    },
    {
      tender_id: 'TENDER-2026-417',
      title: '120 MW Wind Farm Collector Substation — 33kV GIS Switchgear Package',
      status: 'DRAFT' as const,
      share_id: 'bBBTOjH8naxHZHrJbSmxew',
      ingested_at: '2026-11-14T23:53:51.128575+00:00',
      verified_at: null,
      open_items: 18,
    },
  ];

  const handleExportTbe = async () => {
    try {
      setIsExporting(true);
      setExportError(null);
      await downloadTbeExport(activeTenderId);
    } catch (err: any) {
      setExportError(err.message || 'Failed to export TBE workbook');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100 sticky top-0 z-40 select-none font-sans">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Brand & Tender Selector */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 rounded px-1 -ml-1"
            >
              <div className="w-6 h-6 bg-zinc-900 text-white dark:bg-white dark:text-black font-black flex items-center justify-center rounded text-xs tracking-tight shadow-xs">
                A
              </div>
              <span className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-white group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-colors">
                Antova
              </span>
            </Link>

            <span className="text-zinc-300 dark:text-zinc-700">/</span>

            {/* Tender Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-zinc-50 dark:bg-[#111113] border border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                aria-label="Select Active Tender"
                aria-expanded={isSwitcherOpen}
              >
                <span className="text-zinc-500 dark:text-zinc-400 font-normal">Tender:</span>
                <span className="text-zinc-900 dark:text-white font-mono font-medium">{activeTenderId}</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
              </button>

              {isSwitcherOpen && (
                <div
                  className="absolute left-0 top-full mt-1.5 w-84 bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded shadow-2xl py-1 z-50 text-xs"
                  onMouseLeave={() => setIsSwitcherOpen(false)}
                >
                  <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold border-b border-zinc-200 dark:border-zinc-800/80 font-mono">
                    Switch Ingested Tender
                  </div>
                  {displayTenders.map((t) => (
                    <button
                      key={t.tender_id}
                      onClick={() => {
                        setIsSwitcherOpen(false);
                        router.push(`/audit/${t.tender_id}`);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-start justify-between gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors ${
                        t.tender_id === activeTenderId ? 'bg-zinc-100 dark:bg-zinc-900/80 text-zinc-900 dark:text-white font-medium' : 'text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <div>
                        <div className="font-mono font-semibold text-xs text-zinc-900 dark:text-zinc-100">{t.tender_id}</div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[210px]" title={t.title}>
                          {t.title}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium shrink-0 ${
                          t.status === 'VERIFIED'
                            ? 'border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
                            : 'border border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
                        }`}
                      >
                        {t.status}
                      </span>
                    </button>
                  ))}
                  <div className="border-t border-zinc-200 dark:border-zinc-800/80 mt-1 pt-1">
                    <Link
                      href="/ingest"
                      onClick={() => setIsSwitcherOpen(false)}
                      className="block px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    >
                      + Ingest new tender documents
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Center Navigation Pills */}
          <nav className="hidden md:flex items-center space-x-1 text-xs">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded transition-colors ${
                pathname === '/'
                  ? 'bg-zinc-900 text-white font-medium border border-zinc-800'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Packages Hub
            </Link>
            <Link
              href={`/audit/${activeTenderId}`}
              className={`px-3 py-1.5 rounded transition-colors ${
                pathname.startsWith('/audit')
                  ? 'bg-zinc-900 text-white font-medium border border-zinc-800'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Audit Workbench
            </Link>
            <Link
              href="/ingest"
              className={`px-3 py-1.5 rounded transition-colors ${
                pathname === '/ingest'
                  ? 'bg-zinc-900 text-white font-medium border border-zinc-800'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Ingest & Staging
            </Link>
          </nav>

          {/* Right Action Tools */}
          <div className="flex items-center gap-2.5">
            {/* Status Indicator */}
            {status === 'VERIFIED' ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-500/30 bg-emerald-950/30 text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verified & Sealed</span>
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-500/30 bg-amber-950/30 text-amber-400 text-xs font-medium">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  Draft (<span className="font-mono tabular-nums">{openItemsCount}</span> {openItemsCount === 1 ? 'gap' : 'gaps'})
                </span>
              </span>
            )}

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                aria-label="Refresh audit data"
                title="Refresh audit data from backend"
                className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded transition-colors disabled:opacity-50 border border-zinc-300 dark:border-zinc-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}

            {/* Printable Sign-off */}
            <Link
              href={`/print/${activeTenderId}`}
              target="_blank"
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-[#111113] text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors font-medium"
            >
              <Printer className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
              <span>Sign-Off Sheet</span>
            </Link>

            {/* Excel Export Button */}
            <button
              onClick={handleExportTbe}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-black transition-colors disabled:opacity-50 shadow-sm"
              title={status === 'VERIFIED' ? 'Download verified TBE workbook (.xlsx)' : 'Seal tender to download official TBE workbook'}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Export TBE (.xlsx)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Export Error Toast */}
      {exportError && (
        <div className="bg-rose-950/80 border-b border-rose-800 px-4 py-2.5 text-xs text-rose-200 flex items-center justify-between font-sans">
          <div className="flex items-center gap-2 max-w-[1600px] mx-auto w-full">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{exportError}</span>
            <button
              onClick={() => setExportError(null)}
              className="ml-auto text-zinc-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
