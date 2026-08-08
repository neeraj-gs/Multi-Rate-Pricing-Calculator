import Link from 'next/link';
import type { Metadata } from 'next';

import { connectToDatabase } from '@/lib/db';
import { resolveShareToken } from '@/lib/documents/share';
import { DocumentPage, documentPageProps } from '@/components/documents/DocumentPage';
import { PrintButton } from '@/components/documents/PrintButton';
import { Wordmark } from '@/components/brand';

export const dynamic = 'force-dynamic';

/**
 * A shared document, viewable by anyone holding the link.
 *
 * Renders the same `DocumentPage` the editor previews and the PDF route
 * prints, so the customer sees exactly what the sender saw.
 *
 * `noindex` matters here: a share link is unlisted, not secret forever, and a
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
    // Unknown, revoked and expired all render the same page. Telling them
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
    <div className="tessellate min-h-dvh bg-ink-950">
      <header className="no-print border-b border-ink-800 bg-ink-900/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[850px] flex-wrap items-center gap-4 px-5 py-3">
          <Link href="/">
            <Wordmark />
          </Link>

          <span className="ml-auto font-mono text-[0.625rem] text-quill-700">
            Read-only · expires{' '}
            {new Date(shared.expiresAt).toISOString().slice(0, 10)}
          </span>

          <PrintButton label="Save as PDF" />
        </div>
      </header>

      <div className="mx-auto max-w-[850px] px-5 py-8 print:max-w-none print:p-0">
        <div className="shadow-[0_2px_6px_rgba(0,0,0,0.5),0_30px_70px_-24px_rgba(0,0,0,0.85)] print:shadow-none">
          <DocumentPage {...documentPageProps(shared.document)} />
        </div>
      </div>
    </div>
  );
}
