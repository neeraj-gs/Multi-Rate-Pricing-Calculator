import { defineRoute } from '@/lib/api/route';
import { listCustomers } from '@/lib/documents/queries';

export const runtime = 'nodejs';

/** Distinct customers, for autocomplete and the report filter. */
export const GET = defineRoute({
  handler: async ({ userId }) => ({ customers: await listCustomers(userId) }),
});
