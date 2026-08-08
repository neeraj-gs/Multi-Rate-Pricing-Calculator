import { cn } from '@/lib/utils';

/**
 * The mark: one tessera.
 *
 * An octagon with the interstitial square set inside it — the two shapes the
 * hero's tiling is built from, and the reason the product is called what it is.
 * Drawn rather than picked from an icon set, because a stock glyph in the
 * wordmark is the first thing that makes a product look assembled from parts.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-full', className)}
      fill="none"
      aria-hidden
    >
      <polygon
        points="21.24,15.83 15.83,21.24 8.17,21.24 2.76,15.83 2.76,8.17 8.17,2.76 15.83,2.76 21.24,8.17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <polygon points="16.4,12 12,16.4 7.6,12 12,7.6" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-7 items-center justify-center rounded-sheet border border-brass-700 bg-brass-500/10 p-1 text-brass-400">
        <Mark />
      </span>
      <span className="font-display text-[1.0625rem] tracking-[-0.02em] text-quill-100">
        Tessera
      </span>
    </span>
  );
}
