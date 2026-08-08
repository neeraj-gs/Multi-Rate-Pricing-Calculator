'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';

import { api, ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

type Mode = 'login' | 'signup';

/**
 * Sign-in and sign-up.
 *
 * One component for both because the flows differ by two fields and a verb;
 * two near-identical files would drift the moment either changed.
 *
 * Error handling is the part worth reading: the server returns field-level
 * `details`, and each is attached to the input that caused it. A form that
 * reports "validation failed" at the top makes the person hunt for the field.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const isSignup = mode === 'signup';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const payload = isSignup
      ? {
          name: String(form.get('name') ?? '').trim(),
          email: String(form.get('email') ?? '').trim(),
          password: String(form.get('password') ?? ''),
          company: String(form.get('company') ?? '').trim(),
        }
      : {
          email: String(form.get('email') ?? '').trim(),
          password: String(form.get('password') ?? ''),
        };

    try {
      await api.post(`/auth/${mode}`, payload);
      // A full navigation, not a client push: the session cookie has just
      // changed and the server components need to render against the new one.
      const next = searchParams.get('next');
      window.location.href = next?.startsWith('/') ? next : '/dashboard';
    } catch (error) {
      if (error instanceof ApiClientError) {
        const mapped: Record<string, string> = {};
        for (const detail of error.details) {
          if (detail.path) mapped[detail.path] = detail.message;
        }
        setFieldErrors(mapped);
        // Only surface a form-level message when no field claimed the error.
        setFormError(Object.keys(mapped).length > 0 ? null : error.message);
      } else {
        setFormError('Could not reach the server. Check your connection and try again.');
      }
      setPending(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-quill-100">
        {isSignup ? 'Create your account' : 'Sign in'}
      </h1>
      <p className="mt-2 text-sm text-quill-500">
        {isSignup
          ? 'Your documents are yours alone. Nobody else can see them.'
          : 'Welcome back. Pick up where you left off.'}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-sheet border border-oxblood-700 bg-oxblood-500/10 px-3.5 py-3 text-sm text-oxblood-300"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{formError}</span>
          </div>
        ) : null}

        {isSignup ? (
          <>
            <Field label="Your name" htmlFor="name" error={fieldErrors.name}>
              <Input name="name" autoComplete="name" required placeholder="Neeraj GS" />
            </Field>
            <Field
              label="Company"
              htmlFor="company"
              hint="optional"
              error={fieldErrors.company}
            >
              <Input
                name="company"
                autoComplete="organization"
                placeholder="Acme Trading LLC"
              />
            </Field>
          </>
        ) : null}

        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint={isSignup ? 'at least 10 characters' : undefined}
          error={fieldErrors.password}
        >
          <Input
            name="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            placeholder="••••••••••"
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          {isSignup ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-quill-500">
        {isSignup ? 'Already have an account? ' : 'No account yet? '}
        <Link
          href={isSignup ? '/login' : '/signup'}
          className="text-brass-400 underline-offset-4 hover:underline"
        >
          {isSignup ? 'Sign in' : 'Create one'}
        </Link>
      </p>

      {!isSignup ? (
        <p className="mt-8 rounded-sheet border border-ink-700 bg-ink-850 px-4 py-3 text-center font-mono text-xs leading-relaxed text-quill-500">
          Demo account
          <br />
          <span className="text-quill-300">demo@tessera.app</span> ·{' '}
          <span className="text-quill-300">demo-password-2026</span>
        </p>
      ) : null}
    </div>
  );
}
