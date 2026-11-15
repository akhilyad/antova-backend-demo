'use client';

import React, { useState } from 'react';
import {
  FileQuestion,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import type { ProjectBaselineField } from '../lib/types';
import { submitProjectBaselineReview } from '../lib/api';

export interface ProjectBaselineCardProps {
  tenderId: string;
  project?: Record<string, ProjectBaselineField> | null;
  isVerified: boolean;
  onRefresh: () => void;
}

export function ProjectBaselineCard({
  tenderId,
  project,
  isVerified,
  onRefresh,
}: ProjectBaselineCardProps) {
  const [reviewingField, setReviewingField] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!project || Object.keys(project).length === 0) {
    return null;
  }

  const handleConfirm = async (fieldName: string) => {
    try {
      setSubmitting(true);
      setErrorMsg(null);
      await submitProjectBaselineReview(
        tenderId,
        fieldName,
        'approve',
        note.trim() || 'Confirmed baseline project constraint'
      );
      setReviewingField(null);
      setNote('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record project baseline review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 rounded-xl border border-[#D9D4CC] dark:border-[#7A7266] bg-[#FFFFFF] dark:bg-[#1C1916] space-y-3 shadow-2xs font-sans text-xs">
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <FileQuestion className="w-4 h-4 text-cyan-600" />
          <span className="font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
            Project Baseline Constraints
          </span>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300 font-semibold">
            {Object.keys(project).length} Parameters
          </span>
        </div>
        <span className="text-[11px] text-[#767067] dark:text-[#A39A8D]">
          Must be audited before verified seal
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(project).map(([key, field]) => (
          <div
            key={key}
            className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 space-y-2 shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase font-bold text-zinc-600 dark:text-zinc-400">
                {key.replace(/_/g, ' ')}
              </span>
              <span className="font-mono text-xs font-bold text-zinc-900 dark:text-white">
                {String(field.value)}
              </span>
            </div>

            <div className="text-[11px] text-[#767067] dark:text-[#A39A8D]">
              Source: <span className="font-mono">{field.source}</span>
              {field.note && <span> · {field.note}</span>}
            </div>

            {!isVerified && (
              <div className="pt-1">
                {reviewingField === key ? (
                  <div className="space-y-2 pt-1 border-t border-zinc-200 dark:border-zinc-700">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Audit note / confirmation basis..."
                      className="w-full p-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs outline-none"
                    />
                    {errorMsg && (
                      <div className="text-[10px] text-rose-600 dark:text-rose-400">
                        {errorMsg}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReviewingField(null)}
                        className="px-2 py-0.5 rounded border border-zinc-300 text-[11px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirm(key)}
                        disabled={submitting}
                        className="px-2.5 py-0.5 rounded bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 text-[11px] font-semibold flex items-center gap-1"
                      >
                        {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                        <span>Confirm Baseline</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setReviewingField(key);
                      setNote('');
                      setErrorMsg(null);
                    }}
                    className="w-full py-1 rounded bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <CheckCircle2 className="w-3 h-3 text-cyan-600" />
                    <span>Confirm Baseline</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
