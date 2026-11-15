'use client';

import React, { useState, useEffect } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { listTenders, downloadTbeExport, downloadClarificationsExport } from '../../lib/api';
import { ReviewTenderRow } from '../../lib/types';
import {
  FileSpreadsheet,
  Download,
  FileText,
  Printer,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import Link from 'next/link';

export default function ReportsPage() {
  const [tenders, setTenders] = useState<ReviewTenderRow[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState<string>('TENDER-2026-402');
  const [isExportingTbe, setIsExportingTbe] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    listTenders()
      .then((data) => {
        setTenders(data);
        if (data.length > 0) setSelectedTenderId(data[0].tender_id);
      })
      .catch(() => {});
  }, []);

  const handleExportTbe = async () => {
    try {
      setIsExportingTbe(true);
      await downloadTbeExport(selectedTenderId);
      setActionMsg('Workbook downloaded.');
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      alert(err.message || 'Couldn\'t download the workbook.');
    } finally {
      setIsExportingTbe(false);
    }
  };

  const handleExportClarifications = async (format: 'csv' | 'xlsx') => {
    try {
      if (format === 'csv') setIsExportingCsv(true);
      if (format === 'xlsx') setIsExportingXlsx(true);
      await downloadClarificationsExport(selectedTenderId, format);
      setActionMsg('Clarification questions downloaded.');
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      alert(err.message || 'Couldn\'t download the questions.');
    } finally {
      setIsExportingCsv(false);
      setIsExportingXlsx(false);
    }
  };

  return (
    <AppShell activeTenderId={selectedTenderId} actionNotice={actionMsg}>
      <div className="space-y-6 max-w-5xl mx-auto font-sans">
        {/* Header */}
        <div className="pb-3 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
              Downloads
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              The workbook, the clarification questions and the sign-off sheet for each tender.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Package:</span>
            <select
              value={selectedTenderId}
              onChange={(e) => setSelectedTenderId(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white px-2.5 py-1.5 rounded-md text-xs font-mono shadow-2xs outline-none"
            >
              {tenders.length > 0 ? (
                tenders.map((t) => (
                  <option key={t.tender_id} value={t.tender_id}>
                    {t.tender_id}
                  </option>
                ))
              ) : (
                <option value="TENDER-2026-402">TENDER-2026-402</option>
              )}
            </select>
          </div>
        </div>

        {/* Master Reports Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Export 1: TBE Master Workbook */}
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] space-y-3.5 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-white text-xs">
                  Bid evaluation workbook (.xlsx)
                </h3>
                <span className="text-[10px] text-zinc-500 font-mono">Excel</span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Rankings, evaluated totals, the requirements check and every cost adjustment with its formula.
            </p>
            <button
              onClick={handleExportTbe}
              disabled={isExportingTbe}
              className="w-full py-2 bg-[#172536] dark:bg-white text-white dark:text-black font-semibold rounded-md text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-2xs disabled:opacity-50"
            >
              {isExportingTbe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>Download workbook</span>
            </button>
          </div>

          {/* Export 2: Clarification Register */}
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] space-y-3.5 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-white text-xs">
                  Clarification questions
                </h3>
                <span className="text-[10px] text-zinc-500 font-mono">CSV or Excel</span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              One question per gap, with the spec page and the bidder's quote.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleExportClarifications('csv')}
                disabled={isExportingCsv}
                className="flex-1 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold rounded-md text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs disabled:opacity-50"
              >
                {isExportingCsv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>CSV</span>
              </button>
              <button
                onClick={() => handleExportClarifications('xlsx')}
                disabled={isExportingXlsx}
                className="flex-1 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold rounded-md text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs disabled:opacity-50"
              >
                {isExportingXlsx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* Export 3: Executive Print Sheet */}
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] space-y-3.5 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-white text-xs">
                  Sign-off sheet
                </h3>
                <span className="text-[10px] text-zinc-500 font-mono">For printing</span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              A one-page summary with evaluated totals and signature lines.
            </p>
            <Link
              href={`/print/${selectedTenderId}`}
              target="_blank"
              className="w-full py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold rounded-md text-xs flex items-center justify-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Open sign-off sheet</span>
            </Link>
          </div>
        </div>

        {/* Audit Traceability Notice */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] text-xs text-zinc-500 flex items-start gap-3 shadow-2xs">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-zinc-800 dark:text-zinc-200">
              Where every number comes from
            </div>
            <p className="leading-relaxed">
              Every file shows the source page for each quote and the formula for each cost adjustment.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
