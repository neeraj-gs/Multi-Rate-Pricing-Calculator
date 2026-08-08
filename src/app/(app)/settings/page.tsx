import type { Metadata } from 'next';

import { getSession } from '@/lib/auth/session';
import { connectToDatabase, User } from '@/lib/db';
import { formatPercent, SUPPORTED_CURRENCIES } from '@/lib/pricing';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/app/PageHeader';
import { SettingsForm } from '@/components/settings/SettingsForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await getSession();
  await connectToDatabase();
  const user = await User.findById(session!.sub).lean();

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Defaults applied to new documents. Existing documents keep whatever they were created with."
      />

      <div className="px-6 py-8 lg:px-10">
        <SettingsForm
          currencies={SUPPORTED_CURRENCIES}
          initial={{
            name: user?.name ?? '',
            company: user?.company ?? '',
            currency: user?.preferences?.currency ?? 'AED',
            defaultTaxPercent: formatPercent(user?.preferences?.defaultTaxPercent ?? 0),
            documentPrefix: user?.preferences?.documentPrefix ?? 'QT',
          }}
        />

        <dl className="mt-12 max-w-xl space-y-3 border-t border-ink-800 pt-6 text-sm">
          <Row label="Email" value={user?.email ?? ''} />
          <Row
            label="Account created"
            value={formatDateTime(
              (user as { createdAt?: Date } | null)?.createdAt?.toISOString(),
            )}
          />
          <Row label="Last signed in" value={formatDateTime(user?.lastLoginAt?.toISOString())} />
        </dl>

        <p className="mt-8 max-w-xl font-mono text-xs leading-relaxed text-quill-700">
          Your password is stored as a bcrypt hash at cost factor 12, and is
          excluded from every query by default — it is never loaded unless a
          sign-in explicitly asks for it.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-quill-700">
        {label}
      </dt>
      <dd className="text-quill-300">{value}</dd>
    </div>
  );
}
