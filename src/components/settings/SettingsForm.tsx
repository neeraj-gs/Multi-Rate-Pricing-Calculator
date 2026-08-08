'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { api, ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';

/**
 * Preferences that become the defaults on a new document.
 *
 * Tax is entered as a percentage and sent as one; the server scales it by 100
 * before storing, the same way every other percentage in the system is stored.
 * Doing that conversion here would put a second scaling rule in the codebase.
 */
export function SettingsForm({
  currencies,
  initial,
}: {
  currencies: string[];
  initial: {
    name: string;
    company: string;
    currency: string;
    defaultTaxPercent: string;
    documentPrefix: string;
  };
}) {
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    try {
      await api.patch('/auth/me', {
        name: String(form.get('name') ?? '').trim(),
        company: String(form.get('company') ?? '').trim(),
        currency: String(form.get('currency')),
        defaultTaxPercent: Number(form.get('defaultTaxPercent') ?? 0),
        documentPrefix: String(form.get('documentPrefix') ?? '').trim(),
      });
      toast.success('Preferences saved');
    } catch (thrown) {
      if (thrown instanceof ApiClientError) {
        const mapped: Record<string, string> = {};
        for (const detail of thrown.details) {
          if (detail.path) mapped[detail.path] = detail.message;
        }
        setFieldErrors(mapped);
        toast.error(thrown.message);
      } else {
        toast.error('Could not reach the server.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5" noValidate>
      <Field label="Your name" htmlFor="name" error={fieldErrors.name}>
        <Input name="name" defaultValue={initial.name} required />
      </Field>

      <Field label="Company" htmlFor="company" error={fieldErrors.company}>
        <Input
          name="company"
          defaultValue={initial.company}
          placeholder="Shown on your documents"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Default currency" htmlFor="currency" error={fieldErrors.currency}>
          <Select name="currency" defaultValue={initial.currency}>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Default tax"
          htmlFor="defaultTaxPercent"
          hint="percent"
          error={fieldErrors.defaultTaxPercent}
        >
          <Input
            name="defaultTaxPercent"
            inputMode="decimal"
            defaultValue={initial.defaultTaxPercent}
            className="tabular text-right"
          />
        </Field>
      </div>

      <Field
        label="Document prefix"
        htmlFor="documentPrefix"
        hint="e.g. QT-0001"
        error={fieldErrors.documentPrefix}
      >
        <Input
          name="documentPrefix"
          defaultValue={initial.documentPrefix}
          maxLength={8}
          className="uppercase"
        />
      </Field>

      <Button type="submit" variant="primary" loading={pending}>
        Save preferences
      </Button>
    </form>
  );
}
