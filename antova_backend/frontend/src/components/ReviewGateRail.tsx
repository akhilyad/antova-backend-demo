'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { OpenItem, ReviewSummary } from '../lib/types';

export interface ReviewGateRailProps {
  openItems: OpenItem[];
  review?: ReviewSummary;
  isVerified: boolean;
  onSelectOpenItem: (item: OpenItem) => void;
  onVerify: () => void;
  isVerifying: boolean;
  blockingMessage?: string | null;
}

export function ReviewGateRail({
  openItems,
  review,
  isVerified,
  onSelectOpenItem,
  onVerify,
  isVerifying,
  blockingMessage,
}: ReviewGateRailProps) {
  const openCount = openItems.length;

  // Group by kind
  const reviewFlags = openItems.filter((i) => i.kind === 'review_flag');
  const unpricedItems = openItems.filter((i) => i.kind === 'unpriced' || i.kind === 'missing_price');
  const inspectionItems = openItems.filter((i) => i.kind === 'needs_inspection');
  const projectItems = openItems.filter((i) => i.kind === 'project_field');

  const rows: { item: OpenItem; kind: string; action: string }[] = [
    ...reviewFlags.map((item) => ({ item, kind: 'Review flag', action: 'Review' })),
    ...unpricedItems.map((item) => ({ item, kind: 'Unpriced', action: 'Price or accept' })),
    ...inspectionItems.map((item) => ({ item, kind: 'Needs inspection', action: 'Inspect' })),
    ...projectItems.map((item) => ({ item, kind: 'Project value', action: 'Confirm' })),
  ];

  return (
    <section className="text-[13px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-2">
          <h2 className="font-medium text-ink">Before sign-off</h2>
          <span className={`text-xs tabular-nums ${!isVerified && openCount > 0 ? 'text-open' : 'text-muted'}`}>
            {isVerified ? 'Signed off' : openCount > 0 ? `${openCount} open` : 'Nothing open'}
          </span>
        </div>
        {review && (
          <p className="text-[11px] tabular-nums text-faint">
            {review.reviewed} reviewed · {review.open_flags} flagged · {review.stale} changed since review
          </p>
        )}
      </div>

      {!isVerified && rows.length > 0 && (
        <ul className="mt-3 border-t border-rule">
          {rows.map(({ item, kind, action }, idx) => (
            <li
              key={`${kind}-${idx}`}
              className="grid grid-cols-[8.5rem_6rem_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-rule py-2.5 text-xs"
            >
              <span className={kind === 'Unpriced' ? 'text-open' : 'text-ink-2'}>{kind}</span>
              <span className="font-mono text-[11px] text-faint">{item.param_id || '–'}</span>
              <span className="truncate text-ink-2">{item.message}</span>
              <button
                type="button"
                onClick={() => onSelectOpenItem(item)}
                className="font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
              >
                {action}
              </button>
            </li>
          ))}
        </ul>
      )}

      {blockingMessage && <p className="mt-3 text-xs text-gap">{blockingMessage}</p>}

      {!isVerified && (
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-xs text-muted">
            {openCount > 0 ? 'Price or decide every open item, then sign off.' : 'Every gap has a price or a decision.'}
          </p>
          <button
            type="button"
            onClick={onVerify}
            disabled={openCount > 0 || isVerifying}
            className="flex items-center gap-1.5 rounded bg-ink px-3.5 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isVerifying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Sign off
          </button>
        </div>
      )}
      {isVerified && <p className="mt-2 text-xs text-muted">Downloads are available.</p>}
    </section>
  );
}
