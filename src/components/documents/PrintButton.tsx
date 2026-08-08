'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * A one-control client island.
 *
 * Printing needs `window.print()`, and on the print route that is the only
 * interactive thing on the page — so it is the only part that ships
 * JavaScript.
 */
export function PrintButton({ label = 'Print / Save as PDF' }: { label?: string }) {
  return (
    <Button variant="primary" size="sm" onClick={() => window.print()}>
      <Printer className="size-4" />
      {label}
    </Button>
  );
}
