'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Form controls.
 *
 * Two rules run through all of them:
 *
 *   - An error message is bound to its input with `aria-describedby` and
 *     `aria-invalid`, so a screen reader announces *why* a field is wrong
 *     rather than just that it is.
 *   - Anything numeric gets `inputMode="decimal"`, which is what raises the
 *     numeric keypad on a phone, and the mono/tabular treatment, so figures in
 *     a column align on the decimal point.
 */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full rounded-sheet border bg-ink-850 px-3 text-sm text-quill-100 transition-colors',
        'placeholder:text-quill-700',
        'focus:border-brass-600 focus:bg-ink-800',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-oxblood-500' : 'border-ink-600 hover:border-ink-500',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

/** A numeric input. Decimal keypad on mobile, tabular figures everywhere. */
export const NumberInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      className={cn('tabular text-right', className)}
      {...props}
    />
  ),
);
NumberInput.displayName = 'NumberInput';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      'w-full rounded-sheet border bg-ink-850 px-3 py-2 text-sm text-quill-100 transition-colors',
      'placeholder:text-quill-700 focus:border-brass-600 focus:bg-ink-800',
      invalid ? 'border-oxblood-500' : 'border-ink-600 hover:border-ink-500',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-10 w-full appearance-none rounded-sheet border border-ink-600 bg-ink-850 px-3 pr-8 text-sm text-quill-100',
      'transition-colors hover:border-ink-500 focus:border-brass-600',
      "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23868da0%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:16px] bg-[position:right_0.6rem_center] bg-no-repeat",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export function Label({
  className,
  children,
  hint,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label
      className={cn(
        'flex items-baseline justify-between gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-quill-500',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {hint ? <span className="normal-case tracking-normal text-quill-700">{hint}</span> : null}
    </label>
  );
}

/** A labelled control with its error message wired up for assistive tech. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  const errorId = `${htmlFor}-error`;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: htmlFor,
            invalid: Boolean(error),
            'aria-describedby': error ? errorId : undefined,
          })
        : children}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-oxblood-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
