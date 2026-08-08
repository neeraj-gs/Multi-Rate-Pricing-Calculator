import { createHash } from 'node:crypto';

import { DocumentModel, ShareLink } from '@/lib/db';
import { serializeDocument, type ApiDocument } from './serialize';

export interface SharedDocument {
  document: ApiDocument;
  sharedBy: string;
  expiresAt: string;
}

/**
 * Resolves a public share token to a document.
 *
 * Every failure mode — unknown token, revoked, expired, dangling document —
 * returns `null`, and the caller renders one identical "link not available"
 * page. Distinguishing them would let anyone with a wrong token learn whether a
 * link ever existed.
 *
 * Deliberately *not* wrapped in `defineRoute`: this path is public by design,
 * and keeping it separate from the authenticated surface means it cannot
 * accidentally inherit a session.
 */
export async function resolveShareToken(token: string): Promise<SharedDocument | null> {
  if (!token || token.length < 20 || token.length > 200) return null;

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const link = await ShareLink.findOne({ tokenHash }).lean();

  if (!link) return null;
  if (link.revokedAt) return null;
  if (link.expiresAt <= new Date()) return null;

  const document = await DocumentModel.findById(link.documentId).lean();
  if (!document) return null;

  // Fire-and-forget: a view counter must never delay or fail the page.
  void ShareLink.updateOne(
    { _id: link._id },
    { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } },
  ).catch(() => undefined);

  return {
    document: serializeDocument(
      document as unknown as Parameters<typeof serializeDocument>[0],
    ),
    sharedBy: '',
    expiresAt: link.expiresAt.toISOString(),
  };
}
