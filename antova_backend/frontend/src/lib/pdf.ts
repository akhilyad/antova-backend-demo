'use client';

/**
 * pdf.js for the Evidence Inspector, loaded only in the browser and only when the inspector opens.
 *
 * Worker: served from this origin at /pdfjs/pdf.worker.min.mjs, copied from node_modules by
 * scripts/copy-pdf-worker.mjs before dev/build, so it always matches the library version.
 *
 * Coordinates: citations carry PyMuPDF rects in PDF points with a top-left origin. pdf.js text
 * positions are bottom-left; textRect() converts them to the same top-left space, so every overlay
 * is simply `points × scale`.
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { fetchDocumentBytes } from './api';

export const PDF_WORKER_SRC = '/pdfjs/pdf.worker.min.mjs';

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist')
      .then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
        return lib;
      })
      .catch((err) => {
        pdfjsPromise = null;
        throw err;
      });
  }
  return pdfjsPromise;
}

const documents = new Map<string, Promise<PDFDocumentProxy>>();

/** The tender's source PDF, fetched once per tab and kept open while the tab lives. */
export function openTenderDocument(tenderId: string, filename: string): Promise<PDFDocumentProxy> {
  const key = `${tenderId}/${filename}`;
  let pending = documents.get(key);
  if (!pending) {
    pending = Promise.all([loadPdfJs(), fetchDocumentBytes(tenderId, filename)])
      .then(([lib, bytes]) => lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise)
      .catch((err) => {
        documents.delete(key);
        throw err;
      });
    documents.set(key, pending);
  }
  return pending;
}

export type Rect = [number, number, number, number];

export interface PageSize {
  width: number;
  height: number;
}

/** Every page's size in points (scale 1), in page order. */
export async function pageSizes(doc: PDFDocumentProxy): Promise<PageSize[]> {
  const sizes: PageSize[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    sizes.push({ width: vp.width, height: vp.height });
  }
  return sizes;
}

export interface TextHit {
  page: number;
  rect: Rect;
}

const textCache = new WeakMap<PDFDocumentProxy, Map<number, Promise<{ str: string; rect: Rect }[]>>>();

function pageText(doc: PDFDocumentProxy, pageNumber: number): Promise<{ str: string; rect: Rect }[]> {
  let perDoc = textCache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    textCache.set(doc, perDoc);
  }
  let pending = perDoc.get(pageNumber);
  if (!pending) {
    pending = doc.getPage(pageNumber).then(async (page: PDFPageProxy) => {
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const runs: { str: string; rect: Rect }[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const [, , , , x, y] = item.transform as number[];
        const h = item.height || Math.abs((item.transform as number[])[3]) || 10;
        const [x0, y0, x1, y1] = vp.convertToViewportRectangle([x, y, x + item.width, y + h]);
        runs.push({
          str: item.str,
          rect: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
        });
      }
      return runs;
    });
    perDoc.set(pageNumber, pending);
  }
  return pending;
}

/** Text runs containing `query` (case-insensitive), in page order. */
export async function searchDocument(doc: PDFDocumentProxy, query: string): Promise<TextHit[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits: TextHit[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    for (const run of await pageText(doc, p)) {
      if (run.str.toLowerCase().includes(needle)) hits.push({ page: p, rect: run.rect });
    }
  }
  return hits;
}

/** A PNG data URL of `rect` (points) plus `padding` points of context, cut from the page in the browser. */
export async function renderCrop(doc: PDFDocumentProxy, pageNumber: number, rect: Rect, padding = 24): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const x0 = Math.max(0, rect[0] - padding);
  const y0 = Math.max(0, rect[1] - padding);
  const x1 = Math.min(base.width, rect[2] + padding);
  const y1 = Math.min(base.height, rect[3] + padding);
  const scale = Math.min(3, 900 / Math.max(1, x1 - x0));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((x1 - x0) * scale);
  canvas.height = Math.ceil((y1 - y0) * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.translate(-x0 * scale, -y0 * scale);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  // Outline the cited box, as the engine's crop does (oxblood, 1.5 pt).
  ctx.strokeStyle = '#9E2B1F';
  ctx.lineWidth = 1.5 * scale;
  ctx.strokeRect(rect[0] * scale, rect[1] * scale, (rect[2] - rect[0]) * scale, (rect[3] - rect[1]) * scale);
  return canvas.toDataURL('image/png');
}
