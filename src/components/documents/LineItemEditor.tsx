'use client';

import * as React from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

import { cn, currencySymbol } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { DraftLine, PreviewResponse } from '@/lib/documents/types';

/**
 * Line items, as cards rather than as a table.
 *
 * The editor lives in a narrow rail beside the document preview, and a
 * six-column table in that width is cramped enough to read as a checklist —
 * which is exactly the complaint. A card gives each line a description on its
 * own row, its inputs on a second, and its computed total set large on the
 * right, so a line looks like a priced item rather than a row to tick off.
 *
 * The table view still exists — on the document itself, where it belongs.
 *
 * Every computed figure here comes from the server preview. Nothing in this
 * file adds two numbers together.
 */
export function LineItemEditor({
  lines,
  currency,
  preview,
  fieldErrors,
  onChange,
  onAdd,
  onRemove,
  onReorder,
  readOnly,
}: {
  lines: DraftLine[];
  currency: string;
  preview: PreviewResponse | null;
  fieldErrors: Record<string, string>;
  onChange: (key: string, patch: Partial<DraftLine>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onReorder: (from: number, to: number) => void;
  readOnly: boolean;
}) {
  const [dragging, setDragging] = React.useState<number | null>(null);
  const symbol = currencySymbol(currency);

  return (
    <section className="rounded-sheet border border-ink-700 bg-ink-850">
      <header className="flex items-center justify-between border-b border-ink-700 px-5 py-3.5">
        <h2 className="font-display text-base text-quill-100">Line items</h2>
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-quill-700">
          {lines.length} {lines.length === 1 ? 'line' : 'lines'} · {currency}
        </span>
      </header>

      <div className="space-y-2.5 p-4">
        {lines.map((line, index) => {
          const computed = preview?.lines?.[index];
          const errorFor = (field: string) => fieldErrors[`lines.${index}.${field}`];

          return (
            <article
              key={line.key}
              draggable={!readOnly}
              onDragStart={() => setDragging(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragging !== null && dragging !== index) onReorder(dragging, index);
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
              className={cn(
                'rounded-sheet border border-ink-700 bg-ink-900 transition-colors',
                'focus-within:border-ink-500 hover:border-ink-600',
                dragging === index && 'opacity-40',
              )}
            >
              {/* Row one: the description, and what the line comes to. */}
              <div className="flex items-start gap-2 border-b border-ink-800 px-3 py-2.5">
                {readOnly ? (
                  <span className="mt-2 w-6 shrink-0 font-mono text-[0.625rem] text-quill-700">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="mt-2 w-6 shrink-0 cursor-grab text-quill-700"
                    title="Drag to reorder"
                  >
                    <GripVertical className="size-4" />
                  </span>
                )}

                <Field
                  value={line.description}
                  onChange={(value) => onChange(line.key, { description: value })}
                  placeholder="What are you charging for?"
                  readOnly={readOnly}
                  error={errorFor('description')}
                  className="min-w-0 flex-1 text-sm"
                  aria-label={`Line ${index + 1} description`}
                />

                <span className="tabular mt-1 shrink-0 whitespace-nowrap text-right text-sm font-semibold text-quill-100">
                  {computed ? computed.total : '—'}
                </span>

                {readOnly ? null : (
                  <button
                    type="button"
                    onClick={() => onRemove(line.key)}
                    aria-label={`Remove ${line.description || `line ${index + 1}`}`}
                    className="mt-0.5 shrink-0 rounded-sheet p-1.5 text-quill-700 transition-colors hover:bg-oxblood-500/12 hover:text-oxblood-300"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>

              {/*
                Row two: the inputs that price it.

                Two columns, never four. The rail is ~26rem, so a four-column
                split leaves each cell about 90px — and the discount cell has
                to hold a type selector *and* a value, which simply does not
                fit. It collapsed into overlapping labels.
              */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-3 py-3">
                <Cell label="Quantity">
                  <Field
                    value={line.quantity}
                    onChange={(value) => onChange(line.key, { quantity: value })}
                    numeric
                    placeholder="1"
                    readOnly={readOnly}
                    error={errorFor('quantity')}
                    aria-label={`Line ${index + 1} quantity`}
                  />
                </Cell>

                <Cell label={`Unit price · ${symbol}`}>
                  <Field
                    value={line.unitPrice}
                    onChange={(value) => onChange(line.key, { unitPrice: value })}
                    numeric
                    placeholder="0.00"
                    readOnly={readOnly}
                    error={errorFor('unitPrice')}
                    aria-label={`Line ${index + 1} unit price`}
                  />
                </Cell>

                {/*
                  Percent or fixed — never both. One selector rather than two
                  inputs, so the rule is enforced by what the control can
                  express, matching the API's tagged union.
                */}
                <Cell
                  label="Discount"
                  hint={computed && line.discountType !== 'none' ? `−${computed.discountAmount}` : undefined}
                >
                  <div className="flex gap-1.5">
                    {readOnly ? (
                      <p className="tabular flex-1 py-1.5 text-right text-sm text-quill-300">
                        {line.discountType === 'none'
                          ? '—'
                          : line.discountType === 'percent'
                            ? `${line.discountValue}%`
                            : `${symbol} ${line.discountValue}`}
                      </p>
                    ) : (
                      <>
                        <select
                          value={line.discountType}
                          onChange={(event) =>
                            onChange(line.key, {
                              discountType: event.target.value as DraftLine['discountType'],
                              ...(event.target.value === 'none' ? { discountValue: '' } : {}),
                            })
                          }
                          aria-label={`Line ${index + 1} discount type`}
                          className="h-8 shrink-0 rounded-sheet border border-ink-600 bg-ink-850 px-1.5 font-mono text-xs text-quill-300"
                        >
                          <option value="none">—</option>
                          <option value="percent">%</option>
                          <option value="fixed">{symbol}</option>
                        </select>
                        <Field
                          value={line.discountValue}
                          onChange={(value) => onChange(line.key, { discountValue: value })}
                          numeric
                          placeholder={line.discountType === 'percent' ? '10' : '0.00'}
                          disabled={line.discountType === 'none'}
                          error={errorFor('discount.value')}
                          aria-label={`Line ${index + 1} discount value`}
                        />
                      </>
                    )}
                  </div>
                </Cell>

                <Cell
                  label="Tax %"
                  hint={
                    computed && line.taxPercent.trim() !== ''
                      ? `+${computed.taxAmount}`
                      : undefined
                  }
                >
                  {readOnly ? (
                    <p className="tabular py-1.5 text-right text-sm text-quill-300">
                      {line.taxPercent.trim() === '' ? '—' : `${line.taxPercent}%`}
                    </p>
                  ) : (
                    <Field
                      value={line.taxPercent}
                      onChange={(value) => onChange(line.key, { taxPercent: value })}
                      numeric
                      placeholder="0"
                      error={errorFor('taxPercent')}
                      aria-label={`Line ${index + 1} tax percent`}
                    />
                  )}
                </Cell>
              </div>
            </article>
          );
        })}

        {lines.length === 0 ? (
          <div className="rounded-sheet border border-dashed border-ink-700 px-5 py-10 text-center">
            <p className="text-sm text-quill-500">No lines yet.</p>
            <p className="mt-1 text-xs text-quill-700">
              Add the first thing you are charging for — it appears on the document
              as you type.
            </p>
          </div>
        ) : null}

        {readOnly ? null : (
          <Button variant="secondary" size="sm" onClick={onAdd} className="w-full">
            <Plus className="size-4" />
            Add line
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * A labelled control, with the computed effect of that control printed
 * underneath it rather than beside the label — where, at this width, the two
 * collided.
 */
function Cell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block truncate font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-quill-700">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="tabular mt-1 block text-right text-[0.625rem] text-verdigris-400">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  numeric,
  disabled,
  readOnly,
  error,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  numeric?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div className="min-w-0">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        inputMode={numeric ? 'decimal' : undefined}
        autoComplete="off"
        spellCheck={!numeric}
        aria-invalid={Boolean(error)}
        aria-label={ariaLabel}
        className={cn(
          'h-8 w-full min-w-0 rounded-sheet border bg-ink-850 px-2 text-[0.8125rem] text-quill-100 transition-colors',
          'placeholder:text-quill-700 focus:border-brass-600 focus:bg-ink-800',
          'read-only:border-transparent read-only:bg-transparent read-only:px-0',
          'disabled:cursor-not-allowed disabled:opacity-40',
          numeric && 'tabular text-right',
          error ? 'border-oxblood-500' : 'border-ink-600',
          className,
        )}
      />
      {error ? (
        <p role="alert" className="mt-1 text-[0.625rem] leading-tight text-oxblood-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
