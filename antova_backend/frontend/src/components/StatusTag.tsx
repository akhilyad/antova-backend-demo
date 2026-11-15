import React from 'react';
import type { ComplianceStatus, PricingStatus } from '../lib/types';
import { statusTag, StatusSeverity } from '../lib/domain/status';

export interface StatusTagProps {
  status: ComplianceStatus;
  pricingStatus?: PricingStatus | string;
  overridden?: boolean;
  className?: string;
  showGlyphOnly?: boolean;
}

export function StatusTag({
  status,
  pricingStatus = 'NONE',
  overridden = false,
  className = '',
  showGlyphOnly = false,
}: StatusTagProps) {
  const tag = statusTag(status, (pricingStatus as PricingStatus) || 'NONE', overridden);

  // Footnote palette: color marks only what is wrong or open; compliant is ink
  let colorClasses = '';
  if (tag.severity === 'gap') {
    // Oxblood styling
    colorClasses =
      'text-[#9E2B1F] dark:text-[#E07A6A] bg-[#FDF1F0] dark:bg-[#3A1F1A]/60 border-[#E8C5C1] dark:border-[#7A2B22]';
  } else if (tag.severity === 'open') {
    // Amber / unpriced hatch
    colorClasses =
      'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700';
  } else {
    // Compliant / ok: neutral ink with subtle border (no green!)
    colorClasses =
      'text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700';
  }

  if (showGlyphOnly) {
    return (
      <span
        title={`${tag.word}${overridden ? ' · amount edited' : ''}`}
        className={`inline-flex items-center justify-center w-5 h-5 rounded font-mono text-xs font-semibold border ${colorClasses} ${className}`}
      >
        <span aria-hidden="true">{tag.glyph}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium font-sans border tracking-tight shadow-2xs ${colorClasses} ${className}`}
    >
      <span className="font-mono font-semibold" aria-hidden="true">
        {tag.glyph}
      </span>
      <span>{tag.word}</span>
      {overridden && (
        <span className="text-[9px] uppercase tracking-wider font-bold opacity-75 font-mono">
          · amount edited
        </span>
      )}
    </span>
  );
}
