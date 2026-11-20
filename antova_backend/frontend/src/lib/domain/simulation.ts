/**
 * Monte Carlo over a tender's cost drivers, for the Sensitivity Workbench.
 *
 * Every sample starts from the engine's own figure for each bidder (true_evaluated_price at the
 * applied rates) and adds:
 *
 * 1. Engine drivers (copper ×, freight ×, site labour €/h). The engine's line amounts are linear in
 *    these, so each bidder's change is coefficient × (sampled − applied), with the coefficients read
 *    from the same cost lines lib/domain/sensitivity.ts uses (overridden and conceded cells skipped).
 *    scripts/test-simulation.mjs checks this against the cent-exact projection.
 * 2. Scenario assumptions the engine does not model, each labelled as such in the UI:
 *    - add-back realisation: the share of priced gap costs actually incurred (100% = as priced);
 *    - allowance per unpriced gap: a reviewer's guess for gaps the rate table cannot price;
 *    - delivery slip × cost per week of slip.
 *    Their defaults are neutral or zero-width, so out of the box the result is the engine's alone.
 *
 * "True evaluated" = engine drivers only. "Risk-adjusted" = engine drivers + scenario assumptions.
 * No imports beyond types, so the module runs under plain Node for tests.
 */

export type Distribution = 'normal' | 'uniform' | 'triangular' | 'fixed';
export type DriverCategory = 'commercial' | 'schedule' | 'technical';
export type DriverEffect =
  | 'copper'
  | 'freight'
  | 'labour'
  | 'addback_realisation'
  | 'unpriced_allowance'
  | 'delay_weeks'
  | 'delay_cost_week';

export interface DriverSpec {
  id: string;
  label: string;
  category: DriverCategory;
  effect: DriverEffect;
  unit: string;
  /** The value the engine (or the neutral assumption) uses. */
  base: number;
  min: number;
  max: number;
  step: number;
  distribution: Distribution;
  /** true: the engine itself recalculates with this driver. false: a scenario assumption. */
  engine: boolean;
  note?: string;
}

export const CATEGORY_LABEL: Record<DriverCategory, string> = {
  commercial: 'Commercial & pricing',
  schedule: 'Schedule & delay risk',
  technical: 'Technical exclusions & add-backs',
};

export interface CostLineLike {
  qty: string | number;
  rate: string | number;
  driver?: string | null;
}

export interface ParameterLike {
  id: string;
  vendors?: Record<string, { cost_lines?: CostLineLike[] | null; pricing_status?: string | null } | undefined>;
}

export interface FinancialLike {
  vendor_id: string;
  name?: string;
  true_evaluated_price?: number | null;
  itemized_breakdown?:
    | {
        param_id: string;
        adder_eur?: number | null;
        pricing_status?: string | null;
        is_conceded?: boolean;
        is_overridden?: boolean;
      }[]
    | null;
}

export interface AppliedRates {
  copper_multiplier: number;
  /** null: each labour line's own rate. */
  site_labor_rate?: number | null;
  freight_multiplier: number;
}

/** Per-bidder linear coefficients, read once from the brief. */
export interface VendorModel {
  vendor_id: string;
  name: string;
  /** The engine's figure at the applied rates; null when the bidder has none (no usable headline). */
  base: number | null;
  copperBase: number;
  freightBase: number;
  labourHours: number;
  labourOwnCost: number;
  pricedAdders: number;
  unpricedGaps: number;
}

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

export function buildVendorModels(
  financials: readonly FinancialLike[],
  parameters: readonly ParameterLike[]
): VendorModel[] {
  return financials.map((f) => {
    const breakdown = f.itemized_breakdown || [];
    const skipped = new Set(breakdown.filter((c) => c.is_conceded || c.is_overridden).map((c) => c.param_id));
    const m: VendorModel = {
      vendor_id: f.vendor_id,
      name: f.name ?? f.vendor_id,
      base: f.true_evaluated_price ?? null,
      copperBase: 0,
      freightBase: 0,
      labourHours: 0,
      labourOwnCost: 0,
      pricedAdders: 0,
      unpricedGaps: 0,
    };
    for (const p of parameters) {
      if (skipped.has(p.id)) continue;
      for (const line of p.vendors?.[f.vendor_id]?.cost_lines || []) {
        const qty = num(line.qty);
        const rate = num(line.rate);
        if (line.driver === 'copper') m.copperBase += qty * rate;
        else if (line.driver === 'freight') m.freightBase += qty * rate;
        else if (line.driver === 'labour') {
          m.labourHours += qty;
          m.labourOwnCost += qty * rate;
        }
      }
    }
    for (const c of breakdown) {
      if (c.is_conceded) continue;
      if (c.pricing_status === 'UNPRICED') m.unpricedGaps += 1;
      else if (c.pricing_status === 'PRICED' && typeof c.adder_eur === 'number') m.pricedAdders += c.adder_eur;
    }
    return m;
  });
}

function labourCost(m: VendorModel, rate: number | null | undefined): number {
  return rate === null || rate === undefined ? m.labourOwnCost : m.labourHours * rate;
}

export interface DriverValues {
  copper: number;
  freight: number;
  labour: number | null;
  addback_realisation: number; // percent
  unpriced_allowance: number; // EUR per gap
  delay_weeks: number;
  delay_cost_week: number; // EUR per week
}

/** One bidder's figures at the given driver values: [true evaluated, risk-adjusted], or null. */
export function vendorCost(m: VendorModel, applied: AppliedRates, v: DriverValues): [number, number] | null {
  if (m.base === null) return null;
  const engineDelta =
    m.copperBase * (v.copper - applied.copper_multiplier) +
    m.freightBase * (v.freight - applied.freight_multiplier) +
    (labourCost(m, v.labour) - labourCost(m, applied.site_labor_rate));
  const trueCost = m.base + engineDelta;
  const scenario =
    m.pricedAdders * (v.addback_realisation / 100 - 1) +
    m.unpricedGaps * v.unpriced_allowance +
    v.delay_weeks * v.delay_cost_week;
  return [trueCost, trueCost + scenario];
}

/** The rate table's own drivers plus neutral scenario assumptions, sized from this brief. */
export function defaultDrivers(models: readonly VendorModel[], applied: AppliedRates, labourBase: number): DriverSpec[] {
  const any = (k: keyof VendorModel) => models.some((m) => typeof m[k] === 'number' && (m[k] as number) !== 0);
  const unpriced = models.reduce((s, m) => s + m.unpricedGaps, 0);
  const priced = models.reduce((s, m) => s + m.pricedAdders, 0);
  const labour = applied.site_labor_rate ?? labourBase;
  const round5 = (n: number) => Math.round(n / 5) * 5;
  return [
    {
      id: 'copper',
      label: 'Copper price (LME)',
      category: 'commercial',
      effect: 'copper',
      unit: '×',
      base: applied.copper_multiplier,
      min: 0.85,
      max: 1.3,
      step: 0.05,
      distribution: 'normal',
      engine: true,
      note: any('copperBase') ? undefined : 'No copper-priced lines in this tender',
    },
    {
      id: 'freight',
      label: 'Freight',
      category: 'commercial',
      effect: 'freight',
      unit: '×',
      base: applied.freight_multiplier,
      min: 0.9,
      max: 1.4,
      step: 0.05,
      distribution: 'triangular',
      engine: true,
      note: any('freightBase') ? undefined : 'No freight lines in this tender',
    },
    {
      id: 'labour',
      label: 'Site labour rate',
      category: 'commercial',
      effect: 'labour',
      unit: '€/h',
      base: labour,
      min: round5(labour * 0.9),
      max: round5(labour * 1.25),
      step: 5,
      distribution: 'normal',
      engine: true,
      note: any('labourHours') ? undefined : 'No labour lines in this tender',
    },
    {
      id: 'delay_weeks',
      label: 'Delivery slip',
      category: 'schedule',
      effect: 'delay_weeks',
      unit: 'wk',
      base: 0,
      min: 0,
      max: 6,
      step: 1,
      distribution: 'triangular',
      engine: false,
      note: 'Counts only with a cost per week',
    },
    {
      id: 'delay_cost_week',
      label: 'Cost per week of slip',
      category: 'schedule',
      effect: 'delay_cost_week',
      unit: '€/wk',
      base: 0,
      min: 0,
      max: 0,
      step: 500,
      distribution: 'uniform',
      engine: false,
      note: 'Your estimate: site standby, LDs',
    },
    {
      id: 'addback_realisation',
      label: 'Add-back realisation',
      category: 'technical',
      effect: 'addback_realisation',
      unit: '%',
      base: 100,
      min: 90,
      max: 115,
      step: 5,
      distribution: 'normal',
      engine: false,
      note: priced > 0 ? 'Share of priced gap costs actually incurred' : 'No priced gaps in this tender',
    },
    {
      id: 'unpriced_allowance',
      label: 'Allowance per unpriced gap',
      category: 'technical',
      effect: 'unpriced_allowance',
      unit: '€',
      base: 0,
      min: 0,
      max: 0,
      step: 500,
      distribution: 'uniform',
      engine: false,
      note: unpriced > 0 ? `${unpriced} unpriced ${unpriced === 1 ? 'gap' : 'gaps'}: set your own range` : 'No unpriced gaps',
    },
  ];
}

// --- sampling ------------------------------------------------------------------------------------

/** mulberry32: small, fast, seedable. Same seed, same simulation. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleDriver(d: DriverSpec, rand: () => number): number {
  const lo = Math.min(d.min, d.max);
  const hi = Math.max(d.min, d.max);
  if (d.distribution === 'fixed' || hi - lo < 1e-12) return d.distribution === 'fixed' ? clamp(d.base, lo, hi) : lo;
  switch (d.distribution) {
    case 'uniform':
      return lo + rand() * (hi - lo);
    case 'triangular': {
      const mode = clamp(d.base, lo, hi);
      const u = rand();
      const c = (mode - lo) / (hi - lo);
      return u < c ? lo + Math.sqrt(u * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
    }
    case 'normal':
    default: {
      // Centred on the range, ±2σ spanning it, truncated to the range.
      const mean = (lo + hi) / 2;
      const sd = (hi - lo) / 4;
      for (let i = 0; i < 8; i++) {
        const u1 = Math.max(rand(), 1e-12);
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand());
        const x = mean + z * sd;
        if (x >= lo && x <= hi) return x;
      }
      return mean;
    }
  }
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

export type OutputKind = 'risk' | 'true';
export interface OutputVariable {
  /** 'award' = the lowest bidder in each sample; else a vendor ID. */
  target: 'award' | string;
  kind: OutputKind;
}

export interface SimulationResult {
  n: number;
  /** The chosen output per sample (EUR). */
  values: Float64Array;
  /** Driver values per sample, row-major: drivers.length per sample. */
  driverValues: Float64Array;
  driverIds: string[];
  /** Lowest bidder per sample (index into `vendors`), -1 when no bidder has a figure. */
  winners: Int16Array;
  vendors: { vendor_id: string; name: string }[];
  /** The output at every driver's base value (the engine's own figure for "true"). */
  baseline: number | null;
}

export function simulate(
  models: readonly VendorModel[],
  drivers: readonly DriverSpec[],
  applied: AppliedRates,
  output: OutputVariable,
  n = 5000,
  seed = 20261120
): SimulationResult {
  const rand = rng(seed);
  const values = new Float64Array(n);
  const driverValues = new Float64Array(n * drivers.length);
  const winners = new Int16Array(n);
  const k = output.kind === 'true' ? 0 : 1;
  const targetIdx = output.target === 'award' ? -1 : models.findIndex((m) => m.vendor_id === output.target);

  const valuesAt = (pick: (d: DriverSpec) => number): DriverValues => {
    const v: DriverValues = {
      copper: applied.copper_multiplier,
      freight: applied.freight_multiplier,
      labour: applied.site_labor_rate ?? null,
      addback_realisation: 100,
      unpriced_allowance: 0,
      delay_weeks: 0,
      delay_cost_week: 0,
    };
    for (const d of drivers) (v as unknown as Record<string, number>)[d.effect] = pick(d);
    return v;
  };

  const evaluate = (v: DriverValues): { value: number; winner: number } => {
    let best = Infinity;
    let winner = -1;
    let target = NaN;
    models.forEach((m, i) => {
      const c = vendorCost(m, applied, v);
      if (!c) return;
      if (c[k] < best) {
        best = c[k];
        winner = i;
      }
      if (i === targetIdx) target = c[k];
    });
    return { value: targetIdx >= 0 ? target : winner >= 0 ? best : NaN, winner };
  };

  for (let s = 0; s < n; s++) {
    const row: number[] = [];
    const v = valuesAt((d) => {
      const x = sampleDriver(d, rand);
      row.push(x);
      return x;
    });
    driverValues.set(row, s * drivers.length);
    const r = evaluate(v);
    values[s] = r.value;
    winners[s] = r.winner;
  }

  const base = evaluate(valuesAt((d) => d.base)).value;
  return {
    n,
    values,
    driverValues,
    driverIds: drivers.map((d) => d.id),
    winners,
    vendors: models.map((m) => ({ vendor_id: m.vendor_id, name: m.name })),
    baseline: Number.isFinite(base) ? base : null,
  };
}

// --- summarising ---------------------------------------------------------------------------------

export function sortedFinite(values: Float64Array): Float64Array {
  return Float64Array.from(values.filter((x) => Number.isFinite(x))).sort();
}

/** Linear-interpolated quantile of an ascending array, q in [0, 1]. */
export function quantile(sorted: Float64Array, q: number): number {
  if (!sorted.length) return NaN;
  const pos = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface DensityPoint {
  x: number;
  /** Share of samples per unit of x, smoothed (relative units: only the shape is drawn). */
  y: number;
}

/** A smoothed histogram over the 0.5th to 99.5th percentile, for the area chart. */
export function density(sorted: Float64Array, bins = 56): { points: DensityPoint[]; min: number; max: number } {
  if (!sorted.length) return { points: [], min: 0, max: 0 };
  let min = quantile(sorted, 0.005);
  let max = quantile(sorted, 0.995);
  if (max - min < 1e-6) {
    // A single value: draw a narrow spike around it.
    const pad = Math.max(1, Math.abs(min) * 0.002);
    min -= pad;
    max += pad;
  }
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const x of sorted) {
    if (x < min || x > max) continue;
    counts[Math.min(bins - 1, Math.floor((x - min) / width))] += 1;
  }
  // Gaussian smoothing over neighbouring bins (σ = 1.4 bins).
  const kernel = [-3, -2, -1, 0, 1, 2, 3].map((o) => Math.exp(-(o * o) / (2 * 1.4 * 1.4)));
  const ksum = kernel.reduce((a, b) => a + b, 0);
  const smooth = counts.map((_, i) =>
    kernel.reduce((acc, w, j) => {
      const idx = i + j - 3;
      return acc + (idx >= 0 && idx < bins ? counts[idx] * w : 0);
    }, 0) / ksum
  );
  const points = smooth.map((c, i) => ({ x: min + (i + 0.5) * width, y: c / sorted.length }));
  return { points: [{ x: min, y: 0 }, ...points, { x: max, y: 0 }], min, max };
}

export interface BandSummary {
  share: number;
  count: number;
  mean: number | null;
  low: number | null;
  high: number | null;
  /** Mean of each driver over the band's samples, keyed by driver ID. */
  driverMeans: Record<string, number>;
  /** Share of the band's samples each bidder wins. */
  winnerShares: { vendor_id: string; name: string; share: number }[];
}

/** Splits samples at t1 ≤ t2 into [−∞, t1), [t1, t2], (t2, ∞]. */
export function summariseBands(result: SimulationResult, t1: number, t2: number): [BandSummary, BandSummary, BandSummary] {
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  const d = result.driverIds.length;
  const acc = [0, 1, 2].map(() => ({
    count: 0,
    sum: 0,
    low: Infinity,
    high: -Infinity,
    drivers: new Array(d).fill(0) as number[],
    wins: new Array(result.vendors.length).fill(0) as number[],
  }));
  let total = 0;
  for (let s = 0; s < result.n; s++) {
    const x = result.values[s];
    if (!Number.isFinite(x)) continue;
    total++;
    const b = x < lo ? 0 : x > hi ? 2 : 1;
    const a = acc[b];
    a.count++;
    a.sum += x;
    a.low = Math.min(a.low, x);
    a.high = Math.max(a.high, x);
    for (let j = 0; j < d; j++) a.drivers[j] += result.driverValues[s * d + j];
    const w = result.winners[s];
    if (w >= 0) a.wins[w]++;
  }
  return acc.map((a) => ({
    share: total ? a.count / total : 0,
    count: a.count,
    mean: a.count ? a.sum / a.count : null,
    low: a.count ? a.low : null,
    high: a.count ? a.high : null,
    driverMeans: Object.fromEntries(result.driverIds.map((id, j) => [id, a.count ? a.drivers[j] / a.count : NaN])),
    winnerShares: result.vendors
      .map((v, i) => ({ ...v, share: a.count ? a.wins[i] / a.count : 0 }))
      .filter((v) => v.share > 0)
      .sort((x, y) => y.share - x.share),
  })) as [BandSummary, BandSummary, BandSummary];
}
