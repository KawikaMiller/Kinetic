import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  classes, closureWaves, counterexample, holds, incomparable, isEquivalence, isPartialOrder, pairs, PROPERTIES, type Closure, type Counterexample, type Pair,
  type Property, type Rel,
} from './model';

export interface RoFrame extends Frame {
  rel: Rel;
  /** Pairs the current closure wave just added (flash). */
  added: Pair[];
}

export const PROPERTY_NAMES: Record<Property, string> = { reflexive: 'Reflexive', symmetric: 'Symmetric', antisymmetric: 'Antisymmetric', transitive: 'Transitive' };

/** A counterexample in words, with the lesson's element names. */
export function counterText(p: Property, cx: Counterexample, L: readonly string[]): string {
  const [a, b, c] = cx.elements.map((e) => L[e]);
  if (p === 'reflexive') return `${a} is not related to itself`;
  if (p === 'symmetric') return `${a} R ${b}, but not ${b} R ${a}`;
  if (p === 'antisymmetric') return `${a} R ${b} and ${b} R ${a}, although ${a} ≠ ${b}`;
  return `${a} R ${b} and ${b} R ${c}, but not ${a} R ${c}`;
}

const pairList = (ps: readonly Pair[], L: readonly string[]) => ps.map(([a, b]) => `(${L[a]}, ${L[b]})`).join(', ');

/** What kind of relation this is, worked out from the matrix. */
export function describe(r: Rel, L: readonly string[]): ReactNode {
  const n = r.length;
  const count = pairs(r).length;
  const eq = isEquivalence(r);
  const po = isPartialOrder(r);
  if (eq && po) {
    return <>{count} pairs. Both an equivalence relation and a partial order: that only happens for equality, where each element relates only to itself. Symmetric and antisymmetric at once, so they can't be opposites.</>;
  }
  if (eq) return <>{count} pairs. An <span className="hl ok">equivalence relation</span>: reflexive, symmetric and transitive, {classes(r).length === 1 ? <>but every element is related to every other, so all {n} land in one class.</> : <>so it splits the {n} elements into {classes(r).length} classes.</>}</>;
  if (po) {
    const inc = incomparable(r).length;
    return inc === 0
      ? <>{count} pairs. A <span className="hl ok">total order</span>: a partial order where every pair is comparable, so the elements fall in one line.</>
      : <>{count} pairs. A <span className="hl ok">partial order</span>, but {inc} pair{inc === 1 ? ' is' : 's are'} incomparable, so these {n} elements can't all be ranked in one line by this relation.</>;
  }
  const fails = PROPERTIES.filter((p) => !holds(r, p));
  return (
    <>
      {count} pairs. Neither an equivalence relation nor a partial order:{' '}
      {fails.map((p) => `${PROPERTY_NAMES[p].toLowerCase()} fails (${counterText(p, counterexample(r, p)!, L)})`).join('; ')}.
    </>
  );
}

const CLOSURE_RULE: Record<Closure, string> = {
  reflexive: 'add every missing (x, x)',
  symmetric: 'for every x R y, add y R x',
  transitive: "Warshall's algorithm: for each element k in turn, add x R y whenever x R k and k R y",
};

/** The relation as it stands, or a closure growing wave by wave from `from`. */
export function relFrames(rel: Rel, L: readonly string[], anim: { from: Rel; kind: Closure } | null): RoFrame[] {
  const rec = createRecorder<RoFrame>({ rel, added: [] }, { transient: { added: [] } });
  if (!anim) {
    rec.snap(describe(rel, L));
    return rec.frames;
  }
  const { result, waves } = closureWaves(anim.from, anim.kind);
  const total = waves.reduce((s, w) => s + w.added.length, 0);
  rec.snap(<>{anim.kind[0].toUpperCase() + anim.kind.slice(1)} closure: {CLOSURE_RULE[anim.kind]}.</>, undefined, { rel: anim.from });
  if (total === 0) {
    rec.close(<>Nothing to add: the relation is already {anim.kind}. {describe(result, L)}</>, 2);
    return rec.frames;
  }
  let cur = anim.from;
  for (const w of waves) {
    if (!w.added.length) continue;
    cur = cur.map((row, a) => row.map((x, b) => x || w.added.some(([p, q]) => p === a && q === b)));
    rec.snap(
      w.via === null
        ? <>Added {w.added.length} pair{w.added.length === 1 ? '' : 's'}: {pairList(w.added, L)}.</>
        : <>Through {L[w.via]}: added {pairList(w.added, L)}.</>,
      undefined,
      { rel: cur, added: [...w.added] },
    );
  }
  rec.close(<>Closure done: {total} pair{total === 1 ? '' : 's'} added. {describe(result, L)}</>, 2);
  return rec.frames;
}
