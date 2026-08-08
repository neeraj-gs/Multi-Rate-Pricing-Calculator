import Link from 'next/link';
import type { Metadata } from 'next';
import { Activity } from 'lucide-react';

import { getSession } from '@/lib/auth/session';
import { AuditLog, connectToDatabase } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';
import { EmptyState } from '@/components/ui/primitives';
import { PageHeader } from '@/components/app/PageHeader';
import { Types } from 'mongoose';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Activity' };

/**
 * The audit trail.
 *
 * Append-only: nothing in the codebase updates or deletes an entry, and there
 * is no write endpoint over the collection. Rejected edits to finalized
 * documents are recorded too — repeated attempts to change an issued quote are
 * exactly what a finance team wants to be able to see.
 */

const LABELS: Record<string, { text: string; tone: 'neutral' | 'good' | 'warn' }> = {
  'user.signup': { text: 'Account created', tone: 'good' },
  'user.login': { text: 'Signed in', tone: 'neutral' },
  'user.login_failed': { text: 'Failed sign-in', tone: 'warn' },
  'user.logout': { text: 'Signed out', tone: 'neutral' },
  'document.create': { text: 'Created', tone: 'neutral' },
  'document.update': { text: 'Edited', tone: 'neutral' },
  'document.delete': { text: 'Deleted draft', tone: 'warn' },
  'document.finalize': { text: 'Finalized', tone: 'good' },
  'document.duplicate': { text: 'Duplicated', tone: 'neutral' },
  'document.line.create': { text: 'Line added', tone: 'neutral' },
  'document.line.update': { text: 'Line edited', tone: 'neutral' },
  'document.line.delete': { text: 'Line removed', tone: 'neutral' },
  'document.share': { text: 'Share link created', tone: 'neutral' },
  'document.edit_rejected': { text: 'Edit rejected — finalized', tone: 'warn' },
};

export default async function ActivityPage() {
  const session = await getSession();
  await connectToDatabase();

  const entries = await AuditLog.find({ userId: new Types.ObjectId(session!.sub) })
    .sort({ at: -1 })
    .limit(150)
    .lean();

  return (
    <div>
      <PageHeader
        eyebrow="Audit"
        title="Activity"
        description="Every change, in order. This log is append-only — there is no endpoint that edits or removes an entry."
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No activity yet"
          description="Once you start creating and editing documents, every change shows up here."
        />
      ) : (
        <ol className="px-6 py-8 lg:px-10">
          {entries.map((entry, index) => {
            const label = LABELS[entry.action] ?? {
              text: entry.action,
              tone: 'neutral' as const,
            };
            return (
              <li key={String(entry._id)} className="flex gap-4">
                {/* The spine: a continuous rule with a node per event. */}
                <div className="flex flex-col items-center">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      label.tone === 'good'
                        ? 'bg-verdigris-400'
                        : label.tone === 'warn'
                          ? 'bg-oxblood-400'
                          : 'bg-ink-500'
                    }`}
                  />
                  {index < entries.length - 1 ? (
                    <span className="w-px flex-1 bg-ink-700" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1 pb-6">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      className={`font-mono text-[0.6875rem] uppercase tracking-[0.12em] ${
                        label.tone === 'good'
                          ? 'text-verdigris-300'
                          : label.tone === 'warn'
                            ? 'text-oxblood-300'
                            : 'text-quill-500'
                      }`}
                    >
                      {label.text}
                    </span>
                    {entry.entityLabel ? (
                      entry.entityId && entry.entityType === 'document' ? (
                        <Link
                          href={`/documents/${String(entry.entityId)}`}
                          className="truncate text-sm text-quill-100 hover:text-brass-300"
                        >
                          {entry.entityLabel}
                        </Link>
                      ) : (
                        <span className="truncate text-sm text-quill-300">
                          {entry.entityLabel}
                        </span>
                      )
                    ) : null}
                    <span className="ml-auto shrink-0 font-mono text-[0.6875rem] text-quill-700">
                      {formatDateTime(entry.at.toISOString())}
                    </span>
                  </div>

                  {entry.changes ? (
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 rounded-sheet border border-ink-800 bg-ink-850/60 px-3 py-2">
                      {Object.entries(
                        entry.changes as Record<string, { from: unknown; to: unknown }>,
                      )
                        .slice(0, 5)
                        .map(([field, change]) => (
                          <div key={field} className="flex items-baseline gap-2 text-xs">
                            <dt className="font-mono text-quill-700">{field}</dt>
                            <dd className="text-quill-500">
                              <span className="line-through decoration-oxblood-500/50">
                                {preview(change.from)}
                              </span>
                              <span className="mx-1.5 text-quill-700">→</span>
                              <span className="text-quill-300">{preview(change.to)}</span>
                            </dd>
                          </div>
                        ))}
                    </dl>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Renders any audited value as a short, readable string. */
function preview(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (typeof value === 'object') {
    const text = JSON.stringify(value);
    return text.length > 48 ? `${text.slice(0, 45)}…` : text;
  }
  const text = String(value);
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}
