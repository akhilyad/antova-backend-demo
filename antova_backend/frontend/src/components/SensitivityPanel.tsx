'use client';

import React, { useState } from 'react';
import { RatesSettings } from '../lib/types';
import { Sliders, RotateCcw, Activity } from 'lucide-react';

interface SensitivityPanelProps {
  onEvaluate: (rates: RatesSettings) => void;
  isLoading?: boolean;
}

export function SensitivityPanel({ onEvaluate, isLoading = false }: SensitivityPanelProps) {
  const [copper, setCopper] = useState<number>(1.0);
  const [labor, setLabor] = useState<number>(60);
  const [freight, setFreight] = useState<number>(1.0);

  const handleCopperChange = (val: number) => {
    setCopper(val);
    onEvaluate({ copper_multiplier: val, site_labor_rate: labor, freight_multiplier: freight });
  };

  const handleLaborChange = (val: number) => {
    setLabor(val);
    onEvaluate({ copper_multiplier: copper, site_labor_rate: val, freight_multiplier: freight });
  };

  const handleFreightChange = (val: number) => {
    setFreight(val);
    onEvaluate({ copper_multiplier: copper, site_labor_rate: labor, freight_multiplier: val });
  };

  const handleReset = () => {
    setCopper(1.0);
    setLabor(60);
    setFreight(1.0);
    onEvaluate({ copper_multiplier: 1.0, site_labor_rate: 60, freight_multiplier: 1.0 });
  };

  const isModified = copper !== 1.0 || labor !== 60 || freight !== 1.0;

  return (
    <div className="border border-zinc-800 bg-[#09090B] rounded p-3.5 text-xs shadow-sm font-sans">
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800 mb-3">
        <div className="flex items-center gap-2 text-zinc-200 font-semibold text-xs">
          <Sliders className="w-3.5 h-3.5 text-zinc-400" />
          <span>Commodity & Rate Sensitivity Engine</span>
          {isLoading && (
            <span className="text-[11px] text-cyan-400 font-mono animate-pulse flex items-center gap-1">
              <Activity className="w-3 h-3 animate-spin" />
              <span>Recalculating...</span>
            </span>
          )}
        </div>
        {isModified && (
          <button
            onClick={handleReset}
            className="text-[11px] text-zinc-300 hover:text-white flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Baseline Rates</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Copper Slider */}
        <div className="p-2.5 rounded bg-[#111113] border border-zinc-800">
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-zinc-400">Copper (LME Index)</span>
            <span className="text-white font-mono font-bold tabular-nums">{copper.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.05"
            value={copper}
            onChange={(e) => handleCopperChange(parseFloat(e.target.value))}
            className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-white"
            aria-label="Copper multiplier"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-1">
            <span>0.5x</span>
            <span>1.0x (Base)</span>
            <span>2.5x</span>
          </div>
        </div>

        {/* Site Labor Slider */}
        <div className="p-2.5 rounded bg-[#111113] border border-zinc-800">
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-zinc-400">Site Labor Hourly Rate</span>
            <span className="text-white font-mono font-bold tabular-nums">€{labor}/hr</span>
          </div>
          <input
            type="range"
            min="20"
            max="200"
            step="5"
            value={labor}
            onChange={(e) => handleLaborChange(parseInt(e.target.value))}
            className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-white"
            aria-label="Site labor rate"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-1">
            <span>€20/hr</span>
            <span>€60/hr (Base)</span>
            <span>€200/hr</span>
          </div>
        </div>

        {/* Freight Slider */}
        <div className="p-2.5 rounded bg-[#111113] border border-zinc-800">
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-zinc-400">Heavy Haul & Sea Freight</span>
            <span className="text-white font-mono font-bold tabular-nums">{freight.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.05"
            value={freight}
            onChange={(e) => handleFreightChange(parseFloat(e.target.value))}
            className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-white"
            aria-label="Freight multiplier"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-1">
            <span>0.5x</span>
            <span>1.0x (Base)</span>
            <span>2.5x</span>
          </div>
        </div>
      </div>
    </div>
  );
}
