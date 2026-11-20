import React from 'react';

export interface KpiItem {
  label: string;
  value: string;
  /** One short line under the figure: who it belongs to, or what it is made of. */
  context?: React.ReactNode;
  tone?: 'ink' | 'gap' | 'open';
  onClick?: () => void;
}

const TONE: Record<NonNullable<KpiItem['tone']>, string> = {
  ink: 'text-ink',
  gap: 'text-gap',
  open: 'text-open',
};

// Hairlines between cells: 2 columns below lg, 4 from lg up.
const CELL_RULES = [
  'pl-0',
  'border-l border-rule',
  'pl-0 border-t lg:border-t-0 lg:pl-5 lg:border-l border-rule',
  'border-l border-t lg:border-t-0 border-rule',
];

/** One ruled strip, up to four figures. No cards, no icons, no sparklines. */
export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 border-y border-rule">
      {items.slice(0, 4).map((item, i) => {
        const clickable = Boolean(item.onClick);
        return (
          <div
            key={item.label}
            className={`min-w-0 py-5 px-5 ${CELL_RULES[i]} ${
              clickable ? 'cursor-pointer hover:bg-sheet focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-rule-strong' : ''
            }`}
            {...(clickable
              ? {
                  role: 'button',
                  tabIndex: 0,
                  onClick: item.onClick,
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      item.onClick?.();
                    }
                  },
                }
              : {})}
          >
            <dt className="text-[11px] leading-4 text-muted">{item.label}</dt>
            <dd className={`mt-1.5 text-2xl leading-8 font-semibold tracking-tight tabular-nums ${TONE[item.tone ?? 'ink']}`}>
              {item.value}
            </dd>
            {item.context && <dd className="mt-0.5 text-xs leading-5 text-muted">{item.context}</dd>}
          </div>
        );
      })}
    </dl>
  );
}
