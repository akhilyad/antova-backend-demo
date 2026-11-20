'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader2, Send, Sparkles } from 'lucide-react';
import type { Citation, Extraction, Parameter, ReviewRow } from '../../lib/types';
import { askQuestion, fetchEvidenceImageBlob, getAskStatus, listReviewHistory } from '../../lib/api';
import { renderCrop, type Rect } from '../../lib/pdf';
import { formatEur } from '../../lib/formatting';

export interface InspectorSelection {
  paramId: string;
  /** 'mr' for the buyer's spec, else a vendor ID. */
  source: string;
  which: 'primary' | 'secondary';
  citation: Citation | null;
}

interface InspectorRailProps {
  tenderId: string;
  selection: InspectorSelection;
  parameter?: Parameter;
  extraction?: Extraction | null;
  sourceLabel: string;
  doc: PDFDocumentProxy | null;
  ingestedAt?: string | null;
  onShowOnPage: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  COMPLIANT: 'Meets the spec',
  CONFLICT_DOWNGRADE: 'Documents disagree: the weaker offer counts',
  DEVIATION_DOWNGRADE: 'Below the spec',
  DEVIATION_UPGRADE: 'Above the spec',
  OMITTED: 'Not offered',
  MANUAL_INSPECTION_REQUIRED: 'Needs a reviewer to check',
};

type ThreadEntry =
  | { kind: 'review'; row: ReviewRow }
  | { kind: 'flag'; code: string; message: string }
  | { kind: 'question'; text: string; at: string }
  | { kind: 'answer'; text: string; at: string }
  | { kind: 'error'; text: string; at: string };

function citationRects(c: Citation | null): Rect[] {
  if (!c) return [];
  if (Array.isArray(c.rects) && c.rects.length) return c.rects as Rect[];
  return Array.isArray(c.bbox) && c.bbox.length === 4 ? [c.bbox as Rect] : [];
}

/** Crops the engine has already answered 404 for in this tab: not asked again. */
const engineCropMisses = new Set<string>();

/** The crop behind the citation: the engine's PNG when it serves one, else cut from the PDF here. */
function CropPreview({
  tenderId,
  selection,
  doc,
}: {
  tenderId: string;
  selection: InspectorSelection;
  doc: PDFDocumentProxy | null;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [origin, setOrigin] = useState<'engine' | 'browser' | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const { citation } = selection;

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setState('loading');
    setSrc(null);
    const rects = citationRects(citation);

    const fromBrowser = async () => {
      if (!doc || !citation || !rects.length) throw new Error('no source');
      const box: Rect = [
        Math.min(...rects.map((r) => r[0])),
        Math.min(...rects.map((r) => r[1])),
        Math.max(...rects.map((r) => r[2])),
        Math.max(...rects.map((r) => r[3])),
      ];
      return renderCrop(doc, citation.page, box);
    };

    const key = `${tenderId}|${selection.paramId}|${selection.source}|${selection.which}`;
    (async () => {
      try {
        if (engineCropMisses.has(key)) throw new Error('known miss');
        try {
          objectUrl = await fetchEvidenceImageBlob(tenderId, selection.paramId, selection.source, selection.which);
        } catch (err) {
          engineCropMisses.add(key);
          throw err;
        }
        if (!alive) return;
        setSrc(objectUrl);
        setOrigin('engine');
        setState('ready');
      } catch {
        try {
          const url = await fromBrowser();
          if (!alive) return;
          setSrc(url);
          setOrigin('browser');
          setState('ready');
        } catch {
          if (alive) setState(doc || !citation ? 'missing' : 'loading');
        }
      }
    })();

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tenderId, selection.paramId, selection.source, selection.which, citation, doc]);

  return (
    <figure>
      <div className="flex min-h-[72px] items-center justify-center overflow-hidden rounded border border-rule bg-white">
        {state === 'ready' && src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Crop of page ${citation?.page ?? ''}`} className="block max-h-56 w-full object-contain" />
        ) : state === 'loading' ? (
          <div className="h-16 w-full animate-pulse bg-paper" aria-label="Loading crop" />
        ) : (
          <p className="px-3 py-4 text-center text-[11px] text-faint">No crop for this citation. The quote is below.</p>
        )}
      </div>
      {state === 'ready' && (
        <figcaption className="mt-1 text-[10px] text-faint">
          {origin === 'engine' ? 'Cut by the engine from the stored PDF.' : 'Cut in this browser from the source PDF.'}
        </figcaption>
      )}
    </figure>
  );
}

export function InspectorRail({
  tenderId,
  selection,
  parameter,
  extraction,
  sourceLabel,
  doc,
  ingestedAt,
  onShowOnPage,
}: InspectorRailProps) {
  const { citation } = selection;
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [conversation, setConversation] = useState<ThreadEntry[]>([]);
  const [ask, setAsk] = useState<{ enabled: boolean; requires?: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const threadEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getAskStatus().then(setAsk);
  }, []);

  useEffect(() => {
    let alive = true;
    listReviewHistory(tenderId)
      .then((rows) => alive && setReviews(rows))
      .catch(() => alive && setReviews([]));
    return () => {
      alive = false;
    };
  }, [tenderId]);

  useEffect(() => {
    setConversation([]);
  }, [selection.paramId, selection.source, selection.which]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [conversation.length]);

  const isSpec = selection.source === 'mr';
  const thread: ThreadEntry[] = [
    ...reviews
      .filter((r) => r.param_id === selection.paramId && (isSpec || r.vendor_id === selection.source))
      .map((row) => ({ kind: 'review' as const, row })),
    ...(isSpec ? [] : (extraction?.flags || []).map((f) => ({ kind: 'flag' as const, code: f.code, message: f.message }))),
    ...conversation,
  ];

  const submit = async () => {
    const question = draft.trim();
    if (!question || !ask?.enabled || asking) return;
    const at = new Date().toISOString();
    setConversation((c) => [...c, { kind: 'question', text: question, at }]);
    setDraft('');
    setAsking(true);
    try {
      const { answer } = await askQuestion(question, {
        tender_id: tenderId,
        param_id: selection.paramId,
        vendor_id: isSpec ? undefined : selection.source,
        filename: citation?.filename,
        page: citation?.page,
        quote: citation?.quote || citation?.paragraph,
        requirement: parameter?.mr_requirement,
      });
      setConversation((c) => [...c, { kind: 'answer', text: answer, at: new Date().toISOString() }]);
    } catch (err) {
      setConversation((c) => [
        ...c,
        { kind: 'error', text: err instanceof Error ? err.message : 'No answer.', at: new Date().toISOString() },
      ]);
    } finally {
      setAsking(false);
    }
  };

  const status = !isSpec && extraction ? STATUS_LABEL[extraction.status] ?? extraction.status : null;
  const confidence = !isSpec && typeof extraction?.confidence === 'number' ? Math.round(extraction.confidence * 100) : null;
  const askDisabledReason = !ask
    ? 'Checking whether Ask AI is configured...'
    : !ask.enabled
    ? `Ask AI is off. Set ${ask.requires ?? 'ANTOVA_QA_URL'} on the server to enable it.`
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col text-[13px] text-ink">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Citation header */}
        <header>
          <p className="text-[11px] text-muted">
            <span className="font-mono">{selection.paramId}</span> · {sourceLabel}
            {selection.which === 'secondary' && ' · second source'}
          </p>
          <h2 className="mt-0.5 font-medium leading-snug">{parameter?.name || 'Cited clause'}</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            <dt className="text-faint">Reference</dt>
            <dd className="text-ink-2">
              {citation ? (
                <button type="button" onClick={onShowOnPage} className="underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
                  Page {citation.page}
                  {citation.section ? ` · ${citation.section}` : ''}
                </button>
              ) : (
                'No citation recorded'
              )}
            </dd>
            <dt className="text-faint">Extraction</dt>
            <dd className="text-ink-2">
              {citation?.match === 'exact' ? 'Exact quote found on the page' : citation?.match ? `${citation.match} match on the page` : '—'}
              {confidence !== null && <span className="text-faint"> · {confidence}% confidence</span>}
            </dd>
            {ingestedAt && (
              <>
                <dt className="text-faint">Extracted</dt>
                <dd className="tabular-nums text-ink-2">{new Date(ingestedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
              </>
            )}
          </dl>
        </header>

        <CropPreview tenderId={tenderId} selection={selection} doc={doc} />

        {(citation?.quote || citation?.paragraph) && (
          <blockquote className="border-l-2 border-rule-strong pl-3 font-serif text-[13px] leading-relaxed text-ink-2">
            {citation.quote || citation.paragraph}
          </blockquote>
        )}

        {/* Deviation rationale */}
        <section>
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted">Why it matters</h3>
          <dl className="mt-2 space-y-2 border-t border-rule pt-2 text-xs">
            {parameter?.mr_requirement && (
              <div>
                <dt className="text-faint">Spec requires</dt>
                <dd className="text-ink-2">{parameter.mr_requirement}</dd>
              </div>
            )}
            {!isSpec && extraction?.extracted_text && (
              <div>
                <dt className="text-faint">Bid offers</dt>
                <dd className="text-ink-2">{extraction.extracted_text}</dd>
              </div>
            )}
            {status && (
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Result</dt>
                <dd className={extraction?.status === 'COMPLIANT' || extraction?.status === 'DEVIATION_UPGRADE' ? 'text-ink-2' : 'text-gap'}>{status}</dd>
              </div>
            )}
            {!isSpec && extraction && extraction.cost_adder !== null && (
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Cost to close</dt>
                <dd className="tabular-nums text-ink">{formatEur(extraction.cost_adder)}</dd>
              </div>
            )}
            {!isSpec && extraction?.pricing_status === 'UNPRICED' && (
              <p className="text-open">Unpriced: the rate table has no line for this gap. It stays open until a reviewer prices it.</p>
            )}
            {!isSpec && extraction?.adder_formula && (
              <p className="font-mono text-[11px] text-faint">{extraction.adder_formula}</p>
            )}
            {!isSpec && extraction?.conflict_note && <p className="text-open">{extraction.conflict_note}</p>}
            {!isSpec && (extraction?.checks?.length ?? 0) > 0 && (
              <ul className="space-y-1 pt-1">
                {extraction!.checks.map((c, i) => (
                  <li key={`${c.field}-${i}`} className="flex justify-between gap-3 text-[11px]">
                    <span className="text-muted">
                      {c.field} {c.operator} {c.required}
                    </span>
                    <span className={c.passed ? 'text-ink-2' : 'text-gap'}>
                      {c.offered || '—'} {c.passed ? '✓' : '✕'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </dl>
        </section>

        {/* Audit notes and AI context */}
        <section>
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted">Audit notes</h3>
          <ol className="mt-2 space-y-3 border-t border-rule pt-2 text-xs">
            {thread.length === 0 && <li className="text-faint">No reviewer notes on this clause yet.</li>}
            {thread.map((e, i) => (
              <li key={i} className="leading-relaxed">
                {e.kind === 'review' && (
                  <>
                    <p className="text-[11px] text-faint">
                      <span className="text-ink-2">{e.row.reviewer}</span> · {e.row.action} ·{' '}
                      {new Date(e.row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                    <p className="text-ink-2">{e.row.note || 'No note.'}</p>
                  </>
                )}
                {e.kind === 'flag' && (
                  <>
                    <p className="text-[11px] text-faint">
                      <span className="text-brand">Engine check</span> · <span className="font-mono">{e.code}</span>
                    </p>
                    <p className="text-ink-2">{e.message}</p>
                  </>
                )}
                {e.kind === 'question' && (
                  <p className="text-ink">
                    <span className="text-[11px] text-faint">You · </span>
                    {e.text}
                  </p>
                )}
                {e.kind === 'answer' && (
                  <>
                    <p className="text-[11px] text-brand">Antova AI · not a reviewer decision</p>
                    <p className="whitespace-pre-wrap text-ink-2">{e.text}</p>
                  </>
                )}
                {e.kind === 'error' && <p className="text-gap">{e.text}</p>}
              </li>
            ))}
            {asking && (
              <li className="flex items-center gap-2 text-faint">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Thinking about this clause...
              </li>
            )}
          </ol>
          <div ref={threadEnd} />
        </section>
      </div>

      {/* Ask bar */}
      <form
        className="shrink-0 border-t border-rule bg-sheet p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="inspector-ask" className="sr-only">
          Ask about this clause
        </label>
        <textarea
          id="inspector-ask"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={!ask?.enabled}
          placeholder={ask?.enabled ? 'Ask why this clause affects cost or compliance…' : 'Ask AI is not configured on this deployment.'}
          className="w-full resize-none rounded border border-rule-strong bg-paper px-2.5 py-1.5 text-xs text-ink outline-none placeholder:text-faint focus:border-ink disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-faint">Answers are context, not decisions.</span>
          <span title={askDisabledReason} className="inline-flex">
            <button
              type="submit"
              disabled={!ask?.enabled || asking || !draft.trim()}
              className="inline-flex items-center gap-1.5 rounded bg-ink px-2.5 py-1 text-[11px] font-medium text-paper hover:opacity-90 disabled:opacity-40"
            >
              {asking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Ask AI
              <Send className="h-3 w-3" aria-hidden />
            </button>
          </span>
        </div>
        {askDisabledReason && ask && (
          <p className="mt-1 font-mono text-[10px] text-faint">{askDisabledReason}</p>
        )}
      </form>
    </div>
  );
}
