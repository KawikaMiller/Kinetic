import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { fmt, gcdN, inverseInTable, modN, rowsWithoutInverse, walkPlus, walkTimes, type Walk } from './model';

export type Op = 'plus' | 'times';

export interface ClockFrame extends Frame {
  /** Where the hand points. */
  pos: number;
  /** Positions walked through so far in this operation. */
  trail: number[];
}

/** Step frames for "+a" or "×a" from `from` on a clock of n. */
export function clockFrames(op: Op, from: number, a: number, n: number): { walk: Walk; frames: ClockFrame[] } {
  const walk = op === 'plus' ? walkPlus(from, a, n) : walkTimes(from, a, n);
  const r = createRecorder<ClockFrame>({ pos: op === 'plus' ? from : 0, trail: [] });
  const sym = op === 'plus' ? '+' : '×';
  const amount = <span className="hl info">{walk.stepped}</span>;
  if (op === 'plus') r.snap(<>Start at <span className="hl">{from}</span> and add {fmt(a)}.</>);
  else r.snap(<>{from} × {fmt(a)} is {fmt(a)} jumps of {from}, starting from 0.</>);

  if (walk.reduced) {
    r.snap(
      <>{fmt(a)} mod {n} = {amount}. Whole laps of {n} change nothing, so {sym}{fmt(a)} lands exactly where {sym}{walk.stepped} does.
        {' '}Walking {walk.stepped} instead.</>,
      1.6,
    );
  }

  if (walk.stepped === 0) {
    r.snap(op === 'plus' ? <>Nothing to walk: the hand stays put.</> : <>Zero jumps: the hand stays at 0.</>);
  } else if (op === 'times' && from === 0) {
    r.snap(<>Every jump has length 0, so the hand never leaves 0.</>, 1, { trail: [0] });
  } else {
    let wrapped = false;
    walk.path.forEach((pos, i) => {
      const before = r.get().pos;
      const trail = [...r.get().trail, pos];
      let say: ReactNode;
      if (op === 'times') {
        say = before + from >= n
          ? <>Jump {i + 1} of {walk.stepped}: {before} + {from} = {before + from}, past {n - 1}, so it wraps to {pos}.</>
          : <>Jump {i + 1} of {walk.stepped}: {before} + {from} = {pos}.</>;
      } else if (pos === 0 && !wrapped) {
        wrapped = true;
        say = <>Past {n - 1} there is no {n}: the hand wraps round to 0 and keeps counting.</>;
      } else if (i === 0) {
        say = <>Walking {walk.stepped} {walk.stepped === 1 ? 'step' : 'steps'} clockwise, one tick at a time.</>;
      }
      r.snap(say, op === 'times' ? 1 : 0.45, { pos, trail });
    });
  }

  const total = op === 'plus' ? from + a : from * a;
  r.close(
    <>({from} {sym} {fmt(a)}) mod {n}: {from} {sym} {fmt(a)} = {fmt(total)}, and {fmt(total)} mod {n} ={' '}
      <span className="hl">{walk.result}</span>.</>,
    2,
  );
  return { walk, frames: r.frames };
}

/** The equation the clock shows for an operation. */
export function equation(op: Op, from: number, a: number, n: number): string {
  const total = op === 'plus' ? from + a : from * a;
  return `${fmt(total)} mod ${n} = ${modN(total, n)}`;
}

/** Caption for the whole table, read off the table itself. */
export function tableCaption(table: number[][], n: number): ReactNode {
  const missing = rowsWithoutInverse(table);
  if (missing.length === 0) {
    return <>Every row from 1 to {n - 1} has a <span className="hl ok">1</span> in it: every non-zero number has an inverse mod {n},
      because {n} is prime.</>;
  }
  return <>Rows <b>{missing.join(', ')}</b> have no 1 anywhere, so those numbers have no inverse mod {n}.
    They are exactly the ones that share a factor with {n}: gcd(a, {n}) &gt; 1.</>;
}

/** Caption for one clicked cell, a × b, read off the table. */
export function cellCaption(table: number[][], n: number, a: number, b: number): ReactNode {
  const v = table[a - 1][b - 1];
  const head = <>{a} × {b} = {a * b}, and {a * b} mod {n} = <b>{v}</b>.</>;
  if (v === 1) {
    return <>{head} So <span className="hl ok">{b}</span> is the inverse of {a} mod {n}: multiplying by {b} undoes multiplying
      by {a}.</>;
  }
  const inv = inverseInTable(table, a);
  if (inv !== null) return <>{head} Row {a}'s <span className="hl ok">1</span> is in column {inv}, so {a}⁻¹ mod {n} = {inv}.</>;
  const g = gcdN(a, n);
  return <>{head} Row {a} has no 1 at all: gcd({a}, {n}) = {g}, so every product {a}·b minus a multiple of {n} is still a multiple
    of {g}, and can never be 1.</>;
}
