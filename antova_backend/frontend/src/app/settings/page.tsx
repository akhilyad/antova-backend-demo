'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { API_BASE, getReviewToken, setReviewToken } from '../../lib/api';

const field =
  'w-full rounded border border-rule-strong bg-paper px-2.5 py-1.5 text-[13px] tabular-nums text-ink outline-none focus:border-ink';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-rule py-4 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-8">
      <div>
        <p className="text-[13px] text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

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
      <div className="max-w-3xl text-ink">
        <h1 className="text-xl font-semibold leading-7 tracking-tight">Settings</h1>
        <p className="mt-1 text-xs text-muted">Default rates, server and reviewer access.</p>

        <form onSubmit={handleSave} className="mt-8">
          <h2 className="text-[13px] font-medium">Default rates</h2>
          <div className="mt-2 border-t border-rule">
            <Row label="Copper price" hint="Multiplier on the rate table">
              <input
                type="number"
                step="0.05"
                value={copperBaseline}
                onChange={(e) => setCopperBaseline(parseFloat(e.target.value) || 1.0)}
                className={`${field} max-w-[8rem]`}
                aria-label="Copper price multiplier"
              />
            </Row>
            <Row label="Site labour rate" hint="€ per hour">
              <input
                type="number"
                step="5"
                value={laborBaseline}
                onChange={(e) => setLaborBaseline(parseInt(e.target.value) || 60)}
                className={`${field} max-w-[8rem]`}
                aria-label="Site labour rate"
              />
            </Row>
            <Row label="Freight" hint="Multiplier on the rate table">
              <input
                type="number"
                step="0.05"
                value={freightBaseline}
                onChange={(e) => setFreightBaseline(parseFloat(e.target.value) || 1.0)}
                className={`${field} max-w-[8rem]`}
                aria-label="Freight multiplier"
              />
            </Row>
          </div>

          <h2 className="mt-10 text-[13px] font-medium">Access</h2>
          <div className="mt-2 border-t border-rule">
            <Row label="Server" hint="Set NEXT_PUBLIC_API_URL to point at another engine.">
              <code className="font-mono text-xs text-ink-2">{API_BASE || 'This site'}</code>
            </Row>
            <Row
              label="Reviewer token"
              hint="Needed to upload, record decisions and sign off. Kept in this tab only. Leave empty to browse read-only."
            >
              <input
                type="password"
                autoComplete="off"
                value={reviewToken}
                onChange={(e) => setReviewTokenInput(e.target.value)}
                placeholder="Token from your administrator"
                className={`${field} font-mono`}
                aria-label="Reviewer token"
              />
            </Row>
          </div>

          <div className="mt-6 flex items-center justify-end gap-4 text-xs">
            {saved && <span className="text-muted" role="status">Saved</span>}
            <button type="submit" className="rounded bg-ink px-3.5 py-1.5 font-medium text-paper hover:opacity-90">
              Save
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
