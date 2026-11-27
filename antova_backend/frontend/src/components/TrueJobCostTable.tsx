'use client';

import React, { useState } from 'react';
import { ChevronRight, Plus, X } from 'lucide-react';
import { ActionButton } from './ui/actions';
import { VendorFinancials, Vendor, Parameter } from '../lib/types';
import { formatEur, formatAdderEur } from '../lib/domain/money';
import { statusTag } from '../lib/domain/status';

interface TrueJobCostTableProps {
  financials?: VendorFinancials[];
  vendors?: Vendor[];
  parameters?: Parameter[];
  /** Opens the review drawer for one requirement of one bidder (clause, quote, evidence, override). */
  onInspect: (vendorId: string, paramId: string) => void;
  /** Opens the override drawer for a bidder and requirement the engine priced at €0 or missed. */
  onAddAdjustment?: (vendorId: string, paramId: string) => void;
  /** Why adjustments are off (signed off, saved sample); hides nothing, disables the button. */
  adjustDisabledReason?: string;
}

const NUM = 'text-right tabular-nums whitespace-nowrap';

const CRIT: Record<string, string> = { MANDATORY: 'Mandatory', HIGH: 'High', MEDIUM: 'Medium', COMMERCIAL: 'Commercial' };

/**
 * Bids ranked by true job cost. Rows stay one line; a click opens that bidder's priced gaps
 * underneath. The full clause and evidence live in the review drawer, one gap at a time.
 */
export function TrueJobCostTable({ financials = [], vendors = [], parameters = [], onInspect, onAddAdjustment, adjustDisabledReason }: TrueJobCostTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickVendor, setPickVendor] = useState('');
  const [pickParam, setPickParam] = useState('');

  const rows = Array.isArray(financials) ? financials.filter(Boolean) : [];
  const priced = rows
    .filter((f) => f.headline_price !== null && f.true_evaluated_price !== null)
    .sort((a, b) => (a.true_evaluated_price ?? 0) - (b.true_evaluated_price ?? 0));
  const unpriced = rows.filter((f) => f.headline_price === null || f.true_evaluated_price === null);
  const ordered = [...priced, ...unpriced];
  const lowestQuote = priced.length ? Math.min(...priced.map((f) => f.headline_price ?? Infinity)) : null;

  const toggle = (id: string) => setExpanded((cur) => (cur === id ? null : id));

  return (
    <>
    <table className="w-full table-fixed border-collapse text-[13px]" aria-label="Bids ranked by true job cost">
      <colgroup>
        <col className="w-10" />
        <col />
        <col className="w-[12%]" />
        <col className="w-[11%]" />
        <col className="w-[13%]" />
        <col className="w-[13%]" />
        <col className="w-8" />
      </colgroup>
      <thead>
        <tr className="border-b border-rule-strong text-[11px] text-muted">
          <th scope="col" className="py-2 pr-2 text-left font-normal">#</th>
          <th scope="col" className="py-2 pr-4 text-left font-normal">Bidder</th>
          <th scope="col" className={`py-2 px-3 font-normal ${NUM}`}>Quoted price</th>
          <th scope="col" className={`py-2 px-3 font-normal ${NUM}`}>Adders</th>
          <th scope="col" className={`py-2 px-3 font-medium text-ink ${NUM}`}>True job cost</th>
          <th scope="col" className={`py-2 px-3 font-normal ${NUM}`}>vs lowest quote</th>
          <th scope="col"><span className="sr-only">Expand</span></th>
        </tr>
      </thead>
      <tbody>
        {ordered.length === 0 && (
          <tr>
            <td colSpan={7} className="py-10 text-center text-muted">No evaluated bids.</td>
          </tr>
        )}
        {ordered.map((f, index) => {
          const vendor = vendors.find((v) => v.id === f.vendor_id);
          const isPriced = f.headline_price !== null && f.true_evaluated_price !== null;
          const isAward = isPriced && index === 0;
          const isOpen = expanded === f.vendor_id;
          const lowerBound = f.price_status === 'UNPRICED_ITEMS';
          const delta = lowestQuote !== null && f.true_evaluated_price !== null ? f.true_evaluated_price - lowestQuote : null;
          const panelId = `bid-${f.vendor_id}`;

          return (
            <React.Fragment key={f.vendor_id}>
              <tr
                onClick={() => toggle(f.vendor_id)}
                className={`cursor-pointer border-b border-rule hover:bg-sheet ${isOpen ? 'bg-sheet' : ''}`}
              >
                <td className="py-3 pr-2 tabular-nums text-muted">{isPriced ? index + 1 : '–'}</td>
                <td className="py-3 pr-4 min-w-0">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(f.vendor_id);
                    }}
                    className="flex w-full min-w-0 items-baseline gap-2 text-left focus-visible:outline-none focus-visible:underline"
                  >
                    <span className={`truncate ${isAward ? 'font-semibold text-ink' : 'text-ink'}`}>
                      {f.name || vendor?.name || f.vendor_id}
                    </span>
                    <span className="hidden shrink-0 text-xs text-faint xl:inline">{f.country || vendor?.country}</span>
                    {isAward && <span className="shrink-0 text-[11px] font-medium text-brand">Award</span>}
                  </button>
                </td>
                <td className={`py-3 px-3 ${NUM} text-ink-2`}>
                  {f.headline_price !== null ? formatEur(f.headline_price) : <span className="text-open">No price</span>}
                </td>
                <td className={`py-3 px-3 ${NUM} ${f.total_adders > 0 ? 'text-gap' : 'text-faint'}`}>
                  {f.total_adders > 0 ? formatAdderEur(f.total_adders) : '€0'}
                </td>
                <td className={`py-3 px-3 ${NUM} font-semibold text-ink`} title={lowerBound ? 'At least: a gap in this bid has no price yet' : undefined}>
                  {isPriced ? formatEur(f.true_evaluated_price, { isLowerBound: lowerBound }) : <span className="font-normal text-open">–</span>}
                </td>
                <td className={`py-3 px-3 ${NUM} ${delta && delta > 0 ? 'text-ink-2' : 'text-faint'}`}>
                  {delta === null ? '–' : delta > 0 ? formatAdderEur(delta) : '€0'}
                </td>
                <td className="py-3 text-right text-faint">
                  <ChevronRight className={`ml-auto h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90 text-ink' : ''}`} aria-hidden="true" />
                </td>
              </tr>
              {isOpen && (
                <tr id={panelId} className="border-b border-rule bg-sheet">
                  <td />
                  <td colSpan={6} className="pb-4 pr-3 pt-1">
                    <BidGaps financials={f} parameters={parameters} onInspect={onInspect} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
    {onAddAdjustment && (
      <div className="mt-3">
        {picking ? (
          <form
            className="flex flex-wrap items-center gap-2 text-xs"
            onKeyDown={(e) => e.key === 'Escape' && setPicking(false)}
            onSubmit={(e) => {
              e.preventDefault();
              if (!pickVendor || !pickParam) return;
              onAddAdjustment(pickVendor, pickParam);
              setPicking(false);
            }}
          >
            <select
              aria-label="Bidder"
              value={pickVendor}
              onChange={(e) => setPickVendor(e.target.value)}
              className="h-7 rounded border border-rule-strong bg-paper px-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
            >
              <option value="">Bidder…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <select
              aria-label="Requirement"
              value={pickParam}
              onChange={(e) => setPickParam(e.target.value)}
              className="h-7 max-w-xs rounded border border-rule-strong bg-paper px-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink"
            >
              <option value="">Scope item…</option>
              {parameters.map((p) => (
                <option key={p.id} value={p.id}>{p.id} · {p.name}</option>
              ))}
            </select>
            <ActionButton type="submit" tone="primary" icon={Plus} label="Continue" disabled={!pickVendor || !pickParam} />
            <ActionButton icon={X} label="Cancel" onClick={() => setPicking(false)} />
          </form>
        ) : (
          <ActionButton
            icon={Plus}
            label="Add cost adjustment"
            title={adjustDisabledReason || 'Price a scope item the engine missed or under-priced'}
            disabled={Boolean(adjustDisabledReason)}
            onClick={() => {
              setPickVendor(rows[0]?.vendor_id ?? vendors[0]?.id ?? '');
              setPickParam('');
              setPicking(true);
            }}
          />
        )}
      </div>
    )}
    </>
  );
}

function BidGaps({
  financials,
  parameters,
  onInspect,
}: {
  financials: VendorFinancials;
  parameters: Parameter[];
  onInspect: (vendorId: string, paramId: string) => void;
}) {
  const vid = financials.vendor_id;
  const breakdown = Array.isArray(financials.itemized_breakdown) ? financials.itemized_breakdown : [];

  const lines = parameters
    .map((p) => {
      const ext = p.vendors?.[vid];
      const item = breakdown.find((b) => b.param_id === p.id);
      const status = item?.status ?? ext?.status ?? 'MANUAL_INSPECTION_REQUIRED';
      const pricing = item?.pricing_status ?? ext?.pricing_status ?? 'NONE';
      const tag = statusTag(status, pricing, Boolean(item?.is_overridden));
      const adder = item?.adder_eur ?? ext?.cost_adder ?? null;
      return { p, tag, adder, overridden: Boolean(item?.is_overridden), page: p.requirement_citation?.page };
    })
    .filter((l) => l.tag.severity !== 'ok' || (l.adder ?? 0) > 0);

  const meets = parameters.length - lines.length;

  if (lines.length === 0) {
    return <p className="py-2 text-xs text-muted">Meets all {parameters.length} requirements. No adders.</p>;
  }

  return (
    <div>
      <p className="py-2 text-xs text-muted tabular-nums">
        Technical {formatAdderEur(financials.total_tech_penalty)} · Commercial {formatAdderEur(financials.total_commercial_adder)} ·{' '}
        {meets} of {parameters.length} meet spec
      </p>
      <ul className="border-t border-rule">
        {lines.map(({ p, tag, adder, overridden, page }) => (
          <li key={p.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)_8rem_5rem_6.5rem_4rem] items-baseline gap-3 border-b border-rule py-2 text-xs last:border-b-0">
            <span className="text-[11px] text-faint">{CRIT[p.criticality] ?? p.criticality}</span>
            <span className="truncate text-ink-2" title={p.name}>{p.name}</span>
            <span className={tag.severity === 'open' ? 'text-open' : 'text-gap'}>
              {tag.word}
              {overridden && <span className="text-faint"> · edited</span>}
            </span>
            <span className="text-faint tabular-nums">{page ? `Spec p. ${page}` : ''}</span>
            <span
              className={`text-right tabular-nums ${tag.severity === 'open' ? 'text-open' : 'text-gap'}`}
              title={tag.severity === 'open' && adder ? 'Partly priced: the real amount is at least this' : undefined}
            >
              {adder && adder > 0 ? `${formatAdderEur(adder)}${tag.severity === 'open' ? '+' : ''}` : 'Unpriced'}
            </span>
            <button
              type="button"
              onClick={() => onInspect(financials.vendor_id, p.id)}
              className="justify-self-end text-xs font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
            >
              Inspect
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
