/**
 * The ingest phases a reviewer sees on /ingest, mapped from the engine's job status and stage.
 *
 * The engine reports stages from antova_ingest/pipeline.py STAGES ("Intake", "Parse", "Locate",
 * "Check each quote is on its page", "Read values", "Check where documents disagree", "Price") and
 * "Persist" when the job is saved. No imports, so scripts/test-ingest.mjs tests it with plain Node.
 */

export type IngestPhase = 'uploading' | 'queued' | 'parsing' | 'extracting' | 'pricing' | 'complete' | 'failed';

export const INGEST_PHASES: readonly { id: Exclude<IngestPhase, 'failed'>; label: string }[] = [
  { id: 'uploading', label: 'Upload' },
  { id: 'queued', label: 'Queued' },
  { id: 'parsing', label: 'Parsing' },
  { id: 'extracting', label: 'Extracting' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'complete', label: 'Complete' },
];

const PARSING = ['intake', 'parse'];
const EXTRACTING = ['locate', 'check each quote', 'read values'];
const PRICING = ['check where documents disagree', 'price', 'persist'];

export interface JobLike {
  status?: string | null;
  stage?: string | null;
  progress_pct?: number | null;
}

export function phaseFor(job: JobLike): IngestPhase {
  const status = (job.status || '').toUpperCase();
  if (status === 'FAILED') return 'failed';
  if (status === 'COMPLETED') return 'complete';
  if (status === 'QUEUED' || status === 'PENDING') return 'queued';

  const stage = (job.stage || '').toLowerCase();
  if (PARSING.some((s) => stage.startsWith(s))) return 'parsing';
  if (EXTRACTING.some((s) => stage.startsWith(s))) return 'extracting';
  if (PRICING.some((s) => stage.startsWith(s))) return 'pricing';

  const pct = typeof job.progress_pct === 'number' ? job.progress_pct : 0;
  if (pct <= 0) return 'queued';
  if (pct < 25) return 'parsing';
  if (pct < 85) return 'extracting';
  return 'pricing';
}

/** Index of a phase in INGEST_PHASES (failed counts as wherever the job stopped: -1). */
export function phaseIndex(phase: IngestPhase): number {
  return INGEST_PHASES.findIndex((p) => p.id === phase);
}
