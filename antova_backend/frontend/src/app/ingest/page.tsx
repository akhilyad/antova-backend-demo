'use client';

import React from 'react';
import { Header } from '../../components/Header';
import { SplitUploadDropzone } from '../../components/SplitUploadDropzone';

export default function IngestPage() {
  return (
    <div className="min-h-screen flex flex-col bg-black text-zinc-100 font-sans selection:bg-zinc-800 selection:text-white">
      <Header />

      <main className="flex-1 p-6 max-w-5xl w-full mx-auto space-y-6">
        <div>
          <h1 className="text-base font-semibold text-white uppercase tracking-wider">
            Tender & Bid Ingestion Workbench
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Upload the baseline Engineering Specification (MR Spec) and Vendor Bids, or execute an offline audit on pre-staged sample packages.
          </p>
        </div>

        <SplitUploadDropzone />
      </main>
    </div>
  );
}
