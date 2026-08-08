import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import { Toaster } from 'sonner';

import './globals.css';

/*
 * Fonts are self-hosted by next/font at build time — no request to a third
 * party at runtime, no layout shift, and no external origin that can see who is
 * reading a customer's quote.
 */

/**
 * One family for both display and interface, separated by the `wdth` axis
 * rather than by adding a second typeface.
 *
 * Headlines run at width 112 and weight 700 — architectural, slightly
 * expanded, tightly tracked — while body text stays at normal width. Same
 * voice, different register, and one font file instead of two.
 */
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
  axes: ['wdth'],
});

/** Every monetary figure, every label. */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Tessera — pricing that ties out',
    template: '%s · Tessera',
  },
  description:
    'Build quotes with per-line discounts and tax, computed server-side in exact integer arithmetic. Finalize a document and it never changes again.',
  applicationName: 'Tessera',
  authors: [{ name: 'Neeraj GS' }],
  openGraph: {
    title: 'Tessera — pricing that ties out',
    description:
      'Per-line discounts and tax, computed server-side in exact integer arithmetic. Subtotal minus discount plus tax equals the grand total, every time.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0b0f1a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-ink-900 antialiased">
        {/* Keyboard users reach the content without tabbing the whole nav. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sheet focus:bg-brass-500 focus:px-4 focus:py-2 focus:font-mono focus:text-sm focus:text-ink-950"
        >
          Skip to content
        </a>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#121826',
              border: '1px solid #232d42',
              color: '#ece9e3',
              borderRadius: '3px',
              fontFamily: 'var(--font-archivo)',
            },
          }}
        />
      </body>
    </html>
  );
}
