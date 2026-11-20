/**
 * Links between the workbench and the Antova landing page.
 *
 * The landing page's "Audit a tender free" button opens the sample audit here. Anything the public
 * demo can't do without a live engine (processing a new tender, sign-off, exports) points back to
 * the landing page's audit request form, where a real tender is taken in under NDA.
 */
export const LANDING_URL = (process.env.NEXT_PUBLIC_LANDING_URL || 'https://antovayc.vercel.app').replace(/\/$/, '');

/** The landing page's "send us your tender" form. */
export const AUDIT_REQUEST_URL = `${LANDING_URL}/#audit`;

/** The tender the public demo opens: the saved sample, already processed by the engine. */
export const SAMPLE_TENDER_ID = 'TENDER-2026-402';

/** What a visitor is told when they press something only a live engine can do. */
export const REPLAY_NOTICE = {
  signOff:
    'Sign-off records a named reviewer, so it needs a live engine. This saved sample stays a draft.',
  export:
    'Downloads are produced by the live engine. This public demo runs on a saved sample. Send us a tender to get the full pack.',
  upload:
    'This public demo has no live engine attached, so it can’t process new files. Send us your spec and bids instead: a draft audit comes back within 24 hours, under NDA.',
} as const;
