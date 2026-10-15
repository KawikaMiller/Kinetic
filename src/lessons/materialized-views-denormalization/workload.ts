import { mulberry32 } from '../../core/random';
import { differences, inconsistentCopies, initState, read, seededWorld, viewRows, write, type Config, type Strategy, type Write, type World } from './shop';

export const WORLD_SEED = 3;
/** Writes in the workload the totals table runs, and the reads-per-write slider range. */
export const WRITES = 20;
export const RATIO = { min: 0.05, max: 1000, initial: 10 } as const;
/** Reads served after the first k writes of a workload at atio reads per write: round(ratio x k), so a ratio below 1 spaces the reads out. */
export const readsAfter = (ratio: number, k: number): number => Math.round(ratio * k);
/** The full-refresh view is rebuilt this often in the workload scenes; the staleness scene has its own slider. */
export const WORKLOAD_REFRESH_EVERY = 10;
export const STALENESS_REFRESH = { min: 1, max: 50, initial: 10 } as const;

/** The odds of each kind of write in the seeded workload. */
export const MIX = { place: 0.6, refund: 0.25, rename: 0.15 } as const;

export const WORKLOAD_CONFIG: Config = { refreshEvery: WORKLOAD_REFRESH_EVERY, fix: 'none' };

/** One row of the totals table: a strategy with the configuration it is priced under. The copy appears twice, left alone and with its rename fix, because the first is cheap and wrong. */
export interface Contender { id: string; label: string; strategy: Strategy; cfg: Config }
export const CONTENDERS: readonly Contender[] = [
  { id: 'live', label: 'Live join', strategy: 'live', cfg: WORKLOAD_CONFIG },
  { id: 'full', label: 'View, full refresh', strategy: 'full', cfg: WORKLOAD_CONFIG },
  { id: 'incremental', label: 'View, incremental', strategy: 'incremental', cfg: WORKLOAD_CONFIG },
  { id: 'copy-none', label: 'Copy, never fixed', strategy: 'copy', cfg: WORKLOAD_CONFIG },
  { id: 'copy-update', label: 'Copy, fixed on rename', strategy: 'copy', cfg: { ...WORKLOAD_CONFIG, fix: 'update' } },
];

/** The write that renames a product for the n-th time: one name, shared by the workload, the scenes' button and the try-this text. */
export const renameWrite = (w: World, productId: number, n: number): Write => ({ kind: 'rename', productId, name: `${w.products[productId - 1].name} v${n}` });

/** `n` seeded writes against a world: orders placed, items refunded, products renamed. The same seed gives the same writes for every strategy. */
export function seededWrites(w: World, seed: number, n: number): Write[] {
  const rnd = mulberry32(seed);
  const items = w.items.map((i) => i.id);
  let nextItem = w.nextItem;
  const out: Write[] = [];
  for (let k = 0; k < n; k++) {
    const roll = rnd();
    if (roll < MIX.place || items.length === 0) {
      out.push({ kind: 'place', customerId: 1 + Math.floor(rnd() * w.customers.length), productId: 1 + Math.floor(rnd() * w.products.length), qty: 1 + Math.floor(rnd() * 4) });
      items.push(nextItem++);
    } else if (roll < MIX.place + MIX.refund) {
      const at = Math.floor(rnd() * items.length);
      out.push({ kind: 'refund', itemId: items[at] });
      items.splice(at, 1);
    } else {
      const productId = 1 + Math.floor(rnd() * w.products.length);
      out.push(renameWrite(w, productId, k + 1));
    }
  }
  return out;
}

/** Total rows touched by a workload: `writes` seeded writes, each followed by `ratio` dashboard reads, every operation counted where it happens. `right` is whether the answer equals the live query once it ends. */
export function workloadTotal(strategy: Strategy, cfg: Config, ratio: number, writes = WRITES, seed = WORLD_SEED): { reads: number; writes: number; total: number; right: boolean } {
  const world = seededWorld(seed);
  let state = initState(strategy, world);
  let readRows = 0;
  let writeRows = 0;
  let served = 0;
  for (const [k, op] of seededWrites(world, seed, writes).entries()) {
    const w = write(strategy, cfg, state, op);
    state = w.state;
    writeRows += w.touched;
    const due = readsAfter(ratio, k + 1) - served;
    served += due;
    for (let r = 0; r < due; r++) {
      const got = read(strategy, cfg, state);
      state = got.state;
      readRows += got.touched;
    }
  }
  const right = differences(strategy, cfg, state).length === 0 && (strategy !== 'copy' || inconsistentCopies(state.world) === 0);
  return { reads: readRows, writes: writeRows, total: readRows + writeRows, right };
}

/** Every contender priced on the workload; `right` says its answer equals the live query after the last write. */
export const contenderTotals = (ratio: number) => CONTENDERS.map((c) => ({ ...c, ...workloadTotal(c.strategy, c.cfg, ratio) }));

/** The cheapest contender whose answer is right at the end: a cheaper wrong answer is not the same product. */
export const cheapestRight = <T extends { total: number; right: boolean }>(rows: readonly T[]): T => rows.filter((r) => r.right).reduce((a, b) => (b.total < a.total ? b : a));

// ── The rows-touched formulas, stated without running anything ─────────

export type Kind = Write['kind'];

/** Rows one write touches, from the table sizes. `copies` is how many items carry the renamed product. */
export function writeFormula(strategy: Strategy, cfg: Config, size: { items: number; copies: number }, kind: Kind): number {
  const base = { place: 2, refund: 2, rename: 1 }[kind];
  if (strategy === 'incremental') return base + { place: 4, refund: 5, rename: 2 }[kind];
  if (strategy === 'copy' && kind === 'rename' && cfg.fix === 'update') return base + size.items + size.copies;
  return base;
}

/** Rows one dashboard read touches. */
export function readFormula(strategy: Strategy, cfg: Config, w: World): number {
  const tables = { items: w.items.length, orders: w.orders.length, products: w.products.length };
  if (strategy === 'live' || (strategy === 'copy' && cfg.fix === 'recompute')) return tables.items + tables.orders + tables.products;
  if (strategy === 'copy') return tables.items + tables.orders;
  return viewRows(w);
}

/** Rows a full refresh touches: read every table, write every view row. */
export const refreshFormula = (w: World): number => w.items.length + w.orders.length + w.products.length + viewRows(w);

/** Expected rows for one write plus `ratio` reads, on a world of fixed size: the formulas weighted by the write mix, plus the amortised refresh. */
export function cycleCost(strategy: Strategy, cfg: Config, w: World, ratio: number): number {
  const copies = w.items.length / w.products.length;
  const writes = (Object.keys(MIX) as Kind[]).reduce((sum, kind) => sum + MIX[kind] * writeFormula(strategy, cfg, { items: w.items.length, copies }, kind), 0);
  const refresh = strategy === 'full' ? ((1 + ratio) / cfg.refreshEvery) * refreshFormula(w) : 0;
  return writes + ratio * readFormula(strategy, cfg, w) + refresh;
}

/**
 * The reads-per-write ratio at which strategy `a` starts to cost less than strategy `b`. Both costs are straight lines in the
 * ratio (a write mix plus a read price), so it is where the lines meet; null when `a` never catches up, 0 when it is cheaper from the start.
 */
export function crossover(a: Strategy, b: Strategy, cfg: Config, w: World): number | null {
  const line = (s: Strategy) => ({ at0: cycleCost(s, cfg, w, 0), slope: cycleCost(s, cfg, w, 1) - cycleCost(s, cfg, w, 0) });
  const [la, lb] = [line(a), line(b)];
  if (la.at0 <= lb.at0) return la.slope < lb.slope ? 0 : null;
  return la.slope < lb.slope ? (la.at0 - lb.at0) / (lb.slope - la.slope) : null;
}
/** The lowest seed in 1 to 200 whose workload makes the broken incremental rule (refunds not subtracted) diverge from the recomputation. Re-derived by a test. */
export const BROKEN_SEED = 1;

/** The lowest seed in 1 to 50 for which a full-refresh view is out of date at some point of its first STALE_WRITES writes. Re-derived by a test. */
export const STALE_SEED = 1;
export const STALE_WRITES = 12;
