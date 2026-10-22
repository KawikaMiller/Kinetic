/**
 * The halting-problem lesson's library of eight real machines, run by `core/tm`, and the probes
 * (run for a budget, watch for a repeated configuration) that predictors and the analyser use.
 * Nothing here says "never halts" unless a certificate is in the data: a repeated configuration
 * found by running, or the recorded argument on the one machine that has one.
 */
import { tmStep, tmStart, TM_BLANK, type Tm, type TmConfig, type TmRule } from '../../core/tm';
import { INCREMENT_REFERENCE } from '../../core/tmTables';
import { mustParseTm } from '../../core/tm';

const HALT = 'halt';

/** `1RB 1LB 1LA 1RH` in the usual busy-beaver notation: states A, B, ... with the 0-rule then the 1-rule each; 0 is the blank. */
export function fromNotation(text: string): Tm {
  const symbol = (ch: string) => (ch === '0' ? TM_BLANK : ch);
  const cells = text.trim().split(/\s+/);
  const rules: TmRule[] = cells.map((cell, k) => {
    const [write, move, next] = cell;
    return {
      state: String.fromCharCode(65 + Math.floor(k / 2)),
      read: k % 2 === 0 ? TM_BLANK : '1',
      write: symbol(write),
      move: move as 'L' | 'R',
      next: next === 'H' ? HALT : next,
    };
  });
  return { start: 'A', rules };
}

/** What the lesson's recorded argument says about a machine no repeated configuration can certify. */
export interface Argument {
  text: string;
}

export interface LibraryMachine {
  id: string;
  name: string;
  tm: Tm;
  input: string;
  /** Present when the machine loops without ever repeating a configuration. */
  argument?: Argument;
}

const rules = (text: string) => mustParseTm(text);

export const WALK_RIGHT_ARGUMENT: Argument = {
  text: 'The only rule fires on a blank and moves right, and every cell to the right of the head is blank, so the same rule fires at every step and never enters a halting state. The tape gets one cell longer each time, so no configuration repeats.',
};

export const LIBRARY: readonly LibraryMachine[] = [
  { id: 'increment', name: 'Increment 1011', tm: rules(INCREMENT_REFERENCE), input: '1011' },
  { id: 'erase', name: 'Erase 111', tm: rules('q0 1 -> _ R q0\nq0 _ -> _ S halt'), input: '111' },
  { id: 'flip', name: 'Two-state flip', tm: rules('a _ -> 1 S b\nb 1 -> _ S a'), input: '' },
  { id: 'bounce', name: 'Bounce between two cells', tm: rules('a _ -> 1 R b\na 1 -> 1 R b\nb _ -> 1 L a\nb 1 -> 1 L a'), input: '' },
  { id: 'walk', name: 'Walk right writing 1s', tm: rules('q0 _ -> 1 R q0'), input: '', argument: WALK_RIGHT_ARGUMENT },
  { id: 'bb2', name: 'Busy beaver, 2 states', tm: fromNotation('1RB 1LB 1LA 1RH'), input: '' },
  { id: 'bb3', name: 'Busy beaver, 3 states', tm: fromNotation('1RB 1RH 1LB 0RC 1LC 1LA'), input: '' },
  { id: 'bb4', name: 'Busy beaver, 4 states', tm: fromNotation('1RB 1LB 1LA 0LC 1RH 1LD 1RD 0RA'), input: '' },
];

export const libraryMachine = (id: string): LibraryMachine => {
  const m = LIBRARY.find((x) => x.id === id);
  if (!m) throw new Error(`no library machine ${id}`);
  return m;
};

/** The machine D runs when it is told "HALTS": it flips one cell back and forth, repeating a configuration. */
export const D_LOOPS: Tm = LIBRARY[2].tm;
/** The machine D runs otherwise: it halts at once. */
export const D_HALTS: Tm = mustParseTm('q0 _ -> _ S halt');

export const onesOn = (c: TmConfig) => [...c.tape.values()].filter((s) => s === '1').length;

/** A configuration as a string, for spotting a repeat: state, head cell and the written cells in order. */
export function configKey(c: TmConfig): string {
  const cells = [...c.tape.entries()].sort((a, b) => a[0] - b[0]).map(([i, s]) => `${i}:${s}`).join(',');
  return `${c.state}|${c.head}|${cells}`;
}

export type Probe =
  | { kind: 'halted'; steps: number; config: TmConfig }
  | { kind: 'stuck'; steps: number; config: TmConfig }
  /** The configuration after `at` steps equals the one after `first` steps: a certificate that the machine loops. */
  | { kind: 'repeat'; first: number; at: number }
  | { kind: 'cutoff'; steps: number };

/** Runs from `input` for at most `maxSteps` moves; with `watchRepeats`, stops with a certificate when a configuration comes back. */
export function probe(tm: Tm, input: string, o: { maxSteps: number; watchRepeats: boolean }): Probe {
  let config = tmStart(tm, input);
  const seen = new Map<string, number>([[configKey(config), 0]]);
  for (let steps = 0; steps < o.maxSteps; steps++) {
    const next = tmStep(tm, config);
    if (next.status === 'halted') return { kind: 'halted', steps, config };
    if (next.status === 'stuck') return { kind: 'stuck', steps, config };
    config = next.config;
    if (o.watchRepeats) {
      const key = configKey(config);
      const first = seen.get(key);
      if (first !== undefined) return { kind: 'repeat', first, at: steps + 1 };
      seen.set(key, steps + 1);
    }
  }
  const last = tmStep(tm, config);
  if (last.status === 'halted') return { kind: 'halted', steps: o.maxSteps, config };
  if (last.status === 'stuck') return { kind: 'stuck', steps: o.maxSteps, config };
  return { kind: 'cutoff', steps: o.maxSteps };
}

/** How many moves the ground-truth run may take: far above the longest halting machine in the library. */
export const TRUTH_STEPS = 2000;

export type Truth =
  | { kind: 'halts'; steps: number; ones: number }
  | { kind: 'loops'; certificate: { kind: 'repeat'; first: number; at: number } | { kind: 'argument'; text: string } };

/** What a probe established, or an error when it established nothing: halted, repeated a configuration, or has a recorded argument. */
export function truthFromProbe(run: Probe, argument?: Argument): Truth {
  if (run.kind === 'halted') return { kind: 'halts', steps: run.steps, ones: onesOn(run.config) };
  if (run.kind === 'repeat') return { kind: 'loops', certificate: { kind: 'repeat', first: run.first, at: run.at } };
  if (run.kind === 'cutoff' && argument) return { kind: 'loops', certificate: { kind: 'argument', text: argument.text } };
  throw new Error(`no certificate: ${run.kind}`);
}

/** What a library machine really does, established by running it (and, for one machine, by its recorded argument). */
export const truthOf = (m: LibraryMachine): Truth => truthFromProbe(probe(m.tm, m.input, { maxSteps: TRUTH_STEPS, watchRepeats: true }), m.argument);
export const TRUTHS: ReadonlyMap<string, Truth> = new Map(LIBRARY.map((m) => [m.id, truthOf(m)]));
