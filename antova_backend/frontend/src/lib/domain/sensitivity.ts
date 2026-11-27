/**
 * Rate-sensitivity preview, computed in the browser with the engine's own formula.
 *
 * Mirrors antova_engine.line_amount / adder_decimal (base bound):
 * - copper line:  qty x rate x copper_multiplier
 * - freight line: qty x rate x freight_multiplier
 * - labour line:  qty x site_labor_rate when one is set, else qty x the line's own rate
 * - other lines:  qty x rate (not rate-sensitive)
 * Each cell's adder is rounded half up to whole cents, as the engine does.
 *
 * The projection is a delta on the engine's own figures: for every vendor,
 *   projected = true_evaluated_price + sum over cells of (adder at the new rates - adder at the applied rates)
 * Overridden and conceded cells are skipped (the engine ignores the sliders for them). A vendor with
 * no evaluated price (no usable headline) has no projection. Nothing is invented when the brief
 * has no rate-sensitive lines: every delta is zero.
 *
 * The figure is a preview. "Apply" asks the engine, whose answer replaces it.
 */
import Decimal from 'decimal.js-light';

export type Driver = 'copper' | 'labour' | 'freight';

export interface Rates {
  copper_multiplier: number; // {1}
  /** EUR per hour. null/undefined means each labour line's own rate (the rate table's). */
  site_labor_rate?: number | null; // {EUR/h}
  freight_multiplier: number; // {1}
}

export interface CostLineLike {
  qty: string | number; // {X}
  rate: string | number; // {EUR/X}
  driver?: string | null;
}

export interface ParameterLike {
  id: string;
  vendors?: Record<string, { cost_lines?: CostLineLike[] | null } | undefined>;
}

export interface FinancialLike {
  vendor_id: string;
  name?: string;
  true_evaluated_price?: number | null;
  itemized_breakdown?: { param_id: string; is_conceded?: boolean; is_overridden?: boolean }[] | null;
}

export interface ProjectedRow {
  vendor_id: string;
  name: string;
  /** The engine's figure at the applied rates, or null when the vendor has none. */
  baselineCost: number | null; // D2{EUR}
  projectedCost: number | null; // D2{EUR}
  delta: Record<Driver, number>; // D2{EUR} per driver, summed unrounded per line then rounded (not per-cell like totalDelta)
  totalDelta: number; // D2{EUR} sum of per-cell rounded deltas
}

const ZERO = new Decimal(0);

function dec(value: string | number): Decimal {
  try {
    return new Decimal(value);
  } catch {
    return ZERO;
  }
}

function cents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** One line's amount under `rates`, exactly as antova_engine.line_amount (base bound). */
export function lineAmount(line: CostLineLike, rates: Rates): Decimal {
  const qty = dec(line.qty);
  if (line.driver === 'labour' && rates.site_labor_rate !== null && rates.site_labor_rate !== undefined) {
    return qty.times(dec(rates.site_labor_rate));
  }
  // {EUR} = qty{X} * rate{EUR/X} [* multiplier{1}]; labour override above: qty{h} * {EUR/h}
  const base = qty.times(dec(line.rate));
  if (line.driver === 'copper') return base.times(dec(rates.copper_multiplier));
  if (line.driver === 'freight') return base.times(dec(rates.freight_multiplier));
  return base;
}

function isDriver(d: string | null | undefined): d is Driver {
  return d === 'copper' || d === 'labour' || d === 'freight';
}

/** The labour rate the rate table uses (the first labour line's rate), or null when there is none.
 * @returns {EUR/h} */
export function baseLabourRate(parameters: readonly ParameterLike[]): number | null {
  for (const p of parameters) {
    for (const cell of Object.values(p.vendors || {})) {
      for (const line of cell?.cost_lines || []) {
        if (line.driver === 'labour') return dec(line.rate).toNumber();
      }
    }
  }
  return null;
}

export function projectFinancials(
  financials: readonly FinancialLike[],
  parameters: readonly ParameterLike[],
  applied: Rates,
  staged: Rates
): ProjectedRow[] {
  return financials.map((f) => {
    const skipped = new Set(
      (f.itemized_breakdown || []).filter((c) => c.is_conceded || c.is_overridden).map((c) => c.param_id)
    );
    const delta: Record<Driver, Decimal> = { copper: ZERO, labour: ZERO, freight: ZERO }; // {EUR} unrounded per driver
    let total = ZERO; // {EUR} sum of D2{EUR} per-cell deltas

    for (const p of parameters) {
      if (skipped.has(p.id)) continue;
      const lines = p.vendors?.[f.vendor_id]?.cost_lines || [];
      if (!lines.length) continue;
      // Per-cell rounding, as the engine rounds each cell's adder to cents.
      let before = ZERO; // {EUR} cell adder at applied rates, unrounded
      let after = ZERO; // {EUR} cell adder at staged rates, unrounded
      for (const line of lines) {
        const a = lineAmount(line, applied); // {EUR}
        const b = lineAmount(line, staged); // {EUR}
        before = before.plus(a);
        after = after.plus(b);
        if (isDriver(line.driver)) delta[line.driver] = delta[line.driver].plus(b.minus(a));
      }
      // D2{EUR} = cents(adder@staged) - cents(adder@applied)
      total = total.plus(cents(after).minus(cents(before)));
    }

    const baseline = f.true_evaluated_price ?? null; // D2{EUR}
    // D2{EUR} = cents(D2{EUR} + {EUR})
    return {
      vendor_id: f.vendor_id,
      name: f.name ?? f.vendor_id,
      baselineCost: baseline,
      projectedCost: baseline === null ? null : cents(dec(baseline).plus(total)).toNumber(),
      delta: {
        copper: cents(delta.copper).toNumber(),
        labour: cents(delta.labour).toNumber(),
        freight: cents(delta.freight).toNumber(),
      },
      totalDelta: cents(total).toNumber(),
    };
  });
}

/** Lowest first; vendors without a figure go last. */
export function rankBy<T extends { baselineCost: number | null; projectedCost: number | null }>(
  rows: readonly T[],
  key: 'baselineCost' | 'projectedCost'
): T[] {
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  });
}
