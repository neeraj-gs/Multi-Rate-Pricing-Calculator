import { calculateLine } from '@/lib/pricing';

/**
 * How one line is priced, shown as the actual pipeline with real values
 * flowing through it.
 *
 * This replaced a 2×2 grid of icon cards. The cards restated four claims in
 * prose; this shows the mechanism those claims are about — where the discount
 * is subtracted, which number the tax percentage is applied to, and what each
 * step rounds. The figures are computed here by the production engine, so the
 * diagram cannot drift from the code it describes.
 */

const STEPS = [
  { key: 'subtotal', label: 'Subtotal', formula: 'qty × unit price' },
  { key: 'discount', label: 'Less discount', formula: '10% of subtotal' },
  { key: 'discounted', label: 'Discounted', formula: 'what tax applies to' },
  { key: 'tax', label: 'Plus tax', formula: '5% of discounted' },
  { key: 'total', label: 'Line total', formula: 'discounted + tax' },
] as const;

export function Pipeline() {
  const line = calculateLine(
    {
      description: 'Widget A',
      quantity: 2,
      unitPrice: '100.00',
      discount: { type: 'percent', value: 10 },
      taxPercent: 5,
    },
    'USD',
  );

  const values: Record<(typeof STEPS)[number]['key'], string> = {
    subtotal: line.subtotal,
    discount: `−${line.discountAmount}`,
    discounted: line.discountedAmount,
    tax: `+${line.taxAmount}`,
    total: line.total,
  };

  return (
    <div>
      <ol className="grid gap-px overflow-hidden rounded-sheet border border-ink-700 bg-ink-700 sm:grid-cols-5">
        {STEPS.map((step, index) => {
          const isTotal = step.key === 'total';
          const isTaxBase = step.key === 'discounted';
          return (
            <li
              key={step.key}
              className={`relative bg-ink-900 px-5 py-6 ${isTotal ? 'sm:bg-brass-500/[0.06]' : ''}`}
            >
              {/* `block`, because the total below is `inline-block` to size its
                  double rule — without it the index sits on the same line and
                  the two run together. */}
              <span className="block font-mono text-[0.625rem] tracking-[0.16em] text-quill-700">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p
                className={`tabular mt-3 text-xl ${
                  isTotal
                    ? 'double-rule inline-block font-semibold text-brass-400'
                    : step.key === 'discount'
                      ? 'text-verdigris-300'
                      : isTaxBase
                        ? 'text-steel-300'
                        : 'text-quill-100'
                }`}
              >
                {values[step.key]}
              </p>
              <p className="mt-3 text-sm text-quill-300">{step.label}</p>
              <p className="mt-1 font-mono text-[0.6875rem] leading-snug text-quill-700">
                {step.formula}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 max-w-3xl text-pretty text-sm leading-relaxed text-quill-500">
        The step that matters is the third. Tax is charged on{' '}
        <span className="tabular text-steel-300">180.00</span>, the discounted
        amount — not on the gross{' '}
        <span className="tabular text-quill-300">200.00</span>. Applying it to
        the subtotal instead would produce{' '}
        <span className="tabular text-oxblood-300">10.00</span> of tax rather
        than <span className="tabular text-quill-300">9.00</span>, overstating
        every discounted line on every document you send.
      </p>
    </div>
  );
}
