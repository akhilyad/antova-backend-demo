'use client';

import React from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { SplitUploadDropzone } from '../../components/SplitUploadDropzone';

const STEPS = ['Upload spec and bids', 'Sort which file is which', 'Read values, convert units', 'Review and evaluate'];

export default function IngestPage() {
  return (
    <AppShell>
      <div className="max-w-5xl text-ink">
        <h1 className="text-xl font-semibold leading-7 tracking-tight">Upload a tender</h1>
        <p className="mt-1 text-xs text-muted">Your spec (material requisition) and the bids you received.</p>
        <ol className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          {STEPS.map((s, i) => (
            <li key={s}>
              <span className="tabular-nums text-faint">{i + 1}</span> {s}
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <SplitUploadDropzone />
        </div>
      </div>
    </AppShell>
  );
}
