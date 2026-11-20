'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { PageSize, Rect } from '../../lib/pdf';

export interface PageHighlight {
  id: string;
  rects: Rect[];
  kind: 'active' | 'related' | 'search' | 'search-current';
  /** Short label for the margin marker (e.g. "PARAM-04 · vendor-b"). */
  label?: string;
  onSelect?: () => void;
}

interface PdfPageViewProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  size: PageSize;
  scale: number;
  highlights: PageHighlight[];
  /** Render even before the page scrolls into view (the cited page on open). */
  eager?: boolean;
  registerRef?: (pageNumber: number, el: HTMLDivElement | null) => void;
}

// The theme colours are CSS variables, so tints are mixed here rather than with Tailwind's /opacity.
const tint = (v: string, pct: number) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`;
const BOX: Record<PageHighlight['kind'], React.CSSProperties> = {
  active: { border: '1.5px solid var(--gap)', background: tint('--gap', 12) },
  related: { border: `1px solid ${tint('--brand', 60)}`, background: tint('--brand', 7) },
  search: { background: tint('--open', 28) },
  'search-current': { background: tint('--open', 45), outline: '1px solid var(--open)' },
};

/**
 * One PDF page: a placeholder of the right size until it nears the viewport, then a canvas at
 * device resolution, with citation boxes and margin markers laid over it in PDF points × scale.
 */
export function PdfPageView({ doc, pageNumber, size, scale, highlights, eager, registerRef }: PdfPageViewProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(Boolean(eager));
  const [state, setState] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (visible || !wrapRef.current) return;
    const el = wrapRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '800px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    setState('rendering');
    doc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        task = page.render({ canvasContext: ctx, viewport });
        return task.promise;
      })
      .then(() => {
        if (!cancelled) setState('done');
      })
      .catch((err: unknown) => {
        // A cancelled render (zoom changed mid-render) is not an error.
        if (cancelled || (err instanceof Error && err.name === 'RenderingCancelledException')) return;
        setState('error');
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, scale, visible]);

  const w = size.width * scale;
  const h = size.height * scale;

  return (
    <div
      ref={(el) => {
        wrapRef.current = el;
        registerRef?.(pageNumber, el);
      }}
      data-page={pageNumber}
      className="relative mx-auto bg-white shadow-[0_1px_2px_rgba(26,23,20,0.08),0_0_0_1px_var(--rule)]"
      style={{ width: w, height: h }}
      aria-label={`Page ${pageNumber}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      {state !== 'done' && (
        <div className="absolute inset-0 flex items-center justify-center">
          {state === 'error' ? (
            <p className="text-[11px] text-gap">Page {pageNumber} couldn’t be drawn.</p>
          ) : (
            <div className="h-full w-full animate-pulse bg-[linear-gradient(transparent_0,transparent_18px,var(--rule)_18px,var(--rule)_19px)] bg-[length:100%_19px] opacity-40" />
          )}
        </div>
      )}

      {highlights.map((hl) =>
        hl.rects.map((r, i) => (
          <div
            key={`${hl.id}-${i}`}
            className="pointer-events-none absolute rounded-[1px]"
            style={{
              ...BOX[hl.kind],
              left: r[0] * scale - 1,
              top: r[1] * scale - 1,
              width: (r[2] - r[0]) * scale + 2,
              height: (r[3] - r[1]) * scale + 2,
            }}
            data-highlight={hl.kind}
          />
        ))
      )}

      {/* Margin markers: one per citation, level with its first box. */}
      {highlights
        .filter((hl) => (hl.kind === 'active' || hl.kind === 'related') && hl.rects.length > 0)
        .map((hl) => {
          const top = Math.min(...hl.rects.map((r) => r[1])) * scale;
          const active = hl.kind === 'active';
          return (
            <button
              key={`marker-${hl.id}`}
              type="button"
              onClick={hl.onSelect}
              disabled={!hl.onSelect || active}
              title={hl.label}
              aria-label={hl.label ? `Citation ${hl.label}` : 'Citation'}
              className={`absolute -left-7 flex h-5 w-5 items-center justify-center rounded-sm border text-[9px] font-semibold ${
                active ? 'border-gap bg-gap text-paper' : 'border-rule-strong bg-sheet text-muted hover:border-ink hover:text-ink'
              }`}
              style={{ top: Math.max(0, top - 2) }}
            >
              {active ? '●' : '¶'}
            </button>
          );
        })}
    </div>
  );
}
