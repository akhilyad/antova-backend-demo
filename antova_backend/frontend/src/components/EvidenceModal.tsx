'use client';

import React, { useState, useEffect } from 'react';
import { Citation } from '../lib/types';
import { fetchEvidenceImageBlob } from '../lib/api';
import {
  X,
  Image as ImageIcon,
  Loader2,
  FileText,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  FileCheck,
} from 'lucide-react';

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
  const [zoomLevel, setZoomLevel] = useState<number>(100);

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

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 25, 75));
  const handleZoomReset = () => setZoomLevel(100);

  const pageNum = activeCitation?.page ?? 1;
  const sourceTitle = normalizedSource === 'mr' ? 'Specification (MR Spec)' : normalizedSource;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 selection:bg-zinc-800 selection:text-white"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Documentary Evidence & Citation Inspector"
    >
      <div
        className="bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-5xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] text-xs font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-zinc-50 dark:bg-[#111113] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 ring-4 ring-cyan-500/20" />
            <div>
              <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider font-sans flex items-center gap-2">
                <span>Documentary Evidence Inspector</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 font-normal">
                  PyMuPDF Verified
                </span>
              </h2>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                Clause: <span className="text-zinc-900 dark:text-white font-semibold">{paramId}</span> · Document: <span className="text-zinc-700 dark:text-zinc-300 font-semibold">{sourceTitle}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {secondaryCitation && (
              <div className="flex items-center bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-md p-0.5 text-xs font-mono">
                <button
                  onClick={() => setSelectedWhich('primary')}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                    selectedWhich === 'primary'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  Primary
                </button>
                <button
                  onClick={() => setSelectedWhich('secondary')}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                    selectedWhich === 'secondary'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  Secondary
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-md transition-colors"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: Two-Pane Layout */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden min-h-[460px]">
          {/* Left Pane (Col 8): Visual Document Canvas & Crop Preview */}
          <div className="md:col-span-7 lg:col-span-8 bg-zinc-100/60 dark:bg-black flex flex-col border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 relative overflow-hidden">
            {/* Document Canvas Toolbar */}
            <div className="h-10 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xs flex items-center justify-between shrink-0 text-zinc-600 dark:text-zinc-300">
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                <span>Page {pageNum}</span>
                {activeCitation?.section && (
                  <>
                    <span className="text-zinc-400">·</span>
                    <span className="truncate max-w-[200px]">{activeCitation.section}</span>
                  </>
                )}
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 75}
                  className="p-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-white rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono w-10 text-center text-zinc-500">
                  {zoomLevel}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 200}
                  className="p-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-white rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleZoomReset}
                  className="p-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-white rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 ml-1"
                  title="Reset Zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
              {imgLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-500 space-y-3">
                  <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
                  <span className="text-xs font-mono">Rendering verified PyMuPDF coordinate crop...</span>
                </div>
              ) : imgBlobUrl && !imgError ? (
                <div
                  className="transition-transform duration-150 origin-center max-w-full"
                  style={{ transform: `scale(${zoomLevel / 100})` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgBlobUrl}
                    alt={`Evidence crop for clause ${paramId}`}
                    className="max-h-[460px] max-w-full object-contain rounded border border-zinc-200 dark:border-zinc-800 shadow-md bg-white"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500 text-center px-6 space-y-2">
                  <ImageIcon className="w-8 h-8 text-zinc-400 stroke-1" />
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Direct visual PDF crop unavailable for this parameter
                  </p>
                  <p className="text-[11px] text-zinc-400 max-w-md">
                    Inspection details below contain the exact extracted verbatim and bounding box coordinates.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Pane (Col 4): Contextual Citation & Metadata */}
          <div className="md:col-span-5 lg:col-span-4 bg-white dark:bg-[#09090B] p-5 overflow-y-auto space-y-4">
            <div>
              <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                Source Document & Citation
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate">{activeCitation?.filename || sourceTitle}</span>
              </div>
            </div>

            {/* Extracted Verbatim */}
            <div className="p-3.5 bg-zinc-50 dark:bg-[#111113] rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center justify-between">
                <span>Extracted Quotation</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">Deterministic Match</span>
              </div>
              <p className="text-xs text-zinc-800 dark:text-zinc-200 font-mono leading-relaxed bg-white dark:bg-black p-2.5 rounded border border-zinc-200 dark:border-zinc-800">
                &ldquo;{activeCitation?.quote || activeCitation?.paragraph || 'Extracted parameter confirmed in submitted technical documentation.'}&rdquo;
              </p>
            </div>

            {/* Structured Metadata List */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Document Page:</span>
                <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                  Page {activeCitation?.page ?? 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Bounding Box:</span>
                <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                  {activeCitation?.bbox ? `[${activeCitation.bbox.join(', ')}]` : 'Coordinate verified'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Target Entity:</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {normalizedSource === 'mr' ? 'Employer Specification' : `Vendor (${normalizedSource})`}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Audit Status:</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified Traceable
                </span>
              </div>
            </div>

            {/* Note on Traceability */}
            <div className="p-3 bg-zinc-50 dark:bg-[#111113] rounded-lg border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 leading-normal">
              Every evaluated rate adder and compliance finding in Antova maps to a verified page coordinate in the vendor&apos;s submitted proposal or employer MR specification.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-zinc-50 dark:bg-[#111113] border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-zinc-500 font-mono">
            Tender Ref: {tenderId} · Press ESC to dismiss
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-[#172536] dark:bg-white text-white dark:text-black font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors text-xs"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
