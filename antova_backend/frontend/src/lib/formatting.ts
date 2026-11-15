import { ComplianceStatus, Criticality, PricingStatus } from './types';

export function formatEur(val: number | string | null | undefined, includeCents: boolean = false): string {
  if (val === null || val === undefined) return '—';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: includeCents ? 2 : 0,
    maximumFractionDigits: includeCents ? 2 : 0,
  }).format(num);
}

export function formatDelta(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return '—';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  if (num === 0) return '€0';
  const prefix = num > 0 ? '+' : '';
  return prefix + formatEur(num);
}

export function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
}

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  } catch {
    return iso;
  }
}

export function getStatusStyle(status: ComplianceStatus) {
  switch (status) {
    case 'COMPLIANT':
    case 'DEVIATION_UPGRADE':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-emerald-700 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-500/30',
        label: status === 'DEVIATION_UPGRADE' ? 'Exceeds spec' : 'Meets spec',
      };
    case 'DEVIATION_DOWNGRADE':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-500/30',
        label: 'Gap',
      };
    case 'OMITTED':
      return {
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        text: 'text-rose-700 dark:text-rose-400',
        border: 'border-rose-200 dark:border-rose-500/30',
        label: 'Missing',
      };
    case 'CONFLICT_DOWNGRADE':
      return {
        bg: 'bg-purple-50 dark:bg-purple-950/40',
        text: 'text-purple-700 dark:text-purple-400',
        border: 'border-purple-200 dark:border-purple-500/30',
        label: 'Documents disagree',
      };
    case 'MANUAL_INSPECTION_REQUIRED':
    default:
      return {
        bg: 'bg-zinc-100 dark:bg-zinc-900',
        text: 'text-zinc-700 dark:text-zinc-300',
        border: 'border-zinc-300 dark:border-zinc-700',
        label: 'Needs inspection',
      };
  }
}

export function getCriticalityStyle(crit: Criticality) {
  switch (crit) {
    case 'MANDATORY':
      return {
        badge: 'border-red-200 dark:border-red-500/40 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
        dot: 'bg-red-500',
        label: 'Mandatory',
      };
    case 'HIGH':
      return {
        badge: 'border-amber-200 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
        dot: 'bg-amber-500',
        label: 'High',
      };
    case 'MEDIUM':
      return {
        badge: 'border-blue-200 dark:border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30',
        dot: 'bg-blue-500',
        label: 'Medium',
      };
    case 'COMMERCIAL':
    default:
      return {
        badge: 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900',
        dot: 'bg-zinc-400',
        label: 'Commercial',
      };
  }
}
