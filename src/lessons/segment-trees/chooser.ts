/**
 * Scene 5: which structure answers a need, decided by a capabilities table and a stated rule, not typed.
 * The numbers stored are for n cells and are implementation-dependent (labelled so on screen).
 */

export type WantedOp = 'sum' | 'min' | 'max';
export type Updates = 'none' | 'point' | 'range';

export interface Need {
  op: WantedOp;
  updates: Updates;
  /** Memory is tight: refuse a structure that stores more than 2n numbers while another one will do. */
  memory: boolean;
}

export type StructureId = 'prefix' | 'sparse' | 'fenwick' | 'segment' | 'lazy';

export interface Structure {
  id: StructureId;
  label: string;
  ops: readonly WantedOp[];
  updates: readonly Updates[];
  /** Numbers stored for n cells. */
  numbers: (n: number) => number;
  /** How the number is counted, for the table. */
  numbersNote: string;
}

const log2 = (n: number) => Math.ceil(Math.log2(n));

/** The structures in the order of the rule: the first one that fits is the simplest. */
export const STRUCTURES: readonly Structure[] = [
  { id: 'prefix', label: 'prefix sums', ops: ['sum'], updates: ['none'], numbers: (n) => n + 1, numbersNote: 'n + 1' },
  { id: 'sparse', label: 'sparse table', ops: ['min', 'max'], updates: ['none'], numbers: (n) => n * log2(n), numbersNote: 'n log2 n' },
  { id: 'fenwick', label: 'Fenwick tree', ops: ['sum'], updates: ['none', 'point'], numbers: (n) => n, numbersNote: 'n' },
  { id: 'segment', label: 'segment tree', ops: ['sum', 'min', 'max'], updates: ['none', 'point'], numbers: (n) => 2 * n, numbersNote: '2n' },
  { id: 'lazy', label: 'segment tree with lazy propagation', ops: ['sum', 'min', 'max'], updates: ['none', 'point', 'range'], numbers: (n) => 4 * n, numbersNote: '2n aggregates and 2n tags' },
];

export const supports = (s: Structure, need: Pick<Need, 'op' | 'updates'>): boolean => s.ops.includes(need.op) && s.updates.includes(need.updates);

export interface Recommendation {
  structure: Structure;
  /** Every structure with whether it fits and, when it does not, why. */
  considered: { structure: Structure; fits: boolean; why: string }[];
  /** The sentence that says why the winner won, from the table's own numbers. */
  reason: string;
}

/** The first structure in table order that supports the need and, when memory is tight, stores at most 2n numbers (else the first that supports it). */
export function recommend(need: Need, n: number): Recommendation {
  const considered = STRUCTURES.map((s) => {
    if (!s.ops.includes(need.op)) return { structure: s, fits: false, why: `cannot answer ${need.op}` };
    if (!s.updates.includes(need.updates)) return { structure: s, fits: false, why: need.updates === 'range' ? 'cannot add to a range' : 'cannot take updates' };
    return { structure: s, fits: true, why: 'fits' };
  });
  const fitting = considered.filter((c) => c.fits);
  const lean = need.memory ? fitting.filter((c) => c.structure.numbers(n) <= 2 * n) : fitting;
  const winner = (lean.length ? lean : fitting)[0].structure;
  const skipped = need.memory && lean.length && lean[0] !== fitting[0] ? fitting[0].structure : null;
  const extra = need.memory && !lean.length ? ` It stores ${winner.numbers(n).toLocaleString('en-US')} numbers (${winner.numbersNote}), more than 2n, but nothing smaller supports this.` : '';
  const reason = skipped
    ? `${winner.label} is the simplest that fits and stays within 2n numbers: ${skipped.label} would store ${skipped.numbers(n).toLocaleString('en-US')} (${skipped.numbersNote}) for n = ${n.toLocaleString('en-US')}.`
    : `${winner.label} is the first in the table that answers ${need.op} with ${need.updates === 'none' ? 'no updates' : need.updates === 'point' ? 'point updates' : 'range updates'}, storing ${winner.numbers(n).toLocaleString('en-US')} numbers (${winner.numbersNote}).${extra}`;
  return { structure: winner, considered, reason };
}
