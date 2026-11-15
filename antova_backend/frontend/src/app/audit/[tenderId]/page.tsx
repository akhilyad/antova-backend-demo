'use client';

import React, { useEffect, useState, useMemo, use } from 'react';
import { Header } from '../../../components/Header';
import { TrueJobCostTable } from '../../../components/TrueJobCostTable';
import { LineItemDrilldown } from '../../../components/LineItemDrilldown';
import { ComplianceMatrix } from '../../../components/ComplianceMatrix';
import { CommercialRiskTable } from '../../../components/CommercialRiskTable';
import { SensitivityPanel } from '../../../components/SensitivityPanel';
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
  API_BASE,
} from '../../../lib/api';
import { Brief, Citation, RatesSettings } from '../../../lib/types';
import { formatIsoDate, formatEur } from '../../../lib/formatting';
import {
  ShieldCheck,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Check,
  FileSpreadsheet,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
  FileText,
  AlertCircle,
  Loader2,
  Download,
  RefreshCw,
  Database,
} from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ tenderId: string }>;
}

export default function AuditWorkbenchPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const tenderId = resolvedParams.tenderId;

  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'LEDGER' | 'COMPLIANCE' | 'RISKS' | 'SIGNOFF'>('LEDGER');

  // Selected vendor for side-by-side inspector
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  // Collapsible sensitivity toolbar & inline unlock confirmation
  const [showSensitivity, setShowSensitivity] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [hasCustomRates, setHasCustomRates] = useState(false);

  // Evidence modal state
  const [evidenceTarget, setEvidenceTarget] = useState<{
    paramId: string;
    source: string;
    which: 'primary' | 'secondary';
    citation?: Citation | null;
    secondaryCitation?: Citation | null;
  } | null>(null);

  // Override modal state
  const [overrideTarget, setOverrideTarget] = useState<{
    vendorId: string;
    paramId: string;
    paramName?: string;
    vendorName?: string;
    currentAdder?: number;
    currentNote?: string | null;
  } | null>(null);

  // Sensitivity & toast state
  const [evaluating, setEvaluating] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [isExportingTbe, setIsExportingTbe] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);

  const fetchBrief = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getTenderBrief(tenderId);
      setBrief(data);
      if (data.tender?.vendors?.length > 0) {
        setSelectedVendorId((prev) => prev || data.tender.vendors[0].id);
      }
    } catch (err: any) {
      console.error(`Error fetching brief for ${tenderId}:`, err);
      // If backend returns 500 or is unreachable and tender is 402, auto-recover with verified local package
      if (tenderId === 'TENDER-2026-402' || tenderId.includes('402')) {
        try {
          const sample = loadSampleBrief();
          setBrief(sample);
          if (sample.tender?.vendors?.length > 0) {
            setSelectedVendorId((prev) => prev || sample.tender.vendors[0].id);
          }
          setError(
            `Backend engine error (${err.message}). Displaying verified offline package for ${tenderId}. Interactive audit features remain active.`
          );
        } catch {
          setError(err.message || 'Failed to fetch tender audit brief from backend engine');
        }
      } else {
        setError(err.message || 'Failed to fetch tender audit brief from backend engine');
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
      setActionMsg('Loaded offline verified package for TENDER-2026-402');
      setTimeout(() => setActionMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to load sample brief:', err);
      setError('Failed to load local offline package');
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
      setHasCustomRates(
        rates.copper_multiplier !== 1.0 ||
        rates.freight_multiplier !== 1.0 ||
        (rates.site_labor_rate !== undefined && rates.site_labor_rate !== 60)
      );
    } catch (err: any) {
      console.error('Sensitivity evaluation error:', err);
      setActionMsg('Sensitivity calculation failed');
      setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setEvaluating(false);
    }
  };

  const handleVerify = async () => {
    if (!brief) return;
    try {
      setError(null);
      setActionMsg('Sealing audit brief...');
      await verifyTender(tenderId, brief.ingest_stats?.run_id);
      setActionMsg('Audit brief verified and sealed for award.');
      await fetchBrief();
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      setActionMsg(null);
      setError(err.message || 'Verification failed. Resolve open items first.');
    }
  };

  const handleWithdraw = async () => {
    try {
      setConfirmUnlock(false);
      setError(null);
      setActionMsg('Unlocking audit brief...');
      await withdrawTender(tenderId);
      setActionMsg('Brief unlocked. Changes and overrides permitted.');
      await fetchBrief();
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      setActionMsg(null);
      setError(err.message || 'Failed to unlock brief.');
    }
  };

  const handleExportTbeWorkbook = async () => {
    try {
      setIsExportingTbe(true);
      await downloadTbeExport(tenderId);
      setActionMsg('TBE workbook (.xlsx) downloaded successfully.');
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
      setActionMsg(`Clarification register (.${format}) downloaded.`);
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

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-zinc-800">
      <Header tenderId={tenderId} status={brief?.status} />

      {/* Action Notification Toast Banner */}
      {actionMsg && (
        <div className="bg-emerald-950/80 border-b border-emerald-900 px-4 py-2 text-xs text-emerald-300 flex items-center justify-between transition-all">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionMsg}</span>
          </div>
          <button onClick={() => setActionMsg(null)} className="text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-950/40 border-b border-rose-900/60 px-4 py-2.5 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchBrief}
              className="px-2 py-0.5 rounded bg-rose-900/40 hover:bg-rose-900/70 border border-rose-800 text-rose-200 text-[11px] font-medium"
            >
              Retry
            </button>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-zinc-400 gap-3 font-sans">
          <Loader2 className="w-7 h-7 animate-spin text-zinc-300" />
          <span className="text-xs uppercase tracking-wider font-mono">
            Evaluating tender bids & Pint unit models...
          </span>
        </div>
      ) : brief ? (
        <main className="flex-1 p-4 max-w-[1720px] w-full mx-auto space-y-4">
          {/* Executive Tender Summary Banner */}
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-black border border-cyan-200 dark:border-zinc-800 px-2 py-0.5 rounded tracking-wide">
                  {brief.tender?.id || tenderId}
                </span>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <h1 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">
                  {brief.tender?.title || 'Tender Audit'}
                </h1>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border ${
                    isVerified
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {isVerified ? 'VERIFIED & SEALED' : 'DRAFT REVIEW'}
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans">
                Client: <strong className="text-zinc-900 dark:text-zinc-200">{brief.tender?.client || 'N/A'}</strong> · Material Requisition: <span className="font-mono text-zinc-800 dark:text-zinc-300">{brief.tender?.mr_doc || 'MR Spec'}</span> ({brief.tender?.pages_parsed || 0} pages parsed)
              </p>
            </div>

            {/* Top-Right Governance Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowSensitivity(!showSensitivity)}
                className={`px-3 py-1.5 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                  showSensitivity || hasCustomRates
                    ? 'bg-zinc-800 border-zinc-600 text-white'
                    : 'bg-[#111113] hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
                <span>Sensitivity Rates</span>
                {hasCustomRates && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                )}
                {showSensitivity ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                )}
              </button>

              <button
                onClick={handleExportTbeWorkbook}
                disabled={isExportingTbe}
                className="px-3 py-1.5 bg-[#111113] hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Download Technical Bid Evaluation workbook (.xlsx)"
              >
                {isExportingTbe ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                )}
                <span>Export TBE (.xlsx)</span>
              </button>

              <Link
                href={`/print/${tenderId}`}
                target="_blank"
                className="px-3 py-1.5 bg-[#111113] hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Open printable review sheet"
              >
                <Printer className="w-3.5 h-3.5 text-zinc-400" />
                <span>Print Brief</span>
              </Link>

              {/* Seal / Unlock Workflow Action */}
              {isVerified ? (
                confirmUnlock ? (
                  <div className="flex items-center gap-1 bg-black border border-amber-900 rounded p-0.5">
                    <span className="text-[11px] text-amber-400 px-2 font-medium">Unlock brief?</span>
                    <button
                      onClick={handleWithdraw}
                      className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-black font-semibold rounded text-xs"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmUnlock(false)}
                      className="px-2 py-1 text-zinc-400 hover:text-white text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmUnlock(true)}
                    className="px-3.5 py-1.5 bg-black hover:bg-zinc-900 border border-zinc-800 text-amber-400 hover:text-amber-300 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock Brief</span>
                  </button>
                )
              ) : (
                <button
                  onClick={handleVerify}
                  className="px-4 py-1.5 bg-white hover:bg-zinc-200 text-black font-semibold rounded text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Verify & Seal Award</span>
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Sensitivity Rate Toolbar */}
          {showSensitivity && (
            <SensitivityPanel
              onEvaluate={handleSensitivityEvaluate}
              isLoading={evaluating}
              onClose={() => setShowSensitivity(false)}
            />
          )}

          {/* Key Executive KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B]">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-sans">
                Bidders Evaluated
              </span>
              <div className="text-lg font-bold text-zinc-900 dark:text-white font-mono mt-0.5">
                {safeVendors.length} Proposals
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 block font-sans">
                {safeDocuments.length} total source PDFs indexed
              </span>
            </div>

            <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B]">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-sans">
                Clause Coverage
              </span>
              <div className="text-lg font-bold text-zinc-900 dark:text-white font-mono mt-0.5">
                {safeParameters.length} Clauses
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 block font-sans">
                100% deterministic Pint evaluation
              </span>
            </div>

            <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B]">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-sans">
                Recommended Bidder (L1)
              </span>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 truncate">
                {recommendedVendor?.name || 'Awaiting Award'}
              </div>
              <span className="text-[11px] text-zinc-700 dark:text-zinc-300 font-mono mt-0.5 block">
                True Cost: {formatEur(recommendedVendor?.true_evaluated_price)}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B]">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-sans">
                Open Items / Clarifications
              </span>
              <div
                className={`text-lg font-bold font-mono mt-0.5 ${
                  safeOpenItems.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {safeOpenItems.length} Open Gaps
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 block font-sans">
                {safeOpenItems.length === 0 ? 'Ready for sign-off' : 'Action needed before sealing'}
              </span>
            </div>
          </div>

          {/* Workbench Tab Navigation */}
          <div className="border-b border-zinc-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('LEDGER')}
                className={`px-4 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'LEDGER'
                    ? 'border-white text-white bg-zinc-900/40'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>True Job Cost Ledger</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black border border-zinc-800 text-zinc-400">
                  {safeFinancials.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('COMPLIANCE')}
                className={`px-4 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'COMPLIANCE'
                    ? 'border-white text-white bg-zinc-900/40'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Compliance Matrix</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black border border-zinc-800 text-zinc-400">
                  {safeParameters.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('RISKS')}
                className={`px-4 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'RISKS'
                    ? 'border-white text-white bg-zinc-900/40'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Commercial & Logistics Risks</span>
              </button>

              <button
                onClick={() => setActiveTab('SIGNOFF')}
                className={`px-4 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'SIGNOFF'
                    ? 'border-white text-white bg-zinc-900/40'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Clarifications & Sign-Off</span>
                {safeOpenItems.length > 0 && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-amber-950 border border-amber-900 text-amber-400">
                    {safeOpenItems.length}
                  </span>
                )}
              </button>
            </div>

            {/* Vendor Selector Pill when Drilldown is displayed */}
            {activeTab === 'LEDGER' && selectedVendorId && (
              <div className="flex items-center gap-2 text-xs font-sans">
                <span className="text-zinc-500">Drilldown:</span>
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="bg-[#111113] border border-zinc-800 text-zinc-200 px-2 py-1 rounded text-xs font-mono outline-none cursor-pointer"
                  aria-label="Select vendor for line item drilldown"
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

          {/* Workbench Views with ErrorBoundary Protection */}
          <ErrorBoundary fallbackTitle={`Error rendering ${activeTab} tab`}>
            {activeTab === 'LEDGER' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                {/* Main Evaluated Cost Ledger Table */}
                <div className={selectedFinancials ? 'xl:col-span-7' : 'xl:col-span-12'}>
                  <TrueJobCostTable
                    financials={safeFinancials}
                    vendors={safeVendors}
                    onSelectVendor={(vId) => setSelectedVendorId(vId)}
                    onOpenOverride={(vendorId, paramId) => {
                      setOverrideTarget({ vendorId, paramId: paramId || 'PARAM-01' });
                    }}
                    selectedVendorId={selectedVendorId}
                  />
                </div>

                {/* Side-by-Side Line Item Drilldown Inspector */}
                {selectedFinancials && (
                  <div className="xl:col-span-5 sticky top-4">
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
                        setOverrideTarget({
                          vendorId: selectedFinancials.vendor_id,
                          paramId,
                          vendorName: selectedFinancials.name,
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
                  setOverrideTarget({ vendorId, paramId });
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

            {activeTab === 'SIGNOFF' && (
              <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] rounded-xl p-5 space-y-5 text-xs font-sans shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                  <div>
                    <h2 className="text-xs font-semibold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                      <span>Procurement Committee Sign-Off & Clarifications</span>
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      Clear open verification items, export the Technical Bid Evaluation (TBE) workbook, or print the official sign-off sheet.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/print/${tenderId}`}
                      target="_blank"
                      className="px-3.5 py-1.5 bg-[#111113] hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Print Sign-Off Sheet</span>
                    </Link>

                    <button
                      onClick={handleExportTbeWorkbook}
                      disabled={isExportingTbe}
                      className="px-3.5 py-1.5 bg-white hover:bg-zinc-200 text-black font-semibold rounded text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {isExportingTbe ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Exporting...</span>
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Export TBE (.xlsx)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Open Items Clearance */}
                <div className="p-4 rounded bg-[#111113] border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200">
                      Open Verification Items ({safeOpenItems.length})
                    </span>
                    {safeOpenItems.length === 0 ? (
                      <span className="text-emerald-400 text-xs font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Cleared for Award Verification
                      </span>
                    ) : (
                      <span className="text-amber-400 text-xs font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Action Required Before Brief Sealing
                      </span>
                    )}
                  </div>

                  {safeOpenItems.length > 0 ? (
                    <div className="divide-y divide-zinc-800 border border-zinc-800 rounded max-h-64 overflow-y-auto">
                      {safeOpenItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="px-3.5 py-2.5 bg-white dark:bg-[#09090B] text-xs flex items-center justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 font-mono text-[11px]">
                              <span className="text-amber-400 font-semibold uppercase">
                                {item.kind}
                              </span>
                              <span className="text-zinc-600">·</span>
                              <span className="text-zinc-300">
                                {item.vendor_id} {item.param_id ? `(${item.param_id})` : ''}
                              </span>
                            </div>
                            <div className="text-zinc-300">{item.message}</div>
                          </div>
                          {item.param_id && (
                            <button
                              onClick={() => {
                                setOverrideTarget({
                                  vendorId: item.vendor_id,
                                  paramId: item.param_id!,
                                });
                              }}
                              className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 rounded text-xs font-medium shrink-0 transition-colors"
                              aria-label={`Price gap for ${item.vendor_id} clause ${item.param_id}`}
                            >
                              Price Gap
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">
                      Zero unpriced gaps remain. All technical and commercial deviations are fully leveled and priced in the evaluation ledger.
                    </p>
                  )}
                </div>

                {/* Clarifications Register Exports */}
                <div className="p-4 rounded bg-[#111113] border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wide">
                      Vendor Clarification Register
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Formal clarification logs citing exact specification clauses and proposal quotations.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleExportClarifications('csv')}
                      disabled={isExportingCsv}
                      className="px-3.5 py-1.5 bg-black hover:bg-zinc-900 border border-zinc-800 text-zinc-200 rounded text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {isExportingCsv ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                      <span>Download (.csv)</span>
                    </button>
                    <button
                      onClick={() => handleExportClarifications('xlsx')}
                      disabled={isExportingXlsx}
                      className="px-3.5 py-1.5 bg-black hover:bg-zinc-900 border border-zinc-800 text-zinc-200 rounded text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {isExportingXlsx ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                      )}
                      <span>Download (.xlsx)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </ErrorBoundary>

          {/* Evidence Crop Modal */}
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

          {/* Override Drawer Modal */}
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
        </main>
      ) : (
        /* Actionable Backend Offline / Error Card when brief is null */
        <main className="flex-1 p-6 max-w-4xl w-full mx-auto flex flex-col items-center justify-center font-sans">
          <div className="w-full p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    Tender Package Unavailable from Backend
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Target: <code className="text-zinc-300 font-mono">{API_BASE ? `${API_BASE}/api/review/tenders/${tenderId}` : `/api/review/tenders/${tenderId}`}</code>
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-rose-950/60 border border-rose-900 text-rose-300 font-bold">
                Connection Status: Offline / 500
              </span>
            </div>

            <div className="p-3.5 rounded bg-black/60 border border-zinc-800/80 text-xs text-zinc-300 space-y-2">
              <div className="text-rose-400 font-medium">Diagnostic Error:</div>
              <p className="font-mono text-[11px] text-zinc-400 break-all">
                {error || 'The remote backend returned HTTP 500 or is currently booting up.'}
              </p>
              <div className="pt-2 text-[11px] text-zinc-400 border-t border-zinc-900">
                Ensure <code className="text-cyan-400">NEXT_PUBLIC_API_URL</code> is set in Vercel project environment variables pointing to your hosted <code className="text-cyan-400">antova-yc</code> backend instance, and CORS is enabled for your Vercel domain.
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchBrief}
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-black font-semibold rounded text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Connection</span>
                </button>
                <button
                  onClick={handleLoadOfflineSample}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-cyan-400 hover:text-cyan-300 font-semibold rounded text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Database className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Load Verified Demo Brief (TENDER-2026-402)</span>
                </button>
              </div>

              <Link
                href="/ingest"
                className="px-3.5 py-2 bg-[#111113] hover:bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded text-xs transition-colors"
              >
                Go to Ingest Pipeline &rarr;
              </Link>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
