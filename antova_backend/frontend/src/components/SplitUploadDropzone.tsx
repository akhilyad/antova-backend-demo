'use client';

import React, { useEffect, useRef, useState } from 'react';
import { uploadTenderFile, putManifest, startIngestJob, getJobStatus } from '../lib/api';
import { SAMPLE_TENDER_IDS } from '../lib/replay';
import { Job } from '../lib/types';
import { FileUp, CheckCircle, AlertCircle, Loader2, ArrowRight, UploadCloud, FileCheck, Layers } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function SplitUploadDropzone() {
  const router = useRouter();

  // Ingestion form state
  const [tenderId, setTenderId] = useState('TENDER-2026-402');
  const [tenderTitle, setTenderTitle] = useState('350 MWp Solar + BESS Substation: 33 kV GIS Switchgear Package');
  const [clientName, setClientName] = useState('Vogt-Grid EPC Consortium GmbH');
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

  return (
    <div className="space-y-6 text-xs max-w-5xl mx-auto font-sans">
      {/* Quick Launch Pre-Staged Tenders Ribbon */}
      <div className="p-4 rounded-xl border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113] shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <h3 className="text-xs font-bold text-[#182433] dark:text-white uppercase tracking-wider">
                Try a sample tender
              </h3>
            </div>
            <p className="text-[#667487] dark:text-zinc-400 text-xs mt-1">
              Run a saved sample to see a full result:
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleQuickLoadPreset('TENDER-2026-402')}
              disabled={isProcessing}
              className="px-3.5 py-1.5 bg-[#172536] dark:bg-white text-white dark:text-black font-semibold rounded-md text-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 shadow-2xs"
            >
              Open sample 402
            </button>
            <button
              onClick={() => handleQuickLoadPreset('TENDER-2026-417')}
              disabled={isProcessing}
              className="px-3.5 py-1.5 border border-[#DCE2E8] dark:border-zinc-700 bg-zinc-50 dark:bg-[#111113] text-zinc-900 dark:text-white font-medium rounded-md text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors disabled:opacity-50 shadow-2xs"
            >
              Open sample 417
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Ingestion Form */}
      <form onSubmit={handleCustomSubmit} className="border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113] rounded-xl p-5 space-y-5 shadow-2xs">
        <div className="border-b border-[#DCE2E8] dark:border-zinc-800 pb-3">
          <h2 className="text-xs font-bold text-[#182433] dark:text-white uppercase tracking-wider flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
            <span>Upload a tender</span>
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 text-xs mt-0.5">
            Add your spec and every bid. Antova prices each gap against your spec.
          </p>
        </div>

        {/* Tender Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="tenderIdInput" className="block text-zinc-700 dark:text-zinc-400 font-medium mb-1 text-xs">
              Tender ID
            </label>
            <input
              id="tenderIdInput"
              type="text"
              value={tenderId}
              onChange={(e) => setTenderId(e.target.value)}
              placeholder="TENDER-2026-XXX"
              className="w-full px-3 py-2 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded text-zinc-900 dark:text-white text-xs font-mono focus:border-zinc-500 focus:outline-none shadow-xs"
              required
            />
          </div>

          <div>
            <label htmlFor="tenderTitleInput" className="block text-zinc-700 dark:text-zinc-400 font-medium mb-1 text-xs">
              Package name
            </label>
            <input
              id="tenderTitleInput"
              type="text"
              value={tenderTitle}
              onChange={(e) => setTenderTitle(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded text-zinc-900 dark:text-white text-xs focus:border-zinc-500 focus:outline-none font-sans shadow-xs"
              required
            />
          </div>

          <div>
            <label htmlFor="clientNameInput" className="block text-zinc-700 dark:text-zinc-400 font-medium mb-1 text-xs">
              Client
            </label>
            <input
              id="clientNameInput"
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded text-zinc-900 dark:text-white text-xs focus:border-zinc-500 focus:outline-none font-sans shadow-xs"
              required
            />
          </div>

          <div>
            <label htmlFor="busbarCuKgInput" className="block text-zinc-700 dark:text-zinc-400 font-medium mb-1 text-xs">
              Busbar copper estimate (kg, optional)
            </label>
            <input
              id="busbarCuKgInput"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={busbarCuKg}
              onChange={(e) => setBusbarCuKg(e.target.value)}
              placeholder="Leave blank if unknown"
              className="w-full px-3 py-2 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded text-zinc-900 dark:text-white text-xs focus:border-zinc-500 focus:outline-none font-sans shadow-xs"
            />
          </div>

          <div>
            <label htmlFor="heavyHaulInput" className="block text-zinc-700 dark:text-zinc-400 font-medium mb-1 text-xs">
              Heavy-haul loads (optional)
            </label>
            <input
              id="heavyHaulInput"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={heavyHaulLoads}
              onChange={(e) => setHeavyHaulLoads(e.target.value)}
              placeholder="Leave blank if unknown"
              className="w-full px-3 py-2 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded text-zinc-900 dark:text-white text-xs focus:border-zinc-500 focus:outline-none font-sans shadow-xs"
            />
          </div>
        </div>

        {/* Split Upload Interface */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          {/* Panel A: Baseline Engineering Tender Specification */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-zinc-50/70 dark:bg-[#111113] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-500" />
                Your spec
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Required</span>
            </div>

            <div className="border border-dashed border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 rounded-lg p-5 text-center bg-white/80 dark:bg-black/60 cursor-pointer transition-colors shadow-xs">
              <input
                type="file"
                accept=".pdf"
                id="mrFileInput"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setMrFile(e.target.files[0]);
                  }
                }}
              />
              <label htmlFor="mrFileInput" className="cursor-pointer block">
                <FileUp className="w-8 h-8 mx-auto mb-2 text-zinc-400 dark:text-zinc-500" />
                <div className="text-zinc-800 dark:text-zinc-200 font-medium text-xs">
                  {mrFile ? mrFile.name : 'Drop your spec PDF here, or browse'}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1 font-mono">
                  {mrFile ? `${(mrFile.size / 1024).toFixed(0)} KB, ready` : 'PDF up to 50 MB and 600 pages'}
                </div>
              </label>
            </div>
          </div>

          {/* Panel B: Vendor Proposals */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-zinc-50/70 dark:bg-[#111113] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Bids
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">One PDF per bidder</span>
            </div>

            <div className="border border-dashed border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 rounded-lg p-5 text-center bg-white/80 dark:bg-black/60 cursor-pointer transition-colors shadow-xs">
              <input
                type="file"
                accept=".pdf"
                multiple
                id="vendorFileInput"
                className="hidden"
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
              <label htmlFor="vendorFileInput" className="cursor-pointer block">
                <FileCheck className="w-8 h-8 mx-auto mb-2 text-zinc-400 dark:text-zinc-500" />
                <div className="text-zinc-800 dark:text-zinc-200 font-medium text-xs">
                  {vendorFiles.length > 0
                    ? `${vendorFiles.length} ${vendorFiles.length === 1 ? 'bid' : 'bids'} added`
                    : 'Drop bid PDFs here, or browse'}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  Add every bid you want to compare
                </div>
              </label>
            </div>

            {/* Staged list */}
            {vendorFiles.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                {vendorFiles.map((v, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-xs shadow-xs">
                    <span className="text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]">{v.file.name}</span>
                    <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">{v.vendorId}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <div className="pt-3 border-t border-[#DCE2E8] dark:border-zinc-800 flex items-center justify-between">
          <div className="text-[#667487] dark:text-zinc-400 text-xs">
          </div>
          <button
            type="submit"
            disabled={isProcessing}
            className="px-4 py-2 bg-[#172536] dark:bg-white text-white dark:text-black font-semibold rounded-md text-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-50 shadow-2xs"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>Evaluate bids</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Live Pipeline Monitor Modal */}
      {isProcessing && currentJob && (
        <div className="p-4 border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113] rounded-xl space-y-3 shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-[#DCE2E8] dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 animate-spin" />
              <span className="font-semibold text-zinc-900 dark:text-white uppercase tracking-wider text-xs">
                Progress: {currentJob.job_id}
              </span>
            </div>
            <span className="text-cyan-600 dark:text-cyan-400 font-mono font-bold text-xs tabular-nums">
              {currentJob.progress_pct}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-zinc-200 dark:bg-zinc-900 h-1.5 rounded overflow-hidden">
            <div
              className="bg-zinc-900 dark:bg-white h-full transition-all duration-300"
              style={{ width: `${currentJob.progress_pct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 font-sans">
            <div>
              Step: <strong className="text-zinc-900 dark:text-white uppercase font-mono">{currentJob.stage}</strong>
            </div>
            <div className="text-zinc-800 dark:text-zinc-300">{statusMessage}</div>
          </div>
        </div>
      )}
    </div>
  );
}
