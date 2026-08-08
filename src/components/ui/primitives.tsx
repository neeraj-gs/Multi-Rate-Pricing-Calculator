'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn, money as formatMoney } from '@/lib/utils';

/* --- Surfaces ------------------------------------------------------------ */

export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-sheet border border-ink-700 bg-ink-850/80 backdrop-blur-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-display text-lg text-quill-100">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-quill-500">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* --- Status -------------------------------------------------------------- */

export function StatusBadge({ status }: { status: 'draft' | 'finalized' }) {
  const finalized = status === 'finalized';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.12em]',
        finalized
          ? 'border-verdigris-700 bg-verdigris-500/12 text-verdigris-300'
          : 'border-ink-600 bg-ink-800 text-quill-500',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          finalized ? 'bg-verdigris-400' : 'bg-quill-700',
        )}
      />
      {finalized ? 'Finalized' : 'Draft'}
    </span>
  );
}

/* --- Money --------------------------------------------------------------- */

/**
 * A monetary figure.
 *
 * Takes the server's formatted string, never a number. `emphasis="total"`
 * applies the double rule — the mark that says this figure is settled.
 */
export function Figure({
  value,
  currency,
  emphasis = 'normal',
  className,
}: {
  value: string;
  currency?: string;
  emphasis?: 'muted' | 'normal' | 'strong' | 'total';
  className?: string;
}) {
  const text = currency ? formatMoney(value, currency) : value;

  return (
    <span
      className={cn(
        'tabular whitespace-nowrap',
        emphasis === 'muted' && 'text-quill-500',
        emphasis === 'normal' && 'text-quill-100',
        emphasis === 'strong' && 'font-medium text-quill-100',
        emphasis === 'total' && 'double-rule font-semibold text-brass-400',
        className,
      )}
    >
      {text}
    </span>
  );
}

/* --- Empty state --------------------------------------------------------- */

/**
 * An empty screen is an invitation to act, so it always carries the action.
 *
 * `icon` is a rendered element, not a component type. This is a client
 * component, and the pages that show an empty state — the dashboard, the
 * activity log — are server components: a function cannot cross that boundary,
 * so passing `FileText` threw at render. Passing `<FileText />` is just an
 * element, which serialises fine.
 *
 * That failure only surfaced with zero rows, which is a brand-new account's
 * very first screen.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-5 flex size-12 items-center justify-center rounded-sheet border border-ink-700 bg-ink-800 [&_svg]:size-5 [&_svg]:text-brass-500">
        {icon}
      </div>
      <h3 className="font-display text-xl text-quill-100">{title}</h3>
      <p className="mt-2 max-w-sm text-pretty text-sm text-quill-500">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/* --- Loading ------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-sheet bg-ink-800 animate-shimmer',
        className,
      )}
    />
  );
}

/* --- Dialog -------------------------------------------------------------- */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2',
          'rounded-sheet border border-ink-600 bg-ink-850 shadow-sheet',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-4">
          <div>
            <DialogPrimitive.Title className="font-display text-lg text-quill-100">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-quill-500">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">
                {title}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="rounded-sheet p-1 text-quill-500 transition-colors hover:bg-ink-800 hover:text-quill-100"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
