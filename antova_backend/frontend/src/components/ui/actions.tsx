'use client';

import React, { useEffect, useRef } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

type Tone = 'default' | 'destructive' | 'primary';
type Size = 'xs' | 'sm' | 'md';

const TONE: Record<Tone, string> = {
  default: 'border border-rule-strong text-ink hover:bg-sheet',
  primary: 'bg-ink text-paper hover:opacity-90',
  destructive: 'border border-rule-strong text-ink-2 hover:border-red-300 hover:bg-red-50 hover:text-red-600',
};
const SIZE: Record<Size, string> = {
  xs: 'h-6 gap-1 px-2 text-[11px]',
  sm: 'h-7 gap-1.5 px-2.5 text-xs',
  md: 'h-8 gap-1.5 px-3 text-xs',
};
const ICON: Record<Size, string> = { xs: 'h-3 w-3', sm: 'h-3.5 w-3.5', md: 'h-3.5 w-3.5' };

interface ActionButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon?: LucideIcon;
  label: string;
  /** Show only the icon; the label becomes the tooltip and the accessible name. */
  iconOnly?: boolean;
  tone?: Tone;
  size?: Size;
  busy?: boolean;
}

/** One button for every CRUD action: icon + short label, or icon-only with a tooltip. */
export function ActionButton({ icon: Icon, label, iconOnly, tone = 'default', size = 'sm', busy, disabled, className, title, ...rest }: ActionButtonProps) {
  const isDisabled = disabled || busy;
  return (
    <button
      type="button"
      aria-label={iconOnly ? label : undefined}
      title={title ?? (iconOnly ? label : undefined)}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-paper',
        'disabled:cursor-not-allowed disabled:opacity-40',
        iconOnly && tone !== 'primary' ? 'h-6 w-6 rounded text-faint hover:bg-sheet hover:text-ink' : cn(TONE[tone], SIZE[size]),
        iconOnly && tone === 'destructive' && 'hover:bg-red-50 hover:text-red-600',
        className
      )}
      {...rest}
    >
      {busy ? <Loader2 className={cn(ICON[size], 'animate-spin')} aria-hidden="true" /> : Icon && <Icon className={ICON[size]} aria-hidden="true" />}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A small confirm step before a permanent delete. Esc or the backdrop cancels; focus starts on Cancel. */
export function ConfirmDialog({ open, title, body, confirmLabel, busy, error, onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4" onMouseDown={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded border border-rule-strong bg-paper p-5 text-ink shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-sm font-semibold">{title}</h2>
        <div className="mt-2 text-xs leading-5 text-ink-2">{body}</div>
        {error && <p className="mt-3 text-xs text-gap" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-7 rounded px-3 text-xs text-ink-2 hover:bg-sheet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1.5 rounded bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
