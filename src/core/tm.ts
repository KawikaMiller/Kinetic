/**
 * One-tape deterministic Turing machines: `tmStep`, `runTm` with a step budget, and
 * `parseTmTable` for a learner-written transition table. Pure and hand-parsed (no `eval`).
 *
 * A machine halts when it enters a halting state, is stuck when no rule matches a state that
 * hasn't halted, and is budget-exhausted when the step budget runs out first. That last outcome
 * says nothing about whether the machine would ever halt: it is never reported as "never halts".
 */
import { parseRows, type FieldParse, type RowParse } from './parse';
import type { State } from './automata';

export type TmMove = 'L' | 'R' | 'S';
export const TM_MOVES: readonly TmMove[] = ['L', 'R', 'S'];
export const TM_BLANK = '_';
/** States that stop a machine, unless the table says otherwise. */
export const TM_HALT_STATES: readonly State[] = ['halt', 'accept', 'reject'];

/** `state read -> write move next`. */
export interface TmRule {
  state: State;
  read: string;
  write: string;
  move: TmMove;
  next: State;
}

export interface Tm {
  start: State;
  rules: readonly TmRule[];
  halting?: readonly State[];
}

/** The tape is a sparse map from cell index to symbol: unset cells are blank, in both directions. */
export interface TmConfig {
  state: State;
  head: number;
  tape: ReadonlyMap<number, string>;
}

export const isHalting = (tm: Tm, state: State) => (tm.halting ?? TM_HALT_STATES).includes(state);

/** The input written from cell 0, the head on it, in the start state. */
export function tmStart(tm: Tm, input: string): TmConfig {
  const tape = new Map<number, string>();
  [...input].forEach((ch, i) => {
    if (ch !== TM_BLANK) tape.set(i, ch);
  });
  return { state: tm.start, head: 0, tape };
}

export const symbolAt = (c: TmConfig, i: number) => c.tape.get(i) ?? TM_BLANK;

/** The rule for a state and the symbol under the head, if any. */
export const ruleFor = (tm: Tm, state: State, read: string) => tm.rules.find((r) => r.state === state && r.read === read);

export type TmStep =
  | { status: 'moved'; config: TmConfig; rule: TmRule }
  | { status: 'halted' | 'stuck'; config: TmConfig };

const MOVE_BY: Record<TmMove, number> = { L: -1, R: 1, S: 0 };

/** Writes a symbol and moves the head; a blank write leaves the cell unset so the tape stays sparse. */
function applyRule(c: TmConfig, rule: TmRule, tape: Map<number, string>): TmConfig {
  if (rule.write === TM_BLANK) tape.delete(c.head);
  else tape.set(c.head, rule.write);
  return { state: rule.next, head: c.head + MOVE_BY[rule.move], tape };
}

/** One move. Pure: the given config is untouched. */
export function tmStep(tm: Tm, c: TmConfig): TmStep {
  if (isHalting(tm, c.state)) return { status: 'halted', config: c };
  const rule = ruleFor(tm, c.state, symbolAt(c, c.head));
  if (!rule) return { status: 'stuck', config: c };
  return { status: 'moved', config: applyRule(c, rule, new Map(c.tape)), rule };
}

export type TmOutcome = 'halted' | 'budget-exhausted' | 'stuck';

export interface TmRun {
  status: TmOutcome;
  /** Moves made (the move into a halting state counts). */
  steps: number;
  config: TmConfig;
}

/** Runs from `input` for at most `maxSteps` moves. */
export function runTm(tm: Tm, input: string, o: { maxSteps: number }): TmRun {
  const tape = new Map(tmStart(tm, input).tape);
  let config: TmConfig = { state: tm.start, head: 0, tape };
  let steps = 0;
  for (;;) {
    if (isHalting(tm, config.state)) return { status: 'halted', steps, config };
    const rule = ruleFor(tm, config.state, symbolAt(config, config.head));
    if (!rule) return { status: 'stuck', steps, config };
    if (steps >= o.maxSteps) return { status: 'budget-exhausted', steps, config };
    config = applyRule(config, rule, tape);
    steps++;
  }
}

/** The non-blank stretch of the tape, first to last written cell ("" for a blank tape); blanks inside show as `_`. */
export function tapeText(c: TmConfig): string {
  const cells = [...c.tape.keys()];
  if (!cells.length) return '';
  const lo = Math.min(...cells);
  const hi = Math.max(...cells);
  return Array.from({ length: hi - lo + 1 }, (_, k) => symbolAt(c, lo + k)).join('');
}

/** Limits on a learner-written table (the turing-machines lesson's spec). */
export const TM_LIMITS = { maxRules: 40, maxLineChars: 40, maxNameChars: 8 } as const;

/** The parsed machine (the first rule's state is the start), or the refusal with its line. */
export type TmParse = { ok: true; value: Tm } | Extract<RowParse<TmRule>, { ok: false }>;

const RULE_SHAPE = 'Write a rule as: state symbol -> write move next';

function parseRule(text: string, halting: readonly State[]): FieldParse<TmRule> {
  const parts = text.split(/\s+/);
  if (!parts.includes('->')) return { ok: false, error: `missing "->". ${RULE_SHAPE}` };
  if (parts.length !== 6 || parts[2] !== '->') {
    return { ok: false, error: `expected two words, an arrow, then three words, but found ${parts.length} words. ${RULE_SHAPE}` };
  }
  const [state, read, , write, moveText, next] = parts;
  for (const name of [state, next]) {
    if (name.length > TM_LIMITS.maxNameChars) return { ok: false, error: `the state name "${name}" is over ${TM_LIMITS.maxNameChars} characters.` };
  }
  for (const sym of [read, write]) {
    if ([...sym].length !== 1) return { ok: false, error: `"${sym}" is not one symbol; a tape cell holds a single character (${TM_BLANK} is blank).` };
  }
  if (!TM_MOVES.includes(moveText as TmMove)) return { ok: false, error: `unknown move "${moveText}"; use L, R or S.` };
  if (halting.includes(state)) return { ok: false, error: `${state} is a halting state, so it can't have rules.` };
  return { ok: true, value: { state, read, write, move: moveText as TmMove, next } };
}

/**
 * Reads a transition table, one rule per line: `q0 1 -> 0 R q0`. Blank lines and `#` comments are
 * skipped. Refuses, naming the line: a missing arrow, a wrong word count, an unknown move, a name
 * over 8 characters, a multi-character symbol, a rule for a halting state, a duplicate (state,
 * symbol), more than 40 rules, a line over 40 characters, and an empty table.
 */
export function parseTmTable(text: string, o: { halting?: readonly State[] } = {}): TmParse {
  const halting = o.halting ?? TM_HALT_STATES;
  const read = parseRows(text, {
    maxRows: TM_LIMITS.maxRules,
    maxLineChars: TM_LIMITS.maxLineChars,
    row: (line) => parseRule(line, halting),
  });
  if (!read.ok) return read;
  if (!read.rows.length) return { ok: false, line: 1, error: 'The table is empty. Write at least one rule, like: q0 _ -> _ S halt' };
  const firstLine = new Map<string, number>();
  for (const { line, value } of read.rows) {
    const key = `${value.state}\u0000${value.read}`;
    const earlier = firstLine.get(key);
    if (earlier !== undefined) return { ok: false, line, error: `Line ${line}: ${value.state} ${value.read} already has a rule on line ${earlier}.` };
    firstLine.set(key, line);
  }
  const rules = read.rows.map((r) => r.value);
  return { ok: true, value: { start: rules[0].state, rules, ...(o.halting && { halting }) } };
}

/** Parse a table the author wrote (a lesson's reference machine); throws on a mistake, so a typo fails at load, not on screen. */
export const mustParseTm = (text: string): Tm => {
  const p = parseTmTable(text);
  if (!p.ok) throw new Error(p.error);
  return p.value;
};
