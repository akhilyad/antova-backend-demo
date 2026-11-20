'use client';

import React, { useEffect, useRef, useState } from 'react';
import { uploadTenderFile, putManifest, startIngestJob, getJobStatus, fetchHealth } from '../lib/api';
import { AUDIT_REQUEST_URL, REPLAY_NOTICE, SAMPLE_TENDER_ID } from '../lib/site';
import { SAMPLE_TENDER_IDS } from '../lib/replay';
import { Job } from '../lib/types';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function SplitUploadDropzone() {
  const router = useRouter();

  // With no live engine (replay mode) new files can't be processed. Say so before anyone fills
  // in the form, and send them to the real intake instead.
  const [isReplay, setIsReplay] = useState(false);
  useEffect(() => {
    fetchHealth()
      .then((h) => setIsReplay(h?.mode === 'replay'))
      .catch(() => setIsReplay(true));
  }, []);

  // Ingestion form state
  const [tenderId, setTenderId] = useState('');
  const [tenderTitle, setTenderTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [equipmentClass, setEquipmentClass] = useState('mv_gis_switchgear');
  const [rateTable, setRateTable] = useState('mv_gis_switchgear_v2');
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
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  const simulateJobProgression = (targetTenderId: string) => {
    const stages = [
      { msg: 'Sample run: reading the documents...', pct: 15 },
      { msg: 'Sample run: finding each quote...', pct: 40 },
      { msg: 'Sample run: checking each quote is on its page...', pct: 65 },
      { msg: 'Sample run: reading the values...', pct: 85 },
      { msg: 'Sample run: pricing the gaps...', pct: 95 },
      { msg: 'Sample run: done. Opening the tender...', pct: 100 },
    ];
    let i = 0;
    const interval = setInterval(() => {
      if (i < stages.length) {
        setStatusMessage(stages[i].msg);
        setCurrentJob({
          job_id: `replay-${targetTenderId}`,
          status: i === stages.length - 1 ? 'COMPLETED' : 'PROCESSING',
          progress_pct: stages[i].pct,
          stage: stages[i].msg.split(':')[0],
          tender_id: targetTenderId,
        } as any);
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
        setIsProcessing(false);
        setError(err?.message || `No saved sample for ${presetId}. Connect a live server to process it.`);
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
        setIsProcessing(false);
        setError(`Still processing after 20 minutes. Check the tender list later; job ${jobId} keeps running on the server.`);
        return;
      }
      try {
        const job = await getJobStatus(jobId);
        failedAttempts = 0;
        setCurrentJob(job);
        if (job.status === 'COMPLETED') {
          setStatusMessage('Done. Opening the tender...');
          setTimeout(() => router.push(`/audit/${targetTenderId}`), 800);
          return;
        }
        if (job.status === 'FAILED') {
          setIsProcessing(false);
          setError(job.error || 'Processing stopped. Nothing was saved. Try again.');
          return;
        }
      } catch {
        failedAttempts++;
        if (failedAttempts > 3) {
          setIsProcessing(false);
          setError(`Lost contact with the server. Check the tender list in a minute.`);
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
      setStatusMessage('Uploading...');

      const estimates: Record<string, number> = {};
      for (const [name, raw] of [['busbar_cu_kg', busbarCuKg], ['heavy_haul_loads', heavyHaulLoads]] as const) {
        if (raw.trim() === '') continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
          setIsProcessing(false);
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
      for (const v of vendorFiles) {
        setStatusMessage(`Uploading bid: ${v.file.name}...`);
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
      setStatusMessage('Queued. Processing starts shortly.');
      // 'auto': reuse saved model answers where they exist, ask the model for the rest. 'replay' would
      // fail on a new tender, which has no saved answers.
      const res = await startIngestJob(tenderId, 'auto');
      if (res && res.job_id) {
        pollJob(res.job_id, tenderId);
      } else {
        setIsProcessing(false);
        setError('The server didn\'t start processing. Try again.');
      }
    } catch (err: any) {
      console.error('Custom document ingestion error:', err);
      setIsProcessing(false);
      setError(err.message || 'Upload failed. Try again.');
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
            <span className="font-mono">{SAMPLE_TENDER_ID}</span>: a real 33 kV switchgear tender with 3 bids.
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

      {isProcessing && currentJob && (
        <div className="border-b border-rule pb-4" role="status">
          <div className="flex items-baseline justify-between text-xs">
            <span className="flex items-center gap-2 text-ink-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {currentJob.stage}
              <span className="text-faint">{statusMessage}</span>
            </span>
            <span className="tabular-nums text-ink">{currentJob.progress_pct}%</span>
          </div>
          <div className="mt-2 h-px w-full bg-rule">
            <div className="h-px bg-ink transition-all duration-300" style={{ width: `${currentJob.progress_pct}%` }} />
          </div>
        </div>
      )}

      {isReplay && (
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
          <p className="max-w-2xl leading-relaxed text-muted">{REPLAY_NOTICE.upload}</p>
          <a href={AUDIT_REQUEST_URL} className="shrink-0 font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
            Send us your tender
          </a>
        </div>
      )}

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
                <span className="block text-ink-2">{mrFile ? mrFile.name : 'Drop the spec PDF, or browse'}</span>
                {mrFile && <span className="mt-0.5 block text-[11px] tabular-nums text-faint">{(mrFile.size / 1024).toFixed(0)} KB</span>}
              </label>
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
                    const newItems = files.map((file, idx) => ({
                      file,
                      vendorId: `vendor-${String.fromCharCode(97 + vendorFiles.length + idx)}`,
                      vendorName: file.name.replace('.pdf', ''),
                      country: 'EU',
                    }));
                    setVendorFiles([...vendorFiles, ...newItems]);
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
                    <li key={i} className="flex justify-between gap-4 border-b border-rule py-1.5">
                      <span className="truncate text-ink-2">{v.file.name}</span>
                      <span className="shrink-0 font-mono text-[11px] text-faint">{v.vendorId}</span>
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
        {isReplay && <p id="replay-upload-note" className="sr-only">{REPLAY_NOTICE.upload}</p>}
      </form>
    </div>
  );
}
