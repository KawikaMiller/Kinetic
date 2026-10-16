/**
 * A generic recogniser (Earley), independent of every table in this lesson: does the grammar generate the string?
 * The stage uses it to say whether a parser's verdict agrees with the grammar's language, and the tests use it
 * as the oracle for both table-driven parsers.
 */
import { isNonterminal, type Grammar } from './grammar';

interface EarleyItem {
  prod: number;
  dot: number;
  origin: number;
}

const key = (i: EarleyItem) => `${i.prod}.${i.dot}.${i.origin}`;

export function generates(g: Grammar, tokens: readonly string[]): boolean {
  const n = tokens.length;
  const sets: Map<string, EarleyItem>[] = Array.from({ length: n + 1 }, () => new Map());
  const add = (k: number, item: EarleyItem) => {
    if (sets[k].has(key(item))) return false;
    sets[k].set(key(item), item);
    return true;
  };
  g.productions.forEach((p) => {
    if (p.lhs === g.start) add(0, { prod: p.id, dot: 0, origin: 0 });
  });
  for (let k = 0; k <= n; k++) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of [...sets[k].values()]) {
        const p = g.productions[item.prod];
        const next = p.rhs[item.dot];
        if (next === undefined) {
          for (const waiting of [...sets[item.origin].values()]) {
            if (g.productions[waiting.prod].rhs[waiting.dot] === p.lhs) changed = add(k, { ...waiting, dot: waiting.dot + 1 }) || changed;
          }
        } else if (isNonterminal(next)) {
          for (const q of g.productions) if (q.lhs === next) changed = add(k, { prod: q.id, dot: 0, origin: k }) || changed;
        } else if (k < n && tokens[k] === next) {
          add(k + 1, { ...item, dot: item.dot + 1 });
        }
      }
    }
  }
  return [...sets[n].values()].some((i) => g.productions[i.prod].lhs === g.start && i.dot === g.productions[i.prod].rhs.length && i.origin === 0);
}
