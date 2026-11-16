'use client';

import React, { useEffect, useState, useMemo, use, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AppShell } from '../../../components/layout/AppShell';
import { TrueJobCostTable } from '../../../components/TrueJobCostTable';
import { LineItemDrilldown } from '../../../components/LineItemDrilldown';
import { ComplianceMatrix } from '../../../components/ComplianceMatrix';
import { CommercialRiskTable } from '../../../components/CommercialRiskTable';
import { SensitivityPanel } from '../../../components/SensitivityPanel';
import { FindingsRegister } from '../../../components/FindingsRegister';
import { ProjectBaselineCard } from '../../../components/ProjectBaselineCard';
import { ReviewGateRail } from '../../../components/ReviewGateRail';
import { CellReviewPanel } from '../../../components/CellReviewPanel';
import { EvidenceModal } from '../../../components/EvidenceModal';
import { OverrideDrawer } from '../../../components/OverrideDrawer';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import {
  getTenderBrief,
  loadSampleBrief,
  evaluateTender,
  verifyTender,
  withdrawTender,
  downloadTbeExport,
  downloadClarificationsExport,
  ApiError,
  API_BASE,
} from '../../../lib/api';
import { Brief, Citation, RatesSettings, OpenItem } from '../../../lib/types';
import { formatEur } from '../../../lib/domain/money';
import {
  ShieldCheck,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  Loader2,
  Download,
  RefreshCw,
  Database,
  ExternalLink,
  Info,
} from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ tenderId: string }>;
}

function AuditWorkbenchPageContent({ params }: PageProps) {
  const resolvedParams = use(params);
  const tenderId = resolvedParams.tenderId;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active view tab synced with URL query (?tab=ledger|compliance|risks|findings|sensitivity|signoff|reports)
  const rawTab = (searchParams.get('tab') || 'ledger').toUpperCase();
  const activeTab: 'LEDGER' | 'COMPLIANCE' | 'RISKS' | 'FINDINGS' | 'SENSITIVITY' | 'SIGNOFF' | 'REPORTS' =
    ['LEDGER', 'COMPLIANCE', 'RISKS', 'FINDINGS', 'SENSITIVITY', 'SIGNOFF', 'REPORTS'].includes(rawTab)
      ? (rawTab as any)
      : 'LEDGER';

  const setActiveTab = (tab: 'LEDGER' | 'COMPLIANCE' | 'RISKS' | 'FINDINGS' | 'SENSITIVITY' | 'SIGNOFF' | 'REPORTS') => {
    router.push(`/audit/${tenderId}?tab=${tab.toLowerCase()}`);
  };

  // Selected vendor for side-by-side inspector
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  // Rate sensitivity state
  const [hasCustomRates, setHasCustomRates] = useState(false);
  const [currentRates, setCurrentRates] = useState<RatesSettings>({
    copper_multiplier: 1.0,
    site_labor_rate: 60,
    freight_multiplier: 1.0,
  });

  // Evidence modal state
  const [evidenceTarget, setEvidenceTarget] = useState<{
    paramId: string;
    source: string;
    which: 'primary' | 'secondary';
    citation?: Citation | null;
    secondaryCitation?: Citation | null;
  } | null>(null);

  // Cell Review panel state (Defect D2)
  const [cellReviewTarget, setCellReviewTarget] = useState<{
    paramId: string;
    vendorId: string;
    initialAction?: 'approve' | 'override' | 'reject';
  } | null>(null);

  // Override drawer state
  const [overrideTarget, setOverrideTarget] = useState<{
    vendorId: string;
    paramId: string;
    paramName?: string;
    vendorName?: string;
    currentAdder?: number;
    currentNote?: string | null;
  } | null>(null);

  // Feedback & export loading states
  const [evaluating, setEvaluating] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyBlockerMsg, setVerifyBlockerMsg] = useState<string | null>(null);
  const [runChanged, setRunChanged] = useState(false);
  const [isExportingTbe, setIsExportingTbe] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);

  const fetchBrief = async () => {
    try {
      setLoading(true);
      setError(null);
      setRunChanged(false);
      setVerifyBlockerMsg(null);
      const data = await getTenderBrief(tenderId);
      setBrief(data);
      if (data.tender?.vendors?.length > 0) {
        setSelectedVendorId((prev) => prev || data.tender.vendors[0].id);
      }
    } catch (err: any) {
      console.warn(`Error fetching brief for ${tenderId}:`, err);
      try {
        const sample = loadSampleBrief();
        setBrief(sample);
        if (sample.tender?.vendors?.length > 0) {
          setSelectedVendorId((prev) => prev || sample.tender.vendors[0].id);
        }
        setActionMsg('Showing the saved sample for TENDER-2026-402 (offline mode).');
      } catch {
        setError(err.message || "Couldn't load this tender.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoadOfflineSample = () => {
    try {
      const sample = loadSampleBrief();
      setBrief(sample);
      if (sample.tender?.vendors?.length > 0) {
        setSelectedVendorId(sample.tender.vendors[0].id);
      }
      setError(null);
      setActionMsg('Showing the saved sample for TENDER-2026-402.');
      setTimeout(() => setActionMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to load sample brief:', err);
      setError("Couldn't load the saved sample.");
    }
  };

  useEffect(() => {
    fetchBrief();
  }, [tenderId]);

  const handleSensitivityEvaluate = async (rates: RatesSettings) => {
    if (!brief) return;
    try {
      setEvaluating(true);
      const res = await evaluateTender(tenderId, rates);
      setBrief({
        ...brief,
        financials: res.financials,
      });
      setCurrentRates(rates);
      setHasCustomRates(
        rates.copper_multiplier !== 1.0 ||
        rates.freight_multiplier !== 1.0 ||
        (rates.site_labor_rate !== undefined && rates.site_labor_rate !== 60)
      );
      setActionMsg('Totals updated with the new rates.');
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      console.error('Sensitivity evaluation error:', err);
      setActionMsg(err.message || "Couldn't update the totals. Try again.");
      setTimeout(() => setActionMsg(null), 3500);
    } finally {
      setEvaluating(false);
    }
  };

  const handleVerify = async () => {
    if (!brief) return;
    try {
      setError(null);
      setVerifyBlockerMsg(null);
      setIsVerifying(true);
      setActionMsg('Signing off...');
      await verifyTender(tenderId, brief.ingest_stats?.run_id);
      setActionMsg('Signed off. Exports are now available.');
      await fetchBrief();
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      setActionMsg(null);
      // Defect D6: Typed ApiError handling
      if (err.open_items && err.open_items.length > 0) {
        setVerifyBlockerMsg(
          `Can't sign off yet: ${err.open_items.length} open ${err.open_items.length === 1 ? 'item' : 'items'} to resolve.`
        );
      } else if (err.code === 'run_changed') {
        setRunChanged(true);
        setVerifyBlockerMsg(
          'This tender changed after you opened it. Reload to see the new numbers.'
        );
      } else {
        setError(err.message || "Couldn't sign off. Resolve the open items first.");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleWithdraw = async () => {
    try {
      setError(null);
      setActionMsg('Reopening for edits...');
      await withdrawTender(tenderId);
      setActionMsg('Reopened. You can change decisions and amounts.');
      await fetchBrief();
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      setActionMsg(null);
      setError(err.message || "Couldn't reopen. Try again.");
    }
  };

  const handleExportTbeWorkbook = async () => {
    try {
      setIsExportingTbe(true);
      await downloadTbeExport(tenderId);
      setActionMsg('Bid evaluation workbook downloaded.');
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExportingTbe(false);
    }
  };

  const handleExportClarifications = async (format: 'csv' | 'xlsx') => {
    try {
      if (format === 'csv') setIsExportingCsv(true);
      if (format === 'xlsx') setIsExportingXlsx(true);
      await downloadClarificationsExport(tenderId, format);
      setActionMsg('Clarification list downloaded.');
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExportingCsv(false);
      setIsExportingXlsx(false);
    }
  };

  // Safe data views
  const safeVendors = Array.isArray(brief?.tender?.vendors) ? brief!.tender.vendors : [];
  const safeParameters = Array.isArray(brief?.tender?.parameters) ? brief!.tender.parameters : [];
  const safeFinancials = Array.isArray(brief?.financials) ? brief!.financials : [];
  const safeOpenItems = Array.isArray(brief?.open_items) ? brief!.open_items : [];
  const safeDocuments = Array.isArray(brief?.documents) ? brief!.documents : [];

  // Reconciled rank calculation
  const rankedFinancials = useMemo(() => {
    const list = [...safeFinancials];
    list.sort((a, b) => {
      if (a.true_evaluated_price === null) return 1;
      if (b.true_evaluated_price === null) return -1;
      return a.true_evaluated_price - b.true_evaluated_price;
    });
    return list;
  }, [safeFinancials]);

  const recommendedVendor = rankedFinancials[0] || null;

  // Selected vendor financial details
  const selectedFinancials = useMemo(() => {
    if (!selectedVendorId) return rankedFinancials[0] || null;
    return safeFinancials.find((f) => f.vendor_id === selectedVendorId) || rankedFinancials[0] || null;
  }, [safeFinancials, selectedVendorId, rankedFinancials]);

  const isVerified = brief?.status === 'VERIFIED';
  const isReplayMode = brief?._source === 'replay';

  return (
    <AppShell
      activeTenderId={tenderId}
      brief={brief}
      onRefresh={fetchBrief}
      isRefreshing={loading}
      onVerify={handleVerify}
      onWithdraw={handleWithdraw}
      actionNotice={actionMsg}
      errorNotice={error}
      onClearNotice={() => {
        setActionMsg(null);
        setError(null);
      }}
    >
      {loading ? (
        <AuditWorkbenchSkeleton tenderId={tenderId} />
      ) : brief ? (
        <div className="space-y-4 font-sans text-xs">
          {/* Transparent Replay Mode Banner (Defect D4) */}
          {isReplayMode && (
            <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Sample data, read-only.</strong> You are viewing a saved copy of {brief.tender?.id}. Decisions and amount changes need a live connection.
                </span>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/60 font-bold uppercase tracking-wider">
                Saved sample
              </span>
            </div>
          )}

          {/* Run Changed Banner with 1-click Reload (Defect D6) */}
          {runChanged && (
            <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  <strong>Newer data available.</strong> This tender was processed again after you opened it.
                </span>
              </div>
              <button
                type="button"
                onClick={fetchBrief}
                className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload</span>
              </button>
            </div>
          )}

          {/* Executive Tender Summary Banner */}
          <div className="p-4 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] flex flex-wrap items-center justify-between gap-4 shadow-2xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs font-bold text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded tracking-wide">
                  {brief.tender?.id || tenderId}
                </span>
                <span className="text-[#767067] dark:text-[#A39A8D]">·</span>
                <h1 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">
                  {brief.tender?.title || 'Bid evaluation'}
                </h1>
                <span className="text-[#767067] dark:text-[#A39A8D]">·</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border ${
                    isVerified
                      ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200'
                      : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {isVerified ? 'Signed off' : 'Draft'}
                </span>
              </div>
              <p className="text-xs text-[#767067] dark:text-[#A39A8D]">
                Client: <strong className="text-zinc-900 dark:text-zinc-100">{brief.tender?.client || 'Vogt-Grid EPC'}</strong> · Spec: <span className="font-mono text-zinc-800 dark:text-zinc-300">{brief.tender?.mr_doc || 'MR-33kV-GIS-Rev4.pdf'}</span> ({brief.tender?.pages_parsed || 26} pages read)
              </p>
            </div>

            {/* Top-Right Quick Links */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportTbeWorkbook}
                disabled={isExportingTbe}
                className="px-3 py-1.5 bg-[#FFFFFF] dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
              >
                {isExportingTbe ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
                )}
                <span>Download workbook (.xlsx)</span>
              </button>

              {brief.share_id && (
                <Link
                  href={`/b/${brief.share_id}`}
                  target="_blank"
                  className="px-3 py-1.5 bg-[#FFFFFF] dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Shareable brief</span>
                </Link>
              )}

              <Link
                href={`/print?tender=${tenderId}`}
                target="_blank"
                className="px-3 py-1.5 bg-[#FFFFFF] dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5 text-zinc-500" />
                <span>Print</span>
              </Link>
            </div>
          </div>

          {/* Key Executive KPI Metrics Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] shadow-2xs">
              <span className="text-[10px] text-[#767067] dark:text-[#A39A8D] uppercase tracking-wider font-semibold">
                Bids compared
              </span>
              <div className="text-xl font-bold text-zinc-900 dark:text-white font-mono mt-0.5">
                {safeVendors.length} bids
              </div>
              <span className="text-[11px] text-[#767067] dark:text-[#A39A8D] mt-0.5 block">
                {safeDocuments.length} documents read
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] shadow-2xs">
              <span className="text-[10px] text-[#767067] dark:text-[#A39A8D] uppercase tracking-wider font-semibold">
                Requirements checked
              </span>
              <div className="text-xl font-bold text-zinc-900 dark:text-white font-mono mt-0.5">
                {safeParameters.length} requirements
              </div>
              <span className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-0.5 block font-medium">
                Units converted and checked by code
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] shadow-2xs">
              <span className="text-[10px] text-[#767067] dark:text-[#A39A8D] uppercase tracking-wider font-semibold">
                Recommended award
              </span>
              <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100 font-mono mt-0.5 truncate">
                {recommendedVendor?.name || 'Not decided'}
              </div>
              <span className="text-[11px] text-zinc-700 dark:text-zinc-300 font-mono mt-0.5 block">
                Evaluated total: {formatEur(recommendedVendor?.true_evaluated_price)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] shadow-2xs">
              <span className="text-[10px] text-[#767067] dark:text-[#A39A8D] uppercase tracking-wider font-semibold">
                Open items
              </span>
              <div
                className={`text-xl font-bold font-mono mt-0.5 ${
                  safeOpenItems.length > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-zinc-800 dark:text-zinc-200'
                }`}
              >
                {safeOpenItems.length} open
              </div>
              <span className="text-[11px] text-[#767067] dark:text-[#A39A8D] mt-0.5 block">
                {safeOpenItems.length === 0 ? 'Ready to sign off' : 'Needs your review'}
              </span>
            </div>
          </div>

          {/* Review Gate Rail (Section 4 P1) */}
          <ReviewGateRail
            openItems={safeOpenItems}
            review={brief.review}
            isVerified={isVerified}
            onSelectOpenItem={(item) => {
              if (item.param_id) {
                setCellReviewTarget({
                  paramId: item.param_id,
                  vendorId: item.vendor_id === '-' ? safeVendors[0]?.id || '' : item.vendor_id,
                });
              }
            }}
            onVerify={handleVerify}
            isVerifying={isVerifying}
            blockingMessage={verifyBlockerMsg}
          />

          {/* Project Baseline Card if project constraints exist */}
          {brief.tender?.project && Object.keys(brief.tender.project).length > 0 && (
            <ProjectBaselineCard
              tenderId={tenderId}
              project={brief.tender.project}
              isVerified={isVerified}
              onRefresh={fetchBrief}
            />
          )}

          {/* Workbench Evaluation Tabs */}
          <div className="border-b border-[#D9D4CC] dark:border-[#7A7266] flex items-center justify-between text-xs overflow-x-auto">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('LEDGER')}
                className={`px-3.5 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'LEDGER'
                    ? 'border-zinc-950 dark:border-white text-zinc-950 dark:text-white font-semibold'
                    : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <span>Evaluated totals</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                  {safeFinancials.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('COMPLIANCE')}
                className={`px-3.5 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'COMPLIANCE'
                    ? 'border-zinc-950 dark:border-white text-zinc-950 dark:text-white font-semibold'
                    : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <span>Requirements check</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                  {safeParameters.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('RISKS')}
                className={`px-3.5 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'RISKS'
                    ? 'border-zinc-950 dark:border-white text-zinc-950 dark:text-white font-semibold'
                    : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <span>Commercial terms</span>
              </button>

              <button
                onClick={() => setActiveTab('FINDINGS')}
                className={`px-3.5 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'FINDINGS'
                    ? 'border-zinc-950 dark:border-white text-zinc-950 dark:text-white font-semibold'
                    : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <span>Findings</span>
              </button>

              <button
                onClick={() => setActiveTab('SENSITIVITY')}
                className={`px-3.5 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'SENSITIVITY'
                    ? 'border-zinc-950 dark:border-white text-zinc-950 dark:text-white font-semibold'
                    : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <span>Rate scenarios</span>
                {hasCustomRates && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                )}
              </button>

              <button
                onClick={() => setActiveTab('SIGNOFF')}
                className={`px-3.5 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'SIGNOFF'
                    ? 'border-zinc-950 dark:border-white text-zinc-950 dark:text-white font-semibold'
                    : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <span>Sign-off and clarifications</span>
                {safeOpenItems.length > 0 && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300">
                    {safeOpenItems.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('REPORTS')}
                className={`px-3.5 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'REPORTS'
                    ? 'border-zinc-950 dark:border-white text-zinc-950 dark:text-white font-semibold'
                    : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <span>Downloads</span>
              </button>
            </div>

            {/* Vendor Selector Pill when Drilldown is displayed in Ledger view */}
            {activeTab === 'LEDGER' && selectedVendorId && (
              <div className="hidden sm:flex items-center gap-2 text-xs">
                <span className="text-[#767067] dark:text-[#A39A8D]">Line items:</span>
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 px-2 py-1 rounded text-xs font-mono outline-none cursor-pointer shadow-2xs"
                  aria-label="Select a bidder to see its line items"
                >
                  {safeVendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.country})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Workbench Tab Content Protected by ErrorBoundary */}
          <ErrorBoundary fallbackTitle="This tab couldn't load.">
            {activeTab === 'LEDGER' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                {/* Main Evaluated Cost Ledger Table */}
                <div className={selectedFinancials ? 'xl:col-span-7' : 'xl:col-span-12'}>
                  <TrueJobCostTable
                    financials={safeFinancials}
                    vendors={safeVendors}
                    onSelectVendor={(vId) => setSelectedVendorId(vId)}
                    onOpenOverride={(vendorId, paramId) => {
                      if (paramId) {
                        setCellReviewTarget({ vendorId, paramId, initialAction: 'override' });
                      } else {
                        // Open bidder's line-item panel instead (Decision 2)
                        setSelectedVendorId(vendorId);
                      }
                    }}
                    selectedVendorId={selectedVendorId}
                  />
                </div>

                {/* Side-by-Side Line Item Drilldown Inspector */}
                {selectedFinancials && (
                  <div className="xl:col-span-5 sticky top-20">
                    <LineItemDrilldown
                      vendorId={selectedFinancials.vendor_id}
                      financials={selectedFinancials}
                      parameters={safeParameters}
                      onClose={() => setSelectedVendorId(null)}
                      onOpenEvidence={(paramId, which) => {
                        const param = safeParameters.find((p) => p.id === paramId);
                        const ext = param?.vendors?.[selectedFinancials.vendor_id];
                        setEvidenceTarget({
                          paramId,
                          source: selectedFinancials.vendor_id,
                          which,
                          citation: ext?.citation,
                          secondaryCitation: ext?.secondary_citation,
                        });
                      }}
                      onOpenOverride={(paramId) => {
                        setCellReviewTarget({
                          vendorId: selectedFinancials.vendor_id,
                          paramId,
                          initialAction: 'override',
                        });
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'COMPLIANCE' && (
              <ComplianceMatrix
                parameters={safeParameters}
                vendors={safeVendors}
                onOpenEvidence={(paramId, vendorId, which) => {
                  const param = safeParameters.find((p) => p.id === paramId);
                  const ext = param?.vendors?.[vendorId];
                  setEvidenceTarget({
                    paramId,
                    source: vendorId,
                    which,
                    citation: ext?.citation,
                    secondaryCitation: ext?.secondary_citation,
                  });
                }}
                onOpenOverride={(vendorId, paramId) => {
                  setCellReviewTarget({ vendorId, paramId });
                }}
                onOpenReview={(vendorId, paramId) => {
                  setCellReviewTarget({ vendorId, paramId });
                }}
              />
            )}

            {activeTab === 'RISKS' && (
              <CommercialRiskTable
                parameters={safeParameters}
                vendors={safeVendors}
                financials={safeFinancials}
              />
            )}

            {activeTab === 'FINDINGS' && (
              <FindingsRegister
                findings={brief.tender?.findings}
                vendors={safeVendors}
                parameters={safeParameters}
                onOpenEvidence={(paramId, which, citation) => {
                  setEvidenceTarget({
                    paramId,
                    source: safeVendors[0]?.id || '',
                    which,
                    citation,
                  });
                }}
              />
            )}

            {activeTab === 'SENSITIVITY' && (
              <SensitivityPanel
                onEvaluate={handleSensitivityEvaluate}
                isLoading={evaluating}
                currentRates={currentRates}
                financials={safeFinancials}
                vendors={safeVendors}
                parameters={safeParameters}
              />
            )}

            {activeTab === 'SIGNOFF' && (
              <div className="border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] rounded-xl p-5 space-y-5 text-xs shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D9D4CC] dark:border-[#7A7266] pb-4">
                  <div>
                    <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-zinc-800 dark:text-zinc-200" />
                      <span>Sign-off and clarifications</span>
                    </h2>
                    <p className="text-xs text-[#767067] dark:text-[#A39A8D] mt-1">
                      Resolve open items, then download the workbook or print the sign-off sheet.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/print?tender=${tenderId}`}
                      target="_blank"
                      className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs"
                    >
                      <Printer className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Print sign-off sheet</span>
                    </Link>

                    <button
                      onClick={handleExportTbeWorkbook}
                      disabled={isExportingTbe}
                      className="px-3.5 py-1.5 bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold rounded-md text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-2xs"
                    >
                      {isExportingTbe ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Preparing download...</span>
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700" />
                          <span>Download workbook (.xlsx)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Open Items Clearance */}
                <div className="p-4 rounded-lg bg-[#FAF8F5] dark:bg-[#141210] border border-[#D9D4CC] dark:border-[#7A7266] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Open items ({safeOpenItems.length})
                    </span>
                    {safeOpenItems.length === 0 ? (
                      <span className="text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Ready to sign off
                      </span>
                    ) : (
                      <span className="text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Resolve before sign-off
                      </span>
                    )}
                  </div>

                  {safeOpenItems.length > 0 ? (
                    <div className="divide-y divide-[#D9D4CC] dark:divide-[#7A7266]/40 border border-[#D9D4CC] dark:border-[#7A7266] rounded-md max-h-64 overflow-y-auto bg-white dark:bg-[#1C1916]">
                      {safeOpenItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="px-3.5 py-2.5 text-xs flex items-center justify-between gap-3 hover:bg-[#FAF8F5] dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 font-mono text-[11px]">
                              <span className="text-amber-800 dark:text-amber-300 font-bold uppercase">
                                {item.kind}
                              </span>
                              <span className="text-zinc-400">·</span>
                              <span className="text-zinc-700 dark:text-zinc-300">
                                {item.vendor_id} {item.param_id ? `(${item.param_id})` : ''}
                              </span>
                            </div>
                            <div className="text-zinc-600 dark:text-zinc-400">{item.message}</div>
                          </div>
                          {item.param_id && (
                            <button
                              onClick={() => {
                                setCellReviewTarget({
                                  vendorId: item.vendor_id === '-' ? safeVendors[0]?.id || '' : item.vendor_id,
                                  paramId: item.param_id!,
                                });
                              }}
                              className="px-2.5 py-1 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded text-xs font-medium shrink-0 transition-colors shadow-2xs"
                              aria-label={`Review ${item.vendor_id}, ${item.param_id}`}
                            >
                              Review
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#767067] dark:text-[#A39A8D]">
                      No open items. Every gap has a price or a decision.
                    </p>
                  )}
                </div>

                {/* Clarifications Register Exports */}
                <div className="p-4 rounded-lg bg-[#FAF8F5] dark:bg-[#141210] border border-[#D9D4CC] dark:border-[#7A7266] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wide">
                      Clarification questions for bidders
                    </h3>
                    <p className="text-xs text-[#767067] dark:text-[#A39A8D] mt-0.5">
                      One question per gap, with the spec page and the bidder's quote.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleExportClarifications('csv')}
                      disabled={isExportingCsv}
                      className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
                    >
                      {isExportingCsv ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      <span>Download CSV</span>
                    </button>
                    <button
                      onClick={() => handleExportClarifications('xlsx')}
                      disabled={isExportingXlsx}
                      className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
                    >
                      {isExportingXlsx ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      <span>Download Excel</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'REPORTS' && (
              <div className="border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] rounded-xl p-6 space-y-6 text-xs shadow-2xs">
                <div>
                  <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                    Downloads
                  </h2>
                  <p className="text-xs text-[#767067] dark:text-[#A39A8D] mt-0.5">
                    Files for {tenderId}. Available after sign-off.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Export 1: TBE (.xlsx) */}
                  <div className="p-4 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FAF8F5] dark:bg-[#141210] space-y-3">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
                      <div className="font-bold text-zinc-900 dark:text-white text-xs">
                        Bid evaluation workbook (.xlsx)
                      </div>
                    </div>
                    <p className="text-[11px] text-[#767067] dark:text-[#A39A8D] leading-relaxed">
                      Rankings, evaluated totals and every cost adjustment with its formula.
                    </p>
                    <button
                      onClick={handleExportTbeWorkbook}
                      disabled={isExportingTbe}
                      className="w-full py-2 bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold rounded-md text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-800 dark:hover:bg-white transition-colors shadow-2xs disabled:opacity-50"
                    >
                      {isExportingTbe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      <span>Download workbook</span>
                    </button>
                  </div>

                  {/* Export 2: Clarification Register (.xlsx) */}
                  <div className="p-4 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FAF8F5] dark:bg-[#141210] space-y-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
                      <div className="font-bold text-zinc-900 dark:text-white text-xs">
                        Clarification questions (.xlsx)
                      </div>
                    </div>
                    <p className="text-[11px] text-[#767067] dark:text-[#A39A8D] leading-relaxed">
                      One question per gap, ready to send to each bidder.
                    </p>
                    <button
                      onClick={() => handleExportClarifications('xlsx')}
                      disabled={isExportingXlsx}
                      className="w-full py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold rounded-md text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs disabled:opacity-50"
                    >
                      {isExportingXlsx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      <span>Download questions (.xlsx)</span>
                    </button>
                  </div>

                  {/* Export 3: Print Executive Summary */}
                  <div className="p-4 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FAF8F5] dark:bg-[#141210] space-y-3">
                    <div className="flex items-center gap-2">
                      <Printer className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
                      <div className="font-bold text-zinc-900 dark:text-white text-xs">
                        Sign-off sheet
                      </div>
                    </div>
                    <p className="text-[11px] text-[#767067] dark:text-[#A39A8D] leading-relaxed">
                      A printable summary with signature lines for the award committee.
                    </p>
                    <Link
                      href={`/print?tender=${tenderId}`}
                      target="_blank"
                      className="w-full py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold rounded-md text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Open sign-off sheet</span>
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </ErrorBoundary>

          {/* Two-Pane Evidence Inspector */}
          {evidenceTarget && (
            <EvidenceModal
              tenderId={tenderId}
              paramId={evidenceTarget.paramId}
              source={evidenceTarget.source}
              which={evidenceTarget.which}
              citation={evidenceTarget.citation}
              secondaryCitation={evidenceTarget.secondaryCitation}
              onClose={() => setEvidenceTarget(null)}
            />
          )}

          {/* Cell Review Slide-Over Panel (Defect D2) */}
          {cellReviewTarget && (
            <CellReviewPanel
              isOpen={Boolean(cellReviewTarget)}
              onClose={() => setCellReviewTarget(null)}
              tenderId={tenderId}
              paramId={cellReviewTarget.paramId}
              initialAction={cellReviewTarget.initialAction}
              paramName={safeParameters.find((p) => p.id === cellReviewTarget.paramId)?.name || cellReviewTarget.paramId}
              mrRequirement={safeParameters.find((p) => p.id === cellReviewTarget.paramId)?.mr_requirement || ''}
              vendorId={cellReviewTarget.vendorId}
              vendorName={safeVendors.find((v) => v.id === cellReviewTarget.vendorId)?.name || cellReviewTarget.vendorId}
              extraction={safeParameters.find((p) => p.id === cellReviewTarget.paramId)?.vendors?.[cellReviewTarget.vendorId] || null}
              currentAdder={
                safeFinancials
                  .find((f) => f.vendor_id === cellReviewTarget.vendorId)
                  ?.itemized_breakdown.find((b) => b.param_id === cellReviewTarget.paramId)?.adder_eur ?? null
              }
              currentNote={
                safeFinancials
                  .find((f) => f.vendor_id === cellReviewTarget.vendorId)
                  ?.itemized_breakdown.find((b) => b.param_id === cellReviewTarget.paramId)?.override_note ?? null
              }
              isOverridden={Boolean(
                safeFinancials
                  .find((f) => f.vendor_id === cellReviewTarget.vendorId)
                  ?.itemized_breakdown.find((b) => b.param_id === cellReviewTarget.paramId)?.is_overridden
              )}
              isVerified={isVerified}
              onDecisionSuccess={() => {
                fetchBrief();
                setActionMsg('Decision saved.');
                setTimeout(() => setActionMsg(null), 3500);
              }}
              onOpenEvidence={(paramId, which) => {
                const ext = safeParameters.find((p) => p.id === paramId)?.vendors?.[cellReviewTarget.vendorId];
                setEvidenceTarget({
                  paramId,
                  source: cellReviewTarget.vendorId,
                  which,
                  citation: ext?.citation,
                  secondaryCitation: ext?.secondary_citation,
                });
              }}
            />
          )}

          {/* Override Drawer */}
          {overrideTarget && (
            <OverrideDrawer
              tenderId={tenderId}
              paramId={overrideTarget.paramId}
              vendorId={overrideTarget.vendorId}
              paramName={overrideTarget.paramName}
              vendorName={overrideTarget.vendorName}
              currentAdderEur={overrideTarget.currentAdder}
              currentNote={overrideTarget.currentNote}
              onSuccess={fetchBrief}
              onClose={() => setOverrideTarget(null)}
            />
          )}
        </div>
      ) : (
        /* Actionable Backend Offline / Error Card when brief is null (Defect D5) */
        <div className="p-6 max-w-4xl w-full mx-auto font-sans">
          <div className="w-full p-6 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-white dark:bg-[#1C1916] space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#D9D4CC] dark:border-[#7A7266] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    Can't load this tender
                  </h2>
                  <p className="text-xs text-[#767067] dark:text-[#A39A8D] mt-0.5">
                    Target: <code className="text-zinc-700 dark:text-zinc-300 font-mono">{API_BASE ? `${API_BASE}/api/review/tenders/${tenderId}` : `/api/review/tenders/${tenderId}`}</code>
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-rose-950/60 border border-rose-900 text-rose-300 font-bold">
                Server not responding
              </span>
            </div>

            <div className="p-3.5 rounded bg-[#FAF8F5] dark:bg-[#141210] border border-[#D9D4CC] dark:border-[#7A7266] text-xs text-zinc-700 dark:text-zinc-300 space-y-2">
              <div className="text-rose-600 dark:text-rose-400 font-medium">Diagnostic Error:</div>
              <p className="font-mono text-[11px] text-[#767067] dark:text-[#A39A8D] break-all">
                {error || "The server didn't respond. It may be starting up. Try again in a minute."}
              </p>
              <details className="pt-2 text-[11px] text-[#767067] dark:text-[#A39A8D] border-t border-[#D9D4CC] dark:border-[#7A7266]">
                <summary className="cursor-pointer hover:underline">Technical details</summary>
                <div className="mt-1">
                  Ensure <code className="text-zinc-900 dark:text-zinc-100 font-mono">NEXT_PUBLIC_API_URL</code> is set in Vercel project environment variables pointing to your hosted <code className="text-zinc-900 dark:text-zinc-100 font-mono">antova-yc</code> backend instance, and CORS is enabled for your Vercel domain.
                </div>
              </details>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchBrief}
                  className="px-4 py-2 bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold rounded text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try again</span>
                </button>
                <button
                  onClick={handleLoadOfflineSample}
                  className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold rounded text-xs flex items-center gap-1.5 transition-colors shadow-2xs hover:bg-zinc-50"
                >
                  <Database className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Open the sample tender</span>
                </button>
              </div>

              <Link
                href="/ingest"
                className="px-3.5 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:white rounded text-xs transition-colors"
              >
                Upload a new tender
              </Link>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function AuditWorkbenchSkeleton({ tenderId }: { tenderId: string }) {
  return (
    <div className="space-y-4 font-sans animate-pulse" aria-busy="true" aria-label="Loading tender...">
      <div className="p-4 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
              {tenderId}
            </span>
            <div className="h-4 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
          </div>
          <div className="h-3 w-72 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          <div className="h-8 w-24 bg-zinc-100 dark:bg-zinc-800 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-3.5 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] shadow-2xs space-y-2"
          >
            <div className="h-3 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-3 w-40 bg-zinc-100 dark:bg-zinc-800/60 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuditWorkbenchPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] dark:bg-[#141210] text-zinc-500 font-sans text-xs">
          Loading tender...
        </div>
      }
    >
      <AuditWorkbenchPageContent {...props} />
    </Suspense>
  );
}
