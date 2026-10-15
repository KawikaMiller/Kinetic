import { useState } from 'react';
import { DEFAULT_FRAMES, DEFAULT_SEED, SCAN, SKEW, checkpoint, newPool, request, take, togglePin, workload, type Policy, type Pool } from './pool';

export type ClickMode = 'read' | 'write';
/** Requests one press of "Run" serves. */
export const BATCH = 50;

export interface PoolState {
  pool: Pool;
  policy: Policy;
  seed: number;
  skew: number;
  mode: ClickMode;
  setPolicy: (p: Policy) => void;
  setSeed: (s: number) => void;
  setSkew: (s: number) => void;
  setMode: (m: ClickMode) => void;
  /** Serve the next `n` requests of the seeded workload. */
  serve: (n: number) => void;
  scan: () => void;
  click: (page: number) => void;
  pin: (frame: number) => void;
  checkpoint: () => void;
  reset: () => void;
}

/** The learner's pool, the seeded workload feeding it and how far into that stream it has got. */
export function usePoolState(): PoolState {
  const [policy, setPolicyState] = useState<Policy>('lru');
  const [pool, setPool] = useState<Pool>(() => newPool('lru', DEFAULT_FRAMES));
  const [seed, setSeedState] = useState(DEFAULT_SEED);
  const [skew, setSkewState] = useState<number>(SKEW.initial);
  const [served, setServed] = useState(0);
  const [mode, setMode] = useState<ClickMode>('read');

  const fresh = (p: Policy) => {
    setPool(newPool(p, DEFAULT_FRAMES));
    setServed(0);
  };
  return {
    pool, policy, seed, skew, mode, setMode,
    setPolicy: (p) => { setPolicyState(p); fresh(p); },
    setSeed: (s) => { setSeedState(s); fresh(policy); },
    setSkew: (s) => { setSkewState(s); fresh(policy); },
    serve: (n) => {
      const next = workload(seed, skew);
      take(next, served);
      let p = pool;
      for (const page of take(next, n)) p = request(p, { page });
      setPool(p);
      setServed(served + n);
    },
    scan: () => setPool(SCAN.reduce((p, r) => request(p, r), pool)),
    click: (page) => setPool(request(pool, { page, write: mode === 'write' })),
    pin: (frame) => setPool(togglePin(pool, frame)),
    checkpoint: () => setPool(checkpoint(pool)),
    reset: () => fresh(policy),
  };
}
