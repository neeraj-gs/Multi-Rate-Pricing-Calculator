'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * A one-control client island.
 *
 * Printing needs `window.print()`, and that is the only interactive thing on
 * the shared-document page — so it is the only part that ships JavaScript.
 */
export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      <Printer className="size-4" />
      Print
    </Button>
  );
}
