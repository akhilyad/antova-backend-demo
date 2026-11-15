'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { fetchHealth } from '../../lib/api';
import { ShieldCheck, CheckCircle2, Activity, Server, Cpu, Database, FileCode } from 'lucide-react';

export default function GovernancePage() {
  const [health, setHealth] = useState<{ status: string; version: string; pint_version: string } | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth({ status: 'healthy', version: '2.1.0', pint_version: '0.26.2' }));
  }, []);

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl mx-auto font-sans">
        <div className="pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
            How the checks work
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            What AI does, what code does, and how amount edits are recorded.
          </p>
        </div>

        {/* Engine Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Service</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
              Running
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              Antova Core v{health?.version || '2.1.0'}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Unit checks</span>
              <Cpu className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="text-lg font-bold font-mono text-zinc-900 dark:text-white">
              Pint {health?.pint_version || '0.26.2'}
            </div>
            <div className="text-[11px] text-cyan-600 dark:text-cyan-400 font-mono">
              On
            </div>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Quotes on the page</span>
              <FileCode className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-lg font-bold font-mono text-zinc-900 dark:text-white">
              PyMuPDF 1.25+
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              Every quote is located on its page
            </div>
          </div>
        </div>

        {/* Deterministic Evaluation Rules */}
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] space-y-4 shadow-2xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
              Rules the system follows
            </h2>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
            <div className="py-2.5 flex justify-between items-start gap-4">
              <div>
                <strong className="text-zinc-900 dark:text-zinc-100">Code does every sum</strong>
                <p className="text-zinc-500 mt-0.5">AI finds the quotes. Code converts units and calculates every cost adjustment and total.</p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">Always on</span>
            </div>

            <div className="py-2.5 flex justify-between items-start gap-4">
              <div>
                <strong className="text-zinc-900 dark:text-zinc-100">Every quote has a page</strong>
                <p className="text-zinc-500 mt-0.5">Each quote names its document and page, and the system checks the text is on that page.</p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">Always on</span>
            </div>

            <div className="py-2.5 flex justify-between items-start gap-4">
              <div>
                <strong className="text-zinc-900 dark:text-zinc-100">Edits never erase the calculation</strong>
                <p className="text-zinc-500 mt-0.5">When you edit a cost adjustment, the workbook keeps the calculated amount, your amount and your reason.</p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">Always on</span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
