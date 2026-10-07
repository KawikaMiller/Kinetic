import type { ReactNode } from 'react';
import { dfaRun } from '../../core/automata';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { EPS, countingDfa, derive, evaluate, nested, type Derivation, type Grammar, type PNode, type Rule, type Tok } from './model';

export const ruleText = (r: Rule) => `${r.lhs} → ${r.rhs.length ? r.rhs.join(' ') : EPS}`;
export const inputText = (tokens: readonly Tok[]) => tokens.map((t) => t.text).join(' ');

// ── A leftmost derivation, one rule per frame ────────────────────────

export interface DeriveFrame extends Frame {
  d: Derivation;
}

export function deriveFrames(g: Grammar, tokens: readonly Tok[], rules: readonly number[]): DeriveFrame[] {
  const frames: DeriveFrame[] = [];
  for (let k = 0; k <= rules.length; k++) {
    const d = derive(g, tokens, rules.slice(0, k));
    const next = d.next ? d.nodes[d.next].sym : null;
    let say: ReactNode;
    if (k === 0) say = <>Start from {g.start}. The leftmost non-terminal (yellow) is the one to expand: pick one of its productions below, or press Auto-derive.</>;
    else if (next) say = <>Applied <b>{ruleText(g.rules[rules[k - 1]])}</b>. Next, expand the leftmost non-terminal: {next}.</>;
    else
      say = (
        <>
          Applied <b>{ruleText(g.rules[rules[k - 1]])}</b>. <span className="hl ok">Derived.</span> Every leaf is a terminal and, left to right, they spell{' '}
          <b>{inputText(tokens) || 'the empty string'}</b>. That's a leftmost derivation in {rules.length} steps.
        </>
      );
    frames.push({ d, say, hold: next ? 1 : 2 });
  }
  return frames;
}

// ── Two trees, evaluated bottom-up ───────────────────────────────────

/** Post-order list of node paths ("0.2.1"), the order values are worked out in. */
export function postOrder(tree: PNode, path = '0'): string[] {
  return [...tree.children.flatMap((c, i) => postOrder(c, `${path}.${i}`)), path];
}

export interface EvalFrame extends Frame {
  /** How many nodes of each tree (in post-order) show their value. */
  shown: number;
}

export function evalFrames(trees: readonly PNode[], verdict: ReactNode): EvalFrame[] {
  const rec = createRecorder<EvalFrame>({ shown: 0 });
  if (!trees.length) {
    rec.snap(verdict);
    return rec.frames;
  }
  const steps = Math.max(...trees.map((t) => postOrder(t).length));
  rec.snap(<>{trees.length === 1 ? 'One parse tree.' : `${trees.length} parse trees for the same input.`} Evaluate bottom-up: a leaf is its number, and each node combines its children.</>);
  for (let k = 1; k <= steps; k++) rec.snap(undefined, 0.5, { shown: k });
  rec.close(verdict, 2);
  return rec.frames;
}

export function valueText(v: number | undefined) {
  return v === undefined ? '?' : String(v);
}

export const valueOf = (tree: PNode) => evaluate(tree);

// ── Feeding (ⁿ)ⁿ to a counting DFA ───────────────────────────────────

export interface RegexFrame extends Frame {
  read: number;
  state: string | null;
  verdict: boolean | null;
}

export function regexFrames(n: number, k: number): RegexFrame[] {
  const dfa = countingDfa(k);
  const s = nested(n);
  const { path, accepted } = dfaRun(dfa, s);
  const rec = createRecorder<RegexFrame>({ read: 0, state: 'c0', verdict: null });
  rec.snap(<>The string has {n} opening brackets, then {n} closing ones. This DFA counts the open depth with its {k} states: c0 means depth 0.</>);
  let died = false;
  for (let i = 1; i < path.length; i++) {
    const st = path[i];
    if (st === null) {
      rec.snap(
        <>
          Read {s[i - 1]}: c{k - 1} has no arrow for it. Depth {k} needs a state the machine doesn't have, so it dies and{' '}
          <span className="hl bad">rejects a balanced string</span>.
        </>,
        2,
        { read: i, state: null, verdict: false },
      );
      died = true;
      break;
    }
    rec.snap(undefined, 0.6, { read: i, state: st });
  }
  if (!died) rec.set({ verdict: accepted });
  if (!died)
    rec.close(
      accepted
        ? <>Back to c0 at the end: <span className="hl ok">accepted</span>, and correctly. Depth {n} fits in {k} states. Drag n to {k} and it can't keep count any more.</>
        : <>Ends away from c0: rejected.</>,
      2,
    );
  return rec.frames;
}

