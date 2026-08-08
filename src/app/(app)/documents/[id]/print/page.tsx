import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';

import { getSession } from '@/lib/auth/session';
import { connectToDatabase, User } from '@/lib/db';
import { loadOwnedDocument } from '@/lib/documents/service';
import { serializeDocument } from '@/lib/documents/serialize';
import { DocumentPage, documentPageProps } from '@/components/documents/DocumentPage';
import { PrintButton } from '@/components/documents/PrintButton';

export const dynamic = 'force-dynamic';

/**
 * The printable document.
 *
 * This route exists because "Print" used to call `window.print()` on the
 * editor, and the editor is an application — so the PDF came out containing
 * the sidebar, the toolbar, and an "Add line" button. A document you send a
 * customer cannot be a screenshot of the tool that made it.
 *
 * Here the page is the *only* thing rendered. It is deliberately outside the
 * app shell: no navigation, no chrome to hide, nothing for a stray print rule
 * to miss. The single control at the top carries `no-print`, so what reaches
 * the paper is exactly `DocumentPage` — the same component the editor previews
 * and the share link serves.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  if (!session) return { title: 'Document' };

  await connectToDatabase();
  try {
    const record = await loadOwnedDocument(session.sub, id);
    // The browser uses the page title as the default PDF filename.
    return { title: `${record.number} — ${record.title}` };
  } catch {
    return { title: 'Document' };
  }
}

export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  await connectToDatabase();

  let document;
  let user;
  try {
    const [record, owner] = await Promise.all([
      loadOwnedDocument(session.sub, id),
      User.findById(session.sub).lean(),
    ]);
    document = serializeDocument(
      record as unknown as Parameters<typeof serializeDocument>[0],
    );
    user = owner;
  } catch {
    notFound();
  }

  const page = documentPageProps(document, {
    name: user?.name ?? '',
    company: user?.company ?? '',
  });

  return (
    <div className="min-h-dvh bg-ink-950">
      <div className="no-print sticky top-0 z-10 border-b border-ink-800 bg-ink-900/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[850px] flex-wrap items-center gap-3 px-5 py-3">
          <Link
            href={`/documents/${document.id}`}
            className="flex items-center gap-1.5 text-sm text-quill-500 transition-colors hover:text-brass-300"
          >
            <ArrowLeft className="size-4" />
            Back to editor
          </Link>

          <span className="ml-auto hidden font-mono text-[0.625rem] text-quill-700 sm:inline">
            Choose &ldquo;Save as PDF&rdquo; as the destination
          </span>

          <PrintButton />
        </div>
      </div>

      <div className="mx-auto max-w-[850px] px-5 py-8 print:max-w-none print:p-0">
        <div className="shadow-[0_2px_6px_rgba(0,0,0,0.5),0_30px_70px_-24px_rgba(0,0,0,0.85)] print:shadow-none">
          <DocumentPage {...page} />
        </div>
      </div>
    </div>
  );
}
