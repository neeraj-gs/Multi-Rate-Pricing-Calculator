'use client';

import * as React from 'react';
import { Check, Download, Loader2, TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DocumentPage, type DocumentPageProps } from './DocumentPage';

/**
 * The document viewer.
 *
 * A page on a dark canvas with a toolbar above it — the convention every PDF
 * reader uses, and the reason it needs no explanation: the dark part is the
 * application, the light part is the thing that gets printed.
 *
 * The page is rendered at a fixed A4-ish width and then *scaled* to fit its
 * column with a CSS transform, rather than reflowed. Reflowing would make the
 * preview lay out differently from the printed output, which defeats the point
 * of having a preview at all. Scaling keeps it a faithful miniature.
 */
/** The width the page is authored at — A4 at 96dpi. */
const PAGE_WIDTH = 794;
/** A4 height, so a short document still reads as a full sheet. */
const MIN_PAGE_HEIGHT = 1123;

export function DocumentViewer({
  page,
  status,
  latencyMs,
  error,
  onDownload,
  downloading,
  className,
}: {
  page: DocumentPageProps;
  /** Where the figures on the page came from. */
  status: 'idle' | 'computing' | 'ready';
  latencyMs?: number | null;
  error?: string | null;
  onDownload?: () => void;
  downloading?: boolean;
  className?: string;
}) {
  const frame = React.useRef<HTMLDivElement>(null);
  const sheet = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  const [pageHeight, setPageHeight] = React.useState(MIN_PAGE_HEIGHT);

  React.useEffect(() => {
    const container = frame.current;
    if (!container) return;

    const fit = () => {
      const available = container.clientWidth - 48; // breathing room either side
      setScale(Math.min(1, Math.max(0.4, available / PAGE_WIDTH)));
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /*
   * A CSS transform does not change layout size, so the scaled page would
   * still reserve its full unscaled height and leave a long dead scroll below
   * it. Measuring the real content height and reserving `height * scale` on
   * the wrapper is what keeps the scroll container honest.
   */
  React.useEffect(() => {
    const element = sheet.current;
    if (!element) return;

    const measure = () =>
      setPageHeight(Math.max(MIN_PAGE_HEIGHT, element.scrollHeight));

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [page]);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-ink-800 bg-ink-950/80 px-4 py-2.5">
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-quill-700">
          Document preview
        </span>

        <span className="ml-auto flex items-center gap-1.5 font-mono text-[0.625rem] text-quill-700">
          {status === 'computing' ? (
            <>
              <Loader2 className="size-3 animate-spin text-brass-400" />
              computing…
            </>
          ) : error ? (
            <>
              <TriangleAlert className="size-3 text-oxblood-400" />
              <span className="text-oxblood-300">last valid figures shown</span>
            </>
          ) : status === 'ready' ? (
            <>
              <Check className="size-3 text-verdigris-400" />
              server-computed{latencyMs != null ? ` · ${latencyMs}ms` : ''}
            </>
          ) : null}
        </span>

        {onDownload ? (
          <Button variant="secondary" size="sm" onClick={onDownload} loading={downloading}>
            <Download className="size-3.5" />
            PDF
          </Button>
        ) : null}
      </div>

      {/* Canvas */}
      <div
        ref={frame}
        className="tessellate min-h-0 flex-1 overflow-y-auto bg-ink-950 py-6"
      >
        <div
          className="mx-auto shadow-[0_2px_6px_rgba(0,0,0,0.5),0_30px_70px_-24px_rgba(0,0,0,0.85)]"
          style={{ width: PAGE_WIDTH * scale, height: pageHeight * scale }}
        >
          <div
            ref={sheet}
            style={{
              width: PAGE_WIDTH,
              minHeight: MIN_PAGE_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <DocumentPage {...page} />
          </div>
        </div>
      </div>
    </div>
  );
}
