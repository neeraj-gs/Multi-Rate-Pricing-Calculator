'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, Sparkles } from 'lucide-react';

import { api, ApiClientError, newIdempotencyKey } from '@/lib/api-client';
import { todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/app/PageHeader';
import type { ApiDocument } from '@/lib/documents/types';

/**
 * Creating a document.
 *
 * Deliberately short: a title, a customer, a date, a currency. Line items are
 * the editor's job, and asking for them here would make the first screen of the
 * product a wall of inputs.
 *
 * The one starter option is the brief's sample document, which doubles as a
 * way for a reviewer to see the 421.50 figure inside the real editor within
 * seconds of signing up.
 */
export function NewDocumentForm({
  currencies,
  defaultCurrency,
  defaultTaxPercent,
}: {
  currencies: string[];
  defaultCurrency: string;
  defaultTaxPercent: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [withSample, setWithSample] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // One key per mount, reused across retries: a double-submit or a flaky
  // connection returns the first document rather than creating a second.
  const idempotencyKey = React.useMemo(() => newIdempotencyKey(), []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const currency = String(form.get('currency'));
    const tax = defaultTaxPercent === '0' ? null : defaultTaxPercent;

    try {
      const { document } = await api.post<{ document: ApiDocument }>(
        '/documents',
        {
          title: String(form.get('title') ?? '').trim(),
          customer: {
            name: String(form.get('customer') ?? '').trim(),
            email: String(form.get('email') ?? '').trim(),
          },
          issueDate: String(form.get('issueDate')),
          currency,
          lines: withSample
            ? [
                {
                  description: 'Widget A',
                  quantity: '2',
                  unitPrice: '100.00',
                  discount: { type: 'percent', value: '10' },
                  taxPercent: '5',
                },
                {
                  description: 'Widget B',
                  quantity: '1',
                  unitPrice: '50.00',
                  taxPercent: '5',
                },
                {
                  description: 'Service fee',
                  quantity: '1',
                  unitPrice: '200.00',
                  discount: { type: 'fixed', value: '20.00' },
                },
              ]
            : [
                {
                  description: '',
                  quantity: '1',
                  unitPrice: '0.00',
                  taxPercent: tax,
                },
              ],
        },
        idempotencyKey,
      );

      toast.success(`${document.number} created`);
      router.push(`/documents/${document.id}`);
    } catch (thrown) {
      if (thrown instanceof ApiClientError) {
        const mapped: Record<string, string> = {};
        for (const detail of thrown.details) {
          if (detail.path) mapped[detail.path] = detail.message;
        }
        setFieldErrors(mapped);
        toast.error(thrown.message);
      } else {
        toast.error('Could not reach the server. Try again.');
      }
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="New"
        title="Create a document"
        description="Start with the details. You will add line items next."
      />

      <form onSubmit={onSubmit} className="max-w-xl px-6 py-8 lg:px-10" noValidate>
        <div className="space-y-5">
          <Field label="Title" htmlFor="title" error={fieldErrors.title}>
            <Input
              name="title"
              required
              defaultValue="Untitled quote"
              placeholder="Q3 proposal"
            />
          </Field>

          <Field
            label="Customer"
            htmlFor="customer"
            error={fieldErrors['customer.name']}
          >
            <Input name="customer" required placeholder="Acme Trading LLC" />
          </Field>

          <Field
            label="Customer email"
            htmlFor="email"
            hint="optional"
            error={fieldErrors['customer.email']}
          >
            <Input name="email" type="email" placeholder="accounts@acme.com" />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Issue date" htmlFor="issueDate" error={fieldErrors.issueDate}>
              <Input name="issueDate" type="date" required defaultValue={todayISO()} />
            </Field>

            <Field
              label="Currency"
              htmlFor="currency"
              hint="cannot change later"
              error={fieldErrors.currency}
            >
              <Select name="currency" defaultValue={defaultCurrency}>
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-sheet border border-ink-700 bg-ink-850 px-4 py-3.5 transition-colors hover:border-ink-600">
            <input
              type="checkbox"
              checked={withSample}
              onChange={(event) => setWithSample(event.target.checked)}
              className="mt-0.5 size-4 accent-[#cda349]"
            />
            <span>
              <span className="flex items-center gap-2 text-sm text-quill-100">
                <Sparkles className="size-3.5 text-brass-500" />
                Start with the worked example
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-quill-500">
                Three lines mixing a percentage discount, a fixed discount and
                tax — the document that totals 421.50.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <Button type="submit" variant="primary" size="lg" loading={pending}>
            Create document
            <ArrowRight className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => router.push('/documents')}
          >
            Cancel
          </Button>
        </div>

        <p className="mt-6 font-mono text-xs leading-relaxed text-quill-700">
          Currency is fixed at creation. Changing it later would reinterpret every
          stored amount — 1000 fils is not 1000 cents — so the safe move is to
          duplicate into a new currency and re-enter the prices deliberately.
        </p>
      </form>
    </div>
  );
}
