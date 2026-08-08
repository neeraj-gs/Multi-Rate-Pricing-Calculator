'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';
import { Check, ChevronDown, Search } from 'lucide-react';

import { cn, currencyName, currencySymbol } from '@/lib/utils';
import { currencyExponent } from '@/lib/pricing';

/**
 * A searchable currency picker.
 *
 * ## Why not a `<select>`
 *
 * The options list of a native select is drawn by the operating system, not by
 * the page. It ignores the app's colours entirely — on Windows it paints a
 * white popup and then applies the page's light-on-dark option text to it,
 * producing pale grey codes on white that are effectively unreadable. There is
 * no CSS that fixes this; the element simply cannot be themed. The only way to
 * own the appearance is to own the list.
 *
 * Searching comes with that: eleven codes is already more than a person wants
 * to scan, and someone who thinks "rupee" should not have to know it files
 * under `INR`. The filter matches the code, the name and the symbol.
 *
 * ## Why the panel is in a portal
 *
 * The editor rail is a scroll container, and a dropdown positioned inside one
 * is clipped by it. Rendering to `document.body` at coordinates measured from
 * the trigger keeps the panel whole, and it flips above the field when there is
 * not enough room below.
 *
 * Each option carries its minor-unit precision, because in this app that is not
 * trivia: it decides how every amount on the document rounds. KWD's third
 * decimal and JPY's absence of one are the difference between a total that ties
 * out and one that does not.
 */
const PANEL_MIN_WIDTH = 320;

/**
 * How an entry is labelled.
 *
 * Overridable because the app-wide switcher carries one entry that is not a
 * currency at all — "each in its own currency" — and it belongs in the same
 * list as the currencies rather than in a checkbox beside it: they are one
 * choice, not two.
 */
export type CurrencyOptionLabel = { code: string; name: string; meta?: string };

function defaultLabel(code: string): CurrencyOptionLabel {
  return { code, name: currencyName(code), meta: precisionLabel(code) };
}

export function CurrencySelect({
  value,
  onChange,
  options,
  disabled,
  id,
  invalid,
  renderValue,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  renderValue?: (code: string) => CurrencyOptionLabel;
}) {
  const label = React.useCallback(
    (code: string) => renderValue?.(code) ?? defaultLabel(code),
    [renderValue],
  );
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  // Measured on open and kept current while open: any scroll or resize moves
  // the trigger, and a panel left at stale coordinates detaches from its field.
  React.useLayoutEffect(() => {
    if (!open) return;

    const measure = () => setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    measure();

    // Capture phase, so scrolling of *any* ancestor is caught, not just window.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  function close({ refocus = true } = {}) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  function choose(code: string) {
    onChange(code);
    close();
  }

  const belowSpace = rect ? window.innerHeight - rect.bottom : 0;
  const dropUp = rect !== null && belowSpace < 280 && rect.top > belowSpace;

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-sheet border bg-ink-900 px-2.5 text-left text-sm text-quill-100 transition-colors',
          'hover:border-ink-500 focus:border-brass-600 focus:bg-ink-800 focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalid ? 'border-oxblood-500' : 'border-ink-600',
        )}
      >
        <span className="font-mono text-xs text-brass-400">{label(value).code}</span>
        <span className="min-w-0 flex-1 truncate text-quill-500">
          {label(value).name}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-quill-700 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && rect
        ? createPortal(
            <>
              {/* Catches the click that dismisses, without stealing focus. */}
              <div
                className="fixed inset-0 z-40"
                onMouseDown={() => close({ refocus: false })}
              />

              <Command
                loop
                className="fixed z-50 overflow-hidden rounded-sheet border border-ink-600 bg-ink-850 shadow-sheet"
                // Wider than the field when the field is narrow: the rail is
                // 26rem and the trigger inside it cannot hold a code, a name
                // and a precision without truncating the name to "UAE d…".
                style={{
                  left: Math.min(rect.left, window.innerWidth - PANEL_MIN_WIDTH - 12),
                  width: Math.max(rect.width, PANEL_MIN_WIDTH),
                  ...(dropUp
                    ? { bottom: window.innerHeight - rect.top + 6 }
                    : { top: rect.bottom + 6 }),
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    close();
                  }
                }}
              >
                <div className="flex items-center gap-2 border-b border-ink-700 px-3">
                  <Search className="size-3.5 shrink-0 text-quill-700" />
                  <Command.Input
                    autoFocus
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Search currency…"
                    className="w-full bg-transparent py-2.5 text-sm text-quill-100 outline-none placeholder:text-quill-700"
                  />
                </div>

                <Command.List className="max-h-64 overflow-y-auto p-1.5">
                  <Command.Empty className="px-3 py-6 text-center text-sm text-quill-500">
                    No currency matches “{query}”.
                  </Command.Empty>

                  {options.map((code) => {
                    const entry = label(code);
                    return (
                      <Command.Item
                        key={code}
                        value={`${code} ${entry.code} ${entry.name} ${currencySymbol(code)}`}
                        onSelect={() => choose(code)}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-sheet px-2.5 py-2 text-sm text-quill-300',
                          'data-[selected=true]:bg-ink-800 data-[selected=true]:text-quill-100',
                        )}
                      >
                        <Check
                          className={cn(
                            'size-3.5 shrink-0',
                            code === value ? 'text-brass-400' : 'invisible',
                          )}
                        />
                        <span className="w-12 shrink-0 font-mono text-xs text-brass-400">
                          {entry.code}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                        {entry.meta ? (
                          <span className="shrink-0 font-mono text-[0.625rem] text-quill-700">
                            {entry.meta}
                          </span>
                        ) : null}
                      </Command.Item>
                    );
                  })}
                </Command.List>
              </Command>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/** How many decimals this currency's minor unit gives an amount. */
function precisionLabel(code: string): string {
  try {
    const exponent = currencyExponent(code);
    if (exponent === 0) return 'no decimals';
    return `${exponent} decimals`;
  } catch {
    return '';
  }
}
