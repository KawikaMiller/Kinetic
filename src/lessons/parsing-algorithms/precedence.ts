/**
 * The precedence game: the ambiguous grammar `E -> E + E | E * E | id` has four shift/reduce conflicts (after
 * `E op E`, seeing `+` or `*`). The learner picks shift or reduce for each; the resulting parse tree is built by
 * the real shift-reduce parser and evaluated, with the ids numbered 2, 3, 4, ... left to right.
 */
import { analyse } from './grammar';
import { buildAutomaton, buildTable, lrConflicts } from './lr';
import type { ConflictPolicy } from './opening';
import { presetGrammar } from './presets';
import { bottomUpRoot, evaluateTree, runBottomUp, type BuRun } from './runs';

export const AMBIGUOUS = presetGrammar('ambiguous');
const AUTOMATON = buildAutomaton(AMBIGUOUS);
const TABLE = buildTable(AUTOMATON, analyse(AMBIGUOUS));

const PRECEDENCE: Record<string, number> = { '+': 1, '*': 2 };

export interface ConflictCell {
  /** The table cell. */
  cell: string;
  /** The operator already on the stack (`E op E` just completed) and the lookahead operator. */
  op: string;
  look: string;
}

export const choiceId = (c: Pick<ConflictCell, 'op' | 'look'>) => `${c.op}${c.look}`;

const rank = (c: Pick<ConflictCell, 'op' | 'look'>) => (c.op === c.look ? 2 : 0) + (c.op === '+' ? 0 : 1);

/** The conflicts in a fixed order: the two that decide precedence first, then the two for equal operators. */
export const CONFLICTS: ConflictCell[] = lrConflicts(TABLE)
  .map((cell) => {
    const [state, look] = cell.split('\u0000');
    const complete = AUTOMATON.states[Number(state)].items.find((i) => i.dot === 3 && AUTOMATON.productions[i.prod].rhs.length === 3);
    return { cell, op: AUTOMATON.productions[complete!.prod].rhs[1], look };
  })
  .sort((a, b) => rank(a) - rank(b));

/** What the usual precedence and left-associativity rules choose: shift when the next operator binds tighter, otherwise reduce. */
export const usualChoice = (c: Pick<ConflictCell, 'op' | 'look'>): ConflictPolicy => (PRECEDENCE[c.look] > PRECEDENCE[c.op] ? 'shift' : 'reduce');

/**
 * Token strings that each put one of the four conflicts in play: on `id + id * id` only the first choice is reached with a
 * different value; the other three need the shape of the input to match. `+` and `*` are associative, so the equal-operator
 * choices change the tree's shape but never its value.
 */
export const TOKEN_PRESETS: { text: string; choice: string; changesValue: boolean }[] = [
  { text: 'id + id * id', choice: '+*', changesValue: true },
  { text: 'id * id + id', choice: '*+', changesValue: true },
  { text: 'id + id + id', choice: '++', changesValue: false },
  { text: 'id * id * id', choice: '**', changesValue: false },
];

export type Choices = Record<string, ConflictPolicy>;

export const usualChoices = (): Choices => Object.fromEntries(CONFLICTS.map((c) => [choiceId(c), usualChoice(c)]));

export interface GameResult {
  run: BuRun;
  /** The finished tree's root, or null when the parse did not finish. */
  root: number | null;
  value: number | null;
}

export function playGame(tokens: readonly string[], choices: Choices): GameResult {
  const byCell = new Map(CONFLICTS.map((c) => [c.cell, c]));
  const run = runBottomUp(AUTOMATON, TABLE, tokens, (cell, actions) => {
    const c = byCell.get(cell);
    return (c && actions.find((a) => a.kind === choices[choiceId(c)])) || null;
  });
  const root = bottomUpRoot(run);
  return { run, root, value: root === null ? null : evaluateTree(run.nodes, root) };
}
