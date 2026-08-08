import type { Metadata } from 'next';

import { getSession } from '@/lib/auth/session';
import { connectToDatabase, User } from '@/lib/db';
import { SUPPORTED_CURRENCIES, formatPercent } from '@/lib/pricing';
import { NewDocumentForm } from '@/components/documents/NewDocumentForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New document' };

export default async function NewDocumentPage() {
  const session = await getSession();
  await connectToDatabase();
  const user = await User.findById(session?.sub).lean();

  return (
    <NewDocumentForm
      currencies={SUPPORTED_CURRENCIES}
      // The user's saved defaults become the form's starting point, so the
      // common case is "type a customer name and go".
      defaultCurrency={user?.preferences?.currency ?? 'AED'}
      defaultTaxPercent={formatPercent(user?.preferences?.defaultTaxPercent ?? 0)}
    />
  );
}
