/**
 * byzantine-faults: the oral-messages algorithm OM(m) of the Byzantine generals, as a pure synchronous recursion.
 * General 0 is the commander, generals 1.. are lieutenants. Values are 0 (retreat) and 1 (attack). A traitor may send
 * any bit on any edge; a loyal general passes on what it received. A lieutenant decides the majority of the values it
 * holds, and a TIE GOES TO RETREAT (0): a toy default, stated on screen.
 *
 * An instance is named by its path p: p[0] is the commander and p[k] the lieutenant that is commander of the
 * sub-instance. Within the instance with path p the commander last(p) sends to every lieutenant not in p. The bit a
 * traitor sends is `bit(sender, path, receiver)`: the one place where the adversary chooses.
 */
import { hash32 } from '../../core/hash';

export type Bit = 0 | 1;
export const RETREAT: Bit = 0;
export const ATTACK: Bit = 1;
export const COMMANDER = 0;

export const generalName = (i: number): string => (i === COMMANDER ? 'C' : `L${i}`);
export const orderName = (b: Bit | null): string => (b === null ? 'nothing' : b === ATTACK ? 'attack' : 'retreat');

/** What a traitor sends: a function of the edge. */
export type TraitorBits = (sender: number, path: readonly number[], receiver: number) => Bit;

export interface OmSetup {
  /** Generals in all, the commander included. */
  n: number;
  /** Rounds of relaying: OM(m). */
  m: number;
  traitors: ReadonlySet<number>;
  /** The loyal commander's order. */
  order: Bit;
  bit: TraitorBits;
}

const pathKey = (i: number, path: readonly number[]) => `${i}|${path.join('.')}`;

/** Majority of bits; a tie goes to retreat. */
export const majorityOf = (bits: readonly Bit[]): Bit => {
  const ones = bits.filter((b) => b === ATTACK).length;
  return ones * 2 > bits.length ? ATTACK : RETREAT;
};

export interface Message {
  from: number;
  to: number;
  path: number[];
  value: Bit;
  /** Sent by a traitor. */
  traitor: boolean;
}

export interface OmRun {
  /** Everything received: key `${receiver}|${path}`. */
  received: Map<string, Bit>;
  /** Every message sent, in round order. */
  messages: Message[];
  /** The value each lieutenant decides (traitors included, for display; only loyal ones are judged). */
  decisions: Map<number, Bit>;
}

/** Run OM(m): every message of every round, then every lieutenant's recursive majority. */
export function runOm(setup: OmSetup): OmRun {
  const lieutenants = Array.from({ length: setup.n - 1 }, (_, k) => k + 1);
  const received = new Map<string, Bit>();
  const messages: Message[] = [];
  const instance = (path: number[], held: Bit) => {
    const sender = path[path.length - 1];
    const audience = lieutenants.filter((l) => !path.includes(l));
    const traitor = setup.traitors.has(sender);
    for (const to of audience) {
      const value = traitor ? setup.bit(sender, path, to) : held;
      received.set(pathKey(to, path), value);
      messages.push({ from: sender, to, path, value, traitor });
    }
    if (path.length - 1 < setup.m) for (const next of audience) instance([...path, next], received.get(pathKey(next, path))!);
  };
  instance([COMMANDER], setup.order);

  const value = (i: number, path: number[]): Bit => {
    const direct = received.get(pathKey(i, path))!;
    if (path.length - 1 === setup.m) return direct;
    const others = lieutenants.filter((j) => !path.includes(j) && j !== i);
    return majorityOf([direct, ...others.map((j) => value(i, [...path, j]))]);
  };
  const decisions = new Map(lieutenants.map((i) => [i, value(i, [COMMANDER])] as const));
  return { received, messages, decisions };
}

export interface Verdict {
  ic1: boolean;
  ic2: boolean;
  /** The loyal lieutenants' decisions, by general. */
  loyal: Map<number, Bit>;
}

/** IC1: the loyal lieutenants decide the same value. IC2: when the commander is loyal, they decide its order. */
export function judge(setup: OmSetup, run: OmRun): Verdict {
  const loyal = new Map([...run.decisions].filter(([i]) => !setup.traitors.has(i)));
  const values = [...loyal.values()];
  return {
    ic1: values.every((v) => v === values[0]),
    ic2: setup.traitors.has(COMMANDER) || values.every((v) => v === setup.order),
    loyal,
  };
}

/** The values lieutenant `i` holds in OM(1): its own receipt first, then the relays, in lieutenant order. */
export function held(setup: OmSetup, run: OmRun, i: number): { from: number; value: Bit }[] {
  const out = [{ from: COMMANDER, value: run.received.get(pathKey(i, [COMMANDER]))! }];
  for (let j = 1; j < setup.n; j++) if (j !== i) out.push({ from: j, value: run.received.get(pathKey(i, [COMMANDER, j]))! });
  return out;
}

// ---------- every traitor behaviour (OM(1), one traitor, binary values) ----------

export interface Behaviour {
  traitor: number;
  order: Bit;
  /** The bit the traitor sends on each of its edges, in lieutenant order. */
  bits: Bit[];
}

/** Every behaviour with one traitor: its identity, the loyal commander's order, and every bit on every edge. */
export function behaviours(n: number): Behaviour[] {
  const out: Behaviour[] = [];
  const lieutenants = n - 1;
  for (let traitor = 0; traitor < n; traitor++) {
    const edges = traitor === COMMANDER ? lieutenants : lieutenants - 1;
    const orders: Bit[] = traitor === COMMANDER ? [RETREAT] : [RETREAT, ATTACK];
    for (const order of orders) {
      for (let mask = 0; mask < 2 ** edges; mask++) out.push({ traitor, order, bits: Array.from({ length: edges }, (_, k) => ((mask >> k) & 1) as Bit) });
    }
  }
  return out;
}

/** The setup a behaviour describes: its bits go to the traitor's audience in index order. */
export function setupOf(n: number, b: Behaviour): OmSetup {
  return {
    n,
    m: 1,
    traitors: new Set([b.traitor]),
    order: b.order,
    bit: (_sender, path, receiver) => {
      const audience = Array.from({ length: n - 1 }, (_, k) => k + 1).filter((l) => !path.includes(l));
      return b.bits[audience.indexOf(receiver)];
    },
  };
}

/** What the learner has set in scene 1: at most one traitor, and the bit it sends to each receiver. */
export interface TraitorState {
  n: number;
  /** The traitor's general index, or null while everybody is loyal. */
  traitor: number | null;
  /** A loyal commander's order. */
  order: Bit;
  /** The bit the traitor sends to each receiver (missing means retreat). */
  bits: Record<number, Bit>;
}

/** The opening state: three generals, L2 the traitor, a loyal commander ordering attack, and L2 relaying retreat to L1. */
export const DEFAULT_TRAITOR_STATE: TraitorState = { n: 3, traitor: 2, order: ATTACK, bits: { 1: RETREAT } };

/** The pinned refusal for a second traitor. */
export const ONE_TRAITOR_REFUSAL = 'This scene allows one traitor (f = 1).';

/** Make general `i` the traitor, or turn it off if it already is; a second traitor is refused. */
export function chooseTraitor(s: TraitorState, i: number): { ok: true; state: TraitorState } | { ok: false; reason: string } {
  if (s.traitor === i) return { ok: true, state: { ...s, traitor: null } };
  if (s.traitor !== null) return { ok: false, reason: ONE_TRAITOR_REFUSAL };
  return { ok: true, state: { ...s, traitor: i, bits: {} } };
}

export function setupOfState(s: TraitorState): OmSetup {
  return { n: s.n, m: 1, traitors: new Set(s.traitor === null ? [] : [s.traitor]), order: s.order, bit: (_sender, _path, receiver) => s.bits[receiver] ?? RETREAT };
}

/** The behaviour a state describes (a traitor must be chosen): bits to its audience in index order. */
export function behaviourOfState(s: TraitorState & { traitor: number }): Behaviour {
  const audience = Array.from({ length: s.n - 1 }, (_, k) => k + 1).filter((l) => l !== s.traitor);
  return { traitor: s.traitor, order: s.traitor === COMMANDER ? RETREAT : s.order, bits: audience.map((r) => s.bits[r] ?? RETREAT) };
}

export interface Enumeration {
  n: number;
  total: number;
  /** The behaviours that break IC1 or IC2. */
  breaking: Behaviour[];
}

export function tryEveryBehaviour(n: number): Enumeration {
  const all = behaviours(n);
  const breaking = all.filter((b) => {
    const s = setupOf(n, b);
    const v = judge(s, runOm(s));
    return !v.ic1 || !v.ic2;
  });
  return { n, total: all.length, breaking };
}

/** The rules (by name) that at least one behaviour of an enumeration breaks. */
export const rulesBrokenIn = (e: Enumeration): ('IC1' | 'IC2')[] =>
  (['IC1', 'IC2'] as const).filter((name) => e.breaking.some((b) => {
    const s = setupOf(e.n, b);
    const v = judge(s, runOm(s));
    return name === 'IC1' ? !v.ic1 : !v.ic2;
  }));

/** Which rule broke for a behaviour, in words naming the pair of values the first loyal lieutenant holds. */
export function breakText(n: number, b: Behaviour): string {
  const s = setupOf(n, b);
  const run = runOm(s);
  const v = judge(s, run);
  const culprit = [...v.loyal].find(([, d]) => (!v.ic2 ? d !== s.order : true)) ?? [...v.loyal][0];
  const holds = held(s, run, culprit[0]);
  const pair = holds.map((h) => `${generalName(h.from)}: ${h.value}`).join(' and ');
  const tie = holds.filter((h) => h.value === ATTACK).length * 2 === holds.length;
  const how = tie ? `${generalName(culprit[0])} holds ${pair}, a tie, so retreat` : `${generalName(culprit[0])} holds ${pair} and decides ${culprit[1]}`;
  if (!v.ic2) return `${how}; the commander said ${orderName(s.order)}: IC2 broken`;
  return `${how}; the loyal lieutenants decide different values: IC1 broken`;
}

// ---------- every decision rule (scene 1's second button) ----------

export interface RuleSearch {
  n: number;
  rules: number;
  /** Rules that satisfy IC1 and IC2 on every behaviour. */
  survivors: number[];
  behaviours: number;
}

/** A rule is a function of (own receipt, then the relays in lieutenant order): 2^(2^(n-1)) of them, numbered by their truth table. */
export function tryEveryRule(n: number): RuleSearch {
  const arity = n - 1;
  const rules = 2 ** (2 ** arity);
  const all = behaviours(n);
  const survivors: number[] = [];
  for (let rule = 0; rule < rules; rule++) {
    const ok = all.every((b) => {
      const s = setupOf(n, b);
      const run = runOm(s);
      const loyal = Array.from({ length: n - 1 }, (_, k) => k + 1).filter((i) => !s.traitors.has(i));
      const decided = loyal.map((i) => {
        const args = held(s, run, i).map((h) => h.value);
        return ((rule >> args.reduce<number>((a, v) => a * 2 + v, 0)) & 1) as Bit;
      });
      const same = decided.every((d) => d === decided[0]);
      const obeys = s.traitors.has(COMMANDER) || decided.every((d) => d === s.order);
      return same && obeys;
    });
    if (ok) survivors.push(rule);
  }
  return { n, rules, survivors, behaviours: all.length };
}

/** The truth table of the majority rule of `arity` arguments, as a rule number (ties to 0). */
export const majorityRuleNumber = (arity: number): number => {
  let rule = 0;
  for (let args = 0; args < 2 ** arity; args++) {
    const ones = args.toString(2).split('').filter((c) => c === '1').length;
    if (ones * 2 > arity) rule |= 1 << args;
  }
  return rule;
};

// ---------- seeded traitors ----------

/** The bit a seeded traitor sends on an edge: a hash of the seed and the edge, so every harness sees the same lie. */
export const seededBit = (seed: number): TraitorBits => (sender, path, receiver) => (hash32(`${seed}|${sender}|${path.join('.')}|${receiver}`) & 1) as Bit;

export interface SeededSetup extends OmSetup {
  seed: number;
}

/** Seeded: `traitorCount` generals drawn from all n (the commander included), a random loyal order, seeded lies. */
export function seededSetup(seed: number, n: number, m: number, traitorCount: number): SeededSetup {
  const order = (hash32(`order|${seed}`) & 1) as Bit;
  const ranked = Array.from({ length: n }, (_, i) => ({ i, h: hash32(`traitor|${seed}|${i}`) })).sort((a, b) => a.h - b.h || a.i - b.i);
  const traitors = new Set(ranked.slice(0, traitorCount).map((r) => r.i));
  return { seed, n, m, traitors, order, bit: seededBit(seed) };
}
