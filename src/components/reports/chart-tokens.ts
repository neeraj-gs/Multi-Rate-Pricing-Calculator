/**
 * Chart colour, decided by the validator rather than by eye.
 *
 * These four slots were stepped against the dark chart surface (#0b111c) until
 * every check passed: OKLCH lightness inside the dark band 0.48–0.67, chroma
 * above the 0.10 floor so no hue reads as grey, an all-pairs normal-vision ΔE
 * of 16.0, and contrast above 3:1 on the surface.
 *
 *   node scripts/validate_palette.js "#bd8226,#4a8cc4,#1f9e6e" \
 *     --mode dark --surface "#0b111c" --pairs all
 *
 * All pairs, not just adjacent ones: filtering a currency out makes any two
 * survivors neighbours, and colour follows the entity rather than its rank, so
 * the pair that ends up side by side cannot be predicted.
 *
 * The amber↔green pair sits at ΔE 7.9 under protanopia — inside the 6–8 floor
 * band, which is legal *only* with secondary encoding. Every chart using these
 * therefore carries direct labels and a 2px surface gap between fills; none of
 * them rely on colour alone.
 *
 * There is no fifth slot on purpose. A ninth series is never a generated hue —
 * beyond three currencies the rest fold into "Other" in neutral grey.
 */
export const CATEGORICAL = ['#bd8226', '#4a8cc4', '#1f9e6e'] as const;

/** Anything past the third series. Neutral, and never confused for a hue. */
export const OTHER = '#4a5568';

/**
 * Single-series marks, coloured by what the measure *is* rather than by
 * position — so tax is the same steel blue on a chart as it is in the editor.
 */
export const MEASURE = {
  total: '#bd8226',
  tax: '#4a8cc4',
  discount: '#1f9e6e',
} as const;

/** Draft versus finalized. Identity, not status — neither is good or bad. */
export const LIFECYCLE = {
  draft: '#4a5568',
  finalized: '#bd8226',
} as const;

export const CHART_SURFACE = '#0b111c';
export const GRID = '#1a2333';
export const AXIS_TEXT = '#7f8b9f';

/** Assigns a fixed colour per currency, in first-seen order, never cycled. */
export function currencyColour(currency: string, order: string[]): string {
  const index = order.indexOf(currency);
  return index >= 0 && index < CATEGORICAL.length ? CATEGORICAL[index] : OTHER;
}
