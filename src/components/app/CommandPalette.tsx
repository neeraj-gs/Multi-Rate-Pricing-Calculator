'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import useSWR from 'swr';
import {
  Activity,
  BarChart3,
  FileText,
  LayoutDashboard,
  Plus,
  Settings,
} from 'lucide-react';

import { fetcher } from '@/lib/api-client';
import { formatDate, money } from '@/lib/utils';
import type { PaginatedDocuments } from '@/lib/documents/queries';

/**
 * ⌘K.
 *
 * Search runs on the server against the same indexed query the documents list
 * uses, so results are the real thing rather than a filter over whatever
 * happened to be loaded. It only fires once there are two characters, and the
 * request is debounced — a keystroke-per-request search box is how you turn a
 * convenience into a load problem.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useSWR<PaginatedDocuments>(
    open && debounced.trim().length >= 2
      ? `/documents?q=${encodeURIComponent(debounced.trim())}&limit=6`
      : null,
    fetcher,
    { keepPreviousData: true },
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  function go(href: string) {
    onOpenChange(false);
    setQuery('');
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      <Command
        loop
        className="relative w-full max-w-xl overflow-hidden rounded-sheet border border-ink-600 bg-ink-850 shadow-sheet"
      >
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search documents, or jump to a page…"
          className="w-full border-b border-ink-700 bg-transparent px-5 py-4 text-sm text-quill-100 outline-none placeholder:text-quill-700"
        />

        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-quill-500">
            {isLoading ? 'Searching…' : 'Nothing matched. Try a different term.'}
          </Command.Empty>

          {data?.data?.length ? (
            <Command.Group
              heading="Documents"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[0.625rem] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-quill-700"
            >
              {data.data.map((document) => (
                <Command.Item
                  key={document.id}
                  value={`${document.number} ${document.title} ${document.customerName}`}
                  onSelect={() => go(`/documents/${document.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-sheet px-3 py-2.5 text-sm text-quill-300 data-[selected=true]:bg-ink-800 data-[selected=true]:text-quill-100"
                >
                  <FileText className="size-4 shrink-0 text-quill-700" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono text-xs text-brass-500">
                      {document.number}
                    </span>{' '}
                    {document.title}
                    <span className="ml-2 text-quill-700">{document.customerName}</span>
                  </span>
                  <span className="tabular shrink-0 text-xs text-quill-500">
                    {money(document.grandTotal, document.currency)}
                  </span>
                  <span className="shrink-0 font-mono text-[0.625rem] text-quill-700">
                    {formatDate(document.issueDate)}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          <Command.Group
            heading="Go to"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[0.625rem] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-quill-700"
          >
            {[
              { label: 'New document', href: '/documents/new', icon: Plus },
              { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
              { label: 'All documents', href: '/documents', icon: FileText },
              { label: 'Reports', href: '/reports', icon: BarChart3 },
              { label: 'Activity', href: '/activity', icon: Activity },
              { label: 'Settings', href: '/settings', icon: Settings },
            ].map((item) => (
              <Command.Item
                key={item.href}
                value={item.label}
                onSelect={() => go(item.href)}
                className="flex cursor-pointer items-center gap-3 rounded-sheet px-3 py-2.5 text-sm text-quill-300 data-[selected=true]:bg-ink-800 data-[selected=true]:text-quill-100"
              >
                <item.icon className="size-4 text-quill-700" />
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
