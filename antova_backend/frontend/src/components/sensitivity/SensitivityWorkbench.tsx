'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Filter, Loader2, RotateCcw, Search } from 'lucide-react';
import type { Parameter, RatesSettings, Vendor, VendorFinancials } from '../../lib/types';
import { baseLabourRate } from '../../lib/domain/sensitivity';
import {
  CATEGORY_LABEL,
  buildVendorModels,
  defaultDrivers,
  density,
  quantile,
  simulate,
  sortedFinite,
  summariseBands,
  type AppliedRates,
  type BandSummary,
  type Distribution,
  type DriverCategory,
  type DriverSpec,
  type OutputVariable,
  type SimulationResult,
} from '../../lib/domain/simulation';
import { formatEur } from '../../lib/formatting';
import { BAND_COLOR, DistributionChart, eurK } from './DistributionChart';

export interface SensitivityWorkbenchProps {
  /** Resolves false when the engine could not recalculate. */
  onEvaluate: (rates: RatesSettings) => void | Promise<boolean | void>;
  isLoading?: boolean;
  currentRates?: RatesSettings;
  financials?: VendorFinancials[];
  vendors?: Vendor[];
  parameters?: Parameter[];
}

const RUNS = 5000;
const CATEGORIES: DriverCategory[] = ['commercial', 'schedule', 'technical'];
const DISTRIBUTIONS: { id: Distribution; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'triangular', label: 'Triangular' },
  { id: 'uniform', label: 'Uniform' },
  { id: 'fixed', label: 'Fixed' },
];

function fmtDriver(d: DriverSpec, v: number): string {
  if (!Number.isFinite(v)) return '—';
  switch (d.unit) {
    case '×':
      return `${v.toFixed(2)}×`;
    case '€/h':
      return `€${v.toFixed(0)}/h`;
    case '%':
      return `${v.toFixed(1)}%`;
    case 'wk':
      return `${v.toFixed(1)} wk`;
    case '€/wk':
      return `${eurK(v)}/wk`;
    case '€':
      return eurK(v);
    default:
      return v.toFixed(2);
  }
}

/**
 * Sensitivity Workbench: drivers on the left, the simulated cost and its scenario bands on the right.
 * The simulation itself is lib/domain/simulation.ts; this component holds the inputs and the view.
 */
export function SensitivityWorkbench({
  onEvaluate,
  isLoading = false,
  currentRates,
  financials = [],
  vendors = [],
  parameters = [],
}: SensitivityWorkbenchProps) {
  const labourBase = useMemo(() => baseLabourRate(parameters) ?? 60, [parameters]);
  const applied: AppliedRates = useMemo(
    () => ({
      copper_multiplier: currentRates?.copper_multiplier ?? 1,
      // The engine's figures are at the rate table's own labour rates until a rate is applied.
      site_labor_rate: currentRates?.site_labor_rate ?? null,
      freight_multiplier: currentRates?.freight_multiplier ?? 1,
    }),
    [currentRates]
  );
  const models = useMemo(() => buildVendorModels(financials, parameters), [financials, parameters]);
  const baselineDrivers = useMemo(() => defaultDrivers(models, applied, labourBase), [models, applied, labourBase]);

  const [drivers, setDrivers] = useState<DriverSpec[]>(baselineDrivers);
  useEffect(() => setDrivers(baselineDrivers), [baselineDrivers]);

  // Output: by default the closest rival to the current award that the drivers actually move.
  const outputs = useMemo(() => {
    const ranked = [...models].filter((m) => m.base !== null).sort((a, b) => (a.base ?? 0) - (b.base ?? 0));
    const list: { id: string; label: string; value: OutputVariable }[] = [
      { id: 'award:risk', label: 'Risk-adjusted award cost', value: { target: 'award', kind: 'risk' } },
      { id: 'award:true', label: 'True evaluated award cost', value: { target: 'award', kind: 'true' } },
    ];
    for (const m of ranked) {
      list.push({ id: `${m.vendor_id}:risk`, label: `Risk-adjusted bid · ${m.name}`, value: { target: m.vendor_id, kind: 'risk' } });
      list.push({ id: `${m.vendor_id}:true`, label: `True evaluated cost · ${m.name}`, value: { target: m.vendor_id, kind: 'true' } });
    }
    return list;
  }, [models]);
  const defaultOutput = useMemo(() => {
    const ranked = [...models].filter((m) => m.base !== null).sort((a, b) => (a.base ?? 0) - (b.base ?? 0));
    const moves = (m: (typeof models)[number]) =>
      m.copperBase !== 0 || m.freightBase !== 0 || m.labourHours !== 0 || m.pricedAdders !== 0 || m.unpricedGaps !== 0;
    if (ranked[0] && moves(ranked[0])) return 'award:risk';
    const rival = ranked.find(moves);
    return rival ? `${rival.vendor_id}:risk` : 'award:risk';
  }, [models]);
  const [outputId, setOutputId] = useState<string>(defaultOutput);
  useEffect(() => setOutputId(defaultOutput), [defaultOutput]);
  const output = outputs.find((o) => o.id === outputId) ?? outputs[0];

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [ranWith, setRanWith] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [seed, setSeed] = useState(20261120);
  const [thresholds, setThresholds] = useState<[number, number] | null>(null);

  const signature = JSON.stringify({ drivers, outputId, applied });
  const stale = result !== null && ranWith !== signature;

  const run = useCallback(
    (nextSeed = seed) => {
      if (!output) return;
      setRunning(true);
      // Yield a frame so the button shows its busy state; 5,000 runs take a few milliseconds.
      requestAnimationFrame(() => {
        const r = simulate(models, drivers, applied, output.value, RUNS, nextSeed);
        const sorted = sortedFinite(r.values);
        setResult(r);
        setThresholds(sorted.length ? [quantile(sorted, 0.2), quantile(sorted, 0.8)] : null);
        setRanWith(JSON.stringify({ drivers, outputId, applied }));
        setRunning(false);
      });
    },
    [models, drivers, applied, output, outputId, seed]
  );

  // First run, and a fresh run whenever the output variable changes.
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputId, models]);

  const sorted = useMemo(() => (result ? sortedFinite(result.values) : new Float64Array()), [result]);
  const dens = useMemo(() => density(sorted), [sorted]);
  const degenerate = sorted.length > 0 && sorted[sorted.length - 1] - sorted[0] < 0.5;
  const bands = useMemo(
    () => (result && thresholds ? summariseBands(result, thresholds[0], thresholds[1]) : null),
    [result, thresholds]
  );

  const awardHolds = useMemo(() => {
    if (!result) return null;
    const counts = new Map<number, number>();
    result.winners.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [-1, 0];
    return top >= 0 ? { name: result.vendors[top].name, share: n / result.n } : null;
  }, [result]);

  // --- driver editing ------------------------------------------------------------------------
  const [query, setQuery] = useState('');
  const [engineOnly, setEngineOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const update = (id: string, patch: Partial<DriverSpec>) =>
    setDrivers((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const modified = JSON.stringify(drivers) !== JSON.stringify(baselineDrivers);
  const visible = drivers.filter(
    (d) =>
      (!engineOnly || d.engine) &&
      (!query.trim() || `${d.label} ${CATEGORY_LABEL[d.category]} ${d.note ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  );

  const applyRealistic = async () => {
    if (!bands) return;
    const m = bands[1].driverMeans;
    const snap = (id: string, step: number, fallback: number) => {
      const v = m[id];
      return Number.isFinite(v) ? Math.round(v / step) * step : fallback;
    };
    await onEvaluate({
      copper_multiplier: Number(snap('copper', 0.01, applied.copper_multiplier).toFixed(2)),
      site_labor_rate: snap('labour', 1, applied.site_labor_rate ?? labourBase),
      freight_multiplier: Number(snap('freight', 0.01, applied.freight_multiplier).toFixed(2)),
    });
  };

  const numInput =
    'h-6 w-[3.6rem] rounded border border-rule-strong bg-paper px-1.5 text-right text-xs tabular-nums text-ink outline-none focus:border-ink';

  return (
    <div className="grid min-h-[640px] grid-cols-1 gap-0 border border-rule bg-sheet text-[13px] text-ink lg:grid-cols-[minmax(400px,460px)_minmax(0,1fr)]">
      {/* Drivers */}
      <aside className="flex min-h-0 flex-col border-b border-rule lg:border-b-0 lg:border-r" aria-label="Drivers">
        <div className="px-4 pt-4">
          <h2 className="font-medium">Drivers</h2>
          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search drivers"
                aria-label="Search drivers"
                className="h-7 w-full rounded border border-rule-strong bg-paper pl-7 pr-2 text-xs outline-none placeholder:text-faint focus:border-ink"
              />
            </div>
            <button
              type="button"
              onClick={() => setEngineOnly((v) => !v)}
              aria-pressed={engineOnly}
              title={engineOnly ? 'Showing engine drivers only' : 'Show engine drivers only'}
              className={`inline-flex h-7 w-7 items-center justify-center rounded ${engineOnly ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_5.5rem] gap-2 border-b border-rule px-4 pb-1.5 text-[11px] text-muted">
          <span>Driver</span>
          <span className="w-[9.6rem]">Value range</span>
          <span>Distribution</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {CATEGORIES.map((cat) => {
            const rows = visible.filter((d) => d.category === cat);
            if (!rows.length) return null;
            const isCollapsed = collapsed[cat];
            return (
              <section key={cat}>
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-1.5 border-b border-rule px-3 py-2 text-left text-xs font-medium text-ink hover:bg-paper"
                >
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {CATEGORY_LABEL[cat]}
                </button>
                {!isCollapsed &&
                  rows.map((d) => (
                    <div
                      key={d.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto_5.5rem] items-center gap-2 border-b border-rule py-2 pl-7 pr-4"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs leading-tight text-ink">
                          {d.engine && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" title="Recalculated by the engine" aria-label="engine driver" />}
                          {d.label}
                        </p>
                        {d.note && <p className="mt-0.5 text-[10.5px] leading-tight text-faint">{d.note}</p>}
                      </div>
                      <div className="flex w-[9.6rem] items-center gap-1 text-[11px] text-faint">
                        <input
                          type="number"
                          step={d.step}
                          value={d.min}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v)) update(d.id, { min: v });
                          }}
                          className={numInput}
                          aria-label={`${d.label} minimum`}
                        />
                        <span>to</span>
                        <input
                          type="number"
                          step={d.step}
                          value={d.max}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v)) update(d.id, { max: v });
                          }}
                          className={numInput}
                          aria-label={`${d.label} maximum`}
                        />
                        <span className="w-7 shrink-0 truncate">{d.unit}</span>
                      </div>
                      <select
                        value={d.distribution}
                        onChange={(e) => update(d.id, { distribution: e.target.value as Distribution })}
                        aria-label={`${d.label} distribution`}
                        className="h-6 w-full rounded border border-rule-strong bg-paper px-1 text-[11px] text-ink outline-none focus:border-ink"
                      >
                        {DISTRIBUTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
              </section>
            );
          })}
          {visible.length === 0 && <p className="px-4 py-6 text-xs text-faint">No driver matches “{query}”.</p>}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-rule bg-sheet px-4 py-2.5">
          <p className="text-[10.5px] leading-tight text-faint">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-ink align-middle" /> engine driver · others are your scenario assumptions
          </p>
          <button
            type="button"
            onClick={() => setDrivers(baselineDrivers)}
            disabled={!modified}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-rule-strong px-2.5 py-1 text-xs text-ink hover:border-ink disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
      </aside>

      {/* Result */}
      <section className="min-w-0 bg-paper p-4 lg:p-5" aria-label="Simulation result">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Simulation result</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor="sim-output" className="text-muted">
              Output variable
            </label>
            <select
              id="sim-output"
              value={outputId}
              onChange={(e) => setOutputId(e.target.value)}
              className="h-7 max-w-[18rem] rounded border border-rule-strong bg-sheet px-2 text-xs text-ink outline-none focus:border-ink"
            >
              {outputs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const next = seed + 1;
                setSeed(next);
                run(next);
              }}
              disabled={running}
              className="inline-flex h-7 items-center gap-1.5 rounded bg-ink px-3 font-medium text-paper hover:opacity-90 disabled:opacity-50"
            >
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Re-run simulation
            </button>
          </div>
        </div>

        <p className="mt-1 text-[11px] text-muted">
          {RUNS.toLocaleString('en-IE')} runs from the engine’s figures.
          {awardHolds && (
            <>
              {' '}
              Lowest bidder: <span className="text-ink">{awardHolds.name}</span> in {(awardHolds.share * 100).toFixed(1)}% of runs.
            </>
          )}
          {stale && <span className="text-open"> Drivers changed: re-run to update.</span>}
        </p>

        <div className="mt-4 rounded border border-rule bg-sheet px-2 pb-2 pt-3">
          {!result ? (
            <div className="h-[248px] animate-pulse" aria-label="Running simulation" />
          ) : degenerate ? (
            <div className="flex h-[248px] flex-col items-center justify-center px-6 text-center">
              <p className="text-[13px] font-medium tabular-nums">{formatEur(sorted[0])} in every run</p>
              <p className="mt-1 max-w-md text-xs text-muted">
                None of the drivers touch this figure: this bidder has no rate-sensitive lines and no priced or unpriced
                gaps. Pick another output, or widen a scenario assumption that applies to it.
              </p>
            </div>
          ) : (
            thresholds &&
            bands && (
              <DistributionChart
                points={dens.points}
                min={dens.min}
                max={dens.max}
                thresholds={thresholds}
                onThresholdsChange={setThresholds}
                shares={[bands[0].share, bands[1].share, bands[2].share]}
                baseline={result.baseline}
                xLabel={output?.label ?? 'Cost'}
              />
            )
          )}
        </div>

        <h3 className="mt-6 font-medium">Scenario groups</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {(
            [
              { key: 'conservative', title: 'Conservative', band: bands?.[2] },
              { key: 'realistic', title: 'Realistic', band: bands?.[1] },
              { key: 'optimistic', title: 'Optimistic', band: bands?.[0] },
            ] as const
          ).map((c) => (
            <ScenarioCard
              key={c.key}
              tone={c.key}
              title={c.title}
              band={degenerate ? null : c.band ?? null}
              baseline={result?.baseline ?? null}
              outputLabel={output?.label ?? ''}
              drivers={drivers}
              action={
                c.key === 'realistic' && !degenerate && bands ? (
                  <button
                    type="button"
                    onClick={applyRealistic}
                    disabled={isLoading}
                    className="text-[11px] font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink disabled:opacity-50"
                    title="Recalculate every bidder in the engine at this band's average copper, labour and freight"
                  >
                    {isLoading ? 'Recalculating…' : 'Apply these rates in the engine'}
                  </button>
                ) : null
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function Ring({ share, color }: { share: number; color: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg width={56} height={56} viewBox="0 0 48 48" aria-hidden>
      <circle cx={24} cy={24} r={r} fill="none" stroke="var(--rule)" strokeWidth={4} />
      <circle
        cx={24}
        cy={24}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeDasharray={`${c * share} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
      />
      <text x={24} y={27.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink)" className="tabular-nums">
        {(share * 100).toFixed(1)}%
      </text>
    </svg>
  );
}

function ScenarioCard({
  tone,
  title,
  band,
  baseline,
  outputLabel,
  drivers,
  action,
}: {
  tone: keyof typeof BAND_COLOR;
  title: string;
  band: BandSummary | null;
  baseline: number | null;
  outputLabel: string;
  drivers: DriverSpec[];
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(tone === 'realistic');
  const color = BAND_COLOR[tone];
  const delta = band?.mean != null && baseline != null ? band.mean - baseline : null;
  const moving = drivers.filter((d) => d.distribution !== 'fixed' && Math.abs(d.max - d.min) > 1e-9);

  return (
    <article className="overflow-hidden rounded border border-rule bg-sheet">
      <div className="h-[3px]" style={{ background: color }} />
      <div className="p-3.5">
        <h4 className="text-xs font-medium">{title}</h4>
        <div className="mt-2 flex items-center gap-3">
          <Ring share={band?.share ?? 0} color={color} />
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted" title={outputLabel}>
              Mean in this band
            </p>
            <p className="flex items-baseline gap-1.5 text-lg font-semibold tabular-nums leading-tight">
              {band?.mean != null ? formatEur(band.mean) : '—'}
              {delta !== null && Math.abs(delta) >= 1 && (
                <span className={`text-[11px] font-medium ${delta > 0 ? 'text-gap' : 'text-ink-2'}`} title="Against the engine’s figure">
                  {delta > 0 ? '▲' : '▼'} {eurK(Math.abs(delta))}
                </span>
              )}
            </p>
            <p className="text-[11px] tabular-nums text-faint">
              {band?.low != null && band.high != null ? `${eurK(band.low)} – ${eurK(band.high)}` : 'No runs in this band'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-3 flex w-full items-center gap-1 border-t border-rule pt-2 text-left text-[11px] text-muted hover:text-ink"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Driver averages in this band
        </button>
        {open && (
          <dl className="mt-1.5 space-y-1 text-[11px]">
            {moving.length === 0 && <p className="text-faint">Every driver is fixed.</p>}
            {moving.map((d) => (
              <div key={d.id} className="flex justify-between gap-2">
                <dt className="truncate text-muted">{d.label}</dt>
                <dd className="tabular-nums text-ink">{band?.count ? fmtDriver(d, band.driverMeans[d.id]) : '—'}</dd>
              </div>
            ))}
            {band && band.winnerShares.length > 0 && (
              <div className="flex justify-between gap-2 border-t border-rule pt-1">
                <dt className="text-muted">Lowest bidder</dt>
                <dd className="truncate text-ink">
                  {band.winnerShares[0].name} {(band.winnerShares[0].share * 100).toFixed(0)}%
                </dd>
              </div>
            )}
          </dl>
        )}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </article>
  );
}
