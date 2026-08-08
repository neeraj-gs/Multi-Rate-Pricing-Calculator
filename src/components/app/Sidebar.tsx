'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings,
  Sigma,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  user,
  onOpenCommandPalette,
}: {
  user: { name: string; email: string };
  onOpenCommandPalette: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function signOut() {
    setSigningOut(true);
    await api.post('/auth/logout').catch(() => undefined);
    // Full navigation so server components re-render without the session.
    window.location.href = '/login';
  }

  return (
    <div className="flex h-full flex-col border-r border-ink-800 bg-ink-950/60">
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-sheet border border-brass-700 bg-brass-500/10">
            <Sigma className="size-3.5 text-brass-400" />
          </span>
          <span className="font-display text-lg text-quill-100">
            Ledger<span className="text-brass-400">Line</span>
          </span>
        </Link>
      </div>

      <div className="space-y-2 px-3 pb-4">
        <Button
          asChild
          variant="primary"
          size="sm"
          className="w-full justify-start"
        >
          <Link href="/documents/new">
            <Plus className="size-4" />
            New document
          </Link>
        </Button>

        {/* The palette is the fast path; this button is how people find it. */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex w-full items-center gap-2 rounded-sheet border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-quill-500 transition-colors hover:border-ink-600 hover:text-quill-300"
        >
          <Search className="size-4" />
          <span>Search</span>
          <kbd className="ml-auto rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-[0.625rem] text-quill-500">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-sheet px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-ink-800 text-quill-100'
                  : 'text-quill-500 hover:bg-ink-850 hover:text-quill-300',
              )}
            >
              <item.icon
                className={cn('size-4', active ? 'text-brass-400' : 'text-quill-700')}
              />
              {/* The double rule marks the settled position, as it does a total. */}
              <span className={active ? 'double-rule text-brass-400/70' : undefined}>
                <span className={active ? 'text-quill-100' : undefined}>
                  {item.label}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-800 p-3">
        <div className="flex items-center gap-3 rounded-sheet px-2 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-ink-600 bg-ink-800 font-mono text-xs text-brass-400">
            {user.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-quill-300">{user.name}</p>
            <p className="truncate font-mono text-[0.6875rem] text-quill-700">
              {user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            aria-label="Sign out"
            className="rounded-sheet p-1.5 text-quill-700 transition-colors hover:bg-ink-800 hover:text-oxblood-300"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
