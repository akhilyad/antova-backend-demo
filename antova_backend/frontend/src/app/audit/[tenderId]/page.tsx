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
import {
  getTenderBrief,
  evaluateTender,
  verifyTender,
  withdrawTender,
  downloadTbeExport,
  downloadClarificationsExport,
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
      if (!selectedVendorId && data.tender.vendors.length > 0) {
        setSelectedVendorId(data.tender.vendors[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tender audit brief');
    } finally {
      setLoading(false);
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
      setActionMsg('Unlocking brief to editable DRAFT...');
      await withdrawTender(tenderId);
      setActionMsg('Brief unlocked to editable DRAFT status.');
      await fetchBrief();
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      setActionMsg(null);
      setError(err.message || 'Withdraw failed');
    }
  };

  const handleExportTbeWorkbook = async () => {
    try {
      setIsExportingTbe(true);
      setError(null);
      await downloadTbeExport(tenderId);
    } catch (err: any) {
      setError(err.message || 'Failed to export TBE workbook');
    } finally {
      setIsExportingTbe(false);
    }
  };

  const handleExportClarifications = async (format: 'csv' | 'xlsx') => {
    try {
      if (format === 'csv') setIsExportingCsv(true);
      else setIsExportingXlsx(true);
      setError(null);
      await downloadClarificationsExport(tenderId, format);
    } catch (err: any) {
      setError(err.message || `Failed to export clarifications (${format})`);
    } finally {
      setIsExportingCsv(false);
      setIsExportingXlsx(false);
    }
  };

  // Compute deterministic summary metrics from real backend figures
  const auditSummary = useMemo(() => {
    if (!brief) return null;

    const vendorTotals = brief.financials.map((f) => {
      const vendorMeta = brief.tender.vendors.find((v) => v.id === f.vendor_id);
      return {
        vendorId: f.vendor_id,
        vendorName: vendorMeta?.name || f.name || f.vendor_id,
        totalAdders: f.total_adders ?? 0,
      };
    });

    const maxExposure = vendorTotals.reduce(
      (max, curr) => (curr.totalAdders > max.totalAdders ? curr : max),
      { vendorId: '', vendorName: '—', totalAdders: 0 }
    );

    const totalOmissionLines = brief.financials.reduce(
      (sum, f) => sum + (f.itemized_breakdown?.filter((b) => (b.adder_eur || 0) > 0).length || 0),
      0
    );

    const lowestPricedVendor = [...brief.financials]
      .filter((f) => f.headline_price !== null && f.true_evaluated_price !== null)
      .sort((a, b) => (a.true_evaluated_price ?? 0) - (b.true_evaluated_price ?? 0))[0];

    return {
      vendorCount: brief.tender.vendors.length,
      parameterCount: brief.tender.parameters.length,
      maxExposure,
      totalOmissionLines,
      lowestPricedVendor,
    };
  }, [brief]);

  const selectedFinancials = brief?.financials.find((f) => f.vendor_id === selectedVendorId);

  return (
    <div className="min-h-screen flex flex-col bg-black text-zinc-100 font-sans selection:bg-zinc-800 selection:text-white">
      <Header
        tenderId={tenderId}
        tenderTitle={brief?.tender.title}
        status={brief?.status}
        openItemsCount={brief?.open_items.length || 0}
        onRefresh={fetchBrief}
        isRefreshing={loading}
      />

      {loading && !brief ? (
        <div className="flex-1 flex flex-col items-center justify-center text-xs text-zinc-400 font-mono space-y-2">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
          <span>Loading bid evaluation ledger from Antova engine...</span>
        </div>
      ) : error && !brief ? (
        <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
          <div className="p-4 rounded border border-rose-800 bg-rose-950/30 text-rose-300 text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      ) : brief && auditSummary ? (
        <main className="flex-1 flex flex-col max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
          {/* Notification Feedback Banner */}
          {(actionMsg || error) && (
            <div
              role="alert"
              className={`px-3.5 py-2.5 rounded border text-xs flex items-center justify-between transition-all ${
                error
                  ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                  : 'bg-[#111113] border-zinc-700 text-zinc-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {error ? (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span>{error || actionMsg}</span>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  setActionMsg(null);
                }}
                className="text-zinc-400 hover:text-white p-1"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Tender Specification Identity & Governance Bar */}
          <section className="border border-zinc-800 bg-[#09090B] rounded px-4 py-3 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="font-mono font-semibold text-white bg-black border border-zinc-800 px-2 py-0.5 rounded">
                  {brief.tender.id}
                </span>
                <span className="text-zinc-200 font-medium">{brief.tender.client}</span>
                <span className="text-zinc-600">·</span>
                <span className="font-mono text-zinc-300">{brief.tender.mr_doc}</span>
              </div>
              <h1 className="text-base font-semibold text-white tracking-tight">
                {brief.tender.title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                <span>
                  Equipment: <strong className="text-zinc-200 font-mono font-normal">{brief.tender.equipment_class}</strong>
                </span>
                <span>
                  Rate Table: <strong className="text-zinc-200 font-mono font-normal">{brief.tender.rate_table_version}</strong>
                </span>
                <span>
                  Corpus: <strong className="text-zinc-200 font-mono font-normal tabular-nums">{brief.tender.pages_parsed} pages</strong>
                </span>
                <span>
                  Ingest Mode: <strong className="text-zinc-200 font-mono font-normal">{brief.ingest_mode}</strong>
                </span>
              </div>
            </div>

            {/* Governance Action Block */}
            <div className="flex items-center gap-2">
              {brief.status === 'VERIFIED' ? (
                <>
                  <span className="px-3 py-1.5 rounded border border-emerald-500/30 bg-emerald-950/30 text-emerald-300 text-xs font-medium flex items-center gap-1.5 font-sans">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sealed {formatIsoDate(brief.verified_at)}</span>
                  </span>
                  {confirmUnlock ? (
                    <div className="flex items-center gap-1.5 bg-black border border-amber-500/40 rounded px-2.5 py-1 text-xs font-sans">
                      <span className="text-amber-300 text-xs">Unlock draft?</span>
                      <button
                        onClick={handleWithdraw}
                        className="px-2.5 py-1 bg-amber-500 text-black font-semibold rounded text-xs hover:bg-amber-400 transition-colors"
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
                      className="px-3 py-1.5 bg-[#111113] hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded text-xs transition-colors flex items-center gap-1.5"
                    >
                      <Unlock className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Unlock Draft</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="px-3 py-1.5 rounded border border-amber-500/30 bg-amber-950/30 text-amber-300 text-xs font-medium flex items-center gap-1.5 font-sans">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-mono tabular-nums">
                      Draft · {brief.open_items.length} {brief.open_items.length === 1 ? 'Open Item' : 'Open Items'}
                    </span>
                  </span>
                  <button
                    onClick={handleVerify}
                    className="px-3.5 py-1.5 bg-white hover:bg-zinc-200 text-black font-semibold text-xs rounded transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Verify & Seal Brief</span>
                  </button>
                </>
              )}
            </div>
          </section>

          {/* Key Executive Totals Visible Above the Fold */}
          <section className="grid grid-cols-2 lg:grid-cols-4 border border-zinc-800 bg-[#09090B] rounded divide-y lg:divide-y-0 lg:divide-x divide-zinc-800 shadow-sm">
            <div className="px-4 py-3">
              <div className="text-xs text-zinc-400 font-medium">
                Evaluated bidders
              </div>
              <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-white">
                {auditSummary.vendorCount} Vendors{' '}
                <span className="text-xs font-normal text-zinc-500 font-sans">
                  ({auditSummary.parameterCount} clauses)
                </span>
              </div>
            </div>

            <div className="px-4 py-3">
              <div className="text-xs text-zinc-400 font-medium">
                Maximum scope gap exposure
              </div>
              <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-rose-400">
                +{formatEur(auditSummary.maxExposure.totalAdders)}{' '}
                <span className="text-xs font-normal text-zinc-400 font-sans">
                  ({auditSummary.maxExposure.vendorName})
                </span>
              </div>
            </div>

            <div className="px-4 py-3">
              <div className="text-xs text-zinc-400 font-medium">
                L1 true evaluated job cost
              </div>
              <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-emerald-400">
                {auditSummary.lowestPricedVendor
                  ? `${formatEur(auditSummary.lowestPricedVendor.true_evaluated_price)}`
                  : '—'}{' '}
                {auditSummary.lowestPricedVendor && (
                  <span className="text-xs font-normal text-zinc-400 font-sans">
                    ({auditSummary.lowestPricedVendor.name})
                  </span>
                )}
              </div>
            </div>

            <div className="px-4 py-3">
              <div className="text-xs text-zinc-400 font-medium">
                Clarification items
              </div>
              <div
                className={`mt-1 text-sm font-mono tabular-nums font-semibold ${
                  brief.open_items.length > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {brief.open_items.length === 0
                  ? '0 Open (Clean for Award)'
                  : `${brief.open_items.length} Pending Review`}
              </div>
            </div>
          </section>

          {/* Tab Navigation & Rate Sensitivity Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800">
            <nav className="flex items-center space-x-1 text-xs" role="tablist" aria-label="Audit Workbench sections">
              <button
                role="tab"
                id="tab-ledger"
                aria-selected={activeTab === 'LEDGER'}
                aria-controls="panel-ledger"
                onClick={() => setActiveTab('LEDGER')}
                className={`px-3.5 py-2.5 font-medium transition-colors border-b-2 -mb-px focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 ${
                  activeTab === 'LEDGER'
                    ? 'border-white text-white font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                True Cost & Omission Ledger
              </button>

              <button
                role="tab"
                id="tab-compliance"
                aria-selected={activeTab === 'COMPLIANCE'}
                aria-controls="panel-compliance"
                onClick={() => setActiveTab('COMPLIANCE')}
                className={`px-3.5 py-2.5 font-medium transition-colors border-b-2 -mb-px focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 ${
                  activeTab === 'COMPLIANCE'
                    ? 'border-white text-white font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Clause-by-Clause Matrix
              </button>

              <button
                role="tab"
                id="tab-risks"
                aria-selected={activeTab === 'RISKS'}
                aria-controls="panel-risks"
                onClick={() => setActiveTab('RISKS')}
                className={`px-3.5 py-2.5 font-medium transition-colors border-b-2 -mb-px focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 ${
                  activeTab === 'RISKS'
                    ? 'border-white text-white font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Commercial & Delivery Risks
              </button>

              <button
                role="tab"
                id="tab-signoff"
                aria-selected={activeTab === 'SIGNOFF'}
                aria-controls="panel-signoff"
                onClick={() => setActiveTab('SIGNOFF')}
                className={`px-3.5 py-2.5 font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 ${
                  activeTab === 'SIGNOFF'
                    ? 'border-white text-white font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Sign-Off & Clarifications</span>
                {brief.open_items.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono tabular-nums text-[11px] font-semibold">
                    {brief.open_items.length}
                  </span>
                )}
              </button>
            </nav>

            <button
              onClick={() => setShowSensitivity((prev) => !prev)}
              aria-expanded={showSensitivity}
              aria-controls="sensitivity-panel"
              className={`mb-1 px-3 py-1.5 rounded border text-xs flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 ${
                hasCustomRates
                  ? 'border-cyan-500/50 bg-cyan-950/30 text-cyan-300'
                  : 'border-zinc-800 bg-[#09090B] hover:bg-zinc-900 text-zinc-300'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
              <span>Rate Sensitivity Engine</span>
              {hasCustomRates && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" title="Custom rates active" />
              )}
              {showSensitivity ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              )}
            </button>
          </div>

          {/* Collapsible Rate Sensitivity Panel */}
          {showSensitivity && (
            <div id="sensitivity-panel" className="border border-zinc-800 rounded bg-[#09090B] p-2">
              <SensitivityPanel onEvaluate={handleSensitivityEvaluate} isLoading={evaluating} />
            </div>
          )}

          {/* Tab 1: Split-Pane Ledger (Left) + Line Item Drilldown Inspector (Right) */}
          {activeTab === 'LEDGER' && (
            <div id="panel-ledger" role="tabpanel" aria-labelledby="tab-ledger">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                <div className={selectedVendorId && selectedFinancials ? 'xl:col-span-7' : 'xl:col-span-12'}>
                  <TrueJobCostTable
                    financials={brief.financials}
                    vendors={brief.tender.vendors}
                    selectedVendorId={selectedVendorId}
                    onSelectVendor={(vId) => setSelectedVendorId(vId)}
                    onOpenOverride={(vId, pId) => {
                      const param =
                        brief.tender.parameters.find((p) => p.id === pId) ||
                        brief.tender.parameters[0];
                      const vendor = brief.tender.vendors.find((v) => v.id === vId);
                      const adderItem = brief.financials
                        .find((f) => f.vendor_id === vId)
                        ?.itemized_breakdown.find((b) => b.param_id === param.id);

                      setOverrideTarget({
                        vendorId: vId,
                        paramId: param.id,
                        paramName: param.name,
                        vendorName: vendor?.name,
                        currentAdder: adderItem?.adder_eur,
                        currentNote: adderItem?.override_note,
                      });
                    }}
                  />
                </div>

                {selectedVendorId && selectedFinancials && (
                  <div className="xl:col-span-5 xl:sticky xl:top-4">
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
                          currentAdder: adderItem?.adder_eur,
                          currentNote: adderItem?.override_note,
                        });
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Clause-by-Clause Compliance Matrix */}
          {activeTab === 'COMPLIANCE' && (
            <div id="panel-compliance" role="tabpanel" aria-labelledby="tab-compliance">
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
          )}

          {/* Tab 3: Commercial & Delivery Risk Table */}
          {activeTab === 'RISKS' && (
            <div id="panel-risks" role="tabpanel" aria-labelledby="tab-risks">
              <CommercialRiskTable
                parameters={brief.tender.parameters}
                vendors={brief.tender.vendors}
                financials={brief.financials}
              />
            </div>
          )}

          {/* Tab 4: Procurement Sign-Off & Clarification Log */}
          {activeTab === 'SIGNOFF' && (
            <div id="panel-signoff" role="tabpanel" aria-labelledby="tab-signoff" className="border border-zinc-800 bg-[#09090B] rounded p-5 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
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
                    Open Verification Items ({brief.open_items.length})
                  </span>
                  {brief.open_items.length === 0 ? (
                    <span className="text-emerald-400 text-xs font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Cleared for Award Verification
                    </span>
                  ) : (
                    <span className="text-amber-400 text-xs font-medium flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Action Required Before Brief Sealing
                    </span>
                  )}
                </div>

                {brief.open_items.length > 0 ? (
                  <div className="divide-y divide-zinc-800 border border-zinc-800 rounded max-h-64 overflow-y-auto">
                    {brief.open_items.map((item, idx) => (
                      <div
                        key={idx}
                        className="px-3.5 py-2.5 bg-[#09090B] text-xs flex items-center justify-between gap-3 hover:bg-zinc-900/60 transition-colors"
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
      ) : null}
    </div>
  );
}
