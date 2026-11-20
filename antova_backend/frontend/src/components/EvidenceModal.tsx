'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Highlighter,
  Loader2,
  MoveHorizontal,
  PanelRight,
  Search,
  SquareDashed,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Citation, Parameter, SourceDocument, Vendor } from '../lib/types';
import { openTenderDocument, pageSizes, searchDocument, type PageSize, type Rect, type TextHit } from '../lib/pdf';
import { PdfPageView, type PageHighlight } from './evidence/PdfPageView';
import { InspectorRail, type InspectorSelection } from './evidence/InspectorRail';

interface EvidenceInspectorProps {
  tenderId: string;
  paramId: string;
  /** vendorId, or 'mr' / 'mr_spec' for the buyer's spec. */
  source: string;
  which: 'primary' | 'secondary';
  citation?: Citation | null;
  secondaryCitation?: Citation | null;
  onClose: () => void;
  /** The brief's parameters: used for the rationale and to mark every other citation in the document. */
  parameters?: Parameter[];
  vendors?: Vendor[];
  documents?: SourceDocument[];
  ingestedAt?: string | null;
}

interface DocCitation extends InspectorSelection {
  citation: Citation;
  id: string;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const PAGE_GAP = 16;

function rectsOf(c: Citation | null | undefined): Rect[] {
  if (!c) return [];
  if (Array.isArray(c.rects) && c.rects.length) return c.rects as Rect[];
  return Array.isArray(c.bbox) && c.bbox.length === 4 ? [c.bbox as Rect] : [];
}

/**
 * Evidence Inspector: the cited source PDF, full height, with the clause highlighted and a docked
 * rail explaining it. Replaces the old centred crop modal; the export name stays `EvidenceModal` so
 * existing callers keep working.
 *
 * Document source: /api/review/tenders/{id}/documents/{file}. Live, the proxy streams it from the
 * engine; in replay it redirects to the sample's static copy. Rendering is pdf.js in the browser.
 */
export function EvidenceInspector({
  tenderId,
  paramId,
  source,
  which = 'primary',
  citation,
  secondaryCitation,
  onClose,
  parameters = [],
  vendors = [],
  documents = [],
  ingestedAt,
}: EvidenceInspectorProps) {
  const normalizedSource = source === 'mr_spec' ? 'mr' : source;

  const [selection, setSelection] = useState<InspectorSelection>(() => ({
    paramId,
    source: normalizedSource,
    which,
    citation: (which === 'secondary' ? secondaryCitation ?? citation : citation) ?? null,
  }));

  // The document follows the selected citation. Without one, fall back to the source's own document.
  const fallbackFile = useMemo(() => {
    if (normalizedSource === 'mr') return documents.find((d) => d.role === 'mr_spec')?.filename;
    return documents.find((d) => d.vendor_id === normalizedSource)?.filename;
  }, [documents, normalizedSource]);
  const filename = selection.citation?.filename || fallbackFile || '';

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [docState, setDocState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [docError, setDocError] = useState<string>('');
  const [reloadKey, setReloadKey] = useState(0);

  const [zoom, setZoom] = useState(1); // relative to fit-width
  const [fitScale, setFitScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(selection.citation?.page ?? 1);
  const [pageInput, setPageInput] = useState(String(selection.citation?.page ?? 1));
  const [showRelated, setShowRelated] = useState(true);
  const [showActive, setShowActive] = useState(true);
  const [railOpen, setRailOpen] = useState(true);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<TextHit[]>([]);
  const [hitIndex, setHitIndex] = useState(0);
  const [searching, setSearching] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const searchRef = useRef<HTMLInputElement | null>(null);
  const pendingScroll = useRef<{ page: number; y?: number } | null>(null);

  const scale = fitScale * zoom;

  // --- load the document ----------------------------------------------------------------------
  useEffect(() => {
    if (!filename) {
      setDocState('error');
      setDocError('No source document is recorded for this citation.');
      return;
    }
    let alive = true;
    setDocState('loading');
    setDoc(null);
    setSizes([]);
    openTenderDocument(tenderId, filename)
      .then(async (d) => {
        const s = await pageSizes(d);
        if (!alive) return;
        setDoc(d);
        setSizes(s);
        setDocState('ready');
        const target = selection.citation?.page ?? 1;
        pendingScroll.current = { page: target, y: rectsOf(selection.citation)[0]?.[1] };
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setDocState('error');
        const status = (err as { status?: number })?.status;
        setDocError(
          status === 401
            ? 'The engine refused the document: this deployment needs REVIEW_TOKEN (server) or your reviewer token in Settings.'
            : err instanceof Error
            ? err.message
            : 'The source PDF could not be loaded.'
        );
      });
    return () => {
      alive = false;
    };
    // selection.citation is read once per document load on purpose; switching citations within the
    // same file scrolls instead of reloading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId, filename, reloadKey]);

  // --- fit width ------------------------------------------------------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !sizes.length) return;
    const widest = Math.max(...sizes.map((s) => s.width));
    const measure = () => {
      // 64 px: room for the margin markers on the left and breathing space on the right.
      const avail = Math.max(240, el.clientWidth - 64);
      setFitScale(Math.min(2.5, avail / widest));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sizes, railOpen]);

  // --- scrolling ------------------------------------------------------------------------------
  const scrollToPage = useCallback(
    (page: number, yPoints?: number, smooth = true) => {
      const container = scrollRef.current;
      const el = pageEls.current.get(page);
      if (!container || !el) return;
      const offset = yPoints !== undefined ? Math.max(0, yPoints * scale - container.clientHeight * 0.3) : -PAGE_GAP;
      container.scrollTo({ top: el.offsetTop + offset, behavior: smooth ? 'smooth' : 'auto' });
    },
    [scale]
  );

  // After the document (or the scale) settles, honour any pending jump.
  useEffect(() => {
    if (docState !== 'ready' || !pendingScroll.current) return;
    const { page, y } = pendingScroll.current;
    const t = setTimeout(() => {
      scrollToPage(page, y, false);
      pendingScroll.current = null;
    }, 30);
    return () => clearTimeout(t);
  }, [docState, fitScale, scrollToPage]);

  // Track the page in view.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || docState !== 'ready') return;
    const onScroll = () => {
      const mid = container.scrollTop + container.clientHeight * 0.35;
      let page = 1;
      for (const [n, el] of pageEls.current) {
        if (el.offsetTop <= mid) page = Math.max(page, n);
      }
      setCurrentPage(page);
    };
    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [docState, scale]);

  useEffect(() => setPageInput(String(currentPage)), [currentPage]);

  // Keep the reading position when zooming.
  const setZoomKeepingPage = (z: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
    pendingScroll.current = { page: currentPage };
    setZoom(clamped);
  };
  useEffect(() => {
    if (!pendingScroll.current || docState !== 'ready') return;
    const { page, y } = pendingScroll.current;
    const t = setTimeout(() => {
      scrollToPage(page, y, false);
      pendingScroll.current = null;
    }, 30);
    return () => clearTimeout(t);
  }, [zoom, docState, scrollToPage]);

  const numPages = sizes.length;
  const goToPage = (n: number) => {
    if (!numPages) return;
    const page = Math.min(numPages, Math.max(1, n));
    scrollToPage(page);
  };

  // --- citations in this document -------------------------------------------------------------
  const docCitations = useMemo<DocCitation[]>(() => {
    if (!filename) return [];
    const out: DocCitation[] = [];
    for (const p of parameters) {
      if (p.requirement_citation?.filename === filename) {
        out.push({ id: `${p.id}|mr|primary`, paramId: p.id, source: 'mr', which: 'primary', citation: p.requirement_citation });
      }
      for (const [vendorId, ext] of Object.entries(p.vendors || {})) {
        if (ext?.citation?.filename === filename) {
          out.push({ id: `${p.id}|${vendorId}|primary`, paramId: p.id, source: vendorId, which: 'primary', citation: ext.citation });
        }
        if (ext?.secondary_citation?.filename === filename) {
          out.push({
            id: `${p.id}|${vendorId}|secondary`,
            paramId: p.id,
            source: vendorId,
            which: 'secondary',
            citation: ext.secondary_citation,
          });
        }
      }
    }
    return out;
  }, [parameters, filename]);

  const activeId = `${selection.paramId}|${selection.source}|${selection.which}`;

  const selectCitation = useCallback(
    (c: DocCitation) => {
      setSelection({ paramId: c.paramId, source: c.source, which: c.which, citation: c.citation });
      setRailOpen(true);
      scrollToPage(c.citation.page, rectsOf(c.citation)[0]?.[1]);
    },
    [scrollToPage]
  );

  const vendorName = (id: string) => (id === 'mr' ? 'Your spec' : vendors.find((v) => v.id === id)?.name || id);

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, PageHighlight[]>();
    const push = (page: number, hl: PageHighlight) => {
      const list = map.get(page) || [];
      list.push(hl);
      map.set(page, list);
    };
    if (showRelated) {
      for (const c of docCitations) {
        if (c.id === activeId) continue;
        push(c.citation.page, {
          id: c.id,
          rects: rectsOf(c.citation),
          kind: 'related',
          label: `${c.paramId} · ${vendorName(c.source)}${c.which === 'secondary' ? ' (second source)' : ''}`,
          onSelect: () => selectCitation(c),
        });
      }
    }
    if (showActive && selection.citation && selection.citation.filename === filename) {
      push(selection.citation.page, {
        id: activeId,
        rects: rectsOf(selection.citation),
        kind: 'active',
        label: `${selection.paramId} · ${vendorName(selection.source)}`,
      });
    }
    hits.forEach((h, i) =>
      push(h.page, { id: `hit-${i}`, rects: [h.rect], kind: i === hitIndex ? 'search-current' : 'search' })
    );
    return map;
    // vendorName is derived from vendors
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docCitations, showRelated, showActive, selection, filename, hits, hitIndex, activeId, selectCitation, vendors]);

  // --- search ---------------------------------------------------------------------------------
  useEffect(() => {
    if (!doc) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchDocument(doc, q)
        .then((found) => {
          if (!alive) return;
          setHits(found);
          setHitIndex(0);
          if (found[0]) scrollToPage(found[0].page, found[0].rect[1]);
        })
        .finally(() => alive && setSearching(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // scrollToPage changes with scale; a zoom shouldn't re-run the search
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, query]);

  const stepHit = (dir: 1 | -1) => {
    if (!hits.length) return;
    const next = (hitIndex + dir + hits.length) % hits.length;
    setHitIndex(next);
    scrollToPage(hits[next].page, hits[next].rect[1]);
  };

  // --- keyboard -------------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === 'Escape') {
        if (typing && e.target === searchRef.current && query) {
          setQuery('');
          return;
        }
        onClose();
        return;
      }
      if (typing) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToPage(currentPage + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPage(currentPage - 1);
      } else if (e.key === '+' || e.key === '=') {
        setZoomKeepingPage(zoom + 0.15);
      } else if (e.key === '-') {
        setZoomKeepingPage(zoom - 0.15);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Lock the page behind the overlay.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const download = async () => {
    if (!doc) return;
    const data = await doc.getData();
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const parameter = parameters.find((p) => p.id === selection.paramId);
  const extraction = selection.source === 'mr' ? null : parameter?.vendors?.[selection.source] ?? null;
  const hasSecondary = Boolean(secondaryCitation) && selection.paramId === paramId && selection.source === normalizedSource;

  const iconBtn =
    'inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-paper hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent';
  const toggleBtn = (on: boolean) =>
    `inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] ${on ? 'bg-paper text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)]' : 'text-muted hover:text-ink'}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper text-ink" role="dialog" aria-modal="true" aria-label="Evidence inspector">
      {/* Toolbar */}
      <header className="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-rule bg-sheet px-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-medium">{filename || 'Source document'}</p>
            <p className="truncate text-[11px] text-faint">
              <span className="font-mono">{tenderId}</span> · {vendorName(selection.source)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" className={iconBtn} onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = parseInt(pageInput, 10);
              if (Number.isFinite(n)) goToPage(n);
            }}
            className="flex items-center gap-1 text-[11px] text-muted"
          >
            <input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => setPageInput(String(currentPage))}
              className="h-7 w-10 rounded border border-rule-strong bg-paper text-center text-xs tabular-nums text-ink outline-none focus:border-ink"
              aria-label="Page number"
              inputMode="numeric"
            />
            <span className="tabular-nums">of {numPages || '–'}</span>
          </form>
          <button type="button" className={iconBtn} onClick={() => goToPage(currentPage + 1)} disabled={!numPages || currentPage >= numPages} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="mx-1.5 h-5 w-px bg-rule" aria-hidden />

          <button type="button" className={iconBtn} onClick={() => setZoomKeepingPage(zoom - 0.15)} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-[11px] tabular-nums text-muted">{Math.round(scale * 100)}%</span>
          <button type="button" className={iconBtn} onClick={() => setZoomKeepingPage(zoom + 0.15)} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" className={iconBtn} onClick={() => setZoomKeepingPage(1)} aria-label="Fit to width" title="Fit to width">
            <MoveHorizontal className="h-4 w-4" />
          </button>

          <span className="mx-1.5 h-5 w-px bg-rule" aria-hidden />

          <button type="button" className={toggleBtn(showActive)} onClick={() => setShowActive((v) => !v)} aria-pressed={showActive} title="Box around the active citation">
            <SquareDashed className="h-3.5 w-3.5" /> Crop
          </button>
          <button type="button" className={toggleBtn(showRelated)} onClick={() => setShowRelated((v) => !v)} aria-pressed={showRelated} title="Every other citation in this document">
            <Highlighter className="h-3.5 w-3.5" /> Highlights
            {docCitations.length > 1 && <span className="tabular-nums text-faint">{docCitations.length - 1}</span>}
          </button>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1">
          <div className="relative hidden min-w-0 max-w-[16rem] flex-1 md:block">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  stepHit(e.shiftKey ? -1 : 1);
                }
              }}
              placeholder="Search file contents..."
              className="h-7 w-full rounded border border-rule-strong bg-paper pl-7 pr-14 text-xs text-ink outline-none placeholder:text-faint focus:border-ink"
              aria-label="Search file contents"
              disabled={docState !== 'ready'}
            />
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-faint">
              {searching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : query.trim().length >= 2 ? (
                hits.length ? `${hitIndex + 1}/${hits.length}` : '0'
              ) : (
                <kbd className="rounded border border-rule px-1 font-mono">/</kbd>
              )}
            </span>
          </div>
          <button type="button" className={iconBtn} onClick={download} disabled={!doc} aria-label="Download source PDF" title="Download source PDF">
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${iconBtn} ${railOpen ? 'text-ink' : ''}`}
            onClick={() => setRailOpen((v) => !v)}
            aria-pressed={railOpen}
            aria-label="Toggle the inspector panel"
            title="Inspector panel"
          >
            <PanelRight className="h-4 w-4" />
          </button>
          <button type="button" className={iconBtn} onClick={onClose} aria-label="Close inspector" title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Document canvas */}
        <main ref={scrollRef} className="relative min-w-0 flex-1 overflow-auto" aria-label="Source document">
          {docState === 'loading' && (
            <div className="mx-auto mt-6 w-full max-w-[720px] space-y-4 px-8" aria-label="Loading document">
              {[0, 1].map((i) => (
                <div key={i} className="aspect-[1/1.414] w-full animate-pulse bg-sheet shadow-[0_0_0_1px_var(--rule)]" />
              ))}
              <p className="flex items-center justify-center gap-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading {filename}...
              </p>
            </div>
          )}

          {docState === 'error' && (
            <div className="mx-auto mt-16 max-w-md px-6 text-center">
              <p className="text-[13px] font-medium">The source page couldn’t be shown.</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{docError}</p>
              <p className="mt-1 text-xs text-muted">The quote and its rationale are in the panel on the right.</p>
              {filename && (
                <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-4 text-xs font-medium text-ink underline decoration-rule-strong underline-offset-2">
                  Try again
                </button>
              )}
            </div>
          )}

          {docState === 'ready' && doc && (
            // w-max + min-w-full: centred when narrower than the canvas, scrollable (not clipped on
            // the left) when zoomed wider.
            <div className="flex w-max min-w-full flex-col items-center py-6 pl-10 pr-6" style={{ gap: PAGE_GAP }}>
              {sizes.map((size, i) => {
                const n = i + 1;
                return (
                  <PdfPageView
                    key={`${filename}-${n}`}
                    doc={doc}
                    pageNumber={n}
                    size={size}
                    scale={scale}
                    eager={Math.abs(n - (selection.citation?.page ?? 1)) <= 1}
                    highlights={highlightsByPage.get(n) || []}
                    registerRef={(page, el) => {
                      if (el) pageEls.current.set(page, el);
                      else pageEls.current.delete(page);
                    }}
                  />
                );
              })}
            </div>
          )}
        </main>

        {/* Inspector rail */}
        {railOpen && (
          <aside className="flex w-full max-w-[420px] shrink-0 flex-col border-l border-rule bg-sheet sm:w-[34%] sm:min-w-[320px]" aria-label="Citation details">
            {hasSecondary && (
              <div className="flex shrink-0 gap-1 border-b border-rule px-3 py-2 text-[11px]" role="tablist" aria-label="Citation source">
                {(['primary', 'secondary'] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    role="tab"
                    aria-selected={selection.which === w}
                    onClick={() => {
                      const c = w === 'primary' ? citation ?? null : secondaryCitation ?? null;
                      setSelection((s) => ({ ...s, which: w, citation: c }));
                      if (c && c.filename === filename) scrollToPage(c.page, rectsOf(c)[0]?.[1]);
                    }}
                    className={`rounded px-2 py-1 ${selection.which === w ? 'bg-paper text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)]' : 'text-muted hover:text-ink'}`}
                  >
                    {w === 'primary' ? 'Main source' : 'Other source'}
                  </button>
                ))}
              </div>
            )}
            <div className="min-h-0 flex-1">
              <InspectorRail
                tenderId={tenderId}
                selection={selection}
                parameter={parameter}
                extraction={extraction}
                sourceLabel={vendorName(selection.source)}
                doc={selection.citation?.filename === filename ? doc : null}
                ingestedAt={ingestedAt}
                onShowOnPage={() => {
                  if (selection.citation) scrollToPage(selection.citation.page, rectsOf(selection.citation)[0]?.[1]);
                }}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/** Kept for existing callers: the inspector replaces the old centred modal. */
export const EvidenceModal = EvidenceInspector;
