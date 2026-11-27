'use client';

import React, { useEffect, useRef, useState } from 'react';
import { uploadTenderFile, putManifest, startIngestJob, getJobStatus, probeEngine, type EngineState } from '../lib/api';
import { AUDIT_REQUEST_URL, SAMPLE_TENDER_ID } from '../lib/site';
import { SAMPLE_TENDER_IDS } from '../lib/replay';
import { INGEST_PHASES, phaseFor, phaseIndex, type IngestPhase } from '../lib/ingest-phase';
import { Job } from '../lib/types';
import { Loader2, X } from 'lucide-react';
import { ActionButton } from './ui/actions';
import { useRouter } from 'next/navigation';

const ENGINE_COPY = {
  replayShort:
    'No engine is attached to this deployment, so new files can’t be processed. The sample audit still opens, and we can run your tender under NDA.',
} as const;

export function SplitUploadDropzone() {
  const router = useRouter();

  // What this deployment is connected to. Only replay mode (no engine behind the proxy) locks the
  // form. A degraded or unknown answer is reported, but the form stays usable: the engine may be
  // there, and a real error from it says more than a guess.
  const [engine, setEngine] = useState<EngineState>({ kind: 'checking' });
  const recheckEngine = () => {
    setEngine({ kind: 'checking' });
    probeEngine().then(setEngine);
  };
  useEffect(() => {
    let mounted = true;
    probeEngine().then((state) => {
      if (mounted) setEngine(state);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const isReplay = engine.kind === 'replay';

  // Ingestion form state
  const [tenderId, setTenderId] = useState('');
  const [tenderTitle, setTenderTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [equipmentClass] = useState('mv_gis_switchgear');
  const [rateTable] = useState('mv_gis_switchgear_v2');
  // Engineering estimates feed quantity-priced gaps. Blank means unknown: those gaps stay UNPRICED
  // instead of being priced on another tender's numbers.
  const [busbarCuKg, setBusbarCuKg] = useState('');
  const [heavyHaulLoads, setHeavyHaulLoads] = useState('');

  // Selected files
  const [mrFile, setMrFile] = useState<File | null>(null);
  const [vendorFiles, setVendorFiles] = useState<Array<{ file: File; vendorId: string; vendorName: string; country: string }>>([]);

  // Job progress state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [phase, setPhase] = useState<IngestPhase | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  const fail = (message: string) => {
    setIsProcessing(false);
    setPhase((p) => (p ? 'failed' : p));
    setError(message);
  };

  const simulateJobProgression = (targetTenderId: string) => {
    const stages = [
      { msg: 'Sample run: reading the documents...', stage: 'Parse', pct: 15 },
      { msg: 'Sample run: finding each quote...', stage: 'Locate', pct: 40 },
      { msg: 'Sample run: checking each quote is on its page...', stage: 'Check each quote is on its page', pct: 65 },
      { msg: 'Sample run: reading the values...', stage: 'Read values', pct: 85 },
      { msg: 'Sample run: pricing the gaps...', stage: 'Price', pct: 95 },
      { msg: 'Sample run: done. Opening the tender...', stage: 'Persist', pct: 100 },
    ];
    let i = 0;
    const interval = setInterval(() => {
      if (i < stages.length) {
        const job = {
          job_id: `replay-${targetTenderId}`,
          status: i === stages.length - 1 ? 'COMPLETED' : 'PROCESSING',
          progress_pct: stages[i].pct,
          stage: stages[i].stage,
          created_at: new Date().toISOString(),
          completed_at: null,
        } as Job;
        setStatusMessage(stages[i].msg);
        setCurrentJob(job);
        setPhase(phaseFor(job));
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          router.push(`/audit/${targetTenderId}`);
        }, 600);
      }
    }, 400);
  };

  // Quick preset runner (for pre-staged benchmark tenders)
  const handleQuickLoadPreset = async (presetId: string) => {
    try {
      setIsProcessing(true);
      setError(null);
      setStatusMessage(`Starting ${presetId}...`);
      setPhase('queued');

      // No live engine: play the saved run directly instead of asking a server that will refuse.
      if (isReplay && SAMPLE_TENDER_IDS.has(presetId)) {
        simulateJobProgression(presetId);
        return;
      }

      const res = await startIngestJob(presetId, 'replay');
      if (res && res.job_id) {
        pollJob(res.job_id, presetId);
      } else {
        simulateJobProgression(presetId);
      }
    } catch (err: any) {
      // No live server: only a tender with saved sample data can be opened.
      if (SAMPLE_TENDER_IDS.has(presetId)) {
        setStatusMessage(`Loading the saved sample for ${presetId}...`);
        simulateJobProgression(presetId);
      } else {
        fail(err?.message || `No saved sample for ${presetId}. Connect a live server to process it.`);
      }
    }
  };

  // Polls every 0.6 s at first, backing off to 5 s, for at most 20 minutes (a live ingest of a
  // large tender can take several). Stops on COMPLETED, FAILED, unmount, or 4 failed checks in a row.
  const POLL_LIMIT_MS = 20 * 60 * 1000;
  const pollJob = (jobId: string, targetTenderId: string) => {
    const started = Date.now();
    let failedAttempts = 0;
    let delay = 600;

    const tick = async () => {
      pollTimer.current = null;
      if (Date.now() - started > POLL_LIMIT_MS) {
        fail(`Still processing after 20 minutes. Check the tender list later; job ${jobId} keeps running on the server.`);
        return;
      }
      try {
        const job = await getJobStatus(jobId);
        failedAttempts = 0;
        setCurrentJob(job);
        setPhase(phaseFor(job));
        if (job.status === 'COMPLETED') {
          setStatusMessage('Done. Opening the tender...');
          setTimeout(() => router.push(`/audit/${targetTenderId}`), 800);
          return;
        }
        if (job.status === 'FAILED') {
          fail(job.error || 'Processing stopped. Nothing was saved. Try again.');
          return;
        }
        setStatusMessage(job.status === 'PENDING' ? 'Queued. Waiting for a worker...' : 'Processing on the engine...');
      } catch {
        failedAttempts++;
        if (failedAttempts > 3) {
          fail('Lost contact with the server. Check the tender list in a minute.');
          return;
        }
      }
      delay = Math.min(Math.round(delay * 1.5), 5000);
      pollTimer.current = setTimeout(tick, delay);
    };

    pollTimer.current = setTimeout(tick, delay);
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!mrFile && !tenderId) {
      setError('Add your spec PDF first.');
      return;
    }

    try {
      setIsProcessing(true);
      setCurrentJob(null);
      setPhase('uploading');
      setStatusMessage('Uploading...');

      const estimates: Record<string, number> = {};
      for (const [name, raw] of [['busbar_cu_kg', busbarCuKg], ['heavy_haul_loads', heavyHaulLoads]] as const) {
        if (raw.trim() === '') continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
          setIsProcessing(false);
          setPhase(null);
          setError(`${name === 'busbar_cu_kg' ? 'Busbar copper' : 'Heavy-haul loads'} must be a number of 0 or more.`);
          return;
        }
        estimates[name] = value;
      }

      // 1. Upload MR Spec if provided
      if (mrFile) {
        setStatusMessage(`Uploading ${mrFile.name}...`);
        await uploadTenderFile(tenderId, mrFile.name, mrFile);
      }

      // 2. Upload Vendor Proposals
      for (const [i, v] of vendorFiles.entries()) {
        setStatusMessage(`Uploading bid ${i + 1} of ${vendorFiles.length}: ${v.file.name}...`);
        await uploadTenderFile(tenderId, v.file.name, v.file);
      }

      // 3. Commit Manifest
      setStatusMessage('Saving the file list...');
      const manifestDocuments: any[] = [];
      if (mrFile) {
        manifestDocuments.push({ file: mrFile.name, role: 'mr_spec' });
      }
      for (const v of vendorFiles) {
        manifestDocuments.push({
          file: v.file.name,
          role: 'vendor_bid',
          vendor_id: v.vendorId,
          vendor_name: v.vendorName,
          country: v.country,
        });
      }

      if (manifestDocuments.length > 0) {
        await putManifest(tenderId, {
          tender_id: tenderId,
          title: tenderTitle,
          client: clientName,
          equipment_class: equipmentClass,
          rate_table: rateTable,
          documents: manifestDocuments,
          engineering_estimates: estimates,
          synthetic: false,
        });
      }

      // 4. Start Ingestion Job
      setPhase('queued');
      setStatusMessage('Queued. Processing starts shortly.');
      // 'auto': reuse saved model answers where they exist, ask the model for the rest. 'replay' would
      // fail on a new tender, which has no saved answers.
      const res = await startIngestJob(tenderId, 'auto');
      if (res && res.job_id) {
        pollJob(res.job_id, tenderId);
      } else {
        fail("The server didn't start processing. Try again.");
      }
    } catch (err: any) {
      console.error('Custom document ingestion error:', err);
      fail(err?.message || 'Upload failed. Try again.');
    }
  };

  const input =
    'w-full rounded border border-rule-strong bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink placeholder:text-faint';
  const lbl = 'mb-1 block text-[11px] text-muted';
  const drop =
    'block cursor-pointer rounded border border-dashed border-rule-strong px-4 py-6 text-center hover:border-ink';

  return (
    <div className="space-y-8 text-[13px] text-ink">
      {/* Sample tender: the one-click path to a full result */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-rule py-4">
        <div>
          <p className="font-medium">Run the sample audit</p>
          <p className="mt-0.5 text-xs text-muted">
            <span className="font-mono">{SAMPLE_TENDER_ID}</span>: a synthetic 33 kV switchgear tender with 3 bids.
          </p>
        </div>
        <button
          onClick={() => handleQuickLoadPreset(SAMPLE_TENDER_ID)}
          disabled={isProcessing}
          className="rounded bg-brand px-3.5 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
        >
          Open sample audit
        </button>
      </div>

      {phase && (isProcessing || phase === 'failed') && (
        <IngestProgress phase={phase} job={currentJob} message={statusMessage} />
      )}

      <EngineNote engine={engine} onRecheck={recheckEngine} />

      <form onSubmit={handleCustomSubmit}>
        <fieldset
          disabled={isReplay}
          aria-describedby={isReplay ? 'replay-upload-note' : undefined}
          className={`min-w-0 space-y-8 ${isReplay ? 'opacity-50' : ''}`}
        >
          <section>
            <h2 className="font-medium">Tender</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 border-t border-rule pt-4 md:grid-cols-3">
              <div>
                <label htmlFor="tenderIdInput" className={lbl}>Tender ID</label>
                <input id="tenderIdInput" type="text" value={tenderId} onChange={(e) => setTenderId(e.target.value)} placeholder="TENDER-2026-XXX" className={`${input} font-mono`} required />
              </div>
              <div>
                <label htmlFor="tenderTitleInput" className={lbl}>Package name</label>
                <input id="tenderTitleInput" type="text" value={tenderTitle} onChange={(e) => setTenderTitle(e.target.value)} placeholder="33 kV GIS switchgear package" className={input} required />
              </div>
              <div>
                <label htmlFor="clientNameInput" className={lbl}>Client</label>
                <input id="clientNameInput" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Your EPC or utility" className={input} required />
              </div>
              <div>
                <label htmlFor="busbarCuKgInput" className={lbl}>Busbar copper estimate, kg (optional)</label>
                <input id="busbarCuKgInput" type="number" min="0" step="any" inputMode="decimal" value={busbarCuKg} onChange={(e) => setBusbarCuKg(e.target.value)} placeholder="Blank if unknown" className={`${input} tabular-nums`} />
              </div>
              <div>
                <label htmlFor="heavyHaulInput" className={lbl}>Heavy-haul loads (optional)</label>
                <input id="heavyHaulInput" type="number" min="0" step="1" inputMode="numeric" value={heavyHaulLoads} onChange={(e) => setHeavyHaulLoads(e.target.value)} placeholder="Blank if unknown" className={`${input} tabular-nums`} />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">Your spec</h2>
                <span className="text-[11px] text-faint">Required · PDF up to 50 MB, 600 pages</span>
              </div>
              <input
                type="file"
                accept=".pdf"
                id="mrFileInput"
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) setMrFile(e.target.files[0]);
                }}
              />
              <label htmlFor="mrFileInput" className={`${drop} mt-3`}>
                <span className="block text-ink-2">{mrFile ? 'Replace the spec PDF, or browse' : 'Drop the spec PDF, or browse'}</span>
              </label>
              {mrFile && (
                <div className="mt-2 flex items-center justify-between gap-3 border-y border-rule py-1.5 text-xs">
                  <span className="min-w-0 truncate text-ink-2">{mrFile.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-[11px] text-faint">{(mrFile.size / 1024).toFixed(0)} KB</span>
                    <ActionButton
                      icon={X}
                      iconOnly
                      tone="destructive"
                      label={`Remove ${mrFile.name}`}
                      disabled={isProcessing}
                      onClick={() => {
                        setMrFile(null);
                        const el = document.getElementById('mrFileInput') as HTMLInputElement | null;
                        if (el) el.value = '';
                      }}
                    />
                  </span>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">Bids</h2>
                <span className="text-[11px] text-faint">One PDF per bidder</span>
              </div>
              <input
                type="file"
                accept=".pdf"
                multiple
                id="vendorFileInput"
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files) {
                    const files = Array.from(e.target.files);
                    // Next unused letter, so removing a bid never makes two share an ID.
                    const used = new Set(vendorFiles.map((v) => v.vendorId));
                    let n = 0;
                    const nextId = () => {
                      while (used.has(`vendor-${String.fromCharCode(97 + n)}`)) n++;
                      const id = `vendor-${String.fromCharCode(97 + n)}`;
                      used.add(id);
                      return id;
                    };
                    const newItems = files.map((file) => ({
                      file,
                      vendorId: nextId(),
                      vendorName: file.name.replace(/\.pdf$/i, ''),
                      country: 'EU',
                    }));
                    setVendorFiles([...vendorFiles, ...newItems]);
                    e.target.value = '';
                  }
                }}
              />
              <label htmlFor="vendorFileInput" className={`${drop} mt-3`}>
                <span className="block text-ink-2">
                  {vendorFiles.length > 0
                    ? `${vendorFiles.length} ${vendorFiles.length === 1 ? 'bid' : 'bids'} added. Add more`
                    : 'Drop bid PDFs, or browse'}
                </span>
              </label>
              {vendorFiles.length > 0 && (
                <ul className="mt-2 max-h-36 overflow-y-auto border-t border-rule text-xs">
                  {vendorFiles.map((v, i) => (
                    <li key={`${v.vendorId}-${v.file.name}`} className="flex items-center justify-between gap-3 border-b border-rule py-1">
                      <span className="min-w-0 flex-1">
                        <input
                          type="text"
                          value={v.vendorName}
                          aria-label={`Bidder name for ${v.file.name}`}
                          disabled={isProcessing}
                          onChange={(e) =>
                            setVendorFiles(vendorFiles.map((x, j) => (j === i ? { ...x, vendorName: e.target.value } : x)))
                          }
                          className="w-full truncate rounded-sm bg-transparent px-1 py-0.5 text-ink-2 hover:bg-sheet focus:bg-paper focus:outline-none focus:ring-1 focus:ring-rule-strong"
                        />
                        <span className="block truncate px-1 text-[11px] text-faint">{v.file.name}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-faint">{v.vendorId}</span>
                      <ActionButton
                        icon={X}
                        iconOnly
                        tone="destructive"
                        label={`Remove ${v.file.name}`}
                        disabled={isProcessing}
                        onClick={() => setVendorFiles(vendorFiles.filter((_, j) => j !== i))}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {error && <p className="text-xs text-gap" role="alert">{error}</p>}

          <div className="flex justify-end border-t border-rule pt-4">
            <button
              type="submit"
              disabled={isProcessing}
              className="flex items-center gap-1.5 rounded bg-ink px-3.5 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
            >
              {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isProcessing ? 'Processing' : 'Evaluate bids'}
            </button>
          </div>
        </fieldset>
        {isReplay && <p id="replay-upload-note" className="sr-only">{ENGINE_COPY.replayShort}</p>}
      </form>
    </div>
  );
}

/** Upload → Queued → Parsing → Extracting → Pricing → Complete, from the engine's own job stage. */
function IngestProgress({ phase, job, message }: { phase: IngestPhase; job: Job | null; message: string }) {
  const current = phaseIndex(phase);
  const failed = phase === 'failed';
  return (
    <div className="border-b border-rule pb-4" role="status" aria-live="polite">
      <ol className="grid grid-cols-6 gap-2 text-[11px]">
        {INGEST_PHASES.map((p, i) => {
          const done = !failed && (i < current || phase === 'complete');
          const active = !failed && i === current && phase !== 'complete';
          return (
            <li key={p.id} className="min-w-0">
              <div className={`h-0.5 ${done ? 'bg-ink' : active ? 'bg-brand' : 'bg-rule'}`} />
              <p className={`mt-1.5 flex items-center gap-1 truncate ${done || active ? 'text-ink' : 'text-faint'}`}>
                {active && <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />}
                {p.label}
              </p>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex items-baseline justify-between gap-4 text-xs">
        <span className={failed ? 'text-gap' : 'text-muted'}>
          {failed ? 'Processing stopped. The reason is below.' : message}
          {job?.stage && !failed && <span className="text-faint"> · engine stage: {job.stage}</span>}
        </span>
        {job && <span className="tabular-nums text-ink">{job.progress_pct}%</span>}
      </div>
    </div>
  );
}

/**
 * Says what the workbench is connected to: silent when the engine is live and healthy, a specific
 * diagnosis otherwise, with the engineering detail behind a disclosure.
 */
function EngineNote({ engine, onRecheck }: { engine: EngineState; onRecheck: () => void }) {
  if (engine.kind === 'checking') {
    return (
      <p className="flex items-center gap-2 text-xs text-faint">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Checking the engine connection...
      </p>
    );
  }
  if (engine.kind === 'live') {
    if (engine.engine === 'native') {
      return (
        <p className="text-xs text-faint">
          Connected to the built-in engine{engine.model ? ` (${engine.model})` : ''}. New files are processed for real.
          {engine.storage === 'ephemeral' &&
            ' Results live only as long as this server instance; connect a Vercel Blob store to keep them.'}
        </p>
      );
    }
    return (
      <p className="text-xs text-faint">
        Connected to the live engine{engine.version ? ` (v${engine.version})` : ''}. New files are processed for real.
      </p>
    );
  }

  let headline: string;
  let detail: string;
  let tone = 'text-muted';
  if (engine.kind === 'replay' && engine.reason === 'unreachable') {
    headline = `The engine at ${engine.backend ?? 'BACKEND_URL'} isn’t answering, so this page shows the saved sample and can’t process new files.`;
    detail = `Proxy error: ${engine.error ?? 'no answer'}. Check that the engine is running and that BACKEND_URL is its origin, without /api.`;
    tone = 'text-gap';
  } else if (engine.kind === 'replay') {
    headline = ENGINE_COPY.replayShort;
    detail =
      engine.error ??
      'No engine is configured, so /api answers from the saved sample (replay mode). Set LLM_API_KEY and LLM_MODEL_NAME for the built-in engine, or BACKEND_URL to a running engine, and redeploy.';
  } else if (engine.kind === 'degraded') {
    headline = 'The engine is reachable but not healthy. Uploads may fail until it recovers.';
    detail = `${engine.detail} /api/health returned ${engine.status}.`;
    tone = 'text-open';
  } else {
    headline = 'Couldn’t confirm the engine connection. You can still try: any error will say what went wrong.';
    detail = engine.detail;
    tone = 'text-open';
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 text-xs">
      <div className="max-w-2xl space-y-1 leading-relaxed">
        <p className={tone}>{headline}</p>
        <details className="text-faint">
          <summary className="cursor-pointer select-none hover:text-ink">Diagnostic</summary>
          <p className="mt-1 font-mono text-[11px] leading-relaxed">{detail}</p>
        </details>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <button type="button" onClick={onRecheck} className="text-muted hover:text-ink">
          Check again
        </button>
        {engine.kind === 'replay' && (
          <a href={AUDIT_REQUEST_URL} className="font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
            Send us your tender
          </a>
        )}
      </div>
    </div>
  );
}
