'use client';

import * as React from 'react';
import { Menu, X } from 'lucide-react';

import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';

/**
 * The application chrome.
 *
 * Holds the two pieces of state that belong to the shell rather than to any
 * page: whether the command palette is open, and whether the sidebar is showing
 * on a narrow screen. Everything else is the page's own business.
 */
export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop navigation. */}
      <aside className="sticky top-0 hidden h-dvh lg:block">
        <Sidebar user={user} onOpenCommandPalette={() => setPaletteOpen(true)} />
      </aside>

      {/* Mobile navigation, as an overlay. */}
      {navOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
            onClick={() => setNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64">
            <Sidebar
              user={user}
              onOpenCommandPalette={() => {
                setNavOpen(false);
                setPaletteOpen(true);
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-800 bg-ink-900/85 px-4 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen((open) => !open)}
            aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
            className="rounded-sheet p-2 text-quill-300 hover:bg-ink-800"
          >
            {navOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <span className="font-display text-base text-quill-100">
            LedgerLine
          </span>
        </header>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
