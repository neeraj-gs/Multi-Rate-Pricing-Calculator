'use client';

import dynamic from 'next/dynamic';

/**
 * Client boundary for the 3D hero.
 *
 * `ssr: false` is only available inside a client component, and the landing
 * page itself must stay a server component so it can call the pricing engine
 * directly. This one-line module is the seam between the two — and it keeps
 * three.js out of the initial bundle, so the headline paints without waiting
 * for a renderer.
 */
const LedgerScene = dynamic(() => import('./LedgerScene'), { ssr: false });

export function SceneMount() {
  return <LedgerScene />;
}
