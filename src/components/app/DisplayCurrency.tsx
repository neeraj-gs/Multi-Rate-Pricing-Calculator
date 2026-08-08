'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import {
  DISPLAY_CURRENCY_COOKIE,
  NATIVE,
  isNative,
  normalizeDisplayCurrency,
} from '@/lib/display-currency';
import { SUPPORTED_CURRENCIES, RATES_AS_OF } from '@/lib/pricing';
import { cn, currencyName } from '@/lib/utils';
import { CurrencySelect } from '@/components/ui/currency-select';

/**
 * The app-wide display currency.
 *
 * Held in a cookie rather than in React state alone, because half the screens
 * that show money are server components: the dashboard reads its figures during
 * render, and only a value the server can see will change them. Writing the
 * cookie and calling `router.refresh()` re-renders those on the server with the
 * new currency, while the context keeps client components (the report) in step
 * without a round trip.
 *
 * Deliberately not stored on the user record. This is a way of *looking* at the
 * data, closer to a sort order than to a preference — cheap to change, cheap to
 * change back, and it should not cost a database write every time someone
 * checks a number in dollars.
 */

const DisplayCurrencyContext = React.createContext<{
  value: string;
  setValue: (next: string) => void;
}>({ value: NATIVE, setValue: () => {} });

export function useDisplayCurrency() {
  return React.useContext(DisplayCurrencyContext);
}

export function DisplayCurrencyProvider({
  initial,
  children,
}: {
  initial: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [value, setLocal] = React.useState(() => normalizeDisplayCurrency(initial));

  const setValue = React.useCallback(
    (next: string) => {
      const normalized = normalizeDisplayCurrency(next);
      setLocal(normalized);
      // A year, path-wide, lax: it needs to survive a reload and be readable on
      // ordinary navigations, and it carries no authority — the worst a forged
      // one can do is show you your own numbers in the wrong currency.
      document.cookie = `${DISPLAY_CURRENCY_COOKIE}=${normalized}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    },
    [router],
  );

  const context = React.useMemo(() => ({ value, setValue }), [value, setValue]);

  return (
    <DisplayCurrencyContext.Provider value={context}>
      {children}
    </DisplayCurrencyContext.Provider>
  );
}

/**
 * The control itself.
 *
 * "Each in its own currency" leads the list, because it is the only option with
 * no exchange rate inside it: those figures are the documents themselves, not a
 * conversion of them. Everything below it is a lens, and the note underneath
 * says so rather than leaving the reader to assume the totals were always
 * directly comparable.
 */
export function DisplayCurrencySwitcher({ className }: { className?: string }) {
  const { value, setValue } = useDisplayCurrency();
  const native = isNative(value);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-quill-700">
          Show amounts in
        </span>
        {!native ? (
          <span className="font-mono text-[0.5625rem] text-quill-700">
            rates {RATES_AS_OF}
          </span>
        ) : null}
      </div>

      <CurrencySelect
        value={value}
        onChange={setValue}
        options={[NATIVE, ...SUPPORTED_CURRENCIES]}
        renderValue={(code) =>
          isNative(code)
            ? { code: 'MIXED', name: 'Each in its own currency' }
            : { code, name: currencyName(code) }
        }
      />
    </div>
  );
}
