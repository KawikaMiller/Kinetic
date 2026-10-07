import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { canonical, collect, show, solve, type Program, type Subst, type UnifyStep } from './model';

export interface InferFrame extends Frame {
  /** Constraints are listed once collected. */
  collected: boolean;
  /** The constraint being solved now. */
  current: number | null;
  /** The AST node it came from. */
  hot: string | null;
  subst: Subst;
  /** Constraints in conflict (a type error). */
  conflict: number[];
  failed: boolean;
  /** The principal type, renamed to a, b, c…, once solved. */
  result: string | null;
}

/** A type, set as code. */
const ty = (text: string) => <code className="ts-type">{text}</code>;

function stepSay(s: UnifyStep) {
  const eq = ty(`${show(s.left)} = ${show(s.right)}`);
  switch (s.action) {
    case 'same':
      return <>{eq}: both sides are already the same, nothing to do.</>;
    case 'bind':
      return <>Unify {eq}: a type variable can stand for anything, so bind {ty(`${s.bound!.name} := ${show(s.bound!.to)}`)} and use it everywhere from now on.</>;
    case 'split':
      return <>Unify {eq}: both sides are functions, so their argument types must match and their result types must match. Split it in two.</>;
    case 'occurs':
      return <><span className="hl bad">Occurs check fails.</span> {eq} would make a type contain itself, an infinite type. No type works.</>;
    case 'mismatch':
      return <><span className="hl bad">Type error.</span> {eq}: two different concrete types can never be equal. The two red constraints conflict.</>;
  }
}

export function inferFrames(p: Program) {
  const c = collect(p);
  const sol = solve(c);
  const rec = createRecorder<InferFrame>({ collected: false, current: null, hot: null, subst: new Map(), conflict: [], failed: false, result: null });
  const params = [...c.params].map(([x, t]) => `${x} : ${show(t)}`).join(', ');
  rec.snap(
    <>
      Give every unknown a type variable{params ? <> ({ty(params)})</> : null}, and every application and if a fresh one for its result. Literals already have a
      type.
    </>,
  );
  rec.snap(<>Each application, if and operator adds an equation the types must satisfy: <b>{c.constraints.length}</b> here. Now solve them one at a time.</>, undefined, {
    collected: true,
  });
  for (const s of sol.steps) {
    const failing = s.action === 'occurs' || s.action === 'mismatch';
    rec.snap(stepSay(s), failing ? 2 : undefined, {
      current: s.constraint,
      hot: c.constraints[s.constraint].origin,
      subst: s.subst,
      ...(failing && !sol.ok ? { conflict: sol.conflict, failed: true } : {}),
    });
  }
  if (sol.ok) {
    const result = canonical(sol.type);
    rec.set({ current: null, hot: null, result });
    rec.close(
      <>
        Apply the substitution to the whole {p.name ? 'function' : 'program'}: {ty(show(sol.type))}. Renamed in order: <span className="hl ok">{result}</span>. Each letter can be any type, as long
        as the same letter means the same type.
      </>,
      2,
    );
  }
  return rec.frames;
}
