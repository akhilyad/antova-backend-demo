'use client';

import React from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { SplitUploadDropzone } from '../../components/SplitUploadDropzone';
import { UploadCloud, CheckCircle2, ShieldCheck, FileText, Layers } from 'lucide-react';

export default function IngestPage() {
  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl mx-auto font-sans">
        {/* Header Banner */}
        <div className="pb-3 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
              Tender & Bid Ingestion Workbench
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Upload the Employer Material Requisition (MR) specification and vendor bid packages for automated Pint unit evaluation.
            </p>
          </div>
        </div>

        {/* 4-Stage Guided Workflow Indicator */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-3 rounded-lg bg-white dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-cyan-600 dark:text-cyan-400 font-mono">
              Stage 1
            </div>
            <div className="font-semibold text-zinc-900 dark:text-white mt-0.5">
              1. Document Upload
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">MR Spec & Vendor Proposals</div>
          </div>

          <div className="p-3 rounded-lg bg-white dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-zinc-400 font-mono">
              Stage 2
            </div>
            <div className="font-semibold text-zinc-700 dark:text-zinc-300 mt-0.5">
              2. Classification & Map
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Role assignment & country tags</div>
          </div>

          <div className="p-3 rounded-lg bg-white dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-zinc-400 font-mono">
              Stage 3
            </div>
            <div className="font-semibold text-zinc-700 dark:text-zinc-300 mt-0.5">
              3. Pint Math Validation
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">PyMuPDF OCR + Unit checks</div>
          </div>

          <div className="p-3 rounded-lg bg-white dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-zinc-400 font-mono">
              Stage 4
            </div>
            <div className="font-semibold text-zinc-700 dark:text-zinc-300 mt-0.5">
              4. Review Manifest
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Commit to True Job Cost Ledger</div>
          </div>
        </div>

        <SplitUploadDropzone />
      </div>
    </AppShell>
  );
}
