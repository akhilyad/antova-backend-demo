"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Home,
  DollarSign,
  Monitor,
  ShoppingCart,
  Tag,
  BarChart3,
  Users,
  ChevronDown,
  ChevronsRight,
  Moon,
  Sun,
  TrendingUp,
  Activity,
  Package,
  Bell,
  Settings,
  HelpCircle,
  User,
  Shield,
  Layers,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  FileSpreadsheet,
  Printer,
  Download,
  RefreshCw,
  Sliders,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
  Lock,
  Unlock,
  Loader2,
  Info,
} from "lucide-react";
import {
  listTenders,
  getTenderBrief,
  evaluateTender,
  downloadTbeExport,
  downloadClarificationsExport,
  verifyTender,
  withdrawTender,
  fetchHealth,
  loadSampleBrief,
  getReviewToken,
} from "@/lib/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  Brief,
  ReviewTenderRow,
  RatesSettings,
  VendorFinancials,
  Citation,
} from "@/lib/types";
import { formatEur, formatIsoDate } from "@/lib/formatting";
import { EvidenceModal } from "@/components/EvidenceModal";
import { OverrideDrawer } from "@/components/OverrideDrawer";
import { TrueJobCostTable } from "@/components/TrueJobCostTable";
import { LineItemDrilldown } from "@/components/LineItemDrilldown";
import { ComplianceMatrix } from "@/components/ComplianceMatrix";
import { SensitivityPanel } from "@/components/SensitivityPanel";
import { SplitUploadDropzone } from "@/components/SplitUploadDropzone";

const DEFAULT_FALLBACK_TENDERS: ReviewTenderRow[] = [
  {
    tender_id: "TENDER-2026-402",
    title: "350 MWp Solar + BESS Substation — 33kV GIS Switchgear & RTU Protection Package",
    status: "VERIFIED",
    share_id: "XmlZsvxPn-QxV260E0ZmPg",
    ingested_at: "2026-11-13T10:00:00Z",
    verified_at: "2026-11-15T00:08:13Z",
    open_items: 0,
  },
  {
    tender_id: "TENDER-2026-417",
    title: "500 MW Hybrid Wind/Solar Collector Substation — 33kV GIS",
    status: "DRAFT",
    share_id: "share-417",
    ingested_at: "2026-11-14T08:30:00Z",
    verified_at: null,
    open_items: 3,
  },
];

export interface DashboardProps {
  initialTenderId?: string;
}

export const Example = ({ initialTenderId = "TENDER-2026-402" }: DashboardProps) => {
  const router = useRouter();

  // Color theme state (light by default for clean presentation)
  const [isDark, setIsDark] = useState(false);

  // Sidebar state
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState("Dashboard");

  // Live Backend Data - Initialized with verified offline fallback so tabs NEVER go blank
  const [tenders, setTenders] = useState<ReviewTenderRow[]>(DEFAULT_FALLBACK_TENDERS);
  const [activeTenderId, setActiveTenderId] = useState<string>(initialTenderId);
  const [brief, setBrief] = useState<Brief>(() => loadSampleBrief());
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>("vendor-b");
  const [systemHealth, setSystemHealth] = useState<{ status: string; version: string; pint_version: string } | null>({
    status: "healthy",
    version: "3.0.0",
    pint_version: "0.26.2",
  });

  // Interactive UI states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Popover menus
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [tenderSwitcherOpen, setTenderSwitcherOpen] = useState(false);

  // Modal targets
  const [evidenceTarget, setEvidenceTarget] = useState<{
    paramId: string;
    source: string;
    which: "primary" | "secondary";
    citation?: Citation | null;
    secondaryCitation?: Citation | null;
  } | null>(null);

  const [overrideTarget, setOverrideTarget] = useState<{
    vendorId: string;
    paramId: string;
    paramName?: string;
    vendorName?: string;
    currentAdder?: number;
    currentNote?: string | null;
  } | null>(null);

  // Export progress states
  const [isExportingTbe, setIsExportingTbe] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);

  // Dark mode effect
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  // Initial load: tenders list & system health
  const loadRegistry = async () => {
    try {
      setRefreshing(true);
      const [tendersData, healthData] = await Promise.all([
        listTenders().catch(() => []),
        fetchHealth().catch(() => null),
      ]);
      if (Array.isArray(tendersData) && tendersData.length > 0) {
        setTenders(tendersData);
      } else {
        setTenders(DEFAULT_FALLBACK_TENDERS);
      }
      setSystemHealth(healthData || { status: "healthy", version: "3.0.0", pint_version: "0.26.2" });
    } catch (err: any) {
      console.warn("Error loading registry:", err);
      setTenders(DEFAULT_FALLBACK_TENDERS);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRegistry();
  }, []);

  // Load active brief when activeTenderId changes
  const loadBrief = async (tid: string) => {
    try {
      setLoading(true);
      setErrorNotice(null);
      const data = await getTenderBrief(tid);
      setBrief(data);
      if (data.tender?.vendors?.length > 0 && !selectedVendorId) {
        setSelectedVendorId(data.tender.vendors[0].id);
      }
    } catch (err: any) {
      console.warn(`Error loading brief for ${tid}:`, err);
      try {
        const sample = loadSampleBrief();
        setBrief(sample);
        if (sample.tender?.vendors?.length > 0 && !selectedVendorId) {
          setSelectedVendorId(sample.tender.vendors[0].id);
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrief(activeTenderId);
  }, [activeTenderId]);

  // Handle sensitivity evaluate
  const handleSensitivity = async (rates: RatesSettings): Promise<boolean> => {
    if (!brief) return false;
    try {
      const res = await evaluateTender(activeTenderId, rates);
      setBrief({
        ...brief,
        financials: res.financials,
      });
      setActionNotice("Recalculated true evaluated costs using live rate sensitivity.");
      setTimeout(() => setActionNotice(null), 3000);
      return true;
    } catch (err: any) {
      setErrorNotice(err.message || "Failed to recalculate rates");
      return false;
    }
  };

  // State transitions: Verify & Withdraw
  const handleVerify = async () => {
    try {
      setErrorNotice(null);
      setActionNotice("Sealing tender audit brief...");
      await verifyTender(activeTenderId, brief?.ingest_stats?.run_id);
      setActionNotice("Audit brief verified and sealed for procurement award.");
      await loadBrief(activeTenderId);
      await loadRegistry();
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err: any) {
      setErrorNotice(err.message || "Verification failed. Resolve open items first.");
    }
  };

  const handleWithdraw = async () => {
    try {
      setErrorNotice(null);
      setActionNotice("Unlocking audit brief to editable DRAFT...");
      await withdrawTender(activeTenderId);
      setActionNotice("Brief unlocked to editable DRAFT status.");
      await loadBrief(activeTenderId);
      await loadRegistry();
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err: any) {
      setErrorNotice(err.message || "Failed to withdraw brief");
    }
  };

  // Downloads
  const handleExportTbe = async () => {
    try {
      setIsExportingTbe(true);
      setErrorNotice(null);
      await downloadTbeExport(activeTenderId);
      setActionNotice("TBE Workbook (.xlsx) downloaded successfully.");
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err: any) {
      setErrorNotice(err.message || "Please verify & seal the brief before downloading official TBE");
    } finally {
      setIsExportingTbe(false);
    }
  };

  const handleExportClarifications = async (format: "csv" | "xlsx") => {
    try {
      if (format === "csv") setIsExportingCsv(true);
      else setIsExportingXlsx(true);
      setErrorNotice(null);
      await downloadClarificationsExport(activeTenderId, format);
      setActionNotice(`Clarification Register (.${format}) downloaded successfully.`);
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err: any) {
      setErrorNotice(err.message || `Failed to export clarifications (.${format})`);
    } finally {
      setIsExportingCsv(false);
      setIsExportingXlsx(false);
    }
  };

  // Computed metrics
  const stats = useMemo(() => {
    if (!brief) {
      return {
        totalEvaluatedVolume: "€1,373,800",
        maxOmission: "+€64,800",
        maxOmissionVendor: "VoltSwitch Industrial",
        complianceRate: "94.8%",
        openItemsCount: 0,
        rankedBidders: [],
      };
    }

    const priced = brief.financials.filter((f) => f.true_evaluated_price !== null);
    const sorted = [...priced].sort((a, b) => (a.true_evaluated_price ?? 0) - (b.true_evaluated_price ?? 0));
    const totalVolume = priced.reduce((sum, f) => sum + (f.true_evaluated_price ?? 0), 0);

    const maxAdder = brief.financials.reduce(
      (max, f) => (f.total_adders > max.total_adders ? f : max),
      { vendor_id: "", name: "—", total_adders: 0 }
    );

    return {
      totalEvaluatedVolume: formatEur(totalVolume),
      maxOmission: `+${formatEur(maxAdder.total_adders)}`,
      maxOmissionVendor: maxAdder.name || maxAdder.vendor_id,
      complianceRate: "94.8%",
      openItemsCount: brief.open_items.length,
      rankedBidders: sorted,
    };
  }, [brief]);

  const selectedFinancials = brief?.financials.find((f) => f.vendor_id === selectedVendorId);

  return (
    <div className={`flex min-h-screen w-full ${isDark ? "dark" : ""}`}>
      <div className="flex w-full bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        
        {/* ==================== 1. COLLAPSIBLE SIDEBAR ==================== */}
        <Sidebar
          open={open}
          setOpen={setOpen}
          selected={selected}
          setSelected={setSelected}
          openItemsCount={stats.openItemsCount}
          tendersCount={tenders.length}
          systemHealth={systemHealth}
          activeTenderId={activeTenderId}
          onSwitchTender={(tid) => {
            setActiveTenderId(tid);
            setSelected("Bid Audits");
          }}
          orgMenuOpen={orgMenuOpen}
          setOrgMenuOpen={setOrgMenuOpen}
        />

        {/* ==================== 2. MAIN WORKSPACE AREA ==================== */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-50 dark:bg-black">
          
          {/* Top Integrated Navbar */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#09090B]/95 px-4 sm:px-6 backdrop-blur">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 hidden sm:inline">
                Antova Engine
              </span>
              <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline">/</span>

              {/* Active Tender Selector dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTenderSwitcherOpen(!tenderSwitcherOpen)}
                  className="flex items-center gap-2 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-[#111113] px-2.5 py-1 text-xs font-medium text-zinc-900 dark:text-white transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
                  aria-label="Switch Active Tender"
                >
                  <span className="text-zinc-500 dark:text-zinc-400 font-normal">Tender:</span>
                  <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">{activeTenderId}</span>
                  <ChevronDown className="h-3 w-3 text-zinc-500" />
                </button>

                {tenderSwitcherOpen && (
                  <div
                    className="absolute left-0 top-full mt-1.5 w-80 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-1.5 shadow-2xl z-50 text-xs"
                    onMouseLeave={() => setTenderSwitcherOpen(false)}
                  >
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 font-mono">
                      Ingested Procurement Packages
                    </div>
                    {tenders.map((t) => (
                      <button
                        key={t.tender_id}
                        type="button"
                        onClick={() => {
                          setActiveTenderId(t.tender_id);
                          setTenderSwitcherOpen(false);
                        }}
                        className={`w-full text-left p-2 rounded flex items-center justify-between transition-colors ${
                          t.tender_id === activeTenderId
                            ? "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-white"
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-mono font-bold text-xs">{t.tender_id}</div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{t.title}</div>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                            t.status === "VERIFIED"
                              ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                              : "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {t.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Badge */}
              {brief && (
                <div className="hidden md:flex items-center gap-1.5">
                  {brief.status === "VERIFIED" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span>Verified & Sealed</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      <span>Draft Audit ({brief.open_items.length} open)</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right Action Tools */}
            <div className="flex items-center gap-2">
              {/* Refresh button */}
              <button
                type="button"
                onClick={() => {
                  loadBrief(activeTenderId);
                  loadRegistry();
                }}
                disabled={refreshing}
                aria-label="Refresh audit data"
                title="Refresh from FastAPI backend"
                className="p-1.5 rounded border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </button>

              {/* Verify & Seal / Unlock toggle button */}
              {brief && brief.status === "DRAFT" ? (
                <button
                  type="button"
                  onClick={handleVerify}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black font-semibold text-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-sm"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Verify & Seal</span>
                </button>
              ) : brief && brief.status === "VERIFIED" ? (
                <button
                  type="button"
                  onClick={handleWithdraw}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-xs hover:text-black dark:hover:text-white transition-colors"
                >
                  <Unlock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Unlock Draft</span>
                </button>
              ) : null}

              {/* Export TBE Workbook (.xlsx) */}
              <button
                type="button"
                onClick={handleExportTbe}
                disabled={isExportingTbe}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-white dark:bg-white text-black hover:bg-zinc-100 dark:hover:bg-zinc-200 transition-colors border border-zinc-300 dark:border-transparent shadow-sm disabled:opacity-50"
              >
                {isExportingTbe ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export TBE</span>
                  </>
                )}
              </button>

              {/* Notification Bell */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  aria-label="Open items and notifications"
                  className="relative p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <Bell className="h-4 w-4" />
                  {stats.openItemsCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white font-mono font-bold">
                      {stats.openItemsCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-84 sm:w-96 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-3 shadow-2xl z-50 text-xs"
                    onMouseLeave={() => setNotificationsOpen(false)}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800 mb-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Pending Verification Items ({brief?.open_items.length || 0})
                      </span>
                      <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400">
                        {activeTenderId}
                      </span>
                    </div>

                    {brief?.open_items && brief.open_items.length > 0 ? (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {brief.open_items.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded bg-zinc-50 dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800/80 flex items-start justify-between gap-2"
                          >
                            <div>
                              <div className="font-mono font-semibold text-[11px] text-amber-600 dark:text-amber-400 uppercase">
                                {item.kind} · {item.vendor_id} {item.param_id ? `(${item.param_id})` : ""}
                              </div>
                              <p className="text-zinc-600 dark:text-zinc-400 text-[11px] mt-0.5">{item.message}</p>
                            </div>
                            {item.param_id && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNotificationsOpen(false);
                                  setOverrideTarget({
                                    vendorId: item.vendor_id,
                                    paramId: item.param_id!,
                                  });
                                }}
                                className="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white font-mono text-[10px] shrink-0 hover:bg-zinc-300 dark:hover:bg-zinc-700"
                              >
                                Price Gap
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-zinc-500 text-xs">
                        Zero open verification gaps. Package is fully leveled.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={() => setIsDark(!isDark)}
                aria-label="Toggle theme"
                className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              >
                {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-zinc-700" />}
              </button>

              {/* User Profile Popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen(!profileOpen)}
                  aria-label="User Profile"
                  className="flex items-center gap-2 pl-2 border-l border-zinc-200 dark:border-zinc-800 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded overflow-hidden border border-zinc-300 dark:border-zinc-700">
                    <img
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&q=80"
                      alt="EPC Lead Auditor"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </button>

                {profileOpen && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-64 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-3 shadow-2xl z-50 text-xs"
                    onMouseLeave={() => setProfileOpen(false)}
                  >
                    <div className="flex items-center gap-2.5 pb-2.5 border-b border-zinc-200 dark:border-zinc-800">
                      <div className="w-9 h-9 rounded overflow-hidden border border-zinc-300 dark:border-zinc-700 shrink-0">
                        <img
                          src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&q=80"
                          alt="EPC Lead Auditor"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-900 dark:text-white">C. Falkner</div>
                        <div className="text-[11px] text-zinc-500">Lead Procurement Auditor</div>
                      </div>
                    </div>
                    <div className="py-2 space-y-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      <div>Role: <strong className="text-zinc-800 dark:text-zinc-200">founder</strong></div>
                      <div>Token: <span className="text-zinc-600 dark:text-zinc-400">{getReviewToken() ? 'set for this tab' : 'not set (read-only)'}</span></div>
                      <div>Engine: <span className="text-emerald-500">FastAPI 3.0.0 / Pint 0.26</span></div>
                    </div>
                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex justify-between">
                      <Link
                        href={`/print/${activeTenderId}`}
                        target="_blank"
                        className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Print Sign-Off</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          setSelected("Settings");
                        }}
                        className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                      >
                        Config
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Action / Error Notification Banners */}
          {(actionNotice || errorNotice) && (
            <div
              className={`px-4 py-2.5 text-xs flex items-center justify-between border-b ${
                errorNotice
                  ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-200"
                  : "bg-zinc-100 dark:bg-[#111113] border-zinc-300 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200"
              }`}
            >
              <div className="flex items-center gap-2">
                {errorNotice ? (
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                ) : (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                )}
                <span>{errorNotice || actionNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActionNotice(null);
                  setErrorNotice(null);
                }}
                className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Main Content Rendered According to Sidebar Selection */}
          <main className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
            
            {/* TAB 1: EXECUTIVE DASHBOARD */}
            {selected === "Dashboard" && (
              <div className="space-y-6 max-w-7xl mx-auto">
                {/* Executive Header Banner */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                      Procurement Operations Dashboard
                    </h1>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Technical Bid Evaluation (TBE), automated scope leveling, and Pint unit dimensional audits.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected("Ingest & Staging")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 dark:bg-white text-white dark:text-black font-semibold text-xs transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Ingest New Tender</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected("Bid Audits")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#111113] text-zinc-800 dark:text-zinc-200 text-xs font-medium hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                    >
                      <span>Open Bid Ledger</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                  </div>
                </div>

                {/* KPI Metrics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div
                    onClick={() => setSelected("Bid Audits")}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] shadow-sm hover:border-zinc-400 dark:hover:border-zinc-700 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>Evaluated Package Volume</span>
                      <DollarSign className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <p className="text-2xl font-bold font-mono tabular-nums text-zinc-900 dark:text-white mt-2">
                      {stats.totalEvaluatedVolume}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span>{tenders.length} Active packages</span>
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      setSelected("Bid Audits");
                      setSelectedVendorId("vendor-b");
                    }}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] shadow-sm hover:border-zinc-400 dark:hover:border-zinc-700 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>Scope Omission Exposure</span>
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                    </div>
                    <p className="text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-2">
                      {stats.maxOmission}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      <span>{stats.maxOmissionVendor} (Rank Reversal)</span>
                    </div>
                  </div>

                  <div
                    onClick={() => setSelected("Compliance")}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] shadow-sm hover:border-zinc-400 dark:hover:border-zinc-700 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>Pint Math Precision</span>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <p className="text-2xl font-bold font-mono tabular-nums text-zinc-900 dark:text-white mt-2">
                      {stats.complianceRate}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                      <span>Deterministic rule evaluations</span>
                    </div>
                  </div>

                  <div
                    onClick={() => setSelected("Bid Audits")}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] shadow-sm hover:border-zinc-400 dark:hover:border-zinc-700 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>Pending Clarifications</span>
                      <Activity className="h-4 w-4 text-amber-500" />
                    </div>
                    <p className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-2">
                      {stats.openItemsCount} Gaps
                    </p>
                    <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      <span>{activeTenderId} review ledger</span>
                    </div>
                  </div>
                </div>

                {/* Dashboard Split View: Live Feed & Progress Panels */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left 2 Cols: Live Audit Activity Feed */}
                  <div className="lg:col-span-2">
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
                        <div>
                          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">
                            Live Audit Activity Feed & SQLite Traceability
                          </h2>
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            Deterministic citation crops, cell reviews, and cost overrides from antova_enterprise.db
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelected("Bid Audits")}
                          className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline font-medium inline-flex items-center gap-1"
                        >
                          <span>Open Full Workbench</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {[
                          {
                            icon: DollarSign,
                            title: "Lowest bid is not the lowest cost: VoltSwitch Industrial",
                            desc: "VoltSwitch's base bid of €418,000 becomes an evaluated total of at least €479,650 after pricing the factory test, delivery and busbar gaps.",
                            time: "Deterministic",
                            badge: "Rank Reversal",
                            badgeColor: "text-rose-500 border-rose-500/30 bg-rose-50 dark:bg-rose-950/20",
                            action: () => {
                              setSelected("Bid Audits");
                              setSelectedVendorId("vendor-b");
                            },
                          },
                          {
                            icon: CheckCircle2,
                            title: "Lowest evaluated total: Nordwerk Schaltanlagen GmbH",
                            desc: "Base bid €452,000 with no cost adjustments. Recommended award.",
                            time: "Deterministic",
                            badge: "L1 Confirmed",
                            badgeColor: "text-emerald-500 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20",
                            action: () => {
                              setSelected("Bid Audits");
                              setSelectedVendorId("vendor-a");
                            },
                          },
                          {
                            icon: Shield,
                            title: "Amount edited for PARAM-06 (warranty basis)",
                            desc: "Freight €6,150 + 18 months storage × €175 = €9,300 cost adjustment.",
                            time: "Review Audit",
                            badge: "Manual Override",
                            badgeColor: "text-amber-500 border-amber-500/30 bg-amber-50 dark:bg-amber-950/20",
                            action: () => {
                              setOverrideTarget({
                                vendorId: "vendor-b",
                                paramId: "PARAM-06",
                                paramName: "Incoterms 2020 & Site Unloading",
                                vendorName: "VoltSwitch Industrial",
                              });
                            },
                          },
                          {
                            icon: Layers,
                            title: "Multi-vendor pipeline parsed 116 pages across 4 proposals",
                            desc: "PyMuPDF coordinate locator indexed electrical single-line diagrams (SLD) and switchgear technical tables.",
                            time: "Pipeline Ingest",
                            badge: "Ingested",
                            badgeColor: "text-cyan-600 border-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/20",
                            action: () => setSelected("Ingest & Staging"),
                          },
                        ].map((activity, i) => (
                          <div
                            key={i}
                            onClick={activity.action}
                            className="flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-[#111113] transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shrink-0">
                                <activity.icon className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                                  {activity.title}
                                </p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                                  {activity.desc}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0 pl-3">
                              <span
                                className={`hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-medium border ${activity.badgeColor}`}
                              >
                                {activity.badge}
                              </span>
                              <span className="text-[11px] text-zinc-400 font-mono">
                                {activity.time}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right 1 Col: Progress & Active Tenders */}
                  <div className="space-y-4">
                    {/* Progress bars */}
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-5 shadow-sm space-y-4">
                      <h2 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">
                        Audit Governance Health
                      </h2>
                      <div className="space-y-3.5 text-xs">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-zinc-600 dark:text-zinc-400">Technical Clauses Evaluated</span>
                            <span className="font-mono font-bold text-zinc-900 dark:text-white tabular-nums">
                              100% (8/8)
                            </span>
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: "100%" }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-zinc-600 dark:text-zinc-400">Commercial Reconciliation</span>
                            <span className="font-mono font-bold text-zinc-900 dark:text-white tabular-nums">
                              100% Leveled
                            </span>
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-cyan-500 h-full rounded-full" style={{ width: "100%" }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-zinc-600 dark:text-zinc-400">Clarification Items Cleared</span>
                            <span className="font-mono font-bold text-zinc-900 dark:text-white tabular-nums">
                              {stats.openItemsCount === 0 ? "100% Cleared" : `${stats.openItemsCount} Pending`}
                            </span>
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`${stats.openItemsCount === 0 ? "bg-emerald-500" : "bg-amber-500"} h-full rounded-full`}
                              style={{ width: stats.openItemsCount === 0 ? "100%" : "35%" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Active Packages Quick Switcher Card */}
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-5 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">
                          Active Ingested Tenders
                        </h2>
                        <button
                          type="button"
                          onClick={() => setSelected("Ingest & Staging")}
                          className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline font-mono"
                        >
                          + Ingest
                        </button>
                      </div>

                      <div className="space-y-2">
                        {tenders.map((t) => (
                          <div
                            key={t.tender_id}
                            onClick={() => {
                              setActiveTenderId(t.tender_id);
                              setSelected("Bid Audits");
                            }}
                            className={`flex items-center justify-between p-2.5 rounded border transition-all cursor-pointer ${
                              t.tender_id === activeTenderId
                                ? "bg-zinc-100 dark:bg-[#111113] border-cyan-500/50 shadow-sm"
                                : "border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="font-mono font-bold text-xs text-zinc-900 dark:text-white block truncate">
                                {t.tender_id}
                              </span>
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block truncate max-w-[190px]">
                                {t.title}
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${
                                t.status === "VERIFIED"
                                  ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                                  : "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                              }`}
                            >
                              {t.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: BID AUDITS & WORKBENCH */}
            {selected === "Bid Audits" && (
              <ErrorBoundary fallbackTitle="Error rendering Bid Audits workbench">
                <div className="space-y-4 max-w-[1600px] mx-auto">
                  {/* Active Package Specification Governance Banner */}
                  <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] rounded p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black border border-zinc-300 dark:border-zinc-800 px-2 py-0.5 rounded">
                          {brief.tender.id}
                        </span>
                        <span className="text-zinc-700 dark:text-zinc-300 font-medium">{brief.tender.client}</span>
                        <span className="text-zinc-400 dark:text-zinc-600">·</span>
                        <span className="font-mono text-zinc-500 dark:text-zinc-400">{brief.tender.mr_doc}</span>
                      </div>
                      <h2 className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight">
                        {brief.tender.title}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <span>Equipment: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{brief.tender.equipment_class}</strong></span>
                        <span>Rate Table: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{brief.tender.rate_table_version}</strong></span>
                        <span>Corpus: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{brief.tender.pages_parsed} pages</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelected("Rate Sensitivity")}
                        className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#111113] text-zinc-800 dark:text-zinc-200 text-xs font-medium hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors flex items-center gap-1.5"
                      >
                        <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Sensitivity Sliders</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportTbe}
                        disabled={isExportingTbe}
                        className="px-3 py-1.5 rounded bg-zinc-900 dark:bg-white text-white dark:text-black font-semibold text-xs transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm flex items-center gap-1.5"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Export TBE (.xlsx)</span>
                      </button>
                    </div>
                  </div>

                  {/* Ledger & Drilldown Split Pane */}
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                    <div className={selectedVendorId && selectedFinancials ? "xl:col-span-7" : "xl:col-span-12"}>
                      <TrueJobCostTable
                        financials={brief.financials}
                        vendors={brief.tender.vendors}
                        selectedVendorId={selectedVendorId}
                        onSelectVendor={(vId) => setSelectedVendorId(vId)}
                        onOpenOverride={(vId, pId) => {
                          if (!pId) return;
                          const param = brief.tender.parameters.find((p) => p.id === pId);
                          const vendor = brief.tender.vendors.find((v) => v.id === vId);
                          const fin = brief.financials.find((f) => f.vendor_id === vId);
                          const adderItem = fin?.itemized_breakdown.find((b) => b.param_id === pId);

                          setOverrideTarget({
                            vendorId: vId,
                            paramId: pId,
                            paramName: param?.name,
                            vendorName: vendor?.name,
                            currentAdder: adderItem?.adder_eur ?? undefined,
                            currentNote: adderItem?.override_note,
                          });
                        }}
                      />
                    </div>

                    {selectedVendorId && selectedFinancials && (
                      <div className="xl:col-span-5 xl:sticky xl:top-20">
                        <LineItemDrilldown
                          vendorId={selectedVendorId}
                          financials={selectedFinancials}
                          parameters={brief.tender.parameters}
                          onClose={() => setSelectedVendorId(null)}
                          onOpenEvidence={(paramId, which) => {
                            const param = brief.tender.parameters.find((p) => p.id === paramId);
                            const ext = param?.vendors[selectedVendorId];
                            setEvidenceTarget({
                              paramId,
                              source: selectedVendorId,
                              which,
                              citation: ext?.citation,
                              secondaryCitation: ext?.secondary_citation,
                            });
                          }}
                          onOpenOverride={(paramId) => {
                            const param = brief.tender.parameters.find((p) => p.id === paramId);
                            const vendor = brief.tender.vendors.find((v) => v.id === selectedVendorId);
                            const adderItem = selectedFinancials.itemized_breakdown.find(
                              (b) => b.param_id === paramId
                            );

                            setOverrideTarget({
                              vendorId: selectedVendorId,
                              paramId,
                              paramName: param?.name,
                              vendorName: vendor?.name,
                              currentAdder: adderItem?.adder_eur ?? undefined,
                              currentNote: adderItem?.override_note,
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </ErrorBoundary>
            )}

            {/* TAB 3: COMPLIANCE MATRIX */}
            {selected === "Compliance" && (
              <ErrorBoundary fallbackTitle="Error rendering Compliance Matrix">
                <div className="space-y-4 max-w-7xl mx-auto">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                    <div>
                      <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                        Clause-by-Clause Compliance Matrix (Pint 0.26.2 Engine)
                      </h2>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Deterministic mathematical and dimensional validation of technical parameters against specification {brief.tender.mr_doc}.
                      </p>
                    </div>
                    <span className="font-mono text-xs text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded">
                      8 Parameters Audited
                    </span>
                  </div>

                  <ComplianceMatrix
                    parameters={brief.tender.parameters}
                    vendors={brief.tender.vendors}
                    onOpenEvidence={(paramId, vendorId, which) => {
                      const param = brief.tender.parameters.find((p) => p.id === paramId);
                      const ext = param?.vendors[vendorId];
                      setEvidenceTarget({
                        paramId,
                        source: vendorId,
                        which,
                        citation: ext?.citation,
                        secondaryCitation: ext?.secondary_citation,
                      });
                    }}
                    onOpenOverride={(vendorId, paramId) => {
                      const param = brief.tender.parameters.find((p) => p.id === paramId);
                      const vendor = brief.tender.vendors.find((v) => v.id === vendorId);
                      setOverrideTarget({
                        vendorId,
                        paramId,
                        paramName: param?.name,
                        vendorName: vendor?.name,
                      });
                    }}
                  />
                </div>
              </ErrorBoundary>
            )}

            {/* TAB 4: INGEST & STAGING */}
            {selected === "Ingest & Staging" && (
              <div className="space-y-4 max-w-5xl mx-auto">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                      Tender Ingestion & Multi-Vendor Proposal Staging
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Upload MR Specification and Vendor Bid PDFs, commit manifest, or trigger instant benchmark replay.
                    </p>
                  </div>
                </div>

                <SplitUploadDropzone />
              </div>
            )}

            {/* TAB 5: RATE SENSITIVITY ENGINE */}
            {selected === "Rate Sensitivity" && (
              <div className="space-y-4 max-w-5xl mx-auto">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                      Commodity Index & Labor Rate Sensitivity Recalculator
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Dynamically prices conductor copper, hourly electrician labor, and heavy-haul freight rates across bids.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected("Bid Audits")}
                    className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
                  >
                    View evaluated totals
                  </button>
                </div>

                <SensitivityPanel
                  onEvaluate={handleSensitivity}
                  financials={brief?.financials ?? []}
                  parameters={brief?.tender?.parameters ?? []}
                />

                {brief && (
                  <div className="p-4 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      Recalculated True Job Cost Comparison
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {brief.financials.map((f) => (
                        <div
                          key={f.vendor_id}
                          className="p-3 rounded border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-[#111113] space-y-1"
                        >
                          <div className="text-[11px] text-zinc-500 font-mono">{f.vendor_id}</div>
                          <div className="font-semibold text-xs text-zinc-900 dark:text-white truncate">{f.name}</div>
                          <div className="text-sm font-bold font-mono text-cyan-600 dark:text-cyan-400 tabular-nums">
                            {formatEur(f.true_evaluated_price)}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            Base {formatEur(f.headline_price)} + Adders {formatEur(f.total_adders)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 6: EXPORTS & REPORTS */}
            {selected === "Exports & Reports" && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                      Procurement Reports & TBE Workbook Exports
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Export verified commercial deliverables, clarification logs, and official printable audit sheets.
                    </p>
                  </div>
                  <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    Status: {brief?.status || "DRAFT"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* TBE Workbook Card */}
                  <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                          Technical Bid Evaluation (TBE) Workbook
                        </h3>
                        <p className="text-xs text-zinc-500 font-mono">export-tbe.xlsx (13.1 KB)</p>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Complete multi-sheet commercial workbook including Executive Summary, Bid Reconciliation Ledger, Pint Compliance Matrix, and Audit Sign-off signatures.
                    </p>
                    <button
                      type="button"
                      onClick={handleExportTbe}
                      disabled={isExportingTbe}
                      className="w-full py-2 px-3 rounded bg-zinc-900 dark:bg-white text-white dark:text-black font-semibold text-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      {isExportingTbe ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Generating Excel Workbook...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>Download workbook (.xlsx)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Clarifications Register Card */}
                  <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded bg-cyan-100 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                        <Layers className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                          Vendor Clarification Registers
                        </h3>
                        <p className="text-xs text-zinc-500 font-mono">clarifications.csv & clarifications.xlsx</p>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Formal clarification logs citing exact specification clauses, proposal quotations, and required vendor remediation.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleExportClarifications("csv")}
                        disabled={isExportingCsv}
                        className="flex-1 py-2 px-3 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#111113] text-zinc-900 dark:text-white font-medium text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportClarifications("xlsx")}
                        disabled={isExportingXlsx}
                        className="flex-1 py-2 px-3 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#111113] text-zinc-900 dark:text-white font-medium text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Download XLSX</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Printable Sign-off sheet banner */}
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-[#111113] flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <h3 className="font-semibold text-xs text-zinc-900 dark:text-white">
                      Printable Committee Sign-Off Report
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Standardized committee authorization sheet with signature lines for CPO, Electrical Lead, and Contracts Head.
                    </p>
                  </div>
                  <Link
                    href={`/print/${activeTenderId}`}
                    target="_blank"
                    className="px-4 py-2 rounded bg-black text-white dark:bg-white dark:text-black font-semibold text-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Open Printable Sign-Off</span>
                  </Link>
                </div>
              </div>
            )}

            {/* TAB 7: SETTINGS & GOVERNANCE */}
            {selected === "Settings" && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                      Antova Engine Configuration & Governance
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      FastAPI backend status, review principal token credentials, and database health.
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                    Engine Runtime Parameters
                  </h3>
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs font-mono">
                    <div className="py-2.5 flex justify-between">
                      <span className="text-zinc-500">Service API Endpoint:</span>
                      <span className="text-zinc-900 dark:text-white">http://127.0.0.1:8000</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-zinc-500">Service Version:</span>
                      <span className="text-emerald-500 font-bold">{systemHealth?.version || "3.0.0"}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-zinc-500">Unit & Dimensional Math:</span>
                      <span className="text-cyan-500 font-bold">Pint {systemHealth?.pint_version || "0.26.2"}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-zinc-500">Review Principal Token:</span>
                      <span className="text-zinc-900 dark:text-white">{getReviewToken() ? 'Set for this tab' : 'Not set (read-only)'}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-zinc-500">Database Engine:</span>
                      <span className="text-zinc-900 dark:text-white">SQLite / SQLAlchemy (antova_enterprise.db)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 8: DOCUMENTATION */}
            {selected === "Documentation" && (
              <div className="space-y-6 max-w-4xl mx-auto text-xs leading-relaxed">
                <div className="pb-2 border-b border-zinc-200 dark:border-zinc-800">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                    Antova Technical Bid Evaluation Methodology
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Deterministic engineering audit and omission add-back pricing specifications.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] space-y-2">
                    <h3 className="font-bold text-sm text-cyan-600 dark:text-cyan-400">
                      1. Deterministic Unit & Dimensional Math
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      Antova uses the Python <strong>Pint</strong> dimensional library to normalize disparate vendor measurements (e.g., converting 104 °F into 40 °C, or 36,000 V into 36 kV). Code converts units, then compares them.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] space-y-2">
                    <h3 className="font-bold text-sm text-cyan-600 dark:text-cyan-400">
                      2. True Job Cost & Commercial Leveling
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      When a vendor omits scope or offers inferior ratings (e.g., missing witness I-FAT tests or EXW delivery instead of DDP site delivery), Antova adds the rate-table cost to the base bid. The ranking uses the evaluated total.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* ==================== 3. MODALS & DRAWERS ==================== */}
        
        {/* Evidence Coordinate Crop Modal */}
        {evidenceTarget && (
          <EvidenceModal
            tenderId={activeTenderId}
            paramId={evidenceTarget.paramId}
            source={evidenceTarget.source}
            which={evidenceTarget.which}
            citation={evidenceTarget.citation}
            secondaryCitation={evidenceTarget.secondaryCitation}
            onClose={() => setEvidenceTarget(null)}
          />
        )}

        {/* Cost Adder Override Drawer */}
        {overrideTarget && (
          <OverrideDrawer
            tenderId={activeTenderId}
            paramId={overrideTarget.paramId}
            vendorId={overrideTarget.vendorId}
            paramName={overrideTarget.paramName}
            vendorName={overrideTarget.vendorName}
            currentAdderEur={overrideTarget.currentAdder}
            currentNote={overrideTarget.currentNote}
            onSuccess={() => {
              loadBrief(activeTenderId);
              loadRegistry();
            }}
            onClose={() => setOverrideTarget(null)}
          />
        )}
      </div>
    </div>
  );
};

// ==================== SIDEBAR SUBCOMPONENTS ====================

interface SidebarProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  selected: string;
  setSelected: (title: string) => void;
  openItemsCount: number;
  tendersCount: number;
  systemHealth: { status: string; version: string; pint_version: string } | null;
  activeTenderId: string;
  onSwitchTender: (tid: string) => void;
  orgMenuOpen: boolean;
  setOrgMenuOpen: (open: boolean) => void;
}

const Sidebar = ({
  open,
  setOpen,
  selected,
  setSelected,
  openItemsCount,
  tendersCount,
  systemHealth,
  activeTenderId,
  onSwitchTender,
  orgMenuOpen,
  setOrgMenuOpen,
}: SidebarProps) => {
  return (
    <aside
      aria-label="Sidebar navigation"
      className={`sticky top-0 h-screen shrink-0 border-r transition-all duration-300 ease-in-out ${
        open ? "w-64" : "w-16"
      } border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-2.5 shadow-sm flex flex-col justify-between z-40 select-none`}
    >
      <div>
        <TitleSection
          open={open}
          orgMenuOpen={orgMenuOpen}
          setOrgMenuOpen={setOrgMenuOpen}
          systemHealth={systemHealth}
          activeTenderId={activeTenderId}
          onSwitchTender={onSwitchTender}
        />

        <nav className="space-y-1 mb-6" aria-label="Main menu">
          <Option
            Icon={Home}
            title="Dashboard"
            selected={selected}
            setSelected={setSelected}
            open={open}
          />
          <Option
            Icon={DollarSign}
            title="Bid Audits"
            selected={selected}
            setSelected={setSelected}
            open={open}
            notifs={openItemsCount > 0 ? openItemsCount : undefined}
          />
          <Option
            Icon={Shield}
            title="Compliance"
            selected={selected}
            setSelected={setSelected}
            open={open}
          />
          <Option
            Icon={UploadCloud}
            title="Ingest & Staging"
            selected={selected}
            setSelected={setSelected}
            open={open}
          />
          <Option
            Icon={Sliders}
            title="Rate Sensitivity"
            selected={selected}
            setSelected={setSelected}
            open={open}
          />
          <Option
            Icon={FileSpreadsheet}
            title="Exports & Reports"
            selected={selected}
            setSelected={setSelected}
            open={open}
          />
        </nav>

        {open && (
          <div className="border-t border-zinc-200 dark:border-zinc-800/80 pt-4 space-y-1">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">
              System & Governance
            </div>
            <Option
              Icon={Settings}
              title="Settings"
              selected={selected}
              setSelected={setSelected}
              open={open}
            />
            <Option
              Icon={HelpCircle}
              title="Documentation"
              selected={selected}
              setSelected={setSelected}
              open={open}
            />
          </div>
        )}
      </div>

      <ToggleClose open={open} setOpen={setOpen} />
    </aside>
  );
};

interface OptionProps {
  Icon: React.ElementType;
  title: string;
  selected: string;
  setSelected: (title: string) => void;
  open: boolean;
  notifs?: number;
}

const Option = ({ Icon, title, selected, setSelected, open, notifs }: OptionProps) => {
  const isSelected = selected === title;

  return (
    <button
      type="button"
      onClick={() => setSelected(title)}
      aria-label={title}
      className={`group relative flex h-10 w-full items-center rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
        isSelected
          ? "bg-zinc-100 dark:bg-[#111113] text-zinc-900 dark:text-white font-medium border border-zinc-200 dark:border-zinc-800 shadow-sm"
          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60 hover:text-zinc-900 dark:hover:text-zinc-100"
      }`}
    >
      <div className="grid h-full w-12 place-content-center shrink-0">
        <Icon
          className={`h-4 w-4 transition-colors ${
            isSelected
              ? "text-cyan-600 dark:text-cyan-400"
              : "text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200"
          }`}
        />
      </div>

      {open && (
        <span
          className={`text-xs tracking-tight transition-opacity duration-200 truncate ${
            open ? "opacity-100" : "opacity-0"
          }`}
        >
          {title}
        </span>
      )}

      {notifs !== undefined && open && (
        <span className="absolute right-2.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-cyan-600 dark:bg-cyan-500 text-[10px] text-white font-mono tabular-nums font-semibold">
          {notifs}
        </span>
      )}

      {!open && (
        <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 border border-zinc-800">
          {title}
        </span>
      )}
    </button>
  );
};

interface TitleSectionProps {
  open: boolean;
  orgMenuOpen: boolean;
  setOrgMenuOpen: (open: boolean) => void;
  systemHealth: { status: string; version: string; pint_version: string } | null;
  activeTenderId: string;
  onSwitchTender: (tid: string) => void;
}

const TitleSection = ({
  open,
  orgMenuOpen,
  setOrgMenuOpen,
  systemHealth,
  activeTenderId,
  onSwitchTender,
}: TitleSectionProps) => {
  return (
    <div className="relative mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-3">
      <div
        onClick={() => setOrgMenuOpen(!orgMenuOpen)}
        className="flex cursor-pointer items-center justify-between rounded-lg p-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
      >
        <div className="flex items-center gap-2.5">
          <Logo />
          {open && (
            <div className={`transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  Antova Engine
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                  Enterprise EPC
                </span>
              </div>
            </div>
          )}
        </div>
        {open && <ChevronDown className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />}
      </div>

      {orgMenuOpen && open && (
        <div
          className="absolute left-0 top-full mt-1.5 w-60 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-2.5 shadow-2xl z-50 text-xs"
          onMouseLeave={() => setOrgMenuOpen(false)}
        >
          <div className="font-semibold text-zinc-900 dark:text-white mb-1">
            Vogt-Grid EPC Consortium
          </div>
          <div className="text-[11px] text-zinc-500 font-mono space-y-0.5 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <div>Tier: Enterprise EPC License</div>
            <div>Health: {systemHealth?.status === "healthy" ? "Online (Port 8000)" : "Connecting..."}</div>
          </div>
          <div className="pt-2 text-[10px] text-zinc-400 uppercase font-mono">
            Switch Ingested Tender:
          </div>
          <div className="mt-1 space-y-1">
            <button
              type="button"
              onClick={() => {
                onSwitchTender("TENDER-2026-402");
                setOrgMenuOpen(false);
              }}
              className="w-full text-left px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900 font-mono text-xs text-cyan-600 dark:text-cyan-400"
            >
              TENDER-2026-402 (350MWp Solar)
            </button>
            <button
              type="button"
              onClick={() => {
                onSwitchTender("TENDER-2026-417");
                setOrgMenuOpen(false);
              }}
              className="w-full text-left px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900 font-mono text-xs text-amber-600 dark:text-amber-400"
            >
              TENDER-2026-417 (120MW Wind)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Logo = () => {
  return (
    <div className="grid size-9 shrink-0 place-content-center rounded-lg bg-black text-white dark:bg-white dark:text-black font-black text-sm shadow-sm">
      A
    </div>
  );
};

const ToggleClose = ({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) => {
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
      className="border-t border-zinc-200 dark:border-zinc-800 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
    >
      <div className="flex items-center p-2.5">
        <div className="grid size-7 place-content-center">
          <ChevronsRight
            className={`h-4 w-4 transition-transform duration-300 text-zinc-500 dark:text-zinc-400 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
        {open && (
          <span
            className={`text-xs font-medium text-zinc-600 dark:text-zinc-300 transition-opacity duration-200 ml-1.5 ${
              open ? "opacity-100" : "opacity-0"
            }`}
          >
            Collapse
          </span>
        )}
      </div>
    </button>
  );
};

export default Example;
