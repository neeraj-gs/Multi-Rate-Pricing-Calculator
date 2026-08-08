'use client';

import * as React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight, FileText, Plus, Search } from 'lucide-react';

import { fetcher } from '@/lib/api-client';
import { cn, formatDate, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { EmptyState, Skeleton, StatusBadge } from '@/components/ui/primitives';
import type { PaginatedDocuments } from '@/lib/documents/queries';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'finalized', label: 'Finalized' },
] as const;

const SORTS = [
  { value: '-issueDate', label: 'Newest first' },
  { value: 'issueDate', label: 'Oldest first' },
  { value: '-total', label: 'Largest total' },
  { value: '-updatedAt', label: 'Recently edited' },
] as const;

/**
 * The documents table.
 *
 * Filtering, sorting and paging all happen on the server against the
 * `{ userId, status, issueDate }` index — the client holds the query, not the
 * data. Filtering an already-fetched page in the browser would quietly lie
 * about how many results exist.
 */
export function DocumentsList() {
  const [status, setStatus] = React.useState<string>('all');
  const [sort, setSort] = React.useState<string>('-issueDate');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams({
    status,
    sort,
    page: String(page),
    limit: '20',
  });
  if (debouncedSearch.trim()) query.set('q', debouncedSearch.trim());

  const { data, isLoading } = useSWR<PaginatedDocuments>(
    `/documents?${query}`,
    fetcher,
    { keepPreviousData: true },
  );

  const documents = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="px-6 py-6 lg:px-10">
      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-quill-700" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, customer or number"
            className="pl-9"
            aria-label="Search documents"
          />
        </div>

        <div
          className="flex rounded-sheet border border-ink-700 bg-ink-850 p-0.5"
          role="group"
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
              }}
              className={cn(
                'rounded-[2px] px-3 py-1.5 text-xs transition-colors',
                status === filter.value
                  ? 'bg-ink-700 text-quill-100'
                  : 'text-quill-500 hover:text-quill-300',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort documents"
          className="h-10 rounded-sheet border border-ink-700 bg-ink-850 px-3 text-xs text-quill-300"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-sheet border border-ink-700">
        {isLoading && !data ? (
          <div className="space-y-px bg-ink-700">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="bg-ink-900 p-4">
                <Skeleton className="h-5 w-1/3" />
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="bg-ink-900">
            <EmptyState
              icon={FileText}
              title={
                debouncedSearch ? 'Nothing matched that search' : 'No documents yet'
              }
              description={
                debouncedSearch
                  ? 'Try a shorter term, or clear the search to see everything.'
                  : 'Create your first quote and add the lines you are charging for.'
              }
              action={
                debouncedSearch ? (
                  <Button variant="secondary" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                ) : (
                  <Button asChild variant="primary">
                    <Link href="/documents/new">
                      <Plus className="size-4" />
                      New document
                    </Link>
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse">
              <thead>
                <tr className="border-b border-ink-700 bg-ink-850 text-left font-mono text-[0.625rem] uppercase tracking-[0.12em] text-quill-700">
                  <th className="px-4 py-3 font-medium">Number</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Issued</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Tax</th>
                  <th className="px-4 py-3 text-right font-medium">Grand total</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr
                    key={document.id}
                    className="border-b border-ink-800 bg-ink-900 transition-colors last:border-0 hover:bg-ink-850"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/documents/${document.id}`}
                        className="font-mono text-xs text-brass-500 hover:underline"
                      >
                        {document.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/documents/${document.id}`}
                        className="text-sm text-quill-100 hover:text-brass-300"
                      >
                        {document.title}
                      </Link>
                      <p className="mt-0.5 font-mono text-[0.625rem] text-quill-700">
                        {document.lineCount}{' '}
                        {document.lineCount === 1 ? 'line' : 'lines'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-quill-300">
                      {document.customerName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-quill-500">
                      {formatDate(document.issueDate)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={document.status} />
                    </td>
                    <td className="tabular px-4 py-3 text-right text-sm text-quill-500">
                      {money(document.totalTax, document.currency)}
                    </td>
                    <td className="tabular px-4 py-3 text-right text-sm font-medium text-quill-100">
                      {money(document.grandTotal, document.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.total > 0 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="font-mono text-xs text-quill-700">
            {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!pagination.hasMore}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
