'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { API_BASE, getReviewToken, setReviewToken } from '../../lib/api';
import { Settings, Save, CheckCircle2, Shield, Sliders, Database } from 'lucide-react';

export default function SettingsPage() {
  const [copperBaseline, setCopperBaseline] = useState(1.0);
  const [laborBaseline, setLaborBaseline] = useState(60);
  const [freightBaseline, setFreightBaseline] = useState(1.0);
  const [saved, setSaved] = useState(false);
  const [reviewToken, setReviewTokenInput] = useState('');

  useEffect(() => {
    setReviewTokenInput(getReviewToken() || '');
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setReviewToken(reviewToken);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto font-sans">
        <div className="pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
            Settings
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Default rates for new rate scenarios.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Section 1: Default Sensitivity Baseline */}
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-zinc-500" />
              <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                Default rates
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                  Copper price multiplier
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={copperBaseline}
                  onChange={(e) => setCopperBaseline(parseFloat(e.target.value) || 1.0)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded text-xs font-mono text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                  Site labour rate (€/h)
                </label>
                <input
                  type="number"
                  step="5"
                  value={laborBaseline}
                  onChange={(e) => setLaborBaseline(parseInt(e.target.value) || 60)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded text-xs font-mono text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                  Freight multiplier
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={freightBaseline}
                  onChange={(e) => setFreightBaseline(parseFloat(e.target.value) || 1.0)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded text-xs font-mono text-zinc-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Environment API Endpoint */}
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] space-y-3 shadow-2xs text-xs">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-zinc-500" />
              <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                Server connection
              </h2>
            </div>
            <div>
              <span className="text-zinc-500">Server address:</span>
              <code className="block mt-1 p-2 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded font-mono text-cyan-600 dark:text-cyan-400">
                {API_BASE || '(this site)'}
              </code>
            </div>
            <details className="text-[11px] text-zinc-500 cursor-pointer">
              <summary>Technical details</summary>
              <p className="mt-1">
                To point to a different hosted backend instance on Vercel, set <code className="text-zinc-700 dark:text-zinc-300">NEXT_PUBLIC_API_URL</code> in your project environment variables.
              </p>
            </details>
          </div>

          {/* Section 3: Reviewer token */}
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] space-y-3 shadow-2xs text-xs">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-zinc-500" />
              <h2 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                Reviewer token
              </h2>
            </div>
            <p className="text-zinc-500">
              Needed to upload documents, record decisions and sign off. Kept in this browser tab only and cleared when the tab closes. Leave empty to browse read-only.
            </p>
            <input
              type="password"
              autoComplete="off"
              value={reviewToken}
              onChange={(e) => setReviewTokenInput(e.target.value)}
              placeholder="Paste the token your administrator gave you"
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded text-xs font-mono text-zinc-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-between">
            {saved ? (
              <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            ) : <div />}

            <button
              type="submit"
              className="px-4 py-2 bg-[#172536] dark:bg-white text-white dark:text-black font-semibold text-xs rounded-md flex items-center gap-1.5 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-2xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
