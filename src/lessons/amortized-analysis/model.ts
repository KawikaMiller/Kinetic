/**
 * A dynamic array, counted in element writes.
 *
 * Cost model (the same for every policy):
 * - a push writes its element: 1
 * - a pop clears its slot: 1
 * - a resize copies every element into the new block: 1 per element copied
 *
 * The array starts empty with capacity START_CAP. A push into a full array first grows it
 * by the growth policy; a pop may then shrink it by the shrink rule.
 */

export type Growth = 'double' | 'x1.5' | 'plus10';
export type ShrinkRule = 'none' | 'half' | 'quarter';
export type Op = 'push' | 'pop';

export const START_CAP = 1;
/** "+10 slots": the additive policy's step. */
export const PLUS_K = 10;
/** The banker's deposit per operation. */
export const COINS_PER_OP = 3;
/** The push playground stops here: far enough for +10 to overdraw a 3-coin bank (push 42). */
export const MAX_PUSHES = 48;

export const GROWTHS: readonly { id: Growth; label: string; rule: string }[] = [
  { id: 'double', label: '2×', rule: 'new capacity = 2 × old' },
  { id: 'x1.5', label: '1.5×', rule: 'new capacity = ⌊1.5 × old⌋, at least old + 1' },
  { id: 'plus10', label: '+10 slots', rule: `new capacity = old + ${PLUS_K}` },
];

export const growthLabel = (g: Growth) => GROWTHS.find((x) => x.id === g)!.label;

/** The capacity a full block of `cap` slots grows to. */
export function grow(cap: number, g: Growth): number {
  if (g === 'double') return cap * 2;
  if (g === 'x1.5') return Math.max(cap + 1, Math.floor(cap * 1.5));
  return cap + PLUS_K;
}

/** Whether a pop that leaves `size` elements in `cap` slots shrinks the block. */
export function shouldShrink(size: number, cap: number, rule: ShrinkRule): boolean {
  if (rule === 'none' || cap <= START_CAP) return false;
  return rule === 'half' ? size * 2 <= cap : size * 4 <= cap;
}

/** Shrinking halves the capacity (never below START_CAP). */
export const shrunk = (cap: number) => Math.max(START_CAP, Math.floor(cap / 2));

export interface Step {
  op: Op;
  /** 1-based operation number. */
  n: number;
  /** The element pushed (pushes are numbered 1, 2, 3 … in push order), or the one popped. */
  value: number;
  before: number[];
  capBefore: number;
  after: number[];
  capAfter: number;
  resize: 'grow' | 'shrink' | null;
  /** Elements copied by this operation's resize (0 if none). */
  copies: number;
  /** 1 for the push's or pop's own write, plus the copies. */
  cost: number;
  /** Banker's balance after this operation: COINS_PER_OP in, `cost` out. */
  balance: number;
}

/** Replays operations from an empty array. A pop on an empty array is a bug in the caller. */
export function run(ops: readonly Op[], growth: Growth, shrink: ShrinkRule = 'none', coins = COINS_PER_OP): Step[] {
  let items: number[] = [];
  let cap = START_CAP;
  let pushed = 0;
  let balance = 0;
  return ops.map((op, i) => {
    const before = items;
    const capBefore = cap;
    let copies = 0;
    let resize: Step['resize'] = null;
    let value: number;
    if (op === 'push') {
      if (items.length === cap) {
        cap = grow(cap, growth);
        copies = items.length;
        resize = 'grow';
      }
      value = ++pushed;
      items = [...items, value];
    } else {
      if (!items.length) throw new Error('pop on an empty array');
      value = items[items.length - 1];
      items = items.slice(0, -1);
      if (shouldShrink(items.length, cap, shrink)) {
        cap = shrunk(cap);
        copies = items.length;
        resize = 'shrink';
      }
    }
    const cost = 1 + copies;
    balance += coins - cost;
    return { op, n: i + 1, value, before, capBefore, after: items, capAfter: cap, resize, copies, cost, balance };
  });
}

export const pushes = (n: number): Op[] => new Array<Op>(n).fill('push');

/** Total writes (pushes plus copies) after each of the first `n` pushes: index k is after k pushes. */
export function cumulativeCost(n: number, growth: Growth): number[] {
  const out = [0];
  for (const s of run(pushes(n), growth)) out.push(out[out.length - 1] + s.cost);
  return out;
}

/**
 * The smallest whole number of coins per push that keeps the banker's balance at or above
 * zero through every one of the first `n` pushes: max over k of ⌈1 + copies(k) / k⌉.
 */
export function coinsNeeded(n: number, growth: Growth): number {
  let copies = 0;
  let need = 1;
  run(pushes(n), growth).forEach((s, i) => {
    copies += s.copies;
    need = Math.max(need, Math.ceil(1 + copies / (i + 1)));
  });
  return need;
}

/** The first step whose balance dips below zero, or null. */
export const firstOverdraft = (steps: readonly Step[]) => steps.find((s) => s.balance < 0) ?? null;

export const lowestBalance = (steps: readonly Step[]) => (steps.length ? Math.min(0, ...steps.map((s) => s.balance)) : 0);

/** The pop-shrink trap: fill to 8, then alternate push and pop. */
export const TRAP_FILL = 8;
export const TRAP_ROUNDS = 4;
export const TRAP_OPS: readonly Op[] = [...pushes(TRAP_FILL), ...Array.from({ length: TRAP_ROUNDS }, () => ['push', 'pop'] as Op[]).flat()];

/** The potential Φ = 2·size − capacity + 1 used in the key idea: never negative after a push, 0 at the start. */
export const potential = (size: number, cap: number) => 2 * size - cap + 1;
