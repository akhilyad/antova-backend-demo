'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { RatesSettings, VendorFinancials, Vendor, Parameter } from '../lib/types';
import { formatEur, formatDelta, formatPct } from '../lib/formatting';
import {
  Sliders,
  RotateCcw,
  Activity,
  Play,
  CheckCircle2,
  Info,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  BarChart3,
  Layers,
  Scale,
  Zap,
} from 'lucide-react';

export interface SensitivityPanelProps {
  onEvaluate: (rates: RatesSettings) => void;
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
  // 1. Staged Draft State (manipulated by sliders/inputs, does NOT trigger network recalculation)
  const [stagedCopper, setStagedCopper] = useState<number>(currentRates?.copper_multiplier ?? 1.0);
  const [stagedLabor, setStagedLabor] = useState<number>(currentRates?.site_labor_rate ?? 60);
  const [stagedFreight, setStagedFreight] = useState<number>(currentRates?.freight_multiplier ?? 1.0);

  // 2. Applied Rates (currently active in the calculation)
  const [appliedCopper, setAppliedCopper] = useState<number>(currentRates?.copper_multiplier ?? 1.0);
  const [appliedLabor, setAppliedLabor] = useState<number>(currentRates?.site_labor_rate ?? 60);
  const [appliedFreight, setAppliedFreight] = useState<number>(currentRates?.freight_multiplier ?? 1.0);

  // Synchronize when currentRates prop changes externally
  useEffect(() => {
    if (currentRates) {
      setAppliedCopper(currentRates.copper_multiplier ?? 1.0);
      setAppliedLabor(currentRates.site_labor_rate ?? 60);
      setAppliedFreight(currentRates.freight_multiplier ?? 1.0);
    }
  }, [currentRates]);

  // Diff checks
  const hasUnappliedChanges =
    Math.abs(stagedCopper - appliedCopper) > 0.001 ||
    Math.abs(stagedLabor - appliedLabor) > 0.1 ||
    Math.abs(stagedFreight - appliedFreight) > 0.001;

  const isModifiedFromBaseline =
    Math.abs(stagedCopper - 1.0) > 0.001 ||
    Math.abs(stagedLabor - 60) > 0.1 ||
    Math.abs(stagedFreight - 1.0) > 0.001;

  // Unapplied changes count
  const unappliedCount =
    (Math.abs(stagedCopper - appliedCopper) > 0.001 ? 1 : 0) +
    (Math.abs(stagedLabor - appliedLabor) > 0.1 ? 1 : 0) +
    (Math.abs(stagedFreight - appliedFreight) > 0.001 ? 1 : 0);

  // Reset Handlers
  const handleResetCopper = () => setStagedCopper(1.0);
  const handleResetLabor = () => setStagedLabor(60);
  const handleResetFreight = () => setStagedFreight(1.0);

  const handleResetAllToBaseline = () => {
    setStagedCopper(1.0);
    setStagedLabor(60);
    setStagedFreight(1.0);
  };

  // Preset Selection
  const handleSelectPreset = (preset: ScenarioPreset) => {
    setStagedCopper(preset.copper);
    setStagedLabor(preset.labor);
    setStagedFreight(preset.freight);
  };

  // Explicit Recalculation Trigger (The ONLY action that triggers evaluateTender on the backend)
  const handleApplyScenario = () => {
    setAppliedCopper(stagedCopper);
    setAppliedLabor(stagedLabor);
    setAppliedFreight(stagedFreight);
    onEvaluate({
      copper_multiplier: stagedCopper,
      site_labor_rate: stagedLabor,
      freight_multiplier: stagedFreight,
    });
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

    return {
      copperBase: copperBase > 0 ? copperBase : 12580,
      labourHours: labourHours > 0 ? labourHours : 130,
      freightBase: freightBase > 0 ? freightBase : 5200,
      vendorCopper: Object.keys(vendorCopper).length ? vendorCopper : { 'vendor-b': 12580 },
      vendorLabourHours: Object.keys(vendorLabourHours).length ? vendorLabourHours : { 'vendor-b': 65, 'vendor-c': 65 },
      vendorFreight: Object.keys(vendorFreight).length ? vendorFreight : { 'vendor-b': 5200 },
    };
  }, [parameters]);

  // Per-variable scenario results (financial deltas)
  const copperDeltaTotal = driverTotals.copperBase * (stagedCopper - 1.0);
  const laborDeltaTotal = driverTotals.labourHours * (stagedLabor - 60);
  const freightDeltaTotal = driverTotals.freightBase * (stagedFreight - 1.0);

  // Deterministic Client-Side Simulation Projection
  const simulationProjection = useMemo(() => {
    const list = financials.length > 0
      ? financials
      : [
          {
            vendor_id: 'vendor-a',
            name: 'Nordwerk Schaltanlagen GmbH',
            headline_price: 452000,
            true_evaluated_price: 452000,
            badge: 'Recommended Award',
          },
          {
            vendor_id: 'vendor-c',
            name: 'Deltaport Skid Consortium B.V.',
            headline_price: 439000,
            true_evaluated_price: 454000,
            badge: 'Bidder',
          },
          {
            vendor_id: 'vendor-b',
            name: 'VoltSwitch Industrial',
            headline_price: 418000,
            true_evaluated_price: 482800,
            badge: 'Apparent Low Bidder',
          },
        ];

    const projectedRows = list.map((v) => {
      const vId = v.vendor_id;
      const baseCost = v.true_evaluated_price ?? v.headline_price ?? 0;
      const vCopperBase = driverTotals.vendorCopper[vId] || 0;
      const vLabourHrs = driverTotals.vendorLabourHours[vId] || 0;
      const vFreightBase = driverTotals.vendorFreight[vId] || 0;

      const deltaCopper = vCopperBase * (stagedCopper - 1.0);
      const deltaLabor = vLabourHrs * (stagedLabor - 60);
      const deltaFreight = vFreightBase * (stagedFreight - 1.0);
      const totalDelta = deltaCopper + deltaLabor + deltaFreight;
      const projectedCost = baseCost + totalDelta;

      return {
        vendor_id: vId,
        name: v.name,
        baselineCost: baseCost,
        projectedCost,
        deltaCopper,
        deltaLabor,
        deltaFreight,
        totalDelta,
      };
    });

    const baselineSorted = [...projectedRows].sort((a, b) => a.baselineCost - b.baselineCost);
    const projectedSorted = [...projectedRows].sort((a, b) => a.projectedCost - b.projectedCost);

    const baselineWinner = baselineSorted[0];
    const projectedWinner = projectedSorted[0];
    const hasRankFlip = baselineWinner && projectedWinner && baselineWinner.vendor_id !== projectedWinner.vendor_id;

    return {
      rows: projectedSorted,
      baselineWinner,
      projectedWinner,
      hasRankFlip,
    };
  }, [financials, driverTotals, stagedCopper, stagedLabor, stagedFreight]);

  return (
    <div className="border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113] rounded-xl p-5 text-xs shadow-2xs font-sans space-y-5">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#DCE2E8] dark:border-zinc-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#172536] dark:bg-white text-white dark:text-black flex items-center justify-center shadow-xs">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <div className="text-zinc-900 dark:text-zinc-100 font-bold text-sm tracking-tight flex items-center gap-2.5">
              <span>Rate Sensitivity & Scenario Modeling</span>
              {isLoading && (
                <span className="text-[11px] text-cyan-600 dark:text-cyan-400 font-mono animate-pulse flex items-center gap-1 font-normal bg-cyan-50 dark:bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-200 dark:border-cyan-800/40">
                  <Activity className="w-3 h-3 animate-spin" />
                  <span>Recalculating...</span>
                </span>
              )}
              {hasUnappliedChanges && !isLoading && (
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/50 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                  <span>{unappliedCount} unapplied {unappliedCount === 1 ? 'change' : 'changes'}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Adjust commodity, labour and freight assumptions to model true evaluated job cost impacts and rank stability.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          {isModifiedFromBaseline && (
            <button
              onClick={handleResetAllToBaseline}
              disabled={isLoading}
              className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset all</span>
            </button>
          )}

          {/* Primary Apply Scenario Button */}
          <button
            onClick={handleApplyScenario}
            disabled={isLoading || (!hasUnappliedChanges && !isModifiedFromBaseline)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs transition-all shadow-xs cursor-pointer ${
              hasUnappliedChanges
                ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 ring-2 ring-zinc-400/50 dark:ring-white/30 transform active:scale-98'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed border border-zinc-200 dark:border-zinc-700/60'
            }`}
            title={hasUnappliedChanges ? 'Trigger deterministic calculation with staged assumptions' : 'No unapplied assumption changes'}
          >
            {hasUnappliedChanges ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current text-amber-400 dark:text-amber-500" />
                <span>Apply Scenario</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Scenario Applied</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Scenario Presets Strip (Inspired by First Image) */}
      <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Scenario Groups & Presets</span>
          </span>
          <span className="text-[11px] text-zinc-400">Click a preset to stage assumptions, then click Apply Scenario</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SCENARIO_PRESETS.map((preset) => {
            const isPresetActive =
              Math.abs(stagedCopper - preset.copper) < 0.01 &&
              Math.abs(stagedLabor - preset.labor) < 0.1 &&
              Math.abs(stagedFreight - preset.freight) < 0.01;

            return (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`p-3 rounded-lg text-left transition-all border cursor-pointer ${
                  isPresetActive
                    ? 'bg-white dark:bg-zinc-800/90 border-zinc-400 dark:border-zinc-500 shadow-xs ring-1 ring-zinc-300 dark:ring-zinc-600'
                    : `bg-white/70 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/80 hover:bg-white dark:hover:bg-zinc-800/50 ${preset.cardBorder}`
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
                    {preset.title}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${preset.badgeClass}`}>
                    {preset.badge}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2 leading-relaxed">
                  {preset.tagline}
                </p>
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-1.5">
                  <span>Cu: {preset.copper.toFixed(2)}x</span>
                  <span>Labour: €{preset.labor}/h</span>
                  <span>Freight: {preset.freight.toFixed(2)}x</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Three Independent Variable Cards (Copper, Labour, Freight) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* VARIABLE 1: COPPER MULTIPLIER */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3.5 flex flex-col justify-between">
          <div>
            {/* Header: Title, Subtitle, Reset */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                  Copper price (LME)
                </span>
                <p className="text-[11px] text-zinc-500">Affects copper busbars & cables</p>
              </div>

              {/* Reset Button */}
              {stagedCopper !== 1.0 && (
                <button
                  onClick={handleResetCopper}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 px-2 py-0.5 rounded transition-colors cursor-pointer"
                  title="Reset to 1.00x baseline"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Current Baseline Indicator */}
            <div className="flex items-center justify-between text-[11px] bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800/80 mb-3">
              <span className="text-zinc-600 dark:text-zinc-400">
                Baseline: <strong className="font-mono text-zinc-800 dark:text-zinc-200">1.00× (rate table)</strong>
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono ${
                  Math.abs(stagedCopper - 1.0) < 0.01
                    ? 'bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    : stagedCopper > 1.0
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400'
                    : 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-400'
                }`}
              >
                {Math.abs(stagedCopper - 1.0) < 0.01 ? 'At baseline' : formatPct((stagedCopper - 1.0) * 100)}
              </span>
            </div>

            {/* Controls: Slider & Editable Numeric Input */}
            <div className="flex items-center gap-3 mb-2">
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.05"
                value={stagedCopper}
                onChange={(e) => setStagedCopper(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-900 dark:accent-white"
                aria-label="Copper multiplier slider"
              />
              {/* Editable Numeric Input */}
              <div className="flex items-center w-24 px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-right shadow-2xs focus-within:ring-2 focus-within:ring-zinc-400">
                <input
                  type="number"
                  min="0.5"
                  max="2.5"
                  step="0.05"
                  value={stagedCopper}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) setStagedCopper(val);
                  }}
                  onBlur={() => {
                    if (stagedCopper < 0.5) setStagedCopper(0.5);
                    if (stagedCopper > 2.5) setStagedCopper(2.5);
                  }}
                  className="w-full bg-transparent text-right font-mono font-bold text-zinc-900 dark:text-white text-xs focus:outline-none"
                  aria-label="Copper multiplier input"
                />
                <span className="text-[11px] text-zinc-400 ml-1">x</span>
              </div>
            </div>

            {/* Slider Scale Ticks */}
            <div className="flex justify-between text-[10px] text-zinc-400 font-mono mb-3">
              <span>0.50x</span>
              <span className="text-zinc-600 dark:text-zinc-300 font-medium">1.00× (base)</span>
              <span>2.50x</span>
            </div>
          </div>

          {/* Scenario Result (Per-Variable Impact) */}
          <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 text-[11px] space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 font-medium">Scenario Result:</span>
              <span
                className={`font-mono font-bold ${
                  copperDeltaTotal === 0
                    ? 'text-zinc-600 dark:text-zinc-400'
                    : copperDeltaTotal > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {formatDelta(copperDeltaTotal)}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-tight">
              {Math.abs(stagedCopper - 1.0) < 0.01
                ? 'Rate table base: €12,580 Cu-Al adder applied on VoltSwitch.'
                : `VoltSwitch Cu-Al busbar cost changes to ${formatEur(12580 * stagedCopper)}.`}
            </p>
          </div>
        </div>

        {/* VARIABLE 2: SITE LABOUR RATE */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3.5 flex flex-col justify-between">
          <div>
            {/* Header: Title, Subtitle, Reset */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                  Site labour rate
                </span>
                <p className="text-[11px] text-zinc-500">Cabling & installation supervision</p>
              </div>

              {/* Reset Button */}
              {stagedLabor !== 60 && (
                <button
                  onClick={handleResetLabor}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 px-2 py-0.5 rounded transition-colors cursor-pointer"
                  title="Reset to €60/h baseline"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Current Baseline Indicator */}
            <div className="flex items-center justify-between text-[11px] bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800/80 mb-3">
              <span className="text-zinc-600 dark:text-zinc-400">
                Baseline: <strong className="font-mono text-zinc-800 dark:text-zinc-200">€60/h (rate table)</strong>
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono ${
                  stagedLabor === 60
                    ? 'bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    : stagedLabor > 60
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400'
                    : 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-400'
                }`}
              >
                {stagedLabor === 60 ? 'At baseline' : formatPct(((stagedLabor - 60) / 60) * 100)}
              </span>
            </div>

            {/* Controls: Slider & Editable Numeric Input */}
            <div className="flex items-center gap-3 mb-2">
              <input
                type="range"
                min="20"
                max="200"
                step="5"
                value={stagedLabor}
                onChange={(e) => setStagedLabor(parseInt(e.target.value, 10))}
                className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-900 dark:accent-white"
                aria-label="Site labour rate slider"
              />
              {/* Editable Numeric Input */}
              <div className="flex items-center w-24 px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-right shadow-2xs focus-within:ring-2 focus-within:ring-zinc-400">
                <span className="text-[11px] text-zinc-400 mr-0.5">€</span>
                <input
                  type="number"
                  min="20"
                  max="200"
                  step="5"
                  value={stagedLabor}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setStagedLabor(val);
                  }}
                  onBlur={() => {
                    if (stagedLabor < 20) setStagedLabor(20);
                    if (stagedLabor > 200) setStagedLabor(200);
                  }}
                  className="w-full bg-transparent text-right font-mono font-bold text-zinc-900 dark:text-white text-xs focus:outline-none"
                  aria-label="Site labour rate input"
                />
                <span className="text-[10px] text-zinc-400 ml-0.5">/h</span>
              </div>
            </div>

            {/* Slider Scale Ticks */}
            <div className="flex justify-between text-[10px] text-zinc-400 font-mono mb-3">
              <span>€20/h</span>
              <span className="text-zinc-600 dark:text-zinc-300 font-medium">€60/h (base)</span>
              <span>€200/h</span>
            </div>
          </div>

          {/* Scenario Result (Per-Variable Impact) */}
          <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 text-[11px] space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 font-medium">Scenario Result:</span>
              <span
                className={`font-mono font-bold ${
                  laborDeltaTotal === 0
                    ? 'text-zinc-600 dark:text-zinc-400'
                    : laborDeltaTotal > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {formatDelta(laborDeltaTotal)}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-tight">
              {stagedLabor === 60
                ? 'Rate table base: 130 site hours (€7,800 total across bids).'
                : `${formatDelta(65 * (stagedLabor - 60))} each on VoltSwitch and Deltaport (65h each).`}
            </p>
          </div>
        </div>

        {/* VARIABLE 3: FREIGHT MULTIPLIER */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3.5 flex flex-col justify-between">
          <div>
            {/* Header: Title, Subtitle, Reset */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                  Freight
                </span>
                <p className="text-[11px] text-zinc-500">Transport to site (DAP or DDP)</p>
              </div>

              {/* Reset Button */}
              {stagedFreight !== 1.0 && (
                <button
                  onClick={handleResetFreight}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 px-2 py-0.5 rounded transition-colors cursor-pointer"
                  title="Reset to 1.00x baseline"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Current Baseline Indicator */}
            <div className="flex items-center justify-between text-[11px] bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800/80 mb-3">
              <span className="text-zinc-600 dark:text-zinc-400">
                Baseline: <strong className="font-mono text-zinc-800 dark:text-zinc-200">1.00× (rate table)</strong>
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono ${
                  Math.abs(stagedFreight - 1.0) < 0.01
                    ? 'bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    : stagedFreight > 1.0
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400'
                    : 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-400'
                }`}
              >
                {Math.abs(stagedFreight - 1.0) < 0.01 ? 'At baseline' : formatPct((stagedFreight - 1.0) * 100)}
              </span>
            </div>

            {/* Controls: Slider & Editable Numeric Input */}
            <div className="flex items-center gap-3 mb-2">
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.05"
                value={stagedFreight}
                onChange={(e) => setStagedFreight(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-900 dark:accent-white"
                aria-label="Freight rate slider"
              />
              {/* Editable Numeric Input */}
              <div className="flex items-center w-24 px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-right shadow-2xs focus-within:ring-2 focus-within:ring-zinc-400">
                <input
                  type="number"
                  min="0.5"
                  max="2.5"
                  step="0.05"
                  value={stagedFreight}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) setStagedFreight(val);
                  }}
                  onBlur={() => {
                    if (stagedFreight < 0.5) setStagedFreight(0.5);
                    if (stagedFreight > 2.5) setStagedFreight(2.5);
                  }}
                  className="w-full bg-transparent text-right font-mono font-bold text-zinc-900 dark:text-white text-xs focus:outline-none"
                  aria-label="Freight rate input"
                />
                <span className="text-[11px] text-zinc-400 ml-1">x</span>
              </div>
            </div>

            {/* Slider Scale Ticks */}
            <div className="flex justify-between text-[10px] text-zinc-400 font-mono mb-3">
              <span>0.50x</span>
              <span className="text-zinc-600 dark:text-zinc-300 font-medium">1.00× (base)</span>
              <span>2.50x</span>
            </div>
          </div>

          {/* Scenario Result (Per-Variable Impact) */}
          <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 text-[11px] space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 font-medium">Scenario Result:</span>
              <span
                className={`font-mono font-bold ${
                  freightDeltaTotal === 0
                    ? 'text-zinc-600 dark:text-zinc-400'
                    : freightDeltaTotal > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {formatDelta(freightDeltaTotal)}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-tight">
              {Math.abs(stagedFreight - 1.0) < 0.01
                ? 'Rate table base: €5,200 delivery adder on VoltSwitch (DAP).'
                : `VoltSwitch site freight logistics changes to ${formatEur(5200 * stagedFreight)}.`}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Simulation Projection & Rank Flip Alert (Inspired by Image 1) */}
      <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-zinc-200/80 dark:border-zinc-800 gap-2">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
            <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs uppercase tracking-wider">
              Simulation Projection & Rank Stability Monitor
            </span>
          </div>

          {hasUnappliedChanges && (
            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Unapplied draft preview · Click "Apply Scenario" to commit recalculation</span>
            </span>
          )}
        </div>

        {/* Rank Flip Warning Banner if rank flip occurs */}
        {simulationProjection.hasRankFlip ? (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <strong className="font-semibold">Rank Flip Warning: </strong>
              Under this scenario, <strong className="font-semibold">{simulationProjection.projectedWinner?.name}</strong> is projected as lowest evaluated bidder at{' '}
              <span className="font-mono font-bold text-amber-950 dark:text-amber-100">{formatEur(simulationProjection.projectedWinner?.projectedCost)}</span>, undercutting baseline winner{' '}
              {simulationProjection.baselineWinner?.name} ({formatEur(simulationProjection.baselineWinner?.baselineCost)}).
            </div>
          </div>
        ) : (
          <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              <strong>Stable Ranking:</strong> {simulationProjection.baselineWinner?.name} remains the lowest evaluated bidder at {formatEur(simulationProjection.baselineWinner?.projectedCost)} under these assumptions.
            </span>
          </div>
        )}

        {/* Vendor Projected Cost Table */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {simulationProjection.rows.map((row, idx) => {
            const isWinner = idx === 0;
            return (
              <div
                key={row.vendor_id}
                className={`p-3 rounded-lg border transition-all ${
                  isWinner
                    ? 'bg-white dark:bg-zinc-850 border-emerald-300 dark:border-emerald-700/60 shadow-xs ring-1 ring-emerald-400/30'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs truncate" title={row.name}>
                    {row.name}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
                      isWinner
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                </div>

                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[11px] text-zinc-500">Projected Total:</span>
                  <span className="font-mono font-bold text-xs text-zinc-900 dark:text-white">
                    {formatEur(row.projectedCost)}
                  </span>
                </div>

                <div className="flex items-baseline justify-between text-[10px] text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-1">
                  <span>Baseline: {formatEur(row.baselineCost)}</span>
                  <span
                    className={`font-mono font-semibold ${
                      row.totalDelta === 0
                        ? 'text-zinc-400'
                        : row.totalDelta > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {formatDelta(row.totalDelta)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Bottom Sticky Action & Rate Summary Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 rounded-xl bg-zinc-50 dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-zinc-600 dark:text-zinc-400">
          <Info className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>
            Active rates in calculation:{' '}
            <strong className="text-zinc-900 dark:text-white font-mono">{appliedCopper.toFixed(2)}x copper</strong> ·{' '}
            <strong className="text-zinc-900 dark:text-white font-mono">€{appliedLabor}/h labour</strong> ·{' '}
            <strong className="text-zinc-900 dark:text-white font-mono">{appliedFreight.toFixed(2)}x freight</strong>
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasUnappliedChanges && (
            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
              Staged assumptions waiting for recalculation
            </span>
          )}

          <button
            onClick={handleApplyScenario}
            disabled={isLoading || (!hasUnappliedChanges && !isModifiedFromBaseline)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold text-xs transition-colors shadow-2xs cursor-pointer ${
              hasUnappliedChanges
                ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 ring-2 ring-zinc-400/50'
                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
            }`}
          >
            <Play className="w-3 h-3 fill-current text-amber-400 dark:text-amber-500" />
            <span>Apply Scenario</span>
          </button>
        </div>
      </div>
    </div>
  );
}
