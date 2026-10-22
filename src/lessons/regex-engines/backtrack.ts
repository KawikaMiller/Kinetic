/**
 * A backtracking regex matcher with a step counter and a trace. Pure: it knows the dialect's tree and nothing
 * else, so a later lesson can take it as it stands.
 *
 * It follows the ECMAScript rules for the dialect: alternatives are tried in order, quantifiers are greedy,
 * an iteration that matched nothing is rejected once the minimum is met, captures inside a repeated group are
 * cleared at the start of each iteration, and a back-reference to a group that has not matched matches "".
 *
 * A STEP is one attempt of one tree node at one position. Step counts belong to this matcher; they say
 * nothing about the speed of any real engine.
 */
import { LINE_TERMINATORS, type RegexNode } from './regexParse';

/** One attempt of a node at a position. `ok` is true when the match went on to succeed, false when the attempt failed and the matcher backed up, null when it was still running (an open ancestor of the attempt) when the budget ran out. */
export interface TraceEvent {
  /** 1-based step number. */
  step: number;
  node: number;
  pos: number;
  ok: boolean | null;
}

export interface BacktrackOptions {
  /** Give up after this many steps and say so. */
  budget: number;
  /** Keep the first this many attempts (the count keeps going). Default 0: no trace. */
  traceLimit?: number;
  /** The match must reach the end of the subject, as `^(?:…)$` does. */
  mustEnd?: boolean;
}

export interface BacktrackResult {
  status: 'match' | 'fail' | 'budget';
  /** The span of the match (for 'fail' and 'budget' both are -1). */
  start: number;
  end: number;
  /** Attempts made, never more than the budget. */
  steps: number;
  trace: TraceEvent[];
  traceTruncated: boolean;
}


class BudgetExhausted extends Error {}

type Caps = ([number, number] | null)[];
type Cont = (pos: number) => boolean;

function groupsInside(n: RegexNode): number[] {
  switch (n.kind) {
    case 'group':
      return [n.index, ...groupsInside(n.child)];
    case 'cat':
      return n.parts.flatMap(groupsInside);
    case 'alt':
      return n.options.flatMap(groupsInside);
    case 'rep':
      return groupsInside(n.child);
    default:
      return [];
  }
}

function groupCount(n: RegexNode): number {
  return Math.max(0, ...groupsInside(n));
}

/** Try the pattern at exactly `from`. */
export function matchAt(root: RegexNode, subject: readonly string[], from: number, o: BacktrackOptions): BacktrackResult {
  return run(root, subject, [from], o);
}

/** Leftmost-first search: the first start position, left to right, where some alternative order succeeds (what `RegExp.exec` returns). The budget is shared across starts. */
export function searchLeftmost(root: RegexNode, subject: readonly string[], o: BacktrackOptions): BacktrackResult {
  return run(root, subject, Array.from({ length: subject.length + 1 }, (_, i) => i), o);
}

function run(root: RegexNode, subject: readonly string[], starts: readonly number[], o: BacktrackOptions): BacktrackResult {
  const n = subject.length;
  const traceLimit = o.traceLimit ?? 0;
  const trace: TraceEvent[] = [];
  let steps = 0;
  let caps: Caps = Array.from({ length: groupCount(root) + 1 }, () => null);

  const attempt = (node: RegexNode, pos: number, body: (k: Cont) => boolean, k: Cont): boolean => {
    steps++;
    if (steps > o.budget) throw new BudgetExhausted();
    const event: TraceEvent | null = trace.length < traceLimit ? { step: steps, node: node.id, pos, ok: null } : null;
    if (event) trace.push(event);
    const ok = body(k);
    if (event) event.ok = ok;
    return ok;
  };

  const match = (node: RegexNode, pos: number, k: Cont): boolean => {
    switch (node.kind) {
      case 'lit':
        return attempt(node, pos, (next) => pos < n && subject[pos] === node.ch && next(pos + 1), k);
      case 'any':
        return attempt(node, pos, (next) => pos < n && !LINE_TERMINATORS.has(subject[pos]) && next(pos + 1), k);
      case 'set':
        return attempt(node, pos, (next) => pos < n && node.chars.includes(subject[pos]) && next(pos + 1), k);
      case 'backref':
        return attempt(
          node,
          pos,
          (next) => {
            const span = caps[node.group];
            if (!span) return next(pos);
            const text = subject.slice(span[0], span[1]);
            return pos + text.length <= n && text.every((c, i) => subject[pos + i] === c) && next(pos + text.length);
          },
          k,
        );
      case 'group':
        return attempt(
          node,
          pos,
          (next) =>
            match(node.child, pos, (end) => {
              const before = caps[node.index];
              caps[node.index] = [pos, end];
              if (next(end)) return true;
              caps[node.index] = before;
              return false;
            }),
          k,
        );
      case 'cat':
        return attempt(
          node,
          pos,
          (next) => {
            const seq = (i: number, at: number): boolean => (i === node.parts.length ? next(at) : match(node.parts[i], at, (p) => seq(i + 1, p)));
            return seq(0, pos);
          },
          k,
        );
      case 'alt':
        return attempt(node, pos, (next) => node.options.some((option) => match(option, pos, next)), k);
      case 'rep': {
        const inside = groupsInside(node.child);
        const maxIterations = node.op === '?' ? 1 : Infinity;
        const minIterations = node.op === '+' ? 1 : 0;
        return attempt(
          node,
          pos,
          (next) => {
            const iterate = (at: number, min: number, max: number): boolean => {
              if (max === 0) return next(at);
              const more = (): boolean => {
                const saved = inside.map((g) => caps[g]);
                inside.forEach((g) => (caps[g] = null));
                const ok = match(node.child, at, (end) => (min === 0 && end === at ? false : iterate(end, Math.max(0, min - 1), max - 1)));
                if (!ok) inside.forEach((g, i) => (caps[g] = saved[i]));
                return ok;
              };
              if (min > 0) return more();
              return more() || next(at);
            };
            return iterate(pos, minIterations, maxIterations);
          },
          k,
        );
      }
    }
  };

  let status: BacktrackResult['status'] = 'fail';
  let span: [number, number] = [-1, -1];
  try {
    for (const from of starts) {
      caps = caps.map(() => null);
      let end = -1;
      const found = match(root, from, (pos) => {
        if (o.mustEnd && pos !== n) return false;
        end = pos;
        return true;
      });
      if (found) {
        status = 'match';
        span = [from, end];
        break;
      }
    }
  } catch (e) {
    if (!(e instanceof BudgetExhausted)) throw e;
    status = 'budget';
    steps = o.budget;
  }
  return { status, start: span[0], end: span[1], steps, trace, traceTruncated: steps > trace.length && traceLimit > 0 };
}
