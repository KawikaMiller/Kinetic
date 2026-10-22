import { mulberry32, randInt } from '../../core/random';

export const MAX_PATTERNS = 6;
export const MAX_PATTERN_LENGTH = 6;
export const MAX_LETTERS = 24;
export const TEXT_MAX = 24;
export const DEFAULT_PATTERNS: readonly string[] = ['he', 'she', 'his', 'hers'];
export const DEFAULT_TEXT = 'ushers';
export const ROOT = 0;

/** A seed-free shortest witness for the broken mode (no output links): this text misses a nested match. */
export const OUTPUT_LINK_WITNESS = 'ushers';
/** The broken mode is counted over the seeded cases 0 to this value minus one. */
export const BROKEN_CASES = 500;

export interface TrieState {
  id: number;
  parent: number;
  /** The letter on the edge from the parent ('' for the root). */
  letter: string;
  depth: number;
  /** The string this state spells. */
  string: string;
  children: ReadonlyMap<string, number>;
  /** Index of the pattern that ends here, or -1. */
  ends: number;
}

export interface Trie {
  patterns: readonly string[];
  states: readonly TrieState[];
}

/** The trie of the patterns, states numbered in insertion order (root 0, then each pattern's new states in turn). */
export function buildTrie(patterns: readonly string[]): Trie {
  const states: { id: number; parent: number; letter: string; depth: number; string: string; children: Map<string, number>; ends: number }[] = [
    { id: ROOT, parent: -1, letter: '', depth: 0, string: '', children: new Map(), ends: -1 },
  ];
  patterns.forEach((pattern, index) => {
    let at = ROOT;
    for (const letter of pattern) {
      let next = states[at].children.get(letter);
      if (next === undefined) {
        next = states.length;
        states.push({ id: next, parent: at, letter, depth: states[at].depth + 1, string: states[at].string + letter, children: new Map(), ends: -1 });
        states[at].children.set(letter, next);
      }
      at = next;
    }
    states[at].ends = index;
  });
  return { patterns, states };
}

/** State ids in breadth-first order, root first; ties keep insertion order. */
export function bfsOrder(trie: Trie): number[] {
  const order = [ROOT];
  for (let head = 0; head < order.length; head += 1) {
    const children = [...trie.states[order[head]].children.values()].sort((a, b) => a - b);
    order.push(...children);
  }
  return order;
}

/** The goto function: the child by `letter`, or undefined. */
export const child = (trie: Trie, state: number, letter: string): number | undefined => trie.states[state].children.get(letter);

/** Failure links by the breadth-first construction: fail[child of u by c] = goto(fail(u) or an ancestor of it, c). */
export function failureLinks(trie: Trie): number[] {
  const fail = new Array<number>(trie.states.length).fill(ROOT);
  for (const u of bfsOrder(trie)) {
    for (const [letter, v] of trie.states[u].children) {
      if (u === ROOT) {
        fail[v] = ROOT;
        continue;
      }
      let f = fail[u];
      while (f !== ROOT && child(trie, f, letter) === undefined) f = fail[f];
      fail[v] = child(trie, f, letter) ?? ROOT;
    }
  }
  return fail;
}

/** Output links: from each state, the nearest state on its failure chain (the state itself excluded) that ends a pattern, or -1. */
export function outputLinks(trie: Trie, fail: readonly number[]): number[] {
  const out = new Array<number>(trie.states.length).fill(-1);
  for (const v of bfsOrder(trie)) {
    if (v === ROOT) continue;
    const f = fail[v];
    out[v] = f !== ROOT && trie.states[f].ends >= 0 ? f : f === ROOT ? -1 : out[f];
  }
  return out;
}

export interface Match {
  pattern: string;
  /** First and last text position of the match. */
  start: number;
  end: number;
}

export type StepKind = 'read' | 'follow' | 'move' | 'stay' | 'report' | 'out';

export interface ScanStep {
  kind: StepKind;
  /** Text position being read. */
  i: number;
  letter: string;
  /** The state the token was in before this step, and in after it. */
  from: number;
  to: number;
  /** For a `report` or `out` step: the match. */
  match?: Match;
  /** For an `out` step: the state the output link was followed from. */
  via?: number;
}

export interface ScanResult {
  steps: ScanStep[];
  matches: Match[];
  /** Characters read, failure follows, and the deepest state reached. */
  reads: number;
  follows: number;
}

/** Streams `text` through the automaton. Without output links (the broken mode) only the pattern ending at the current state is reported. */
export function scan(trie: Trie, fail: readonly number[], out: readonly number[], text: string, outputLinksOn = true): ScanResult {
  const steps: ScanStep[] = [];
  const matches: Match[] = [];
  let state = ROOT;
  let follows = 0;
  const report = (kind: 'report' | 'out', at: number, i: number, via?: number) => {
    const pattern = trie.patterns[trie.states[at].ends];
    const match = { pattern, start: i - pattern.length + 1, end: i };
    matches.push(match);
    steps.push({ kind, i, letter: text[i], from: at, to: at, match, via });
  };
  for (let i = 0; i < text.length; i += 1) {
    const letter = text[i];
    steps.push({ kind: 'read', i, letter, from: state, to: state });
    while (state !== ROOT && child(trie, state, letter) === undefined) {
      const next = fail[state];
      steps.push({ kind: 'follow', i, letter, from: state, to: next });
      follows += 1;
      state = next;
    }
    const next = child(trie, state, letter);
    if (next === undefined) {
      steps.push({ kind: 'stay', i, letter, from: state, to: state });
    } else {
      steps.push({ kind: 'move', i, letter, from: state, to: next });
      state = next;
    }
    if (trie.states[state].ends >= 0) report('report', state, i);
    if (outputLinksOn) {
      for (let from = state, o = out[state]; o >= 0; from = o, o = out[o]) report('out', o, i, from);
    }
  }
  return { steps, matches, reads: text.length, follows };
}

/** Counts the characters the naive matcher compares: every pattern at every alignment that fits, stopping at the first mismatch. */
export function naiveScan(patterns: readonly string[], text: string): { matches: Match[]; compared: number } {
  const matches: Match[] = [];
  let compared = 0;
  for (const pattern of patterns) {
    for (let start = 0; start + pattern.length <= text.length; start += 1) {
      let k = 0;
      while (k < pattern.length) {
        compared += 1;
        if (text[start + k] !== pattern[k]) break;
        k += 1;
      }
      if (k === pattern.length) matches.push({ pattern, start, end: start + pattern.length - 1 });
    }
  }
  return { matches, compared };
}

/** A match set as sorted strings, to compare two matchers without caring about report order. */
export const matchKeys = (matches: readonly Match[]): string[] => matches.map((m) => `${m.pattern}@${m.start}`).sort();

export interface Machine {
  trie: Trie;
  fail: number[];
  out: number[];
}

export function buildMachine(patterns: readonly string[]): Machine {
  const trie = buildTrie(patterns);
  const fail = failureLinks(trie);
  return { trie, fail, out: outputLinks(trie, fail) };
}

export const runMachine = (m: Machine, text: string, outputLinksOn = true): ScanResult => scan(m.trie, m.fail, m.out, text, outputLinksOn);

// ── The editor and the by-hand failure-link game ─────────────────────────

export const LOWERCASE = /^[a-z]+$/;

export type Edit = { ok: true; patterns: string[] } | { ok: false; error: string };

/** Adds one pattern, or says why not. */
export function addPattern(patterns: readonly string[], raw: string): Edit {
  const word = raw.trim();
  if (word === '') return { ok: false, error: 'A pattern needs at least one letter.' };
  if (!LOWERCASE.test(word)) return { ok: false, error: 'Lowercase letters only in this lesson.' };
  if (word.length > MAX_PATTERN_LENGTH) return { ok: false, error: `A pattern has at most ${MAX_PATTERN_LENGTH} letters.` };
  if (patterns.includes(word)) return { ok: false, error: `${word} is already a pattern.` };
  if (patterns.length >= MAX_PATTERNS) return { ok: false, error: `At most ${MAX_PATTERNS} patterns: remove one first.` };
  if (patterns.reduce((sum, p) => sum + p.length, 0) + word.length > MAX_LETTERS) {
    return { ok: false, error: `At most ${MAX_LETTERS} letters in all: remove a pattern or use a shorter one.` };
  }
  return { ok: true, patterns: [...patterns, word] };
}

export type TextParse = { ok: true; text: string } | { ok: false; error: string };

export function parseText(raw: string): TextParse {
  if (raw === '') return { ok: false, error: 'Type at least one letter of text.' };
  if (!LOWERCASE.test(raw)) return { ok: false, error: 'Lowercase letters only in this lesson.' };
  if (raw.length > TEXT_MAX) return { ok: false, error: `The text is limited to ${TEXT_MAX} letters.` };
  return { ok: true, text: raw };
}

export type LinkJudgement = { ok: true } | { ok: false; error: string };

const stateName = (trie: Trie, id: number) => (id === ROOT ? 'the root (the empty string)' : `'${trie.states[id].string}' (state ${id})`);

/** Judges a learner's failure link for `state`: it must be the longest proper suffix that is a trie prefix. */
export function judgeLink(machine: Machine, state: number, target: number): LinkJudgement {
  const { trie, fail } = machine;
  const s = trie.states[state];
  const right = fail[state];
  if (target === right) return { ok: true };
  const chosen = trie.states[target];
  if (chosen.depth >= s.depth) {
    return {
      ok: false,
      error: `A failure link must point to a shorter string. For '${s.string}' the longest proper suffix that is also a pattern prefix is ${stateName(trie, right)}, not '${chosen.string}'.`,
    };
  }
  if (!s.string.endsWith(chosen.string)) {
    return { ok: false, error: `'${chosen.string || 'the root'}' is not a suffix of '${s.string}': a failure link points to a string that ends where '${s.string}' ends.` };
  }
  const longer = trie.patterns.find((p) => p.startsWith(trie.states[right].string)) ?? trie.states[right].string;
  return {
    ok: false,
    error: `Not the longest: ${stateName(trie, right)} is also a suffix of '${s.string}' and a prefix of '${longer}', so the link goes there, not to ${stateName(trie, target)}.`,
  };
}

// ── Seeded cases for the broken mode and the oracles ─────────────────────

export interface Case {
  patterns: string[];
  text: string;
}

const CASE_ALPHABET = 'abc';

/** A seeded (pattern set, text) pair: 2 to 6 distinct patterns of 1 to 4 letters over a, b, c and a text of up to 30 letters. */
export function seededCase(seed: number): Case {
  const rnd = mulberry32(seed);
  const wanted = randInt(2, 6, rnd);
  const patterns: string[] = [];
  for (let tries = 0; patterns.length < wanted && tries < 100; tries += 1) {
    const length = randInt(1, 4, rnd);
    const word = Array.from({ length }, () => CASE_ALPHABET[randInt(0, 2, rnd)]).join('');
    if (!patterns.includes(word)) patterns.push(word);
  }
  const text = Array.from({ length: randInt(1, 30, rnd) }, () => CASE_ALPHABET[randInt(0, 2, rnd)]).join('');
  return { patterns, text };
}

export interface BrokenReport {
  cases: number;
  /** Cases where the no-output-links scan misses a match that the naive scan finds. */
  failing: number;
  lowestFailingSeed: number;
  witness: { text: string; missed: Match[]; reported: Match[] };
}

/** Runs the no-output-links scan against the naive scan over the seeded cases 0 to cases - 1, and on the seed-free witness. */
export function brokenReport(cases = BROKEN_CASES): BrokenReport {
  let failing = 0;
  let lowest = -1;
  for (let seed = 0; seed < cases; seed += 1) {
    const { patterns, text } = seededCase(seed);
    const machine = buildMachine(patterns);
    const broken = matchKeys(runMachine(machine, text, false).matches);
    const truth = matchKeys(naiveScan(patterns, text).matches);
    if (broken.join() !== truth.join()) {
      failing += 1;
      if (lowest < 0) lowest = seed;
    }
  }
  const machine = buildMachine(DEFAULT_PATTERNS);
  const reported = runMachine(machine, OUTPUT_LINK_WITNESS, false).matches;
  const have = new Set(matchKeys(reported));
  const missed = naiveScan(DEFAULT_PATTERNS, OUTPUT_LINK_WITNESS).matches.filter((m) => !have.has(`${m.pattern}@${m.start}`));
  return { cases, failing, lowestFailingSeed: lowest, witness: { text: OUTPUT_LINK_WITNESS, missed, reported } };
}

/** The links the learner has set so far, by state id. */
export type Assigned = Readonly<Record<number, number>>;

/** The next state to assign: the first in breadth-first order (root excluded) without a link yet. */
export function nextToAssign(machine: Machine, assigned: Assigned): number | undefined {
  return bfsOrder(machine.trie).slice(1).find((id) => assigned[id] === undefined);
}

/** Every failure link, as the Reveal button fills them in. */
export function allLinks(machine: Machine): Assigned {
  return Object.fromEntries(bfsOrder(machine.trie).slice(1).map((id) => [id, machine.fail[id]]));
}

/** What the learner's click on `target` does for the state that is next in line: the new links, or the refusal. */
export function clickTarget(machine: Machine, assigned: Assigned, target: number): { assigned: Assigned; message: string; ok: boolean } | null {
  const state = nextToAssign(machine, assigned);
  if (state === undefined) return null;
  const verdict = judgeLink(machine, state, target);
  if (!verdict.ok) return { assigned, message: verdict.error, ok: false };
  const names = (id: number) => (id === ROOT ? 'the root' : `'${machine.trie.states[id].string}' (state ${id})`);
  return {
    assigned: { ...assigned, [state]: target },
    message: `Right: the failure link of '${machine.trie.states[state].string}' (state ${state}) goes to ${names(target)}.`,
    ok: true,
  };
}
