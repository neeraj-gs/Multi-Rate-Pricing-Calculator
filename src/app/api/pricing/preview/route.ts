import { defineRoute } from '@/lib/api/route';
import { calculateDocument } from '@/lib/pricing';
import { previewSchema } from '@/lib/validation/documents';

export const runtime = 'nodejs';

/**
 * Stateless calculation preview.
 *
 * This is how the editor keeps totals live while typing **without** the client
 * ever computing money. The brief requires the server to be the source of
 * truth; this endpoint makes that compatible with a responsive UI, instead of
 * forcing a choice between correctness and feel.
 *
 * It touches no stored data, so it is safe to call on every keystroke (debounced
 * in the client, and rate-limited here).
 */
export const POST = defineRoute({
  body: previewSchema,
  handler: async ({ body }) => {
    const result = calculateDocument({ currency: body.currency, lines: body.lines });
    return { lines: result.lines, totals: result.totals };
  },
});
