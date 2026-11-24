/**
 * Page text and text positions from a PDF, server side, with pdf.js (already the viewer's library).
 *
 * Each page keeps its text runs with a box in PDF points, top-left origin: the same space as the
 * engine's citations, so a quote found here becomes a highlight in the Evidence Inspector.
 * Scanned pages have no text layer; they come back empty and are reported, never guessed at.
 */

export type Rect = [number, number, number, number];

export interface PageRun {
  /** The run's text. */
  s: string;
  /** [x0, top, x1, bottom] in points. */
  r: Rect;
}

export interface PageText {
  page: number;
  width: number;
  height: number;
  /** Reading-order text, one line per text line. */
  text: string;
  runs: PageRun[];
}

export interface ParsedPdf {
  pages: PageText[];
}

let loader: Promise<any> | null = null;

async function pdfjs(): Promise<any> {
  if (!loader) {
    loader = (async () => {
      const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      // pdf.js runs its worker in-process in Node when the worker module is already loaded.
      (globalThis as any).pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
      return lib;
    })().catch((err) => {
      loader = null;
      throw err;
    });
  }
  return loader;
}

const round = (n: number) => Math.round(n * 10) / 10;

export async function parsePdf(bytes: Uint8Array, maxPages = 600): Promise<ParsedPdf> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  try {
    if (doc.numPages > maxPages) {
      throw new Error(`This PDF has ${doc.numPages} pages; the limit is ${maxPages}.`);
    }
    const pages: PageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const runs: PageRun[] = [];
      for (const item of content.items as any[]) {
        if (typeof item?.str !== 'string' || !item.str.trim()) continue;
        const [a, b, , d, x, y] = item.transform as number[];
        const h = item.height || Math.hypot(b, d) || Math.abs(a) || 10;
        const top = vp.height - (y + h);
        runs.push({ s: item.str, r: [round(x), round(top), round(x + item.width), round(top + h)] });
      }
      pages.push({ page: n, width: round(vp.width), height: round(vp.height), text: linesOf(runs), runs });
      page.cleanup();
    }
    return { pages };
  } finally {
    await doc.destroy();
  }
}

/** Runs grouped into lines (same baseline within 2 pt), top to bottom, left to right. */
function linesOf(runs: PageRun[]): string {
  const sorted = [...runs].sort((p, q) => p.r[3] - q.r[3] || p.r[0] - q.r[0]);
  const lines: PageRun[][] = [];
  for (const run of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].r[3] - run.r[3]) <= 2) line.push(run);
    else lines.push([run]);
  }
  return lines
    .map((line) =>
      line
        .sort((p, q) => p.r[0] - q.r[0])
        .map((r) => r.s)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join('\n');
}

// --- Finding a quote on its page -------------------------------------------------------------

/** Lowercase, one kind of quote mark and dash, no whitespace: robust to how pdf.js splits runs. */
function squash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, '');
}

export interface QuoteHit {
  page: number;
  match: 'exact' | 'fuzzy';
  rects: Rect[];
  bbox: Rect;
  /** The full text of the lines the quote sits on (the citation's paragraph). */
  paragraph: string;
}

function union(rects: Rect[]): Rect {
  return [
    Math.min(...rects.map((r) => r[0])),
    Math.min(...rects.map((r) => r[1])),
    Math.max(...rects.map((r) => r[2])),
    Math.max(...rects.map((r) => r[3])),
  ];
}

/** Lines of the page's runs that the hit touches, joined: the "paragraph" a reviewer reads. */
function paragraphFor(page: PageText, runIdx: Set<number>): string {
  const touched = page.runs.filter((_, i) => runIdx.has(i));
  if (!touched.length) return '';
  const top = Math.min(...touched.map((r) => r.r[1])) - 1;
  const bottom = Math.max(...touched.map((r) => r.r[3])) + 1;
  return page.runs
    .filter((r) => r.r[1] >= top && r.r[3] <= bottom)
    .sort((p, q) => p.r[3] - q.r[3] || p.r[0] - q.r[0])
    .map((r) => r.s)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findOnPage(page: PageText, quote: string): QuoteHit | null {
  const needle = squash(quote);
  if (needle.length < 3) return null;
  // The page's squashed text, and for each character the run it came from.
  let hay = '';
  const owner: number[] = [];
  page.runs.forEach((run, i) => {
    const s = squash(run.s);
    hay += s;
    for (let k = 0; k < s.length; k++) owner.push(i);
  });
  const at = hay.indexOf(needle);
  if (at >= 0) {
    const idx = new Set(owner.slice(at, at + needle.length));
    const rects = [...idx].map((i) => page.runs[i].r);
    return { page: page.page, match: 'exact', rects, bbox: union(rects), paragraph: paragraphFor(page, idx) };
  }
  // Fuzzy: the window of runs sharing the most words with the quote, if at least 80% of them.
  const words = quote.toLowerCase().match(/[a-z0-9.,%°/-]+/g) || [];
  if (words.length < 3) return null;
  const want = new Set(words);
  let best: { score: number; idx: number[] } | null = null;
  for (let i = 0; i < page.runs.length; i++) {
    const seen = new Set<string>();
    const idx: number[] = [];
    for (let j = i; j < page.runs.length && j < i + 12; j++) {
      idx.push(j);
      for (const w of page.runs[j].s.toLowerCase().match(/[a-z0-9.,%°/-]+/g) || []) if (want.has(w)) seen.add(w);
      const score = seen.size / want.size;
      if (!best || score > best.score) best = { score, idx: [...idx] };
      if (score === 1) break;
    }
  }
  if (!best || best.score < 0.8) return null;
  const idx = new Set(best.idx);
  const rects = best.idx.map((i) => page.runs[i].r);
  return { page: page.page, match: 'fuzzy', rects, bbox: union(rects), paragraph: paragraphFor(page, idx) };
}

/**
 * Where `quote` is: on `page` first, then on any other page (the model named the wrong one). Null
 * when it is nowhere in the document: that citation cannot be trusted.
 */
export function locateQuote(pages: PageText[], quote: string, page?: number | null): QuoteHit | null {
  if (!quote || !quote.trim()) return null;
  const first = pages.find((p) => p.page === page);
  if (first) {
    const hit = findOnPage(first, quote);
    if (hit) return hit;
  }
  let fuzzy: QuoteHit | null = null;
  for (const p of pages) {
    if (p === first) continue;
    const hit = findOnPage(p, quote);
    if (hit?.match === 'exact') return hit;
    if (hit && !fuzzy) fuzzy = hit;
  }
  return fuzzy;
}
