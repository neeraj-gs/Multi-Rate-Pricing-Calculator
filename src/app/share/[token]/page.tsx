import type { Metadata } from 'next';

import { connectToDatabase } from '@/lib/db';
import { resolveShareToken } from '@/lib/documents/share';
import { PrintableDocument } from '@/components/documents/PrintableDocument';
import { PrintButton } from '@/components/documents/PrintButton';
import { Mark } from '@/components/brand';

export const dynamic = 'force-dynamic';

/**
 * A shared document, viewable by anyone holding the link.
 *
 * `noindex` matters here: a share link is unlisted, not secret-forever, and a
 * customer's pricing has no business in a search index.
 */
export const metadata: Metadata = {
  title: 'Shared document',
  robots: { index: false, follow: false },
};

export default async function SharedDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  await connectToDatabase();
  const shared = await resolveShareToken(token);

  if (!shared) {
    // Unknown, revoked, and expired all render the same page. Telling them
    // apart would let anyone with a wrong token learn whether a link existed.
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl text-quill-100">
            This link is not available
          </h1>
          <p className="mt-3 text-pretty text-sm text-quill-500">
            It may have expired, been revoked, or never existed. Ask whoever sent
            it for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ink-900 py-10">
      <div className="no-print mx-auto mb-8 flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6">
        <span className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-sheet border border-brass-700 bg-brass-500/10 p-1 text-brass-400">
              <Mark />
            </span>
          <span className="font-display text-lg text-quill-100">
            LedgerLine
          </span>
        </span>

        <div className="flex items-center gap-4">
          <span className="font-mono text-[0.6875rem] text-quill-700">
            Read-only · expires {new Date(shared.expiresAt).toISOString().slice(0, 10)}
          </span>
          <PrintButton />
        </div>
      </div>

      <div className="px-6">
        <PrintableDocument document={shared.document} />
      </div>
    </div>
  );
}
