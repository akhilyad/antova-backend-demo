'use client';

import React, { useEffect, useState, useMemo, use, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AppShell } from '../../../components/layout/AppShell';
import { TrueJobCostTable } from '../../../components/TrueJobCostTable';
import { ComplianceMatrix } from '../../../components/ComplianceMatrix';
import { CommercialRiskTable } from '../../../components/CommercialRiskTable';
import { SensitivityWorkbench } from '../../../components/sensitivity/SensitivityWorkbench';
import { FindingsRegister } from '../../../components/FindingsRegister';
import { ProjectBaselineCard } from '../../../components/ProjectBaselineCard';
import { ReviewGateRail } from '../../../components/ReviewGateRail';
import { CellReviewPanel } from '../../../components/CellReviewPanel';
import { EvidenceModal } from '../../../components/EvidenceModal';
import { OverrideDrawer } from '../../../components/OverrideDrawer';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { KpiStrip, KpiItem } from '../../../components/audit/KpiStrip';
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
import { AUDIT_REQUEST_URL, REPLAY_NOTICE } from '../../../lib/site';
import { Brief, Citation, RatesSettings } from '../../../lib/types';
import { formatEur, formatAdderEur } from '../../../lib/domain/money';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

const TAB_IDS = ['LEDGER', 'COMPLIANCE', 'RISKS', 'FINDINGS', 'SENSITIVITY', 'SIGNOFF'] as const;
type TabId = (typeof TAB_IDS)[number];

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

  // Active section synced with the URL (?tab=ledger|compliance|risks|findings|sensitivity|signoff).
  // ?tab=reports is an old link: downloads now live in Sign-off.
  const rawTab = (searchParams.get('tab') || 'ledger').toUpperCase();
  const activeTab: TabId = rawTab === 'REPORTS' ? 'SIGNOFF' : (TAB_IDS as readonly string[]).includes(rawTab) ? (rawTab as TabId) : 'LEDGER';

  const setActiveTab = (tab: TabId) => {
    router.push(`/audit/${tenderId}?tab=${tab.toLowerCase()}`, { scroll: false });
  };

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
    } catch (err: any) {
      console.warn(`Error fetching brief for ${tenderId}:`, err);
      try {
        const sample = loadSampleBrief();
        setBrief(sample);
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

  // The public demo runs on a saved sample. Actions that need the live engine explain themselves
  // instead of failing with a server error.
  const replayOnly = (notice: string): boolean => {
    if (brief?._source !== 'replay') return false;
    setError(null);
    setActionMsg(notice);
    setTimeout(() => setActionMsg(null), 6000);
    return true;
  };

  const handleSensitivityEvaluate = async (rates: RatesSettings): Promise<boolean> => {
    if (!brief) return false;
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
      return true;
    } catch (err: any) {
      console.error('Sensitivity evaluation error:', err);
      setActionMsg(err.message || "Couldn't update the totals. Try again.");
      setTimeout(() => setActionMsg(null), 3500);
      return false;
    } finally {
      setEvaluating(false);
    }
  };

  const handleVerify = async () => {
    if (!brief) return;
    if (replayOnly(REPLAY_NOTICE.signOff)) return;
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
    if (replayOnly(REPLAY_NOTICE.signOff)) return;
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
    if (replayOnly(REPLAY_NOTICE.export)) return;
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
    if (replayOnly(REPLAY_NOTICE.export)) return;
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
  const findingsCount = Array.isArray(brief?.tender?.findings)
    ? brief!.tender.findings.length
    : brief?.tender?.findings
    ? Object.keys(brief.tender.findings).length
    : 0;

  // Ranked by true job cost; bids without a price go last.
  const rankedFinancials = useMemo(() => {
    const list = safeFinancials.filter((f) => f.true_evaluated_price !== null);
    list.sort((a, b) => (a.true_evaluated_price ?? 0) - (b.true_evaluated_price ?? 0));
    return list;
  }, [safeFinancials]);

  const recommendedVendor = rankedFinancials[0] || null;

  // The bid with the lowest sticker price, to show what pricing the gaps did to it.
  const lowestQuote = useMemo(() => {
    const quoted = safeFinancials.filter((f) => f.headline_price != null && f.true_evaluated_price != null);
    quoted.sort((a, b) => (a.headline_price ?? 0) - (b.headline_price ?? 0));
    return quoted[0] || null;
  }, [safeFinancials]);

  // Requirement x bidder cells that miss the spec (gap, contradiction, missing, or not yet inspected).
  const specDeviations = useMemo(
    () =>
      safeParameters.reduce((n, p) => {
        const cells = Object.values(p.vendors || {});
        return n + cells.filter((c) => c && c.status !== 'COMPLIANT' && c.status !== 'DEVIATION_UPGRADE').length;
      }, 0),
    [safeParameters]
  );

  const lowestQuoteGaps = lowestQuote
    ? (lowestQuote.itemized_breakdown || []).filter((b) => (b.adder_eur ?? 0) > 0 || b.pricing_status === 'UNPRICED').length
    : 0;

  const lowestQuoteUnpriced = lowestQuote
    ? (lowestQuote.itemized_breakdown || []).filter((b) => b.pricing_status === 'UNPRICED').length
    : 0;

  const isVerified = brief?.status === 'VERIFIED';
  const isReplayMode = brief?._source === 'replay';

  const openCellReview = (vendorId: string, paramId: string, initialAction?: 'approve' | 'override' | 'reject') =>
    setCellReviewTarget({ vendorId: vendorId === '-' ? safeVendors[0]?.id || '' : vendorId, paramId, initialAction });

  const kpis: KpiItem[] = [
    {
      label: 'Lowest quoted price',
      value: formatEur(lowestQuote?.headline_price),
      context: lowestQuote?.name ?? 'No priced bid',
    },
    {
      label: 'Lowest true job cost',
      value: formatEur(recommendedVendor?.true_evaluated_price, {
        isLowerBound: recommendedVendor?.price_status === 'UNPRICED_ITEMS',
      }),
      context: recommendedVendor ? recommendedVendor.name : 'Not decided',
    },
    {
      label: 'Excluded scope',
      value: lowestQuote ? formatAdderEur(lowestQuote.total_adders) : '–',
      tone: lowestQuote && lowestQuote.total_adders > 0 ? 'gap' : 'ink',
      context: lowestQuote
        ? `${lowestQuoteGaps} ${lowestQuoteGaps === 1 ? 'gap' : 'gaps'} in the lowest quote${
            lowestQuoteUnpriced > 0 ? `, ${lowestQuoteUnpriced} unpriced` : ''
          }`
        : undefined,
    },
    {
      label: 'Spec deviations',
      value: String(specDeviations),
      context:
        safeOpenItems.length > 0
          ? `${safeOpenItems.length} open before sign-off`
          : isVerified
          ? 'Signed off'
          : 'None open',
      tone: 'ink',
      onClick: () => setActiveTab('SIGNOFF'),
    },
  ];

  const tabs: { id: TabId; label: string; count?: number; tone?: 'open'; hidden?: boolean }[] = [
    { id: 'LEDGER', label: 'Bids', count: safeFinancials.length },
    { id: 'COMPLIANCE', label: 'Requirements', count: safeParameters.length },
    { id: 'RISKS', label: 'Commercial terms' },
    { id: 'FINDINGS', label: 'Findings', count: findingsCount, hidden: findingsCount === 0 && activeTab !== 'FINDINGS' },
    { id: 'SENSITIVITY', label: 'Rate scenarios' },
    { id: 'SIGNOFF', label: 'Sign-off', count: safeOpenItems.length || undefined, tone: 'open' },
  ];

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
        <div className="text-ink">
          {isReplayMode && (
            <div className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-rule pb-3 text-xs text-muted">
              <p>
                <span className="font-medium text-ink-2">Sample audit.</span> Saved run of a real 33 kV switchgear tender. Read-only.
              </p>
              <div className="flex items-center gap-4">
                <Link href="/ingest" className="text-ink-2 underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
                  Upload your tender
                </Link>
                <a
                  href={AUDIT_REQUEST_URL}
                  className="rounded bg-brand px-2.5 py-1 font-medium text-paper hover:opacity-90"
                >
                  Get your tender audited free
                </a>
              </div>
            </div>
          )}

          {runChanged && (
            <div className="mb-8 flex items-center justify-between gap-4 border-y border-rule py-2.5 text-xs">
              <span className="text-gap">This tender was processed again after you opened it.</span>
              <button type="button" onClick={fetchBrief} className="font-medium text-ink underline underline-offset-2">
                Reload
              </button>
            </div>
          )}

          {/* Tender header */}
          <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 lg:flex-nowrap">
            <div className="min-w-0 max-w-3xl flex-1">
              <p className="text-[11px] text-muted">
                <span className="font-mono">{brief.tender?.id || tenderId}</span>
                {brief.tender?.client && <> · {brief.tender.client}</>}
              </p>
              <h1 className="mt-1 text-xl font-semibold leading-7 tracking-tight text-ink">
                {brief.tender?.title || 'Bid evaluation'}
              </h1>
              <p className="mt-1 text-xs text-muted">
                {brief.tender?.mr_doc && <span className="font-mono">{brief.tender.mr_doc}</span>}
                {brief.tender?.mr_doc && ' · '}
                {brief.tender?.pages_parsed || safeDocuments.length} pages read · {safeVendors.length} bids ·{' '}
                <span className={isVerified ? 'text-ink-2' : 'text-open'}>{isVerified ? 'Signed off' : 'Draft'}</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <Link
                href={`/print?tender=${tenderId}`}
                target="_blank"
                className="px-3 py-1.5 text-ink-2 hover:text-ink"
              >
                Print
              </Link>
              <button
                type="button"
                onClick={handleExportTbeWorkbook}
                disabled={isExportingTbe}
                className="flex items-center gap-1.5 rounded border border-rule-strong px-3 py-1.5 font-medium text-ink hover:bg-sheet disabled:opacity-50"
              >
                {isExportingTbe && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Download workbook
              </button>
            </div>
          </header>

          <div className="mt-8">
            <KpiStrip items={kpis} />
          </div>

          {/* Tabs */}
          <nav className="mt-10 flex items-center gap-6 overflow-x-auto overflow-y-hidden border-b border-rule text-[13px]" aria-label="Audit sections">
            {tabs
              .filter((t) => !t.hidden)
              .map((t) => {
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-baseline gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 ${
                      active ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    {t.label}
                    {t.count !== undefined && (
                      <span className={`text-[11px] tabular-nums ${t.tone === 'open' ? 'text-open' : 'text-faint'}`}>{t.count}</span>
                    )}
                    {t.id === 'SENSITIVITY' && hasCustomRates && <span className="text-[11px] text-open">edited</span>}
                  </button>
                );
              })}
          </nav>

          <div className="mt-6">
            <ErrorBoundary fallbackTitle="This section couldn't load.">
              {activeTab === 'LEDGER' && (
                <>
                  <TrueJobCostTable
                    financials={safeFinancials}
                    vendors={safeVendors}
                    parameters={safeParameters}
                    onInspect={(vendorId, paramId) => openCellReview(vendorId, paramId)}
                  />
                  <p className="mt-4 text-[11px] leading-4 text-faint">
                    True job cost is the quoted price plus the cost to close missing scope, delivery terms and warranty
                    shortfalls, priced from rate table {brief.tender?.rate_table_version || 'in force'}. Open a bid to see its gaps.
                  </p>
                </>
              )}

              {activeTab === 'COMPLIANCE' && (
                <ComplianceMatrix
                  parameters={safeParameters}
                  vendors={safeVendors}
                  onOpenEvidence={(paramId, vendorId, which) => {
                    const ext = safeParameters.find((p) => p.id === paramId)?.vendors?.[vendorId];
                    setEvidenceTarget({
                      paramId,
                      source: vendorId,
                      which,
                      citation: ext?.citation,
                      secondaryCitation: ext?.secondary_citation,
                    });
                  }}
                  onOpenOverride={(vendorId, paramId) => openCellReview(vendorId, paramId)}
                  onOpenReview={(vendorId, paramId) => openCellReview(vendorId, paramId)}
                />
              )}

              {activeTab === 'RISKS' && (
                <CommercialRiskTable parameters={safeParameters} vendors={safeVendors} financials={safeFinancials} />
              )}

              {activeTab === 'FINDINGS' && (
                <FindingsRegister
                  findings={brief.tender?.findings}
                  vendors={safeVendors}
                  parameters={safeParameters}
                  onOpenEvidence={(paramId, which, citation) => {
                    // The finding's citation names its document; the source follows from it, not from the first bidder.
                    const doc = safeDocuments.find((d) => d.filename === citation?.filename);
                    const source = doc ? (doc.role === 'mr_spec' ? 'mr' : doc.vendor_id || '') : safeVendors[0]?.id || '';
                    setEvidenceTarget({ paramId, source, which, citation });
                  }}
                />
              )}

              {activeTab === 'SENSITIVITY' && (
                <SensitivityWorkbench
                  onEvaluate={handleSensitivityEvaluate}
                  isLoading={evaluating}
                  // Until rates are applied, the brief's figures are at the rate table's own rates.
                  currentRates={hasCustomRates ? currentRates : undefined}
                  financials={safeFinancials}
                  vendors={safeVendors}
                  parameters={safeParameters}
                />
              )}

              {activeTab === 'SIGNOFF' && (
                <div className="space-y-10">
                  <ReviewGateRail
                    openItems={safeOpenItems}
                    review={brief.review}
                    isVerified={isVerified}
                    onSelectOpenItem={(item) => {
                      if (item.param_id) openCellReview(item.vendor_id, item.param_id);
                    }}
                    onVerify={handleVerify}
                    isVerifying={isVerifying}
                    blockingMessage={verifyBlockerMsg}
                  />

                  {brief.tender?.project && Object.keys(brief.tender.project).length > 0 && (
                    <ProjectBaselineCard
                      tenderId={tenderId}
                      project={brief.tender.project}
                      isVerified={isVerified}
                      onRefresh={fetchBrief}
                    />
                  )}

                  <section>
                    <h2 className="text-[13px] font-medium text-ink">Downloads</h2>
                    <p className="mt-0.5 text-xs text-muted">Available after sign-off.</p>
                    <ul className="mt-3 border-t border-rule text-[13px]">
                      <DownloadRow
                        name="Bid evaluation workbook"
                        detail="Ranking, true job cost and every adder with its formula. .xlsx"
                      >
                        <TextAction onClick={handleExportTbeWorkbook} busy={isExportingTbe}>Download</TextAction>
                      </DownloadRow>
                      <DownloadRow
                        name="Clarification questions"
                        detail="One question per gap, with the spec page and the bidder's text."
                      >
                        <TextAction onClick={() => handleExportClarifications('xlsx')} busy={isExportingXlsx}>Excel</TextAction>
                        <TextAction onClick={() => handleExportClarifications('csv')} busy={isExportingCsv}>CSV</TextAction>
                      </DownloadRow>
                      <DownloadRow name="Sign-off sheet" detail="Printable summary with signature lines for the award committee.">
                        <Link
                          href={`/print?tender=${tenderId}`}
                          target="_blank"
                          className="font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
                        >
                          Open
                        </Link>
                      </DownloadRow>
                    </ul>
                  </section>
                </div>
              )}
            </ErrorBoundary>
          </div>

          {evidenceTarget && (
            <EvidenceModal
              tenderId={tenderId}
              paramId={evidenceTarget.paramId}
              source={evidenceTarget.source}
              which={evidenceTarget.which}
              citation={evidenceTarget.citation}
              secondaryCitation={evidenceTarget.secondaryCitation}
              onClose={() => setEvidenceTarget(null)}
              parameters={safeParameters}
              vendors={safeVendors}
              documents={safeDocuments}
            />
          )}

          {/* Right-hand review drawer: clause, bidder text, evidence and override for one gap */}
          {cellReviewTarget && (() => {
            const param = safeParameters.find((p) => p.id === cellReviewTarget.paramId);
            const line = safeFinancials
              .find((f) => f.vendor_id === cellReviewTarget.vendorId)
              ?.itemized_breakdown.find((b) => b.param_id === cellReviewTarget.paramId);
            return (
              <CellReviewPanel
                isOpen
                onClose={() => setCellReviewTarget(null)}
                tenderId={tenderId}
                paramId={cellReviewTarget.paramId}
                initialAction={cellReviewTarget.initialAction}
                paramName={param?.name || cellReviewTarget.paramId}
                mrRequirement={param?.mr_requirement || ''}
                vendorId={cellReviewTarget.vendorId}
                vendorName={safeVendors.find((v) => v.id === cellReviewTarget.vendorId)?.name || cellReviewTarget.vendorId}
                extraction={param?.vendors?.[cellReviewTarget.vendorId] || null}
                currentAdder={line?.adder_eur ?? null}
                currentNote={line?.override_note ?? null}
                isOverridden={Boolean(line?.is_overridden)}
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
            );
          })()}

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
        <div className="mx-auto max-w-xl py-16 text-ink">
          <h1 className="text-xl font-semibold tracking-tight">Can't load this tender</h1>
          <p className="mt-2 text-[13px] text-muted">
            {error || "The server didn't respond. It may be starting up. Try again in a minute."}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
            <button type="button" onClick={fetchBrief} className="rounded bg-ink px-3 py-1.5 font-medium text-paper">
              Try again
            </button>
            <button
              type="button"
              onClick={handleLoadOfflineSample}
              className="rounded border border-rule-strong px-3 py-1.5 font-medium text-ink hover:bg-sheet"
            >
              Open the sample tender
            </button>
            <Link href="/ingest" className="px-1 text-ink-2 underline decoration-rule-strong underline-offset-2">
              Upload a tender
            </Link>
          </div>
          <details className="mt-8 border-t border-rule pt-3 text-[11px] text-faint">
            <summary className="cursor-pointer">Technical details</summary>
            <p className="mt-2 font-mono break-all">
              {API_BASE ? `${API_BASE}/api/review/tenders/${tenderId}` : `/api/review/tenders/${tenderId}`}
            </p>
            <p className="mt-1">
              Set <code className="font-mono">NEXT_PUBLIC_API_URL</code> to the hosted engine and allow this domain in its CORS list.
            </p>
          </details>
        </div>
      )}
    </AppShell>
  );
}

function DownloadRow({ name, detail, children }: { name: string; detail: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule py-3">
      <div className="min-w-0">
        <span className="text-ink">{name}</span>
        <span className="ml-3 text-xs text-muted">{detail}</span>
      </div>
      <div className="flex items-center gap-4 text-xs">{children}</div>
    </li>
  );
}

function TextAction({ onClick, busy, children }: { onClick: () => void; busy?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-1 font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink disabled:opacity-50"
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {children}
    </button>
  );
}

function AuditWorkbenchSkeleton({ tenderId }: { tenderId: string }) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading tender">
      <p className="font-mono text-[11px] text-faint">{tenderId}</p>
      <div className="mt-2 h-6 w-2/3 max-w-xl rounded-sm bg-rule" />
      <div className="mt-2 h-3 w-80 rounded-sm bg-rule" />
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

export default function AuditWorkbenchPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper text-xs text-muted">Loading tender</div>
      }
    >
      <AuditWorkbenchPageContent {...props} />
    </Suspense>
  );
}
