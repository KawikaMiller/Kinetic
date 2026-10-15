import { useMemo, useState } from 'react';
import { nextRedex, run, stepAt, type Mode, type RunEnd, type Step, type Strategy } from './reduce';
import { parse, type Path, type Term } from './term';

/** Why the last action did what it did, besides the step itself. */
export type Note =
  | { kind: 'not-redex'; path: Path }
  | { kind: 'ended'; end: RunEnd; strategy: Strategy; steps: number; budget?: number };

export interface Stepper {
  text: string;
  /** Why the typed text was refused, or null when it parses. The term shown is then the last one that parsed. */
  error: string | null;
  start: Term;
  terms: Term[];
  current: Term;
  last: Step | null;
  note: Note | null;
  setText: (text: string) => void;
  /** Reduce the redex at `path`. */
  reduceAt: (path: Path, mode: Mode) => void;
  /** One step by a strategy. */
  stepBy: (strategy: Strategy, mode: Mode) => void;
  /** Steps by a strategy until it stops, within `budget`. */
  runBy: (strategy: Strategy, budget: number, mode: Mode) => void;
  reset: () => void;
}

interface State {
  start: Term;
  terms: Term[];
  last: Step | null;
  note: Note | null;
}

function startTerm(text: string): Term {
  const p = parse(text);
  if (!p.ok) throw new Error(`preset does not parse: ${p.error}`);
  return p.term;
}

/** A run's end seen from the whole history: a repeat certificate counts steps from the start of the history, not from where the run began. */
export function endInHistory(end: RunEnd, stepsBefore: number): RunEnd {
  return end.kind === 'loop' ? { kind: 'loop', first: end.first + stepsBefore, at: end.at + stepsBefore } : end;
}

/** The learner's term, its reduction history and the actions on it. The reducer is `reduce.ts`; this only keeps state. */
export function useStepper(initialText: string): Stepper {
  const [text, setTextState] = useState(initialText);
  const [state, setState] = useState<State>(() => {
    const start = startTerm(initialText);
    return { start, terms: [start], last: null, note: null };
  });
  const parsed = useMemo(() => parse(text), [text]);
  const current = state.terms[state.terms.length - 1];

  const fresh = (start: Term): State => ({ start, terms: [start], last: null, note: null });
  const push = (step: Step): State => ({ ...state, terms: [...state.terms, step.after], last: step, note: null });

  return {
    text,
    error: parsed.ok ? null : parsed.error,
    start: state.start,
    terms: state.terms,
    current,
    last: state.last,
    note: state.note,
    setText(next) {
      setTextState(next);
      const p = parse(next);
      if (p.ok) setState(fresh(p.term));
    },
    reduceAt(path, mode) {
      const step = stepAt(current, path, mode);
      setState(step ? push(step) : { ...state, note: { kind: 'not-redex', path } });
    },
    stepBy(strategy, mode) {
      const at = nextRedex(current, strategy);
      const step = at === null ? null : stepAt(current, at, mode);
      setState(step ? push(step) : { ...state, note: { kind: 'ended', end: { kind: 'normal' }, strategy, steps: state.terms.length - 1 } });
    },
    runBy(strategy, budget, mode) {
      const r = run(current, strategy, budget, mode);
      const terms = [...state.terms, ...r.terms.slice(1)];
      const prev = r.terms.length > 1 ? r.terms[r.terms.length - 2] : null;
      const at = prev ? nextRedex(prev, strategy) : null;
      const last = prev && at !== null ? stepAt(prev, at, mode) : state.last;
      setState({ ...state, terms, last, note: { kind: 'ended', end: endInHistory(r.end, state.terms.length - 1), strategy, steps: terms.length - 1, budget } });
    },
    reset() {
      setState(fresh(state.start));
    },
  };
}
