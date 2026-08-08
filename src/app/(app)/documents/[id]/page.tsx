import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { getSession } from '@/lib/auth/session';
import { connectToDatabase, User } from '@/lib/db';
import { formatPercent } from '@/lib/pricing';
import { loadOwnedDocument } from '@/lib/documents/service';
import { serializeDocument } from '@/lib/documents/serialize';
import { DocumentEditor } from '@/components/documents/DocumentEditor';

export const dynamic = 'force-dynamic';

/**
 * Loaded on the server, rendered immediately.
 *
 * Fetching the document in a client effect would mean a spinner on every open,
 * and the document is the whole point of the page. The editor takes it as its
 * initial state and manages its own changes from there.
 */
async function load(id: string) {
  const session = await getSession();
  if (!session) notFound();

  await connectToDatabase();
  try {
    const record = await loadOwnedDocument(session.sub, id);
    return serializeDocument(
      record as unknown as Parameters<typeof serializeDocument>[0],
    );
  } catch {
    // Someone else's document and a non-existent one are the same 404 here,
    // exactly as they are in the API.
    notFound();
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const document = await load(id);
  return { title: `${document.number} — ${document.title}` };
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const [document, user] = await Promise.all([
    load(id),
    User.findById(session!.sub).lean(),
  ]);

  return (
    <DocumentEditor
      initial={document}
      // Newly added lines start at the account's default tax rate, so the
      // common case is typing a description and a price and nothing else.
      defaultTaxPercent={formatPercent(user?.preferences?.defaultTaxPercent ?? 0)}
      issuer={{ name: user?.name ?? '', company: user?.company ?? '' }}
    />
  );
}
