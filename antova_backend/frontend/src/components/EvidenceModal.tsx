'use client';

import React, { useState, useEffect } from 'react';
import { Citation } from '../lib/types';
import { fetchEvidenceImageBlob } from '../lib/api';
import { X, Image as ImageIcon, Loader2, FileText, CheckCircle2 } from 'lucide-react';

interface EvidenceModalProps {
  tenderId: string;
  paramId: string;
  source: string; // vendorId or 'mr' / 'mr_spec'
  which: 'primary' | 'secondary';
  citation?: Citation | null;
  secondaryCitation?: Citation | null;
  onClose: () => void;
}

export function EvidenceModal({
  tenderId,
  paramId,
  source,
  which = 'primary',
  citation,
  secondaryCitation,
  onClose,
}: EvidenceModalProps) {
  const normalizedSource = source === 'mr_spec' ? 'mr' : source;
  const [selectedWhich, setSelectedWhich] = useState<'primary' | 'secondary'>(which);
  const [imgBlobUrl, setImgBlobUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  // Active citation depending on which tab is active
  const activeCitation = selectedWhich === 'primary' ? citation : secondaryCitation || citation;

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setImgLoading(true);
    setImgError(false);

    fetchEvidenceImageBlob(tenderId, paramId, normalizedSource, selectedWhich)
      .then((url) => {
        if (active) {
          objectUrl = url;
          setImgBlobUrl(url);
          setImgLoading(false);
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch((err) => {
        console.warn('Evidence image load failed:', err);
        if (active) {
          setImgError(true);
          setImgLoading(false);
        }
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [tenderId, paramId, normalizedSource, selectedWhich]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 selection:bg-zinc-800 selection:text-white"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Documentary Evidence Viewer"
    >
      <div
        className="bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 bg-zinc-50 dark:bg-[#111113] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-cyan-500" />
            <div>
              <h2 className="text-xs font-semibold text-zinc-900 dark:text-white uppercase tracking-wider font-sans">
                Documentary Evidence & Citation Crop
              </h2>
              <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono mt-0.5">
                Clause: <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{paramId}</span> · Source: <span className="text-zinc-900 dark:text-zinc-200 font-semibold">{normalizedSource === 'mr' ? 'Specification (MR)' : normalizedSource}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {secondaryCitation && (
              <div className="flex items-center bg-zinc-100 dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded p-0.5 text-xs font-mono">
                <button
                  onClick={() => setSelectedWhich('primary')}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    selectedWhich === 'primary'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  Primary
                </button>
                <button
                  onClick={() => setSelectedWhich('secondary')}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    selectedWhich === 'secondary'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  Secondary
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 font-sans">
          {/* Visual Crop Viewer */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded bg-zinc-100/60 dark:bg-black p-3 flex flex-col items-center justify-center min-h-[260px] relative">
            {imgLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-500 dark:text-zinc-400 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                <span className="text-xs font-mono">Rendering verified PyMuPDF coordinate crop...</span>
              </div>
            ) : imgBlobUrl && !imgError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgBlobUrl}
                alt={`Evidence crop for clause ${paramId} from ${normalizedSource}`}
                className="max-h-[420px] max-w-full object-contain rounded border border-zinc-300 dark:border-zinc-800"
              />
            ) : (
              <div className="text-center py-10 text-zinc-500 dark:text-zinc-400 space-y-2">
                <ImageIcon className="w-8 h-8 mx-auto text-zinc-400 dark:text-zinc-600" />
                <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">Visual PDF crop coordinate unrendered.</p>
                <p className="text-[11px] text-zinc-500 max-w-md mx-auto">
                  Textual citation and bounding box coordinates remain fully verifiable below.
                </p>
              </div>
            )}
          </div>

          {/* Citation Metadata Block */}
          {activeCitation && (
            <div className="p-3 bg-zinc-50 dark:bg-[#111113] rounded border border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-zinc-200 dark:border-zinc-800/80 pb-2">
                <div className="flex items-center gap-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                  <FileText className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                  <span className="text-zinc-500">Document:</span>
                  <span className="text-zinc-900 dark:text-white font-medium">{activeCitation.filename}</span>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <div>
                    <span className="text-zinc-500">Page: </span>
                    <strong className="text-cyan-600 dark:text-cyan-400 tabular-nums">{activeCitation.page}</strong>
                  </div>
                  {activeCitation.section && (
                    <div>
                      <span className="text-zinc-500">Section: </span>
                      <strong className="text-zinc-800 dark:text-zinc-200">{activeCitation.section}</strong>
                    </div>
                  )}
                  <div>
                    <span className="text-zinc-500">Match: </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{activeCitation.match || 'exact'}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium uppercase tracking-wider mb-1">
                  Verbatim Text Passage Extracted:
                </div>
                <div className="p-2.5 rounded bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800/80 text-zinc-900 dark:text-zinc-100 text-xs leading-relaxed font-sans shadow-xs">
                  &ldquo;{activeCitation.quote}&rdquo;
                </div>
              </div>

              {activeCitation.bbox && (
                <div className="text-[11px] text-zinc-500 font-mono flex items-center justify-between pt-1">
                  <span>Bounding Box: [{activeCitation.bbox.map((n) => n.toFixed(1)).join(', ')}]</span>
                  <span className="text-zinc-400 dark:text-zinc-600">Deterministic PyMuPDF extraction</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 bg-zinc-50 dark:bg-[#111113] border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs font-sans">
          <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <span>Deterministic verification: every penalty and adder is traceable to exact source text.</span>
          </div>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded text-xs font-medium transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
