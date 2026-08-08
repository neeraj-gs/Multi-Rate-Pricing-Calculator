'use client';

import * as React from 'react';

import { api, ApiClientError } from '@/lib/api-client';
import type { DraftLine, PreviewResponse } from '@/lib/documents/types';

/**
 * Live totals, computed by the server.
 *
 * The brief requires the server to be the source of truth for every figure.
 * The obvious way to honour that is to only show totals after a save, which
 * makes the editor feel dead. The obvious way to make it feel alive is to add
 * up the lines in JavaScript, which breaks the requirement — and, worse, gives
 * the user a number that quietly disagrees with what gets stored.
 *
 * This takes the third path: a debounced call to a stateless `/pricing/preview`
 * endpoint that runs the *same* `calculateDocument` the write path runs. The
 * client never does arithmetic; it just asks faster.
 *
 * `latencyMs` is surfaced in the UI on purpose. It is the visible evidence that
 * these numbers came from the server, and it is the first thing you would want
 * if the editor ever started feeling sluggish.
 */
export interface PreviewState {
  preview: PreviewResponse | null;
  pending: boolean;
  error: ApiClientError | null;
  latencyMs: number | null;
  /** Field path -> message, e.g. `lines.2.discount.value`. */
  fieldErrors: Record<string, string>;
}

export function toLineInput(line: DraftLine) {
  return {
    description: line.description.trim() || 'Untitled line',
    quantity: line.quantity.trim() === '' ? '0' : line.quantity.trim(),
    unitPrice: line.unitPrice.trim() === '' ? '0' : line.unitPrice.trim(),
    discount:
      line.discountType === 'none' || line.discountValue.trim() === ''
        ? null
        : { type: line.discountType, value: line.discountValue.trim() },
    taxPercent: line.taxPercent.trim() === '' ? null : line.taxPercent.trim(),
  };
}

export function usePricingPreview(
  lines: DraftLine[],
  currency: string,
  debounceMs = 220,
): PreviewState {
  const [state, setState] = React.useState<PreviewState>({
    preview: null,
    pending: false,
    error: null,
    latencyMs: null,
    fieldErrors: {},
  });

  // Serialising the payload gives a cheap, stable dependency: React re-runs the
  // effect only when a value that actually affects the price changes, not on
  // every render that happens to produce a new array identity.
  const payload = React.useMemo(
    () => JSON.stringify({ currency, lines: lines.map(toLineInput) }),
    [lines, currency],
  );

  React.useEffect(() => {
    const parsed = JSON.parse(payload) as { currency: string; lines: unknown[] };
    if (parsed.lines.length === 0) {
      setState({
        preview: null,
        pending: false,
        error: null,
        latencyMs: null,
        fieldErrors: {},
      });
      return;
    }

    setState((previous) => ({ ...previous, pending: true }));

    // An in-flight request whose input is already stale must not be allowed to
    // land — otherwise fast typing can leave older totals on screen.
    let cancelled = false;
    const timer = setTimeout(async () => {
      const startedAt = performance.now();
      try {
        const result = await api.post<PreviewResponse>('/pricing/preview', parsed);
        if (cancelled) return;
        setState({
          preview: result,
          pending: false,
          error: null,
          latencyMs: Math.round(performance.now() - startedAt),
          fieldErrors: {},
        });
      } catch (error) {
        if (cancelled) return;
        const apiError = error instanceof ApiClientError ? error : null;
        const fieldErrors: Record<string, string> = {};
        for (const detail of apiError?.details ?? []) {
          if (detail.path) fieldErrors[detail.path] = detail.message;
        }
        setState((previous) => ({
          // Keep the last good totals on screen. Blanking them mid-edit makes a
          // single mistyped character feel like data loss.
          preview: previous.preview,
          pending: false,
          error: apiError,
          latencyMs: Math.round(performance.now() - startedAt),
          fieldErrors,
        }));
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [payload, debounceMs]);

  return state;
}
