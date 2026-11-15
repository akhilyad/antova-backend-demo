'use client';

import React, { useState } from 'react';
import { RatesSettings } from '../lib/types';
import {
  Sliders,
  RotateCcw,
  Activity,
  Play,
  CheckCircle2,
  Info,
  TrendingUp,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface SensitivityPanelProps {
  onEvaluate: (rates: RatesSettings) => void;
  isLoading?: boolean;
  onClose?: () => void;
  currentRates?: RatesSettings;
}

export function SensitivityPanel({
  onEvaluate,
  isLoading = false,
  onClose,
  currentRates,
}: SensitivityPanelProps) {
  // Staged values (local draft before applying)
  const [stagedCopper, setStagedCopper] = useState<number>(currentRates?.copper_multiplier ?? 1.0);
  const [stagedLabor, setStagedLabor] = useState<number>(currentRates?.site_labor_rate ?? 60);
  const [stagedFreight, setStagedFreight] = useState<number>(currentRates?.freight_multiplier ?? 1.0);

  // Applied values (the ones currently active in the calculation)
  const [appliedCopper, setAppliedCopper] = useState<number>(currentRates?.copper_multiplier ?? 1.0);
  const [appliedLabor, setAppliedLabor] = useState<number>(currentRates?.site_labor_rate ?? 60);
  const [appliedFreight, setAppliedFreight] = useState<number>(currentRates?.freight_multiplier ?? 1.0);

  // Check if staged differs from baseline (1.0, 60, 1.0)
  const isStagedModifiedFromBaseline = stagedCopper !== 1.0 || stagedLabor !== 60 || stagedFreight !== 1.0;
  // Check if staged differs from currently applied
  const hasUnappliedChanges =
    stagedCopper !== appliedCopper ||
    stagedLabor !== appliedLabor ||
    stagedFreight !== appliedFreight;

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

  const handleResetBaseline = () => {
    setStagedCopper(1.0);
    setStagedLabor(60);
    setStagedFreight(1.0);
    setAppliedCopper(1.0);
    setAppliedLabor(60);
    setAppliedFreight(1.0);
    onEvaluate({
      copper_multiplier: 1.0,
      site_labor_rate: 60,
      freight_multiplier: 1.0,
    });
  };

  const handleResetCopper = () => setStagedCopper(1.0);
  const handleResetLabor = () => setStagedLabor(60);
  const handleResetFreight = () => setStagedFreight(1.0);

  return (
    <div className="border border-[#DCE2E8] dark:border-zinc-800 bg-[#FFFFFF] dark:bg-[#111113] rounded-xl p-5 text-xs shadow-2xs font-sans space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#DCE2E8] dark:border-zinc-800 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-[#172536] text-white flex items-center justify-center">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-zinc-900 dark:text-zinc-100 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
              <span>Rate scenarios</span>
              {isLoading && (
                <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono animate-pulse flex items-center gap-1 font-normal">
                  <Activity className="w-3 h-3 animate-spin" />
                  <span>Updating...</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">
              Change copper, labour and freight rates to see if the ranking changes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isStagedModifiedFromBaseline && (
            <button
              onClick={handleResetBaseline}
              disabled={isLoading}
              className="text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 rounded-md transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset all</span>
            </button>
          )}

          <button
            onClick={handleApplyScenario}
            disabled={isLoading || (!hasUnappliedChanges && !isStagedModifiedFromBaseline)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-semibold text-xs transition-colors shadow-2xs ${
              hasUnappliedChanges
                ? 'bg-[#172536] text-white hover:bg-zinc-800 ring-2 ring-zinc-400 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Update totals</span>
          </button>
        </div>
      </div>

      {/* Assumptions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* 1. Copper Multiplier */}
        <div className="p-3 rounded-lg bg-zinc-50 dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex justify-between items-start">
            <div>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs">Copper price (LME)</span>
              <p className="text-[10px] text-zinc-500">Affects copper busbars and cables</p>
            </div>
            {stagedCopper !== 1.0 && (
              <button
                onClick={handleResetCopper}
                className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                title="Reset copper"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              value={stagedCopper}
              onChange={(e) => setStagedCopper(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded appearance-none cursor-pointer accent-[#172536] dark:accent-white"
              aria-label="Copper price"
            />
            <div className="flex items-center w-20 px-2 py-1 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 rounded text-right shadow-2xs">
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
                className="w-full bg-transparent text-right font-mono font-bold text-zinc-900 dark:text-white text-xs focus:outline-none"
              />
              <span className="text-[11px] text-zinc-400 ml-0.5">x</span>
            </div>
          </div>

          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
            <span>0.50x</span>
            <span className="text-zinc-700 dark:text-zinc-300 font-semibold">1.00× (rate table)</span>
            <span>2.50x</span>
          </div>
        </div>

        {/* 2. Site Labor Rate */}
        <div className="p-3 rounded-lg bg-zinc-50 dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex justify-between items-start">
            <div>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs">Site labour rate</span>
              <p className="text-[10px] text-zinc-500">Cabling and installation supervision</p>
            </div>
            {stagedLabor !== 60 && (
              <button
                onClick={handleResetLabor}
                className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                title="Reset labour"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="range"
              min="20"
              max="200"
              step="5"
              value={stagedLabor}
              onChange={(e) => setStagedLabor(parseInt(e.target.value))}
              className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded appearance-none cursor-pointer accent-[#172536] dark:accent-white"
              aria-label="Site labour rate"
            />
            <div className="flex items-center w-24 px-2 py-1 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 rounded text-right shadow-2xs">
              <span className="text-[11px] text-zinc-400 mr-0.5">€</span>
              <input
                type="number"
                min="20"
                max="200"
                step="5"
                value={stagedLabor}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) setStagedLabor(val);
                }}
                className="w-full bg-transparent text-right font-mono font-bold text-zinc-900 dark:text-white text-xs focus:outline-none"
              />
              <span className="text-[10px] text-zinc-400 ml-0.5">/h</span>
            </div>
          </div>

          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
            <span>€20/h</span>
            <span className="text-zinc-700 dark:text-zinc-300 font-semibold">€60/h (rate table)</span>
            <span>€200/h</span>
          </div>
        </div>

        {/* 3. Freight Multiplier */}
        <div className="p-3 rounded-lg bg-zinc-50 dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex justify-between items-start">
            <div>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs">Freight</span>
              <p className="text-[10px] text-zinc-500">Transport to site (DAP or DDP)</p>
            </div>
            {stagedFreight !== 1.0 && (
              <button
                onClick={handleResetFreight}
                className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                title="Reset freight"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              value={stagedFreight}
              onChange={(e) => setStagedFreight(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded appearance-none cursor-pointer accent-[#172536] dark:accent-white"
              aria-label="Freight rate"
            />
            <div className="flex items-center w-20 px-2 py-1 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 rounded text-right shadow-2xs">
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
                className="w-full bg-transparent text-right font-mono font-bold text-zinc-900 dark:text-white text-xs focus:outline-none"
              />
              <span className="text-[11px] text-zinc-400 ml-0.5">x</span>
            </div>
          </div>

          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
            <span>0.50x</span>
            <span className="text-zinc-700 dark:text-zinc-300 font-semibold">1.00× (rate table)</span>
            <span>2.50x</span>
          </div>
        </div>
      </div>

      {/* Applied Scenario Status Bar */}
      <div className="flex items-center justify-between px-3 py-2 rounded-md bg-zinc-50 dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 text-[11px]">
        <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
          <Info className="w-3.5 h-3.5 text-zinc-500" />
          <span>
            Current rates: copper <strong className="text-zinc-900 dark:text-white font-mono">{appliedCopper.toFixed(2)}x</strong> · labour <strong className="text-zinc-900 dark:text-white font-mono">€{appliedLabor}/h</strong> · freight <strong className="text-zinc-900 dark:text-white font-mono">{appliedFreight.toFixed(2)}x</strong>
          </span>
        </div>
        {hasUnappliedChanges && (
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            Rates changed. Select "Update totals" to recalculate.
          </span>
        )}
      </div>
    </div>
  );
}
