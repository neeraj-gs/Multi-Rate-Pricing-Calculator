'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Copy,
  FileLock2,
  Link2,
  Printer,
  Save,
  Trash2,
} from 'lucide-react';

import { api, ApiClientError, newIdempotencyKey } from '@/lib/api-client';
import { formatDateTime, todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  StatusBadge,
} from '@/components/ui/primitives';
import type { ApiDocument, DraftLine } from '@/lib/documents/types';

import { LineItemsTable } from './LineItemsTable';
import { TotalsPanel } from './TotalsPanel';
import { usePricingPreview, toLineInput } from './usePricingPreview';

/**
 * The document editor.
 *
 * ## Where the numbers come from
 *
 * Nowhere in this component is a monetary value computed. Editing a field
 * updates local text, a debounced request asks the server what that text is
 * worth, and the answer is rendered. Saving sends the same inputs to the write
 * path, which runs the same engine — so what you saw while typing and what got
 * stored cannot disagree.
 *
 * ## Where immutability is enforced
 *
 * In the API, not here. This component hides the controls on a finalized
 * document because showing a disabled Save button is a worse experience than
 * not showing one — but if it rendered them anyway, every request would come
 * back 409. The UI reflects the rule; it does not implement it.
 */

function toDraftLines(document: ApiDocument): DraftLine[] {
  return document.lines.map((line) => ({
    key: line.id,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountType: line.discount?.type ?? 'none',
    discountValue: line.discount?.value ?? '',
    taxPercent: line.taxPercent ?? '',
  }));
}

/** A fresh row, pre-filled with the account's default tax rate. */
function blankLine(defaultTaxPercent: string): DraftLine {
  return {
    key: `new-${crypto.randomUUID()}`,
    description: '',
    quantity: '1',
    unitPrice: '',
    discountType: 'none',
    discountValue: '',
    taxPercent: defaultTaxPercent === '0' ? '' : defaultTaxPercent,
  };
}

export function DocumentEditor({
  initial,
  defaultTaxPercent = '0',
}: {
  initial: ApiDocument;
  /** From the account's preferences; applied to newly added lines. */
  defaultTaxPercent?: string;
}) {
  const router = useRouter();

  const [document, setDocument] = React.useState(initial);
  const [title, setTitle] = React.useState(initial.title);
  const [customerName, setCustomerName] = React.useState(initial.customer.name);
  const [customerEmail, setCustomerEmail] = React.useState(initial.customer.email);
  const [customerAddress, setCustomerAddress] = React.useState(initial.customer.address);
  const [issueDate, setIssueDate] = React.useState(initial.issueDate ?? todayISO());
  const [dueDate, setDueDate] = React.useState(initial.dueDate ?? '');
  const [notes, setNotes] = React.useState(initial.notes);
  const [lines, setLines] = React.useState<DraftLine[]>(() => toDraftLines(initial));

  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<ApiClientError | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(initial.updatedAt);

  const readOnly = !document.editable;
  const currency = document.currency;

  const { preview, pending, error, latencyMs, fieldErrors } = usePricingPreview(
    lines,
    currency,
  );

  // Combine the two sources of field-level errors so an input shows whichever
  // arrived most recently, rather than the preview's stale one after a failed
  // save (or vice versa).
  const combinedFieldErrors = React.useMemo(() => {
    const merged: Record<string, string> = { ...fieldErrors };
    for (const detail of saveError?.details ?? []) {
      if (detail.path) merged[detail.path] = detail.message;
    }
    return merged;
  }, [fieldErrors, saveError]);

  const dirty = React.useMemo(
    () =>
      JSON.stringify({
        title,
        customerName,
        customerEmail,
        customerAddress,
        issueDate,
        dueDate,
        notes,
        lines: lines.map(toLineInput),
      }) !==
      JSON.stringify({
        title: document.title,
        customerName: document.customer.name,
        customerEmail: document.customer.email,
        customerAddress: document.customer.address,
        issueDate: document.issueDate ?? todayISO(),
        dueDate: document.dueDate ?? '',
        notes: document.notes,
        lines: toDraftLines(document).map(toLineInput),
      }),
    [
      title,
      customerName,
      customerEmail,
      customerAddress,
      issueDate,
      dueDate,
      notes,
      lines,
      document,
    ],
  );

  /* --- Line editing ----------------------------------------------------- */

  const updateLine = React.useCallback((key: string, patch: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }, []);

  const addLine = React.useCallback(() => {
    setLines((current) => [...current, blankLine(defaultTaxPercent)]);
  }, [defaultTaxPercent]);

  const removeLine = React.useCallback((key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
  }, []);

  const reorderLines = React.useCallback((from: number, to: number) => {
    setLines((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  /* --- Persistence ------------------------------------------------------ */

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const { document: updated } = await api.patch<{ document: ApiDocument }>(
        `/documents/${document.id}`,
        {
          title: title.trim(),
          customer: {
            name: customerName.trim(),
            email: customerEmail.trim(),
            address: customerAddress.trim(),
          },
          issueDate,
          dueDate: dueDate || null,
          notes,
          lines: lines.map(toLineInput),
          // Echoing the revision turns a concurrent edit into a 409 we can
          // explain, instead of silently overwriting the other tab.
          revision: document.revision,
        },
      );
      setDocument(updated);
      setLines(toDraftLines(updated));
      setSavedAt(updated.updatedAt);
      toast.success('Changes saved');
    } catch (thrown) {
      const apiError =
        thrown instanceof ApiClientError
          ? thrown
          : new ApiClientError(0, 'NETWORK', 'Could not reach the server.');
      setSaveError(apiError);
      toast.error(
        apiError.code === 'REVISION_MISMATCH'
          ? 'This document changed in another tab. Refresh to see the latest version.'
          : apiError.message,
      );
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    setBusy('finalize');
    try {
      const { document: updated } = await api.post<{ document: ApiDocument }>(
        `/documents/${document.id}/finalize`,
        { revision: document.revision },
        newIdempotencyKey(),
      );
      setDocument(updated);
      setLines(toDraftLines(updated));
      toast.success(`${updated.number} finalized. It is now read-only.`);
    } catch (thrown) {
      const apiError = thrown as ApiClientError;
      // A finalize refusal usually lists several reasons; showing only the
      // first would send the user round the loop once per problem.
      toast.error(apiError.message, {
        description: apiError.details?.map((d) => d.message).join(' '),
      });
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    setBusy('duplicate');
    try {
      const { document: copy } = await api.post<{ document: ApiDocument }>(
        `/documents/${document.id}/duplicate`,
        {},
        newIdempotencyKey(),
      );
      toast.success(`Duplicated into ${copy.number}`);
      router.push(`/documents/${copy.id}`);
    } catch (thrown) {
      toast.error((thrown as ApiClientError).message);
      setBusy(null);
    }
  }

  async function share() {
    setBusy('share');
    try {
      const { share: link } = await api.post<{ share: { url: string } }>(
        `/documents/${document.id}/share`,
        { expiresInDays: 30 },
      );
      await navigator.clipboard.writeText(link.url).catch(() => undefined);
      toast.success('Share link copied', {
        description: 'Read-only, expires in 30 days.',
      });
    } catch (thrown) {
      toast.error((thrown as ApiClientError).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('delete');
    try {
      await api.delete(`/documents/${document.id}`);
      toast.success('Draft deleted');
      router.push('/documents');
    } catch (thrown) {
      toast.error((thrown as ApiClientError).message);
      setBusy(null);
    }
  }

  /* --- Keyboard --------------------------------------------------------- */

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        if (!readOnly && dirty) void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, dirty, title, customerName, lines]);

  /* --- Render ----------------------------------------------------------- */

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-900/90 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 lg:px-10">
          <Button asChild variant="ghost" size="icon" aria-label="Back to documents">
            <Link href="/documents">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span className="whitespace-nowrap font-mono text-xs text-brass-500">
                {document.number}
              </span>
              <StatusBadge status={document.status} />
              {readOnly ? null : dirty ? (
                <span className="font-mono text-[0.6875rem] text-quill-700">
                  Unsaved changes
                </span>
              ) : savedAt ? (
                <span className="font-mono text-[0.6875rem] text-quill-700">
                  Saved {formatDateTime(savedAt)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              <span className="hidden sm:inline">Print</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={share}
              loading={busy === 'share'}
            >
              <Link2 className="size-4" />
              <span className="hidden sm:inline">Share</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={duplicate}
              loading={busy === 'duplicate'}
            >
              <Copy className="size-4" />
              <span className="hidden sm:inline">Duplicate</span>
            </Button>

            {readOnly ? null : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={save}
                  loading={saving}
                  disabled={!dirty}
                >
                  <Save className="size-4" />
                  Save
                </Button>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="primary" size="sm">
                      <FileLock2 className="size-4" />
                      Finalize
                    </Button>
                  </DialogTrigger>
                  <DialogContent
                    title="Finalize this document?"
                    description="Finalizing is permanent."
                  >
                    <div className="space-y-4 px-5 py-5 text-sm text-quill-300">
                      <p>
                        Once finalized, {document.number} becomes read-only. Its
                        lines, amounts and details can never be changed again,
                        and it cannot be deleted — reports covering this period
                        depend on it staying exactly as it is.
                      </p>
                      <p className="text-quill-500">
                        If you need to change something later, duplicate it into
                        a new draft. The original stays as your customer
                        received it.
                      </p>
                      {dirty ? (
                        <p className="rounded-sheet border border-brass-700 bg-brass-500/10 px-3.5 py-2.5 text-brass-300">
                          You have unsaved changes. Save them first — finalizing
                          freezes what is stored, not what is on screen.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-ink-700 px-5 py-4">
                      <DialogClose asChild>
                        <Button variant="ghost" size="sm">
                          Keep editing
                        </Button>
                      </DialogClose>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={finalize}
                        loading={busy === 'finalize'}
                        disabled={dirty}
                      >
                        Finalize {document.number}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Delete draft">
                      <Trash2 className="size-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent
                    title="Delete this draft?"
                    description="This cannot be undone."
                  >
                    <p className="px-5 py-5 text-sm text-quill-300">
                      {document.number} and its {document.lines.length} line
                      items will be removed permanently.
                    </p>
                    <div className="flex justify-end gap-2 border-t border-ink-700 px-5 py-4">
                      <DialogClose asChild>
                        <Button variant="ghost" size="sm">
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={remove}
                        loading={busy === 'delete'}
                      >
                        Delete draft
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>

        {readOnly ? (
          <div className="flex items-center gap-2.5 border-t border-verdigris-700/50 bg-verdigris-500/[0.07] px-6 py-2.5 lg:px-10">
            <FileLock2 className="size-3.5 shrink-0 text-verdigris-400" />
            <p className="text-xs text-verdigris-300">
              Finalized {formatDateTime(document.finalizedAt)}. This document is
              read-only — duplicate it to make changes.
            </p>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 px-6 py-8 lg:grid-cols-[1fr_20rem] lg:px-10">
        <div className="min-w-0 space-y-6">
          {/* The document header, on parchment. */}
          <div className="sheet p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <SheetField label="Title" htmlFor="doc-title" className="sm:col-span-2">
                <input
                  id="doc-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  readOnly={readOnly}
                  placeholder="Q3 proposal"
                  className="w-full border-b border-parchment-300 bg-transparent pb-1.5 font-display text-2xl text-ink-900 outline-none placeholder:text-parchment-400 focus:border-ink-600 read-only:border-transparent"
                />
              </SheetField>

              <SheetField label="Customer" htmlFor="doc-customer">
                <SheetInput
                  id="doc-customer"
                  value={customerName}
                  onChange={setCustomerName}
                  readOnly={readOnly}
                  placeholder="Acme Trading LLC"
                  error={combinedFieldErrors['customer.name']}
                />
              </SheetField>

              <SheetField label="Customer email" htmlFor="doc-email">
                <SheetInput
                  id="doc-email"
                  value={customerEmail}
                  onChange={setCustomerEmail}
                  readOnly={readOnly}
                  type="email"
                  placeholder="accounts@acme.com"
                  error={combinedFieldErrors['customer.email']}
                />
              </SheetField>

              <SheetField label="Issue date" htmlFor="doc-issue">
                <SheetInput
                  id="doc-issue"
                  value={issueDate}
                  onChange={setIssueDate}
                  readOnly={readOnly}
                  type="date"
                  error={combinedFieldErrors.issueDate}
                />
              </SheetField>

              <SheetField label="Due date" htmlFor="doc-due">
                <SheetInput
                  id="doc-due"
                  value={dueDate}
                  onChange={setDueDate}
                  readOnly={readOnly}
                  type="date"
                  error={combinedFieldErrors.dueDate}
                />
              </SheetField>

              <SheetField
                label="Billing address"
                htmlFor="doc-address"
                className="sm:col-span-2"
              >
                <SheetInput
                  id="doc-address"
                  value={customerAddress}
                  onChange={setCustomerAddress}
                  readOnly={readOnly}
                  placeholder="Office 1204, Boulevard Plaza Tower 1, Dubai"
                />
              </SheetField>
            </div>
          </div>

          <LineItemsTable
            lines={lines}
            currency={currency}
            preview={preview}
            fieldErrors={combinedFieldErrors}
            onChange={updateLine}
            onAdd={addLine}
            onRemove={removeLine}
            onReorder={reorderLines}
            readOnly={readOnly}
          />

          <div className="rounded-sheet border border-ink-700 bg-ink-850 p-5">
            <Field label="Notes" htmlFor="doc-notes" hint="shown on the document">
              <Textarea
                id="doc-notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                readOnly={readOnly}
                placeholder="Payment terms, delivery timelines, anything the customer should read."
              />
            </Field>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <TotalsPanel
            preview={preview}
            currency={currency}
            pending={pending}
            error={error}
            latencyMs={latencyMs}
          />

          {!readOnly && dirty ? (
            <Button
              variant="primary"
              className="mt-3 w-full"
              onClick={save}
              loading={saving}
            >
              <Save className="size-4" />
              Save changes
            </Button>
          ) : null}

          <dl className="mt-4 space-y-2.5 rounded-sheet border border-ink-700 bg-ink-850 px-5 py-4 text-xs">
            <Meta label="Currency" value={currency} />
            <Meta label="Revision" value={String(document.revision)} />
            <Meta label="Created" value={formatDateTime(document.createdAt)} />
            {document.duplicatedFromId ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-mono uppercase tracking-[0.12em] text-quill-700">
                  Copied from
                </dt>
                <dd>
                  <Link
                    href={`/documents/${document.duplicatedFromId}`}
                    className="text-brass-400 underline-offset-4 hover:underline"
                  >
                    original
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
        </aside>
      </div>
    </div>
  );
}

/* --- Small parchment-surface helpers ------------------------------------ */

function SheetField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-500"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SheetInput({
  id,
  value,
  onChange,
  readOnly,
  placeholder,
  type = 'text',
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  type?: string;
  error?: string;
}) {
  return (
    <div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`h-9 w-full rounded-[2px] border bg-parchment-50 px-2.5 text-sm text-ink-900 outline-none transition-colors placeholder:text-parchment-400 read-only:border-transparent read-only:bg-transparent ${
          error
            ? 'border-oxblood-500'
            : 'border-parchment-300 focus:border-ink-600 focus:bg-white'
        }`}
      />
      {error ? (
        <p role="alert" className="mt-1 text-[0.6875rem] text-oxblood-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-mono uppercase tracking-[0.12em] text-quill-700">{label}</dt>
      <dd className="text-quill-300">{value}</dd>
    </div>
  );
}
