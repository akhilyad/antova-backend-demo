'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  FileSpreadsheet,
  UploadCloud,
  FileText,
  Settings,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Printer,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  Sliders,
  FolderKanban,
  FileStack,
  Layers,
  HelpCircle,
  LogOut,
  User,
  Activity,
  Download,
  AlertCircle,
  X,
} from 'lucide-react';
import { TenderCommandPopover } from '../TenderCommandPopover';
import { ReviewTenderRow, Brief } from '../../lib/types';
import { listTenders, downloadTbeExport, fetchHealth } from '../../lib/api';
import { LANDING_URL, SAMPLE_TENDER_ID } from '../../lib/site';

interface AppShellProps {
  children: React.ReactNode;
  activeTenderId?: string;
  brief?: Brief | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onVerify?: () => void;
  onWithdraw?: () => void;
  actionNotice?: string | null;
  errorNotice?: string | null;
  onClearNotice?: () => void;
}

function AppShellContent({
  children,
  activeTenderId: propActiveTenderId,
  brief,
  onRefresh,
  isRefreshing = false,
  onVerify,
  onWithdraw,
  actionNotice,
  errorNotice,
  onClearNotice,
}: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Dark/Light theme state
  const [isDark, setIsDark] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [tenders, setTenders] = useState<ReviewTenderRow[]>([]);
  const [isExportingTbe, setIsExportingTbe] = useState<boolean>(false);

  // Phones and small tablets start with the sidebar collapsed to icons, so the audit gets the width.
  useEffect(() => {
    if (window.matchMedia('(max-width: 1023px)').matches) setSidebarOpen(false);
  }, []);

  // Initialize theme from HTML or localStorage
  useEffect(() => {
    const isDarkClass = document.documentElement.classList.contains('dark');
    setIsDark(isDarkClass);
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        try { localStorage.setItem('antova_theme', 'dark'); } catch {}
      } else {
        document.documentElement.classList.remove('dark');
        try { localStorage.setItem('antova_theme', 'light'); } catch {}
      }
      return next;
    });
  };

  // Live engine or saved sample? Health answers mode: 'replay' when no engine is connected.
  const [engineMode, setEngineMode] = useState<'live' | 'replay' | 'unknown'>('unknown');
  useEffect(() => {
    fetchHealth()
      .then((h) => setEngineMode(h?.mode === 'replay' ? 'replay' : 'live'))
      .catch(() => setEngineMode('replay'));
  }, []);
  const isReplay = brief?._source === 'replay' || engineMode === 'replay';

  // Load tender registry for switcher
  useEffect(() => {
    listTenders()
      .then(setTenders)
      .catch((err) => console.warn('Could not load tenders:', err));
  }, []);

  // Determine active tender ID
  const routeTenderId = pathname.startsWith('/audit/')
    ? pathname.split('/audit/')[1]?.split('/')[0]?.split('?')[0]
    : undefined;

  const currentTenderId = propActiveTenderId || routeTenderId || tenders[0]?.tender_id || SAMPLE_TENDER_ID;
  const activeTenderData = tenders.find((t) => t.tender_id === currentTenderId);
  const isVerified = brief?.status === 'VERIFIED' || activeTenderData?.status === 'VERIFIED';
  const openItemsCount = brief?.open_items?.length ?? activeTenderData?.open_items ?? 0;

  // Active subtab for audit
  const activeAuditTab = searchParams.get('tab') || 'ledger';

  // Handle Quick TBE Export
  const handleQuickExport = async () => {
    try {
      setIsExportingTbe(true);
      await downloadTbeExport(currentTenderId);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExportingTbe(false);
    }
  };

  // Breadcrumb generator
  const getBreadcrumbTitle = () => {
    if (pathname === '/') return 'Overview';
    if (pathname === '/ingest') return 'Upload';
    if (pathname === '/reports') return `${currentTenderId} / Downloads`;
    if (pathname === '/governance') return 'Governance';
    if (pathname === '/settings') return 'Settings';
    if (pathname.startsWith('/audit')) {
      const tabNames: Record<string, string> = {
        ledger: 'Evaluated totals',
        compliance: 'Requirements check',
        risks: 'Commercial terms',
        sensitivity: 'Rate scenarios',
        signoff: 'Sign-off',
        reports: 'Downloads',
      };
      return `${currentTenderId} / ${tabNames[activeAuditTab] || 'Bid evaluation'}`;
    }
    return 'Antova';
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans ${isDark ? 'dark' : ''} bg-[#F4F6F8] dark:bg-[#09090B] text-[#182433] dark:text-[#F4F4F5]`}>
      <div className="flex flex-1 w-full relative">
        {/* Persistent Left Sidebar */}
        <aside
          className={`shrink-0 sticky top-0 h-screen border-r border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113] transition-all duration-200 z-30 flex flex-col select-none ${
            sidebarOpen ? 'w-60' : 'w-16'
          }`}
          aria-label="Sidebar Navigation"
        >
          {/* Brand Header */}
          <div className="h-14 px-4 flex items-center justify-between border-b border-[#DCE2E8] dark:border-zinc-800">
            <Link href="/" className="flex items-center gap-2 overflow-hidden" aria-label="Antova workbench home">
              {/* Same wordmark as the landing page: brand dot + serif name */}
              <span aria-hidden="true" className="inline-flex h-2 w-2 rounded-full bg-[#C4552D] shrink-0 ml-1" />
              {sidebarOpen && (
                <span className="flex items-baseline gap-1.5 min-w-0">
                  <span className="font-serif text-xl tracking-tight text-[#1A1512] dark:text-[#F1F0EF] leading-none">
                    Antova
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[#9C5137] dark:text-[#D49672]">
                    Workbench
                  </span>
                </span>
              )}
            </Link>

            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 text-xs">
            {/* Group: WORKSPACE */}
            <div>
              {sidebarOpen && (
                <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Workspace
                </div>
              )}
              <div className="space-y-0.5">
                <Link
                  href="/"
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${
                    pathname === '/'
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                  title="Overview"
                >
                  <LayoutDashboard className="w-4 h-4 shrink-0 text-zinc-500" />
                  {sidebarOpen && <span>Overview</span>}
                </Link>

                <Link
                  href="/"
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100"
                  title="Tenders"
                >
                  <FolderKanban className="w-4 h-4 shrink-0 text-zinc-500" />
                  {sidebarOpen && <span>Tenders</span>}
                </Link>
              </div>
            </div>

            {/* Group: EVALUATION */}
            <div>
              {sidebarOpen && (
                <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Evaluation
                </div>
              )}
              <div className="space-y-0.5">
                <Link
                  href={`/audit/${currentTenderId}?tab=ledger`}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${
                    pathname.startsWith('/audit')
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                  title="Tender"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0 text-zinc-500" />
                  {sidebarOpen && (
                    <div className="flex-1 flex items-center justify-between">
                      <span>Bid evaluation</span>
                      {isVerified ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      )}
                    </div>
                  )}
                </Link>

                {/* Sub-items when on audit page & expanded */}
                {sidebarOpen && pathname.startsWith('/audit') && (
                  <div className="pl-6 pr-1 py-1 space-y-0.5 border-l border-zinc-200 dark:border-zinc-800 ml-4 my-1">
                    <Link
                      href={`/audit/${currentTenderId}?tab=ledger`}
                      className={`block px-2 py-1 rounded text-[11px] transition-colors ${
                        activeAuditTab === 'ledger'
                          ? 'text-zinc-900 dark:text-white font-semibold bg-zinc-100/80 dark:bg-zinc-800/60'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      Evaluated totals
                    </Link>
                    <Link
                      href={`/audit/${currentTenderId}?tab=compliance`}
                      className={`block px-2 py-1 rounded text-[11px] transition-colors ${
                        activeAuditTab === 'compliance'
                          ? 'text-zinc-900 dark:text-white font-semibold bg-zinc-100/80 dark:bg-zinc-800/60'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      Requirements check
                    </Link>
                    <Link
                      href={`/audit/${currentTenderId}?tab=risks`}
                      className={`block px-2 py-1 rounded text-[11px] transition-colors ${
                        activeAuditTab === 'risks'
                          ? 'text-zinc-900 dark:text-white font-semibold bg-zinc-100/80 dark:bg-zinc-800/60'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      Commercial terms
                    </Link>
                    <Link
                      href={`/audit/${currentTenderId}?tab=sensitivity`}
                      className={`block px-2 py-1 rounded text-[11px] transition-colors ${
                        activeAuditTab === 'sensitivity'
                          ? 'text-zinc-900 dark:text-white font-semibold bg-zinc-100/80 dark:bg-zinc-800/60'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      Rate scenarios
                    </Link>
                    <Link
                      href={`/audit/${currentTenderId}?tab=signoff`}
                      className={`block px-2 py-1 rounded text-[11px] transition-colors ${
                        activeAuditTab === 'signoff'
                          ? 'text-zinc-900 dark:text-white font-semibold bg-zinc-100/80 dark:bg-zinc-800/60'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      Sign-off
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Group: DATA */}
            <div>
              {sidebarOpen && (
                <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Data
                </div>
              )}
              <div className="space-y-0.5">
                <Link
                  href="/ingest"
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${
                    pathname === '/ingest'
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                  title="Upload"
                >
                  <UploadCloud className="w-4 h-4 shrink-0 text-zinc-500" />
                  {sidebarOpen && <span>Upload</span>}
                </Link>
              </div>
            </div>

            {/* Group: OUTPUTS */}
            <div>
              {sidebarOpen && (
                <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Outputs
                </div>
              )}
              <div className="space-y-0.5">
                <Link
                  href={`/audit/${currentTenderId}?tab=reports`}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${
                    pathname === '/reports' || (pathname.startsWith('/audit') && activeAuditTab === 'reports')
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                  title="Downloads"
                >
                  <FileText className="w-4 h-4 shrink-0 text-zinc-500" />
                  {sidebarOpen && <span>Downloads</span>}
                </Link>
              </div>
            </div>

            {/* Group: ADMINISTRATION */}
            <div>
              {sidebarOpen && (
                <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Administration
                </div>
              )}
              <div className="space-y-0.5">
                <Link
                  href="/governance"
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${
                    pathname === '/governance'
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                  title="How the checks work"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0 text-zinc-500" />
                  {sidebarOpen && <span>How the checks work</span>}
                </Link>

                <Link
                  href="/settings"
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${
                    pathname === '/settings'
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                  title="Settings"
                >
                  <Settings className="w-4 h-4 shrink-0 text-zinc-500" />
                  {sidebarOpen && <span>Settings</span>}
                </Link>
              </div>
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isReplay ? 'bg-amber-500' : engineMode === 'live' ? 'bg-emerald-500' : 'bg-zinc-300'
                }`}
                aria-hidden="true"
              />
              {sidebarOpen && (
                <div className="truncate text-[11px]">
                  <div className="font-semibold text-zinc-900 dark:text-white truncate">
                    {isReplay ? 'Saved sample' : engineMode === 'live' ? 'Live engine' : 'Connecting...'}
                  </div>
                  <a href={LANDING_URL} className="text-[10px] text-zinc-400 hover:text-[#C4552D] truncate block">
                    Back to antova
                  </a>
                </div>
              )}
            </div>

            <button
              onClick={toggleTheme}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </aside>

        {/* Main Work Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Top Persistent Header */}
          <header className="h-14 px-4 sm:px-6 border-b border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113] sticky top-0 z-20 flex items-center justify-between gap-4 select-none font-sans">
            {/* Left: Breadcrumbs & Tender Selector */}
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate hidden md:inline">
                {getBreadcrumbTitle()}
              </span>

              <div className="hidden sm:block h-4 w-px bg-zinc-200 dark:border-zinc-800" />

              <TenderCommandPopover
                tenders={tenders}
                activeTenderId={currentTenderId}
                onSelectTender={(tid) => router.push(`/audit/${tid}`)}
              />

              {/* Status Pill */}
              {isVerified ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Signed off</span>
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Draft ({openItemsCount} open)</span>
                </span>
              )}
            </div>

            {/* Right: Quick Action Controls */}
            <div className="flex items-center gap-2">
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title="Refresh tender data"
                  aria-label="Refresh tender data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-500' : ''}`} />
                </button>
              )}

              {/* Quick TBE Export Button (needs the live engine) */}
              {!isReplay && (
              <button
                onClick={handleQuickExport}
                disabled={isExportingTbe}
                className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shadow-2xs"
                title="Download workbook (.xlsx)"
              >
                <Download className="w-3.5 h-3.5 text-zinc-500" />
                <span>Download</span>
              </button>
              )}

              {/* Verified Seal / Unlock Toggle (if on audit page) */}
              {pathname.startsWith('/audit') && onVerify && onWithdraw && (
                isVerified ? (
                  <button
                    onClick={onWithdraw}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shadow-2xs"
                    title="Reopen to change decisions or amounts"
                  >
                    <Unlock className="w-3 h-3" />
                    <span>Reopen</span>
                  </button>
                ) : (
                  <button
                    onClick={onVerify}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#172536] dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-2xs"
                    title="Sign off this tender"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Sign off</span>
                  </button>
                )
              )}

              {/* Print View Link */}
              <Link
                href={`/print/${currentTenderId}`}
                target="_blank"
                className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Print sign-off sheet"
                aria-label="Print sign-off sheet"
              >
                <Printer className="w-3.5 h-3.5" />
              </Link>
            </div>
          </header>

          {/* Notification / Toast Banner */}
          {actionNotice && (
            <div className="bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 px-4 py-2 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{actionNotice}</span>
              </div>
              {onClearNotice && (
                <button onClick={onClearNotice} className="text-emerald-600 hover:text-emerald-900">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {errorNotice && (
            <div className="bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 px-4 py-2 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{errorNotice}</span>
              </div>
              {onClearNotice && (
                <button onClick={onClearNotice} className="text-rose-600 hover:text-rose-900">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Page Context Content */}
          <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto space-y-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8] dark:bg-[#09090B] text-zinc-500 font-sans text-xs">
          Loading...
        </div>
      }
    >
      <AppShellContent {...props} />
    </Suspense>
  );
}
