'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { RatesSettings, VendorFinancials, Vendor, Parameter } from '../lib/types';
import { formatEur, formatDelta } from '../lib/formatting';
import { projectFinancials, baseLabourRate, rankBy, type Rates } from '../lib/domain/sensitivity';

export interface SensitivityPanelProps {
  /** Resolves false when the engine could not recalculate; the staged rates then stay unapplied. */
  onEvaluate: (rates: RatesSettings) => void | Promise<boolean | void>;
  isLoading?: boolean;
  onClose?: () => void;
  currentRates?: RatesSettings;
  financials?: VendorFinancials[];
  vendors?: Vendor[];
  parameters?: Parameter[];
}

interface ScenarioPreset {
  id: 'pessimistic' | 'realistic' | 'optimistic';
  title: string;
  tagline: string;
  copper: number;
  labor: number;
  freight: number;
  badge: string;
  badgeClass: string;
  cardBorder: string;
}

const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'pessimistic',
    title: 'Pessimistic Scenario',
    tagline: 'Supply chain shock & commodity inflation',
    copper: 1.8,
    labor: 85,
    freight: 1.5,
    badge: 'Stress Test',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/50',
    cardBorder: 'hover:border-rose-400 dark:hover:border-rose-600',
  },
  {
    id: 'realistic',
    title: 'Realistic Scenario',
    tagline: 'Rate table specification baseline',
    copper: 1.0,
    labor: 60,
    freight: 1.0,
    badge: 'Baseline',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/50',
    cardBorder: 'hover:border-blue-400 dark:hover:border-blue-600',
  },
  {
    id: 'optimistic',
    title: 'Optimistic Scenario',
    tagline: 'Softening metals & local labor synergies',
    copper: 0.85,
    labor: 50,
    freight: 0.85,
    badge: 'Favorable',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50',
    cardBorder: 'hover:border-emerald-400 dark:hover:border-emerald-600',
  },
];

export function SensitivityPanel({
  onEvaluate,
  isLoading = false,
  currentRates,
  financials = [],
  vendors = [],
  parameters = [],
}: SensitivityPanelProps) {
  // The rate table's labour rate, read from the brief's labour lines (60 only when it has none).
  const labourBase = useMemo(() => baseLabourRate(parameters) ?? 60, [parameters]);

  // 1. Staged Draft State (manipulated by sliders/inputs, does NOT trigger network recalculation)
  const [stagedCopper, setStagedCopper] = useState<number>(currentRates?.copper_multiplier ?? 1.0);
  const [stagedLabor, setStagedLabor] = useState<number>(currentRates?.site_labor_rate ?? labourBase);
  const [stagedFreight, setStagedFreight] = useState<number>(currentRates?.freight_multiplier ?? 1.0);

  // 2. Applied Rates (currently active in the calculation)
  const [appliedCopper, setAppliedCopper] = useState<number>(currentRates?.copper_multiplier ?? 1.0);
  const [appliedLabor, setAppliedLabor] = useState<number>(currentRates?.site_labor_rate ?? labourBase);
  const [appliedFreight, setAppliedFreight] = useState<number>(currentRates?.freight_multiplier ?? 1.0);

  // Synchronize when currentRates prop changes externally
  useEffect(() => {
    if (currentRates) {
      setAppliedCopper(currentRates.copper_multiplier ?? 1.0);
      setAppliedLabor(currentRates.site_labor_rate ?? labourBase);
      setAppliedFreight(currentRates.freight_multiplier ?? 1.0);
    }
  }, [currentRates, labourBase]);

  // Diff checks
  const hasUnappliedChanges =
    Math.abs(stagedCopper - appliedCopper) > 0.001 ||
    Math.abs(stagedLabor - appliedLabor) > 0.1 ||
    Math.abs(stagedFreight - appliedFreight) > 0.001;

  const isModifiedFromBaseline =
    Math.abs(stagedCopper - 1.0) > 0.001 ||
    Math.abs(stagedLabor - labourBase) > 0.1 ||
    Math.abs(stagedFreight - 1.0) > 0.001;

  // Unapplied changes count
  const unappliedCount =
    (Math.abs(stagedCopper - appliedCopper) > 0.001 ? 1 : 0) +
    (Math.abs(stagedLabor - appliedLabor) > 0.1 ? 1 : 0) +
    (Math.abs(stagedFreight - appliedFreight) > 0.001 ? 1 : 0);

  // Reset Handlers
  const handleResetCopper = () => setStagedCopper(1.0);
  const handleResetLabor = () => setStagedLabor(labourBase);
  const handleResetFreight = () => setStagedFreight(1.0);

  const handleResetAllToBaseline = () => {
    setStagedCopper(1.0);
    setStagedLabor(labourBase);
    setStagedFreight(1.0);
  };

  // Preset Selection
  const handleSelectPreset = (preset: ScenarioPreset) => {
    setStagedCopper(preset.copper);
    setStagedLabor(preset.id === 'realistic' ? labourBase : preset.labor);
    setStagedFreight(preset.freight);
  };

  // Explicit Recalculation Trigger (The ONLY action that triggers evaluateTender on the backend)
  const handleApplyScenario = async () => {
    const ok = await onEvaluate({
      copper_multiplier: stagedCopper,
      site_labor_rate: stagedLabor,
      freight_multiplier: stagedFreight,
    });
    // Only rates the engine accepted count as applied; otherwise the preview keeps showing the change.
    if (ok === false) return;
    setAppliedCopper(stagedCopper);
    setAppliedLabor(stagedLabor);
    setAppliedFreight(stagedFreight);
  };

  // Driver base analysis computed from tender parameters or benchmark package
  const driverTotals = useMemo(() => {
    let copperBase = 0;
    let labourHours = 0;
    let freightBase = 0;
    const vendorCopper: Record<string, number> = {};
    const vendorLabourHours: Record<string, number> = {};
    const vendorFreight: Record<string, number> = {};

    parameters.forEach((param) => {
      Object.entries(param.vendors || {}).forEach(([vId, ext]) => {
        (ext.cost_lines || []).forEach((line) => {
          const qty = parseFloat(line.qty) || 0;
          const rate = parseFloat(line.rate) || 0;
          if (line.driver === 'copper') {
            const cost = qty * rate;
            copperBase += cost;
            vendorCopper[vId] = (vendorCopper[vId] || 0) + cost;
          } else if (line.driver === 'labour') {
            labourHours += qty;
            vendorLabourHours[vId] = (vendorLabourHours[vId] || 0) + qty;
          } else if (line.driver === 'freight') {
            const cost = qty * rate;
            freightBase += cost;
            vendorFreight[vId] = (vendorFreight[vId] || 0) + cost;
          }
        });
      });
    });

    // No invented fallbacks: a brief without rate-sensitive lines shows zeros.
    return { copperBase, labourHours, freightBase, vendorCopper, vendorLabourHours, vendorFreight };
  }, [parameters]);

  const stagedRates: Rates = useMemo(
    () => ({ copper_multiplier: stagedCopper, site_labor_rate: stagedLabor, freight_multiplier: stagedFreight }),
    [stagedCopper, stagedLabor, stagedFreight]
  );
  const appliedRates: Rates = useMemo(
    () => ({ copper_multiplier: appliedCopper, site_labor_rate: appliedLabor, freight_multiplier: appliedFreight }),
    [appliedCopper, appliedLabor, appliedFreight]
  );

  // Per-variable results against the rate table (engine formula, exact cents; see lib/domain/sensitivity.ts)
  const tableDeltas = useMemo(() => {
    const table: Rates = { copper_multiplier: 1.0, site_labor_rate: null, freight_multiplier: 1.0 };
    return projectFinancials(financials, parameters, table, stagedRates).reduce(
      (acc, r) => ({
        copper: acc.copper + r.delta.copper,
        labour: acc.labour + r.delta.labour,
        freight: acc.freight + r.delta.freight,
      }),
      { copper: 0, labour: 0, freight: 0 }
    );
  }, [financials, parameters, stagedRates]);
  const copperDeltaTotal = tableDeltas.copper;
  const laborDeltaTotal = tableDeltas.labour;
  const freightDeltaTotal = tableDeltas.freight;

  // Preview of the staged rates: the engine's applied figures plus the exact change per cell.
  // "Apply Scenario" asks the engine; its answer replaces this preview.
  const simulationProjection = useMemo(() => {
    const rows = projectFinancials(financials, parameters, appliedRates, stagedRates).map((r) => ({
      vendor_id: r.vendor_id,
      name: r.name,
      baselineCost: r.baselineCost,
      projectedCost: r.projectedCost,
      deltaCopper: r.delta.copper,
      deltaLabor: r.delta.labour,
      deltaFreight: r.delta.freight,
      totalDelta: r.totalDelta,
    }));
    const baselineWinner = rankBy(rows, 'baselineCost')[0];
    const projectedSorted = rankBy(rows, 'projectedCost');
    const projectedWinner = projectedSorted[0];
    const hasRankFlip = Boolean(
      baselineWinner &&
        projectedWinner &&
        baselineWinner.baselineCost !== null &&
        projectedWinner.projectedCost !== null &&
        baselineWinner.vendor_id !== projectedWinner.vendor_id
    );
    return { rows: projectedSorted, baselineWinner, projectedWinner, hasRankFlip };
  }, [financials, parameters, appliedRates, stagedRates]);

  const drivers: {
    key: string;
    label: string;
    unit: string;
    value: number;
    set: (n: number) => void;
    reset: () => void;
    base: number;
    min: number;
    max: number;
    step: number;
    delta: number;
    fmt: (n: number) => string;
    note: string;
  }[] = [
    {
      key: 'copper',
      label: 'Copper price (LME)',
      unit: '×',
      value: stagedCopper,
      set: setStagedCopper,
      reset: handleResetCopper,
      base: 1.0,
      min: 0.5,
      max: 2.5,
      step: 0.05,
      delta: copperDeltaTotal,
      fmt: (n) => `${n.toFixed(2)}×`,
      note: driverTotals.copperBase === 0 ? 'No copper-priced lines' : `${formatEur(driverTotals.copperBase)} of copper lines at 1.00×`,
    },
    {
      key: 'labour',
      label: 'Site labour rate',
      unit: '€/h',
      value: stagedLabor,
      set: setStagedLabor,
      reset: handleResetLabor,
      base: labourBase,
      min: 20,
      max: 200,
      step: 5,
      delta: laborDeltaTotal,
      fmt: (n) => `€${n}/h`,
      note: driverTotals.labourHours === 0 ? 'No labour lines' : `${driverTotals.labourHours} h across bids`,
    },
    {
      key: 'freight',
      label: 'Freight',
      unit: '×',
      value: stagedFreight,
      set: setStagedFreight,
      reset: handleResetFreight,
      base: 1.0,
      min: 0.5,
      max: 2.5,
      step: 0.05,
      delta: freightDeltaTotal,
      fmt: (n) => `${n.toFixed(2)}×`,
      note: driverTotals.freightBase === 0 ? 'No freight lines' : `${formatEur(driverTotals.freightBase)} of freight lines at 1.00×`,
    },
  ];

  const deltaTone = (n: number) => (n === 0 ? 'text-faint' : n > 0 ? 'text-gap' : 'text-ink-2');
  const activePreset = SCENARIO_PRESETS.find(
    (p) =>
      Math.abs(stagedCopper - p.copper) < 0.01 &&
      Math.abs(stagedLabor - (p.id === 'realistic' ? labourBase : p.labor)) < 0.1 &&
      Math.abs(stagedFreight - p.freight) < 0.01
  );

  return (
    <div className="space-y-8 text-[13px]">
      {/* Presets and apply */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded border border-rule-strong p-0.5 text-xs" role="radiogroup" aria-label="Scenario">
          {SCENARIO_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={activePreset?.id === p.id}
              onClick={() => handleSelectPreset(p)}
              title={`Copper ${p.copper.toFixed(2)}×, labour €${p.id === 'realistic' ? labourBase : p.labor}/h, freight ${p.freight.toFixed(2)}×`}
              className={`rounded-sm px-3 py-1 ${activePreset?.id === p.id ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
            >
              {p.id === 'pessimistic' ? 'Stress' : p.id === 'realistic' ? 'Rate table' : 'Favourable'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs">
          {isModifiedFromBaseline && (
            <button type="button" onClick={handleResetAllToBaseline} className="text-muted hover:text-ink">
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={handleApplyScenario}
            disabled={!hasUnappliedChanges || isLoading}
            className="rounded bg-ink px-3.5 py-1.5 font-medium text-paper hover:opacity-90 disabled:opacity-30"
          >
            {isLoading ? 'Recalculating' : hasUnappliedChanges ? `Apply ${unappliedCount} ${unappliedCount === 1 ? 'change' : 'changes'}` : 'Applied'}
          </button>
        </div>
      </div>

      {/* Drivers */}
      <section>
        <h2 className="text-[13px] font-medium text-ink">Rate drivers</h2>
        <ul className="mt-3 border-t border-rule">
          {drivers.map((d) => (
            <li key={d.key} className="grid grid-cols-[11rem_minmax(0,1fr)_5.5rem_6.5rem] items-center gap-5 border-b border-rule py-3">
              <div className="min-w-0">
                <p className="text-ink">{d.label}</p>
                <p className="truncate text-[11px] text-faint">{d.note}</p>
              </div>
              <input
                type="range"
                min={d.min}
                max={d.max}
                step={d.step}
                value={d.value}
                onChange={(e) => d.set(parseFloat(e.target.value))}
                className="w-full accent-[var(--ink)]"
                aria-label={d.label}
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={d.min}
                  max={d.max}
                  step={d.step}
                  value={d.value}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n)) d.set(Math.min(d.max, Math.max(d.min, n)));
                  }}
                  className="w-16 rounded border border-rule-strong bg-paper px-1.5 py-0.5 text-right text-xs tabular-nums text-ink outline-none focus:border-ink"
                  aria-label={`${d.label} value`}
                />
                <span className="text-[11px] text-faint">{d.unit}</span>
              </div>
              <div className="text-right">
                <p className={`tabular-nums ${deltaTone(d.delta)}`}>{formatDelta(d.delta)}</p>
                {Math.abs(d.value - d.base) > 0.001 ? (
                  <button type="button" onClick={d.reset} className="text-[11px] text-faint hover:text-ink">
                    base {d.fmt(d.base)}
                  </button>
                ) : (
                  <p className="text-[11px] text-faint">at base</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Ranking under the staged rates */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-[13px] font-medium text-ink">Ranking under these rates</h2>
          <p className={`text-xs ${simulationProjection.hasRankFlip ? 'text-gap' : 'text-muted'}`}>
            {simulationProjection.hasRankFlip
              ? `Award moves from ${simulationProjection.baselineWinner?.name} to ${simulationProjection.projectedWinner?.name}.`
              : simulationProjection.projectedWinner
              ? `${simulationProjection.projectedWinner.name} stays lowest.`
              : ''}
            {hasUnappliedChanges && <span className="text-faint"> Preview, not applied.</span>}
          </p>
        </div>
        <table className="mt-3 w-full table-fixed border-collapse" aria-label="Ranking under these rates">
          <thead>
            <tr className="border-b border-rule-strong text-[11px] text-muted">
              <th scope="col" className="w-10 py-2 text-left font-normal">#</th>
              <th scope="col" className="py-2 text-left font-normal">Bidder</th>
              <th scope="col" className="w-[18%] py-2 text-right font-normal">Applied</th>
              <th scope="col" className="w-[18%] py-2 text-right font-medium text-ink">Scenario</th>
              <th scope="col" className="w-[14%] py-2 text-right font-normal">Change</th>
            </tr>
          </thead>
          <tbody>
            {simulationProjection.rows.map((row, idx) => (
              <tr key={row.vendor_id} className="border-b border-rule">
                <td className="py-2.5 tabular-nums text-muted">{idx + 1}</td>
                <td className={`truncate py-2.5 ${idx === 0 ? 'font-semibold text-ink' : 'text-ink'}`}>{row.name}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-2">{formatEur(row.baselineCost)}</td>
                <td className="py-2.5 text-right font-semibold tabular-nums text-ink">{formatEur(row.projectedCost)}</td>
                <td className={`py-2.5 text-right tabular-nums ${deltaTone(row.totalDelta)}`}>{formatDelta(row.totalDelta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-faint tabular-nums">
          Applied: copper {appliedCopper.toFixed(2)}× · labour €{appliedLabor}/h · freight {appliedFreight.toFixed(2)}×
        </p>
      </section>
    </div>
  );
}
