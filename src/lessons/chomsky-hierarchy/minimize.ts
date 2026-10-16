/**
 * DFA minimisation by partition refinement (Moore): start with accepting against rejecting, split every class
 * whose members disagree about where a symbol leads, repeat until nothing splits. The classes left are the
 * states of the minimal DFA. Also the shortest string that tells two states apart, and the Myhill-Nerode count
 * of prefix classes for a language given only by its membership test.
 */
import { dfaStep, type Dfa, type State } from '../../core/automata';

export interface Partition {
  /** Class number per state, numbered in order of first appearance. */
  classOf: Record<State, number>;
  count: number;
}

/** States reachable from the start. */
export function reachable(dfa: Dfa): State[] {
  const seen = new Set<State>([dfa.start]);
  const queue = [dfa.start];
  while (queue.length) {
    const s = queue.shift()!;
    for (const c of dfa.alphabet) {
      const t = dfaStep(dfa, s, c);
      if (t !== null && !seen.has(t)) {
        seen.add(t);
        queue.push(t);
      }
    }
  }
  return dfa.states.filter((s) => seen.has(s));
}

const numbered = (keys: Record<State, string>, order: readonly State[]): Partition => {
  const ids = new Map<string, number>();
  const classOf: Record<State, number> = {};
  for (const s of order) {
    if (!ids.has(keys[s])) ids.set(keys[s], ids.size);
    classOf[s] = ids.get(keys[s])!;
  }
  return { classOf, count: ids.size };
};

/** Round 0 is accepting against rejecting; each later round is one refinement; the last round is stable. */
export function refine(dfa: Dfa): Partition[] {
  const states = reachable(dfa);
  let current = numbered(Object.fromEntries(states.map((s) => [s, dfa.accept.includes(s) ? 'accept' : 'reject'])), states);
  const rounds = [current];
  for (;;) {
    const signature = Object.fromEntries(
      states.map((s) => [s, [current.classOf[s], ...dfa.alphabet.map((c) => current.classOf[dfaStep(dfa, s, c) as State])].join(',')]),
    );
    const next = numbered(signature, states);
    if (next.count === current.count) return rounds;
    rounds.push(next);
    current = next;
  }
}

export const finalPartition = (dfa: Dfa): Partition => refine(dfa).at(-1)!;

/** The shortest string that is accepted from one of the two states and rejected from the other, or null when they behave alike. Breadth-first over pairs of states. */
export function distinguishing(dfa: Dfa, p: State, q: State): string | null {
  const key = (a: State, b: State) => `${a}\u0000${b}`;
  const seen = new Set([key(p, q)]);
  let frontier: { a: State; b: State; word: string }[] = [{ a: p, b: q, word: '' }];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const { a, b, word } of frontier) {
      if (dfa.accept.includes(a) !== dfa.accept.includes(b)) return word;
      for (const c of dfa.alphabet) {
        const a2 = dfaStep(dfa, a, c) as State;
        const b2 = dfaStep(dfa, b, c) as State;
        if (!seen.has(key(a2, b2))) {
          seen.add(key(a2, b2));
          next.push({ a: a2, b: b2, word: word + c });
        }
      }
    }
    frontier = next;
  }
  return null;
}

/** The states of a class as a name: "{s0,s3}" (just "s0" for a class of one). */
export const className = (members: readonly State[]) => (members.length === 1 ? members[0] : `{${members.join(',')}}`);

/** The DFA whose states are the partition's classes. */
export function quotient(dfa: Dfa, partition: Partition): Dfa {
  const states = reachable(dfa);
  const members = Array.from({ length: partition.count }, (_, k) => states.filter((s) => partition.classOf[s] === k));
  const nameOf = (s: State) => className(members[partition.classOf[s]]);
  const delta: Record<State, Record<string, State>> = {};
  for (const group of members) {
    delta[className(group)] = Object.fromEntries(dfa.alphabet.map((c) => [c, nameOf(dfaStep(dfa, group[0], c) as State)]));
  }
  return {
    kind: 'dfa',
    states: members.map(className),
    alphabet: dfa.alphabet,
    start: nameOf(dfa.start),
    accept: members.filter((g) => dfa.accept.includes(g[0])).map(className),
    delta,
  };
}

/**
 * Myhill-Nerode for a language given by `member`: how many different behaviours the prefixes a^0 .. a^k have
 * when tried against every suffix of at most `maxSuffix` letters. Two prefixes behave alike when they agree on
 * every suffix.
 */
export function prefixClasses(member: (s: string) => boolean, alphabet: readonly string[], prefixes: readonly string[], maxSuffix: number): number {
  const suffixes = [''];
  let layer = [''];
  for (let n = 1; n <= maxSuffix; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => s + a));
    for (const s of layer) suffixes.push(s);
  }
  return new Set(prefixes.map((p) => suffixes.map((s) => (member(p + s) ? '1' : '0')).join(''))).size;
}

/** The two preset DFAs with redundant states. */
export interface MinimiseExample {
  id: string;
  label: string;
  dfa: Dfa;
  language: string;
}

const ab = ['a', 'b'];

export const EXAMPLES: MinimiseExample[] = [
  {
    id: 'mod3',
    label: 'Counts mod 3, written with 6 states',
    language: 'the number of a\'s is a multiple of 3 (b changes nothing)',
    dfa: {
      kind: 'dfa', alphabet: ab, start: 's0', accept: ['s0', 's3'],
      states: ['s0', 's1', 's2', 's3', 's4', 's5'],
      delta: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`s${i}`, { a: `s${(i + 1) % 6}`, b: `s${i}` }])),
    },
  },
  {
    id: 'endsab',
    label: 'Ends in ab, with duplicate states',
    language: 'the string ends in ab',
    dfa: {
      kind: 'dfa', alphabet: ab, start: 'p0', accept: ['p2'],
      states: ['p0', 'p0b', 'p1', 'p1b', 'p2'],
      delta: {
        p0: { a: 'p1', b: 'p0b' }, p0b: { a: 'p1b', b: 'p0' },
        p1: { a: 'p1b', b: 'p2' }, p1b: { a: 'p1', b: 'p2' },
        p2: { a: 'p1', b: 'p0' },
      },
    },
  },
];
