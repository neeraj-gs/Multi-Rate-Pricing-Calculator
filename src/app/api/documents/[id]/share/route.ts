import { createHash, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';

import { defineRoute } from '@/lib/api/route';
import { recordAudit } from '@/lib/api/audit';
import { ShareLink } from '@/lib/db';
import { loadOwnedDocument } from '@/lib/documents/service';
import { documentIdParamSchema, shareLinkSchema } from '@/lib/validation/documents';

export const runtime = 'nodejs';

/**
 * Mints a public, read-only link to a document.
 *
 * The token is 32 random bytes — 256 bits, so guessing one is not a strategy.
 * Only its SHA-256 hash is stored, and the raw value is returned exactly once,
 * here. If the database is ever exposed, the stored hashes cannot be turned
 * back into working links.
 */
export const POST = defineRoute({
  params: documentIdParamSchema,
  body: shareLinkSchema,
  successStatus: 201,
  handler: async ({ userId, params, body, ctx, request }) => {
    const document = await loadOwnedDocument(userId, params.id);

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresInDays = body?.expiresInDays ?? 30;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    await ShareLink.create({
      userId: new Types.ObjectId(userId),
      documentId: document._id,
      tokenHash,
      expiresAt,
    });

    await recordAudit({
      userId,
      action: 'document.share',
      entityType: 'document',
      entityId: params.id,
      entityLabel: `${document.number} — ${document.title}`,
      metadata: { expiresAt: expiresAt.toISOString() },
      context: ctx,
    });

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

    return {
      share: {
        url: `${origin}/share/${token}`,
        token,
        expiresAt: expiresAt.toISOString(),
      },
    };
  },
});
