'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DensityPoint } from '../../lib/domain/simulation';

export const BAND_COLOR = {
  optimistic: 'var(--band-optimistic)',
  realistic: 'var(--band-realistic)',
  conservative: 'var(--band-conservative)',
} as const;

interface DistributionChartProps {
  points: DensityPoint[];
  min: number;
  max: number;
  /** Lower and upper threshold, in output units (EUR). */
  thresholds: [number, number];
  onThresholdsChange: (t: [number, number]) => void;
  /** Share of samples below / between / above the thresholds. */
  shares: [number, number, number];
  /** The engine's own figure, marked on the axis. */
  baseline: number | null;
  xLabel: string;
}

const H = 248;
const PAD = { top: 52, right: 16, bottom: 40, left: 16 };

export function eurK(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `€${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `€${(n / 1e3).toFixed(1)}k`;
  return `€${Math.round(n).toLocaleString('en-IE')}`;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 1) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

/**
 * Area chart of the simulated cost, split into three bands by two draggable thresholds.
 * Cost runs left to right, so the left band is the cheapest outcome (optimistic) and the right
 * band the dearest (conservative). Handles move with the pointer or the arrow keys.
 */
export function DistributionChart({
  points,
  min,
  max,
  thresholds,
  onThresholdsChange,
  shares,
  baseline,
  xLabel,
}: DistributionChartProps) {
  const uid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(720);
  const dragging = useRef<0 | 1 | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const yMax = Math.max(...points.map((p) => p.y), 1e-12);
  const x = (v: number) => PAD.left + ((v - min) / (max - min || 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH * 0.92;
  const toValue = (px: number) => min + ((px - PAD.left) / innerW) * (max - min);

  const area = useMemo(() => {
    if (!points.length) return '';
    const pts = points.map((p) => `${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`);
    return `M${x(points[0].x).toFixed(1)},${y(0)} L${pts.join(' L')} L${x(points[points.length - 1].x).toFixed(1)},${y(0)} Z`;
    // x/y depend on width and the data only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width, min, max]);
  const line = useMemo(() => {
    if (!points.length) return '';
    return `M${points.map((p) => `${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' L')}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width, min, max]);

  const [t1, t2] = thresholds;
  const x1 = x(Math.max(min, Math.min(max, t1)));
  const x2 = x(Math.max(min, Math.min(max, t2)));
  const ticks = niceTicks(min, max);
  const step = (max - min) / 100;

  const setHandle = (i: 0 | 1, value: number) => {
    const v = Math.max(min, Math.min(max, value));
    const next: [number, number] = i === 0 ? [Math.min(v, t2), t2] : [t1, Math.max(v, t1)];
    onThresholdsChange(next);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current === null || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setHandle(dragging.current, toValue(e.clientX - rect.left));
  };

  const bands = [
    { key: 'optimistic', from: PAD.left, to: x1, share: shares[0], label: 'Optimistic' },
    { key: 'realistic', from: x1, to: x2, share: shares[1], label: 'Realistic' },
    { key: 'conservative', from: x2, to: PAD.left + innerW, share: shares[2], label: 'Conservative' },
  ] as const;

  return (
    <div
      ref={wrapRef}
      className="relative select-none"
      onPointerMove={onPointerMove}
      onPointerUp={() => (dragging.current = null)}
      onPointerLeave={() => (dragging.current = null)}
    >
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`Distribution of ${xLabel}`}>
        <defs>
          {bands.map((b) => (
            <clipPath key={b.key} id={`${uid}-${b.key}`}>
              <rect x={b.from} y={0} width={Math.max(0, b.to - b.from)} height={H} />
            </clipPath>
          ))}
        </defs>

        {/* Bands */}
        {bands.map((b) => (
          <g key={b.key} clipPath={`url(#${uid}-${b.key})`}>
            <path d={area} fill={BAND_COLOR[b.key]} fillOpacity={0.16} />
            <path d={line} fill="none" stroke={BAND_COLOR[b.key]} strokeWidth={1.25} />
          </g>
        ))}

        {/* Band shares and names */}
        {bands.map((b) => {
          const w = b.to - b.from;
          if (w < 36) return null;
          const cx = b.from + w / 2;
          return (
            <g key={`lbl-${b.key}`} textAnchor="middle">
              <text x={cx} y={PAD.top + innerH * 0.52} fontSize={12} fontWeight={600} fill={BAND_COLOR[b.key]} className="tabular-nums">
                {(b.share * 100).toFixed(1)}%
              </text>
              {w > 90 && (
                <text x={cx} y={PAD.top + innerH * 0.52 + 15} fontSize={10.5} fill="var(--muted)">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Axis */}
        <line x1={PAD.left} x2={PAD.left + innerW} y1={y(0)} y2={y(0)} stroke="var(--rule-strong)" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(0) + 4} stroke="var(--rule-strong)" />
            <text x={x(t)} y={y(0) + 16} fontSize={10.5} textAnchor="middle" fill="var(--muted)" className="tabular-nums">
              {eurK(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left + innerW / 2} y={H - 6} fontSize={11} textAnchor="middle" fill="var(--ink-2)">
          {xLabel}
        </text>

        {/* Engine figure */}
        {baseline !== null && baseline >= min && baseline <= max && (
          <g>
            <line x1={x(baseline)} x2={x(baseline)} y1={y(0) - 6} y2={y(0) + 6} stroke="var(--ink)" strokeWidth={1.5} />
            <text x={x(baseline)} y={y(0) - 9} fontSize={9.5} textAnchor="middle" fill="var(--ink)">
              engine
            </text>
          </g>
        )}

        {/* Threshold lines */}
        {[x1, x2].map((hx, i) => (
          <line key={i} x1={hx} x2={hx} y1={PAD.top - 12} y2={y(0)} stroke="var(--ink-2)" strokeDasharray="3 3" strokeWidth={1} />
        ))}
      </svg>

      {/* Threshold badges and handles (HTML, for focus and keyboard) */}
      {([0, 1] as const).map((i) => {
        const hx = i === 0 ? x1 : x2;
        const value = i === 0 ? t1 : t2;
        return (
          <div key={i} className="absolute" style={{ left: hx, top: 4, transform: 'translateX(-50%)' }}>
            <div className="rounded border border-rule-strong bg-sheet px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-ink shadow-sm">
              {eurK(value)}
            </div>
            <button
              type="button"
              role="slider"
              aria-label={i === 0 ? 'Optimistic / realistic threshold' : 'Realistic / conservative threshold'}
              aria-valuemin={Math.round(min)}
              aria-valuemax={Math.round(max)}
              aria-valuenow={Math.round(value)}
              aria-valuetext={eurK(value)}
              onPointerDown={(e) => {
                dragging.current = i;
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              }}
              onPointerUp={() => (dragging.current = null)}
              onKeyDown={(e) => {
                const big = e.shiftKey ? 10 : 1;
                if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHandle(i, value - step * big);
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHandle(i, value + step * big);
                }
              }}
              className="mx-auto mt-1 flex h-5 w-5 cursor-ew-resize items-center justify-center rounded-full border border-ink-2 bg-sheet text-[9px] leading-none text-ink-2 outline-none hover:border-ink focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            >
              ‹›
            </button>
          </div>
        );
      })}
    </div>
  );
}
