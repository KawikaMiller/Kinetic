/**
 * Thompson's construction: a regex tree becomes an NFA with ε-moves, one fragment per node, built from the
 * leaves up. Each state and arrow records which node added it, so the lesson can replay the construction.
 *
 * Fragment shapes (each has one start and one end state):
 *   literal / set / `.`  two states and one arrow
 *   concatenation        an ε arrow from one fragment's end to the next one's start
 *   alternation          a new split and a new join (2 states), an ε arrow into and out of every option
 *   `*`                  a new start and end, with the loop-back arrow and the skip arrow
 *   `+`                  the same without the skip arrow
 *   `?`                  the same without the loop-back arrow
 */
import { EPSILON, type Nfa, type State } from '../../core/automata';
import { layeredLayout, layeredPositions, type Pt } from '../../core/graphLayout';
import { nodesInOrder, type ParsedRegex, type RegexNode } from './regexParse';

/** Stands for "any character the pattern does not name": what `.` also matches. */
export const ELSE = 'else';

export interface ConsState {
  id: State;
  /** The node whose construction step created this state. */
  addedBy: number;
}

export interface ConsEdge {
  from: State;
  to: State;
  /** [ε] for an ε arrow, otherwise the characters it consumes. */
  symbols: string[];
  addedBy: number;
  /** A loop-back arrow (it points to an earlier part of the drawing). */
  back: boolean;
  /** Drawn as "any": it consumes every symbol of the alphabet. */
  any: boolean;
}

export interface Construction {
  nfa: Nfa;
  states: ConsState[];
  edges: ConsEdge[];
  /** Node ids in construction order (children before parents). */
  order: number[];
}

export interface BuildOptions {
  /** The broken variant the tests use: `*` without its skip arrow, so `a*` cannot match "". */
  skipStarShortcut?: boolean;
}

export type BuildResult = { ok: true; value: Construction } | { ok: false; error: string };

export const BACKREF_REFUSAL = 'this needs memory an automaton does not have.';

/** The symbols the NFA consumes: every literal and set character, plus ELSE when the pattern has a `.`. */
export function patternAlphabet(root: RegexNode): string[] {
  const chars = new Set<string>();
  let hasAny = false;
  for (const n of nodesInOrder(root)) {
    if (n.kind === 'lit') chars.add(n.ch);
    else if (n.kind === 'set') n.chars.forEach((c) => chars.add(c));
    else if (n.kind === 'any') hasAny = true;
  }
  const sorted = [...chars].sort();
  return hasAny ? [...sorted, ELSE] : sorted;
}

/** The symbol a subject character is read as: itself when the pattern names it, ELSE otherwise (what only `.` can match). */
export const symbolOf = (alphabet: readonly string[], ch: string) => (alphabet.includes(ch) ? ch : alphabet.includes(ELSE) ? ELSE : ch);

export function buildNfa(parsed: ParsedRegex, options: BuildOptions = {}): BuildResult {
  if (parsed.usesBackref) return { ok: false, error: BACKREF_REFUSAL };
  const alphabet = patternAlphabet(parsed.root);
  const states: ConsState[] = [];
  const edges: ConsEdge[] = [];
  let by = 0;

  const state = (): State => {
    const id = `q${states.length}`;
    states.push({ id, addedBy: by });
    return id;
  };
  const edge = (from: State, to: State, symbols: string[], back = false, any = false) => edges.push({ from, to, symbols, addedBy: by, back, any });
  const eps = (from: State, to: State, back = false) => edge(from, to, [EPSILON], back);

  const build = (n: RegexNode): { start: State; end: State } => {
    switch (n.kind) {
      case 'group':
        return build(n.child);
      case 'lit':
      case 'any':
      case 'set': {
        by = n.id;
        const start = state();
        const end = state();
        if (n.kind === 'lit') edge(start, end, [n.ch]);
        else if (n.kind === 'set') edge(start, end, [...new Set(n.chars)].sort());
        else edge(start, end, alphabet, false, true);
        return { start, end };
      }
      case 'backref':
        throw new Error('back-references are refused before the build');
      case 'cat': {
        const frags = n.parts.map(build);
        by = n.id;
        for (let i = 0; i + 1 < frags.length; i++) eps(frags[i].end, frags[i + 1].start);
        return { start: frags[0].start, end: frags[frags.length - 1].end };
      }
      case 'alt': {
        const frags = n.options.map(build);
        by = n.id;
        const start = state();
        const end = state();
        for (const f of frags) {
          eps(start, f.start);
          eps(f.end, end);
        }
        return { start, end };
      }
      case 'rep': {
        const f = build(n.child);
        by = n.id;
        const start = state();
        const end = state();
        eps(start, f.start);
        eps(f.end, end);
        if (n.op !== '?') eps(f.end, f.start, true);
        if (n.op !== '+' && !(n.op === '*' && options.skipStarShortcut)) eps(start, end);
        return { start, end };
      }
    }
  };

  const whole = build(parsed.root);
  const delta: Record<State, Record<string, State[]>> = {};
  for (const s of states) delta[s.id] = {};
  for (const e of edges) {
    for (const sym of e.symbols) (delta[e.from][sym] ??= []).push(e.to);
  }
  const nfa: Nfa = { kind: 'nfa', states: states.map((s) => s.id), alphabet, start: whole.start, accept: [whole.end], delta };
  return { ok: true, value: { nfa, states, edges, order: nodesInOrder(parsed.root).map((n) => n.id) } };
}

/** The machine for a pattern the scene has already checked has no back-reference (those are refused when typed). */
export function constructionOf(parsed: ParsedRegex): Construction {
  const built = buildNfa(parsed);
  if (!built.ok) throw new Error(`${parsed.source}: ${built.error}`);
  return built.value;
}

/** How many ε arrows the machine has, counted from its transition table (not from the edge list). */
export function epsilonCount(nfa: Nfa): number {
  return nfa.states.reduce((sum, s) => sum + (nfa.delta[s]?.[EPSILON]?.length ?? 0), 0);
}

/**
 * The count of ε arrows the construction rules predict from the tree alone: one per join, two per option of an
 * alternation, four for `*`, three for `+` and for `?`.
 */
export function predictedEpsilons(root: RegexNode): number {
  let total = 0;
  for (const n of nodesInOrder(root)) {
    if (n.kind === 'cat') total += n.parts.length - 1;
    else if (n.kind === 'alt') total += 2 * n.options.length;
    else if (n.kind === 'rep') total += n.op === '*' ? 4 : 3;
  }
  return total;
}

/** States the rules predict: two per atom, two per alternation, two per quantifier. */
export function predictedStates(root: RegexNode): number {
  let total = 0;
  for (const n of nodesInOrder(root)) {
    if (n.kind === 'lit' || n.kind === 'any' || n.kind === 'set' || n.kind === 'alt' || n.kind === 'rep') total += 2;
  }
  return total;
}

const SPACING = { direction: 'right' as const, layerGap: 84, nodeGap: 58, padMain: 36, padCross: 40 };

export interface Placement {
  at: Record<State, Pt>;
  width: number;
  height: number;
}

/** Fixed positions for the whole machine, so nothing moves while the construction adds to it. Loop-back arrows do not take part in layering. */
export function placeNfa(c: Construction): Placement {
  const forward = c.edges.filter((e) => !e.back).map((e) => ({ from: e.from, to: e.to }));
  const placed = layeredPositions(layeredLayout(c.states.map((s) => s.id), forward), SPACING);
  return { at: Object.fromEntries(placed.at), width: placed.width, height: placed.height };
}

export const edgeKey = (e: Pick<ConsEdge, 'from' | 'to'>) => `${e.from}\u0000${e.to}`;

/** The text on an arrow: ε, "any" for a dot, or the characters it consumes. */
export function edgeLabel(e: ConsEdge): string {
  if (e.symbols[0] === EPSILON) return 'ε';
  if (e.any) return 'any';
  return e.symbols.map((s) => (s === ELSE ? 'other' : s)).join(',');
}
