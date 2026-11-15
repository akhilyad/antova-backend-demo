/**
 * Antova Domain Status Mapping
 * Implements Ruling R15 & §8.2: The glyph, word, and severity for requirement x bidder cells.
 */
import type { ComplianceStatus, PricingStatus } from '../schemas';

export type StatusSeverity = 'ok' | 'gap' | 'open';

export interface StatusTagView {
  glyph: string;
  word: string;
  severity: StatusSeverity;
}

export const STATUS_WORDS = {
  meets: { word: 'Meets spec', glyph: '✓' },
  gap: { word: 'Gap', glyph: '✗' },
  contradiction: { word: 'Contradiction', glyph: '⇄' },
  missing: { word: 'Missing', glyph: '∅' },
  exceeds: { word: 'Exceeds spec', glyph: '↑' },
  unpriced: { word: 'Unpriced', glyph: '€?' },
  needsInspection: { word: 'Needs inspection', glyph: '!' },
} as const;

const BASE_ROWS: Record<Exclude<ComplianceStatus, 'MANUAL_INSPECTION_REQUIRED'>, { word: string; glyph: string; severity: StatusSeverity }> = {
  COMPLIANT: { ...STATUS_WORDS.meets, severity: 'ok' },
  DEVIATION_UPGRADE: { ...STATUS_WORDS.exceeds, severity: 'ok' },
  DEVIATION_DOWNGRADE: { ...STATUS_WORDS.gap, severity: 'gap' },
  CONFLICT_DOWNGRADE: { ...STATUS_WORDS.contradiction, severity: 'gap' },
  OMITTED: { ...STATUS_WORDS.missing, severity: 'gap' },
};

/**
 * Ruling R15: An open condition wins over the status row.
 * A non-overridden UNPRICED cell is `€? Unpriced` (open) whatever its status;
 * a non-overridden MANUAL_INSPECTION_REQUIRED is `! Needs inspection` (open).
 * Once overridden, an UNPRICED cell shows its status row, and a
 * MANUAL_INSPECTION_REQUIRED cell keeps `! Needs inspection` with severity `gap`.
 */
export function statusTag(
  status: ComplianceStatus,
  pricingStatus: PricingStatus,
  overridden: boolean
): StatusTagView {
  if (pricingStatus === 'UNPRICED' && !overridden) {
    return { ...STATUS_WORDS.unpriced, severity: 'open' };
  }
  if (status === 'MANUAL_INSPECTION_REQUIRED') {
    return { ...STATUS_WORDS.needsInspection, severity: overridden ? 'gap' : 'open' };
  }
  const base = BASE_ROWS[status as keyof typeof BASE_ROWS];
  if (base) return base;
  return { ...STATUS_WORDS.needsInspection, severity: 'open' };
}
