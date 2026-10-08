/**
 * Server state with stale-while-revalidate, as a scripted exchange between a component, a query cache and a
 * server. The server is simulated. The two modes differ in one thing: whether the component reads the cache
 * on every render (SWR) or copies the first value it saw into its own local state (the anti-pattern).
 */

export type SwrMode = 'swr' | 'copy';
export type SwrActor = 'ui' | 'cache' | 'server';

export interface SwrMessage {
  id: string;
  from: SwrActor;
  to: SwrActor;
  label: string;
  lost?: boolean;
}

export interface SwrFrame {
  /** Index of the message that just happened; -1 before any. */
  step: number;
  server: number;
  cache: number | null;
  /** What the component is showing: null while it has nothing to show yet. */
  ui: number | null;
  /** Identifies what the frame is about, for the caption. */
  event:
    | 'intro' | 'ask' | 'miss' | 'stored' | 'fresh' | 'edit' | 'revisit' | 'instant' | 'copied' | 'revalidate' | 'updated' | 'refreshed' | 'drift';
}

export const FIRST_PRICE = 12;
export const PRICE_RANGE = { min: 1, max: 30 } as const;

export function swrMessages(serverPrice: number, mode: SwrMode): SwrMessage[] {
  return [
    { id: 'ask', from: 'ui', to: 'cache', label: 'read price' },
    { id: 'miss', from: 'cache', to: 'server', label: 'GET /price (nothing cached)' },
    { id: 'stored', from: 'server', to: 'cache', label: String(FIRST_PRICE) },
    { id: 'fresh', from: 'cache', to: 'ui', label: String(FIRST_PRICE) },
    { id: 'edit', from: 'server', to: 'server', label: `price is now ${serverPrice}` },
    { id: 'revisit', from: 'ui', to: 'cache', label: 'read price again' },
    { id: 'instant', from: 'cache', to: 'ui', label: `${FIRST_PRICE} (cached)` },
    { id: 'revalidate', from: 'cache', to: 'server', label: 'GET /price (revalidate)' },
    { id: 'updated', from: 'server', to: 'cache', label: String(serverPrice) },
    { id: 'refreshed', from: 'cache', to: 'ui', label: mode === 'swr' ? String(serverPrice) : `${serverPrice} (nobody listens)`, lost: mode === 'copy' },
  ];
}

export function swrFrames(serverPrice: number, mode: SwrMode): SwrFrame[] {
  const frame = (step: number, event: SwrFrame['event'], s: Pick<SwrFrame, 'server' | 'cache' | 'ui'>): SwrFrame => ({ step, event, ...s });
  const final = mode === 'swr' ? serverPrice : FIRST_PRICE;
  return [
    frame(-1, 'intro', { server: FIRST_PRICE, cache: null, ui: null }),
    frame(0, 'ask', { server: FIRST_PRICE, cache: null, ui: null }),
    frame(1, 'miss', { server: FIRST_PRICE, cache: null, ui: null }),
    frame(2, 'stored', { server: FIRST_PRICE, cache: FIRST_PRICE, ui: null }),
    frame(3, 'fresh', { server: FIRST_PRICE, cache: FIRST_PRICE, ui: FIRST_PRICE }),
    frame(4, 'edit', { server: serverPrice, cache: FIRST_PRICE, ui: FIRST_PRICE }),
    frame(5, 'revisit', { server: serverPrice, cache: FIRST_PRICE, ui: FIRST_PRICE }),
    frame(6, mode === 'swr' ? 'instant' : 'copied', { server: serverPrice, cache: FIRST_PRICE, ui: FIRST_PRICE }),
    frame(7, 'revalidate', { server: serverPrice, cache: FIRST_PRICE, ui: FIRST_PRICE }),
    frame(8, 'updated', { server: serverPrice, cache: serverPrice, ui: FIRST_PRICE }),
    frame(9, mode === 'swr' ? 'refreshed' : 'drift', { server: serverPrice, cache: serverPrice, ui: final }),
  ];
}

/** The UI is stale when it shows a number the server no longer has. */
export const isStale = (f: Pick<SwrFrame, 'server' | 'ui'>): boolean => f.ui !== null && f.ui !== f.server;
