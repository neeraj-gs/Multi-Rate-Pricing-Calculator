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
  PanelRightClose,
  PanelRightOpen,
  Save,
  Trash2,
} from 'lucide-react';

import { api, ApiClientError, newIdempotencyKey } from '@/lib/api-client';
import { SUPPORTED_CURRENCIES } from '@/lib/pricing';
import { cn, currencySymbol, formatDateTime, todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  StatusBadge,
} from '@/components/ui/primitives';
import type { ApiDocument, DraftLine } from '@/lib/documents/types';

import { LineItemEditor } from './LineItemEditor';
import { DocumentViewer } from './DocumentViewer';
import type { DocumentPageProps } from './DocumentPage';
import { usePricingPreview, toLineInput } from './usePricingPreview';

/**
 * The document workspace.
 *
 * Controls on the left, the document itself on the right, updating as you
 * type. The point of the split is that you are never editing an abstraction of
 * a quote — you are watching the thing you are about to send take shape, and
 * the preview is the *same component* the PDF and the share link render, so
 * there is nothing to be surprised by later.
 *
 * ## Where the numbers come from
 *
 * Nowhere in this component is a monetary value computed. Editing a field
 * updates local text, a debounced request asks the server what that text is
 * worth, and the answer is rendered onto the page. The client never does
 * arithmetic; it just asks faster.
 *
 * ## Where immutability is enforced
 *
 * In the API, not here. A finalized document hides its editing controls
 * because a permanent record dressed as a form invites an edit the server is
 * only going to refuse — but if this rendered them anyway, every request would
 * still come back 409.
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
  issuer,
}: {
  initial: ApiDocument;
  /** From the account's preferences; applied to newly added lines. */
  defaultTaxPercent?: string;
  issuer?: { name: string; company: string };
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
  // Local, so the preview re-prices in the new currency as soon as it is
  // picked — including surfacing a value that will not fit its precision,
  // before you save rather than after.
  const [currency, setCurrency] = React.useState(initial.currency);
  const [lines, setLines] = React.useState<DraftLine[]>(() => toDraftLines(initial));

  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<ApiClientError | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(initial.updatedAt);
  const [previewOpen, setPreviewOpen] = React.useState(true);

  const readOnly = !document.editable;
  const symbol = currencySymbol(currency);

  const { preview, pending, error, latencyMs, fieldErrors } = usePricingPreview(
    lines,
    currency,
  );

  // Merge the two sources of field-level errors so an input shows whichever
  // arrived most recently, rather than a stale one from the other source.
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
        currency,
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
        currency: document.currency,
        lines: toDraftLines(document).map(toLineInput),
      }),
    [title, customerName, customerEmail, customerAddress, issueDate, dueDate, notes, currency, lines, document],
  );

  /* --- The live page ----------------------------------------------------- */

  const page: DocumentPageProps = React.useMemo(
    () => ({
      number: document.number,
      status: document.status,
      title,
      customer: {
        name: customerName,
        email: customerEmail,
        address: customerAddress,
      },
      issueDate,
      dueDate: dueDate || null,
      currency,
      notes,
      finalizedAt: document.finalizedAt,
      issuer,
      lines: lines.map((line, index) => {
        const computed = preview?.lines?.[index];
        return {
          id: line.key,
          description: line.description,
          // Normalised by the engine, so the page shows what will be stored —
          // 100.00 reads as 100.000 the moment the currency becomes KWD,
          // rather than lagging the rest of the figures until the next save.
          quantity: computed?.quantity ?? line.quantity ?? '—',
          unitPrice: computed?.unitPrice ?? line.unitPrice ?? '0.00',
          discountLabel:
            line.discountType === 'none' || line.discountValue.trim() === ''
              ? null
              : line.discountType === 'percent'
                ? `${line.discountValue}%`
                : // A three-letter code needs a space; a single glyph hugs.
                  `${symbol}${symbol.length > 1 ? ' ' : ''}${line.discountValue}`,
          discountAmount: computed?.discountAmount ?? '0.00',
          taxPercent: line.taxPercent.trim() === '' ? null : line.taxPercent,
          taxAmount: computed?.taxAmount ?? '0.00',
          total: computed?.total ?? '—',
        };
      }),
      totals: preview?.totals
        ? {
            subtotal: preview.totals.subtotal,
            totalDiscount: preview.totals.totalDiscount,
            totalTax: preview.totals.totalTax,
            grandTotal: preview.totals.grandTotal,
          }
        : null,
    }),
    [document, title, customerName, customerEmail, customerAddress, issueDate, dueDate, currency, notes, issuer, lines, preview, symbol],
  );

  /* --- Line editing ------------------------------------------------------ */

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

  /* --- Persistence -------------------------------------------------------- */

  const save = React.useCallback(async (): Promise<boolean> => {
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
          currency,
          lines: lines.map(toLineInput),
          // Echoing the revision turns a concurrent edit into a 409 we can
          // explain, instead of silently overwriting the other tab.
          revision: document.revision,
        },
      );
      setDocument(updated);
      setLines(toDraftLines(updated));
      setCurrency(updated.currency);
      setSavedAt(updated.updatedAt);
      toast.success('Changes saved');
      return true;
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
      return false;
    } finally {
      setSaving(false);
    }
  }, [document, title, customerName, customerEmail, customerAddress, issueDate, dueDate, notes, lines]);

  /**
   * The PDF always reflects what is *stored*, so an unsaved edit is saved
   * first. Opening a PDF that silently omits the change you just made is the
   * kind of thing you only discover after sending it.
   */
  async function openPdf() {
    setBusy('pdf');
    if (dirty && !readOnly) {
      const ok = await save();
      if (!ok) {
        setBusy(null);
        return;
      }
    }
    setBusy(null);
    router.push(`/documents/${document.id}/print`);
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
      setCurrency(updated.currency);
      toast.success(`${updated.number} finalized. It is now read-only.`);
    } catch (thrown) {
      const apiError = thrown as ApiClientError;
      // A finalize refusal usually lists several reasons; showing only the
      // first would send the user round the loop once per problem.
      toast.error(apiError.message, {
        description: apiError.details?.map((detail) => detail.message).join(' '),
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

  /* --- Keyboard ----------------------------------------------------------- */

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        if (!readOnly && dirty) void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readOnly, dirty, save]);

  /* --- Render -------------------------------------------------------------- */

  return (
    // Below lg the shell adds a 3.5rem mobile header, so a plain `h-dvh` here
    // overflows the viewport by exactly that much.
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh lg:min-h-0">
      {/* Command bar */}
      <header className="shrink-0 border-b border-ink-800 bg-ink-900">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 lg:px-6">
          <Button asChild variant="ghost" size="icon" aria-label="Back to documents">
            <Link href="/documents">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>

          <div className="flex min-w-0 items-center gap-2.5">
            <span className="whitespace-nowrap font-mono text-xs text-brass-400">
              {document.number}
            </span>
            <StatusBadge status={document.status} />
            {readOnly ? null : dirty ? (
              <span className="whitespace-nowrap font-mono text-[0.625rem] text-brass-300">
                Unsaved
              </span>
            ) : savedAt ? (
              <span className="hidden whitespace-nowrap font-mono text-[0.625rem] text-quill-700 sm:inline">
                Saved {formatDateTime(savedAt)}
              </span>
            ) : null}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewOpen((open) => !open)}
              className="hidden xl:inline-flex"
            >
              {previewOpen ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
              <span className="hidden 2xl:inline">
                {previewOpen ? 'Hide' : 'Show'} document
              </span>
            </Button>

            <Button variant="ghost" size="sm" onClick={share} loading={busy === 'share'}>
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
                        lines, amounts and details can never be changed again, and
                        it cannot be deleted — reports covering this period depend
                        on it staying exactly as it is.
                      </p>
                      <p className="text-quill-500">
                        If you need to change something later, duplicate it into a
                        new draft. The original stays as your customer received it.
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
                      {document.number} and its {document.lines.length} line items
                      will be removed permanently.
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
          <div className="flex items-center gap-2.5 border-t border-verdigris-700/50 bg-verdigris-500/[0.07] px-4 py-2 lg:px-6">
            <FileLock2 className="size-3.5 shrink-0 text-verdigris-400" />
            <p className="text-xs text-verdigris-300">
              Finalized {formatDateTime(document.finalizedAt)}. Read-only — duplicate
              it to make changes.
            </p>
          </div>
        ) : null}
      </header>

      {/* Workspace */}
      <div
        className={cn(
          'grid min-h-0 flex-1',
          previewOpen ? 'xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]' : 'xl:grid-cols-1',
        )}
      >
        {/* Controls */}
        <div className="min-h-0 space-y-4 overflow-y-auto border-ink-800 p-4 xl:border-r xl:p-5">
          <Details
            title={title}
            setTitle={setTitle}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerEmail={customerEmail}
            setCustomerEmail={setCustomerEmail}
            customerAddress={customerAddress}
            setCustomerAddress={setCustomerAddress}
            issueDate={issueDate}
            setIssueDate={setIssueDate}
            dueDate={dueDate}
            setDueDate={setDueDate}
            currency={currency}
            setCurrency={setCurrency}
            currencyChanged={currency !== document.currency}
            readOnly={readOnly}
            errors={combinedFieldErrors}
          />

          <LineItemEditor
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

          {/* Notes: its own titled section, not an afterthought at the bottom
              of a long page where nobody found it. */}
          <section className="rounded-sheet border border-ink-700 bg-ink-850">
            <header className="flex items-center justify-between border-b border-ink-700 px-5 py-3.5">
              <h2 className="font-display text-base text-quill-100">Notes</h2>
              <span className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-quill-700">
                shown on the document
              </span>
            </header>
            <div className="p-4">
              <Textarea
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                readOnly={readOnly}
                placeholder="Payment terms, delivery timelines, anything the customer should read."
                aria-label="Notes"
              />
            </div>
          </section>

          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-sheet border border-ink-700 bg-ink-700 text-xs">
            <Meta label="Status" value={document.status} />
            <Meta label="Revision" value={String(document.revision)} />
            <Meta label="Lines" value={String(lines.length)} />
          </dl>

          {document.duplicatedFromId ? (
            <p className="text-xs text-quill-700">
              Copied from{' '}
              <Link
                href={`/documents/${document.duplicatedFromId}`}
                className="text-brass-400 underline-offset-4 hover:underline"
              >
                the original document
              </Link>
              .
            </p>
          ) : null}
        </div>

        {/* The document */}
        <div className={cn('min-h-0', previewOpen ? 'hidden xl:flex' : 'hidden')}>
          <DocumentViewer
            page={page}
            status={pending ? 'computing' : preview ? 'ready' : 'idle'}
            latencyMs={latencyMs}
            error={error?.message ?? null}
            onDownload={openPdf}
            downloading={busy === 'pdf'}
            className="w-full"
          />
        </div>
      </div>

      {/* Below xl there is no room for a split, so the document is one tap away. */}
      <div className="shrink-0 border-t border-ink-800 bg-ink-900 p-3 xl:hidden">
        <Button variant="secondary" className="w-full" onClick={openPdf} loading={busy === 'pdf'}>
          View document
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Details(props: {
  title: string;
  setTitle: (value: string) => void;
  customerName: string;
  setCustomerName: (value: string) => void;
  customerEmail: string;
  setCustomerEmail: (value: string) => void;
  customerAddress: string;
  setCustomerAddress: (value: string) => void;
  issueDate: string;
  setIssueDate: (value: string) => void;
  dueDate: string;
  setDueDate: (value: string) => void;
  currency: string;
  setCurrency: (value: string) => void;
  currencyChanged: boolean;
  readOnly: boolean;
  errors: Record<string, string>;
}) {
  return (
    <section className="rounded-sheet border border-ink-700 bg-ink-850">
      <header className="border-b border-ink-700 px-5 py-3.5">
        <h2 className="font-display text-base text-quill-100">Details</h2>
      </header>

      <div className="space-y-3.5 p-4">
        <Input
          label="Title"
          value={props.title}
          onChange={props.setTitle}
          readOnly={props.readOnly}
          placeholder="Q3 platform renewal"
          error={props.errors.title}
        />
        <Input
          label="Customer"
          value={props.customerName}
          onChange={props.setCustomerName}
          readOnly={props.readOnly}
          placeholder="Acme Trading LLC"
          error={props.errors['customer.name']}
        />
        <Input
          label="Customer email"
          value={props.customerEmail}
          onChange={props.setCustomerEmail}
          readOnly={props.readOnly}
          type="email"
          placeholder="accounts@acme.com"
          error={props.errors['customer.email']}
        />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input
            label="Issue date"
            value={props.issueDate}
            onChange={props.setIssueDate}
            readOnly={props.readOnly}
            type="date"
            error={props.errors.issueDate}
          />
          <Input
            label="Due date"
            value={props.dueDate}
            onChange={props.setDueDate}
            readOnly={props.readOnly}
            type="date"
            error={props.errors.dueDate}
          />
        </div>
        <Input
          label="Billing address"
          value={props.customerAddress}
          onChange={props.setCustomerAddress}
          readOnly={props.readOnly}
          placeholder="Office 1204, Boulevard Plaza Tower 1, Dubai"
        />

        <div>
          <label
            htmlFor="doc-currency"
            className="mb-1.5 block font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-quill-700"
          >
            Currency
          </label>
          {props.readOnly ? (
            <p className="tabular text-sm text-quill-100">{props.currency}</p>
          ) : (
            <select
              id="doc-currency"
              value={props.currency}
              onChange={(event) => props.setCurrency(event.target.value)}
              aria-invalid={Boolean(props.errors.currency)}
              className={cn(
                'h-9 w-full appearance-none rounded-sheet border bg-ink-900 px-2.5 text-sm text-quill-100 transition-colors',
                'focus:border-brass-600 focus:bg-ink-800',
                "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%237f8b9f%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:16px] bg-[position:right_0.6rem_center] bg-no-repeat",
                props.errors.currency ? 'border-oxblood-500' : 'border-ink-600',
              )}
            >
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          )}

          {/*
            Prices keep the numbers you typed; only their precision changes.
            Saying so up front is the difference between a deliberate switch and
            a moment of "did that just move every price?".
          */}
          {props.currencyChanged ? (
            <p className="mt-2 rounded-sheet border border-brass-700 bg-brass-500/10 px-3 py-2 text-[0.6875rem] leading-relaxed text-brass-300">
              Amounts keep the values you entered and are re-priced at{' '}
              {props.currency}&rsquo;s precision. A price with more decimals than{' '}
              {props.currency} supports will be reported rather than rounded away.
            </p>
          ) : null}

          {props.errors.currency ? (
            <p role="alert" className="mt-1 text-[0.6875rem] text-oxblood-300">
              {props.errors.currency}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  type = 'text',
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  type?: string;
  error?: string;
}) {
  const id = React.useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-quill-700"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={cn(
          'h-9 w-full rounded-sheet border bg-ink-900 px-2.5 text-sm text-quill-100 transition-colors',
          'placeholder:text-quill-700 focus:border-brass-600 focus:bg-ink-800',
          'read-only:border-transparent read-only:bg-transparent read-only:px-0',
          error ? 'border-oxblood-500' : 'border-ink-600',
        )}
      />
      {error ? (
        <p role="alert" className="mt-1 text-[0.6875rem] text-oxblood-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-850 px-3 py-2.5">
      <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-quill-700">
        {label}
      </dt>
      <dd className="tabular mt-1 text-quill-300">{value}</dd>
    </div>
  );
}
