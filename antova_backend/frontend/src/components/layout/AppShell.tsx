'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileSpreadsheet,
  UploadCloud,
  Settings,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  RefreshCw,
  X,
} from 'lucide-react';
import { TenderCommandPopover } from '../TenderCommandPopover';
import { ReviewTenderRow, Brief } from '../../lib/types';
import { listTenders, fetchHealth } from '../../lib/api';
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
  const router = useRouter();

  // Dark/Light theme state
  const [isDark, setIsDark] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [tenders, setTenders] = useState<ReviewTenderRow[]>([]);

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

  const navItem = (active: boolean) =>
    `flex items-center gap-2.5 rounded px-2.5 py-1.5 transition-colors ${
      active ? 'bg-sheet text-ink font-medium' : 'text-muted hover:text-ink'
    }`;

  return (
    <div className={`min-h-screen flex flex-col font-sans ${isDark ? 'dark' : ''} bg-paper text-ink`}>
      <div className="flex flex-1 w-full relative">
        <aside
          className={`shrink-0 sticky top-0 h-screen border-r border-rule bg-paper transition-all duration-200 z-30 flex flex-col select-none ${
            sidebarOpen ? 'w-52' : 'w-14'
          }`}
          aria-label="Sidebar Navigation"
        >
          <div className="h-14 px-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 overflow-hidden" aria-label="Antova workbench home">
              <span aria-hidden="true" className="inline-flex h-2 w-2 rounded-full bg-[#C4552D] shrink-0 ml-1.5" />
              {sidebarOpen && <span className="font-serif text-lg tracking-tight text-ink leading-none">Antova</span>}
            </Link>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 rounded text-faint hover:text-ink transition-colors"
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-2 text-[13px]">
            <div className="space-y-0.5">
              <Link href="/" className={navItem(pathname === '/')} title="Overview">
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                {sidebarOpen && <span>Overview</span>}
              </Link>
              <Link href={`/audit/${currentTenderId}`} className={navItem(pathname.startsWith('/audit'))} title="Bid evaluation">
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                {sidebarOpen && <span>Bid evaluation</span>}
              </Link>
              <Link href="/ingest" className={navItem(pathname === '/ingest')} title="Upload">
                <UploadCloud className="w-4 h-4 shrink-0" />
                {sidebarOpen && <span>Upload</span>}
              </Link>
            </div>
            <div className="my-3 mx-2.5 border-t border-rule" />
            <div className="space-y-0.5">
              <Link href="/governance" className={navItem(pathname === '/governance')} title="How the checks work">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                {sidebarOpen && <span>How the checks work</span>}
              </Link>
              <Link href="/settings" className={navItem(pathname === '/settings')} title="Settings">
                <Settings className="w-4 h-4 shrink-0" />
                {sidebarOpen && <span>Settings</span>}
              </Link>
            </div>
          </nav>

          <div className="px-3 py-3 border-t border-rule flex items-center justify-between text-[11px]">
            {sidebarOpen ? (
              <div className="min-w-0 truncate">
                <div className="text-ink-2 truncate">
                  {isReplay ? 'Saved sample' : engineMode === 'live' ? 'Live engine' : 'Connecting'}
                </div>
                <a href={LANDING_URL} className="text-faint hover:text-ink truncate block">
                  Back to antova
                </a>
              </div>
            ) : (
              <span />
            )}
            <button
              onClick={toggleTheme}
              className="p-1.5 text-faint hover:text-ink rounded transition-colors"
              title={isDark ? 'Light mode' : 'Dark mode'}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 px-6 lg:px-10 border-b border-rule bg-paper sticky top-0 z-20 flex items-center justify-between gap-4 select-none">
            <TenderCommandPopover
              tenders={tenders}
              activeTenderId={currentTenderId}
              onSelectTender={(tid) => router.push(`/audit/${tid}`)}
            />

            <div className="flex items-center gap-2 text-xs">
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="p-1.5 text-faint hover:text-ink rounded transition-colors"
                  title="Reload tender"
                  aria-label="Reload tender"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              )}
              {pathname.startsWith('/audit') && onVerify && onWithdraw && (
                isVerified ? (
                  <button
                    onClick={onWithdraw}
                    className="rounded border border-rule-strong px-3 py-1.5 font-medium text-ink hover:bg-sheet"
                    title="Reopen to change decisions or amounts"
                  >
                    Reopen
                  </button>
                ) : (
                  <button
                    onClick={onVerify}
                    className="rounded bg-ink px-3 py-1.5 font-medium text-paper hover:opacity-90"
                    title={openItemsCount > 0 ? `${openItemsCount} open items to resolve first` : 'Sign off this tender'}
                  >
                    Sign off
                  </button>
                )
              )}
            </div>
          </header>

          {actionNotice && (
            <div className="border-b border-rule bg-sheet px-6 lg:px-10 py-2 text-xs text-ink-2 flex items-center justify-between gap-4" role="status">
              <span>{actionNotice}</span>
              {onClearNotice && (
                <button onClick={onClearNotice} className="text-faint hover:text-ink" aria-label="Dismiss">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {errorNotice && (
            <div className="border-b border-rule bg-sheet px-6 lg:px-10 py-2 text-xs text-gap flex items-center justify-between gap-4" role="alert">
              <span>{errorNotice}</span>
              {onClearNotice && (
                <button onClick={onClearNotice} className="text-faint hover:text-ink" aria-label="Dismiss">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <main className="flex-1 w-full max-w-[1280px] mx-auto px-6 lg:px-10 py-8 lg:py-10 space-y-6">
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
        <div className="min-h-screen flex items-center justify-center bg-paper text-muted font-sans text-xs">
          Loading...
        </div>
      }
    >
      <AppShellContent {...props} />
    </Suspense>
  );
}
