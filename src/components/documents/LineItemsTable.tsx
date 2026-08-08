'use client';

import * as React from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

import { cn, currencySymbol } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { DraftLine, PreviewResponse } from '@/lib/documents/types';

/**
 * The editable line-item grid — the surface people actually spend their time in.
 *
 * It sits on parchment, because it is the document. Every computed column is
 * read-only and comes from the server preview; nothing in this file adds two
 * numbers together.
 */

export function LineItemsTable({
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
    <div className="sheet overflow-hidden">
      <div className="flex items-center justify-between border-b border-parchment-300 px-5 py-3.5">
        <h2 className="font-display text-lg text-ink-900">Line items</h2>
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-500">
          {lines.length} {lines.length === 1 ? 'line' : 'lines'} · {currency}
        </p>
      </div>

      {/*
        The column budget is deliberately tight. At 1440px the editor's left
        column is about 47rem wide, so a wider table silently clips its last
        columns — and the one it clips first is the line total, which is the
        column people came to read. Anything narrower than this scrolls
        horizontally inside its own container rather than pushing the page.
      */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-parchment-300 text-left font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-500">
              <th className="w-7 px-1 py-2.5" aria-label="Reorder" />
              <th className="px-2 py-2.5 font-medium">Description</th>
              <th className="w-14 px-1 py-2.5 text-right font-medium">Qty</th>
              <th className="w-24 px-1 py-2.5 text-right font-medium">Unit price</th>
              <th className="w-32 px-1 py-2.5 text-right font-medium">Discount</th>
              <th className="w-20 px-1 py-2.5 text-right font-medium">Tax %</th>
              <th className="w-28 px-2 py-2.5 text-right font-medium">Line total</th>
              <th className="w-9 px-1 py-2.5" aria-label="Remove" />
            </tr>
          </thead>

          <tbody>
            {lines.map((line, index) => {
              const computed = preview?.lines?.[index];
              const errorFor = (field: string) =>
                fieldErrors[`lines.${index}.${field}`];

              return (
                <tr
                  key={line.key}
                  draggable={!readOnly}
                  onDragStart={() => setDragging(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragging !== null && dragging !== index) {
                      onReorder(dragging, index);
                    }
                    setDragging(null);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={cn(
                    'border-b border-parchment-300/60 align-top transition-colors',
                    dragging === index && 'opacity-40',
                  )}
                >
                  <td className="px-1 py-2 text-center">
                    {readOnly ? (
                      <span className="font-mono text-xs text-ink-500">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    ) : (
                      <GripVertical className="mx-auto size-4 cursor-grab text-parchment-400" />
                    )}
                  </td>

                  <td className="px-1 py-2">
                    <CellInput
                      value={line.description}
                      onChange={(value) => onChange(line.key, { description: value })}
                      placeholder="What are you charging for?"
                      readOnly={readOnly}
                      error={errorFor('description')}
                    />
                  </td>

                  <td className="px-1 py-2">
                    <CellInput
                      value={line.quantity}
                      onChange={(value) => onChange(line.key, { quantity: value })}
                      numeric
                      placeholder="1"
                      readOnly={readOnly}
                      error={errorFor('quantity')}
                    />
                  </td>

                  {/*
                    No currency prefix here. A three-letter code like AED eats
                    a third of the column and pushes the price out of view, and
                    the currency is already stated once in the panel header —
                    repeating it on every row costs space and says nothing new.
                  */}
                  <td className="px-1 py-2">
                    <CellInput
                      value={line.unitPrice}
                      onChange={(value) => onChange(line.key, { unitPrice: value })}
                      numeric
                      placeholder="0.00"
                      readOnly={readOnly}
                      error={errorFor('unitPrice')}
                    />
                  </td>

                  {/*
                    Percent or fixed — never both. The control is a single
                    selector rather than two inputs, so the rule is enforced by
                    what the UI can express, matching the API's tagged union.
                  */}
                  <td className="px-1 py-2">
                    {readOnly ? (
                      // A finalized document is a record, not a form. Rendering
                      // disabled dropdowns would dress a permanent figure up as
                      // something that might still be changed.
                      <p className="tabular text-right text-sm text-ink-800">
                        {line.discountType === 'none'
                          ? '—'
                          : line.discountType === 'percent'
                            ? `${line.discountValue}%`
                            : `${symbol} ${line.discountValue}`}
                      </p>
                    ) : (
                      <div className="flex gap-1.5">
                        <select
                          value={line.discountType}
                          onChange={(event) =>
                            onChange(line.key, {
                              discountType: event.target
                                .value as DraftLine['discountType'],
                              ...(event.target.value === 'none'
                                ? { discountValue: '' }
                                : {}),
                            })
                          }
                          aria-label="Discount type"
                          className="h-8 shrink-0 rounded-[2px] border border-parchment-300 bg-parchment-50 px-1.5 font-mono text-xs text-ink-700"
                        >
                          <option value="none">—</option>
                          <option value="percent">%</option>
                          <option value="fixed">{symbol}</option>
                        </select>
                        <CellInput
                          value={line.discountValue}
                          onChange={(value) =>
                            onChange(line.key, { discountValue: value })
                          }
                          numeric
                          placeholder={line.discountType === 'percent' ? '10' : '0.00'}
                          disabled={line.discountType === 'none'}
                          error={errorFor('discount.value')}
                        />
                      </div>
                    )}
                    {computed && line.discountType !== 'none' ? (
                      <p className="tabular mt-1 text-right text-[0.6875rem] text-ink-500">
                        −{computed.discountAmount}
                      </p>
                    ) : null}
                  </td>

                  <td className="px-1 py-2">
                    {readOnly ? (
                      <p className="tabular text-right text-sm text-ink-800">
                        {line.taxPercent.trim() === '' ? '—' : `${line.taxPercent}%`}
                      </p>
                    ) : (
                      <CellInput
                        value={line.taxPercent}
                        onChange={(value) => onChange(line.key, { taxPercent: value })}
                        numeric
                        suffix="%"
                        placeholder="0"
                        error={errorFor('taxPercent')}
                      />
                    )}
                    {computed && line.taxPercent.trim() !== '' ? (
                      <p className="tabular mt-1 text-right text-[0.6875rem] text-ink-500">
                        +{computed.taxAmount}
                      </p>
                    ) : null}
                  </td>

                  <td className="px-2 py-2 text-right">
                    <span className="tabular text-sm font-medium text-ink-900">
                      {computed ? computed.total : '—'}
                    </span>
                    {computed ? (
                      <p className="tabular mt-1 text-[0.6875rem] text-ink-500">
                        {computed.subtotal} sub
                      </p>
                    ) : null}
                  </td>

                  <td className="px-1 py-2 text-center">
                    {readOnly ? null : (
                      <button
                        type="button"
                        onClick={() => onRemove(line.key)}
                        aria-label={`Remove ${line.description || `line ${index + 1}`}`}
                        className="rounded-[2px] p-1.5 text-parchment-400 transition-colors hover:bg-oxblood-500/10 hover:text-oxblood-500"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}

            {lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center">
                  <p className="text-sm text-ink-500">
                    No lines yet. Add the first thing you are charging for.
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {readOnly ? null : (
        <div className="border-t border-parchment-300 px-5 py-3">
          <Button variant="sheet" size="sm" onClick={onAdd}>
            <Plus className="size-4" />
            Add line
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * A cell input styled for parchment.
 *
 * Borderless until focused, so a table of twenty lines reads as a document
 * rather than as twenty boxes — but it is a real input with a real focus ring,
 * not a div pretending to be one.
 */
function CellInput({
  value,
  onChange,
  placeholder,
  numeric,
  prefix,
  suffix,
  disabled,
  readOnly,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  numeric?: boolean;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string;
}) {
  return (
    <div className="relative">
      <div
        className={cn(
          'flex items-center gap-1 rounded-[2px] border px-2 transition-colors',
          error
            ? 'border-oxblood-500 bg-oxblood-500/5'
            : 'border-transparent hover:border-parchment-300 focus-within:border-ink-500 focus-within:bg-white',
          disabled && 'opacity-40',
        )}
      >
        {prefix ? (
          <span className="shrink-0 font-mono text-[0.6875rem] text-ink-500">
            {prefix}
          </span>
        ) : null}
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
          className={cn(
            'h-8 w-full min-w-0 bg-transparent text-sm text-ink-900 outline-none',
            'placeholder:text-parchment-400 read-only:cursor-default',
            numeric && 'tabular text-right',
          )}
        />
        {suffix ? (
          <span className="shrink-0 font-mono text-[0.6875rem] text-ink-500">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-[0.6875rem] leading-tight text-oxblood-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
