/**
 * Pure model for memory-ordering-atomics: the programs the learner edits, the outcome tables read off
 * `core/memModel`, and the sentences computed from them. No JSX. Everything on screen is "allowed by the
 * model" (AC-0/T4 #31): nothing here is measured on any machine.
 */
import { outcomes, parseLitmus, MODELS, type Instr, type Litmus, type Model, type Ord, type Snapshot, type Step } from '../../core/memModel';

export type BaseId = 'sb' | 'mp' | 'dekker' | 'corr';

/** A preset program: its threads, and the one outcome the scene is about (the "surprising" one). */
export interface Base {
  id: BaseId;
  title: string;
  litmus: Litmus;
  /** Register values of the surprising outcome, keyed "T0.r0". */
  target: Record<string, number>;
  /** What the target outcome means in the scene's own words. */
  targetMeaning: string;
  /** Where the flag store and flag load sit ([thread, index]) in message passing; null elsewhere. */
  flag: { store: [number, number]; load: [number, number] } | null;
}

const litmus = (name: string, text: string): Litmus => {
  const read = parseLitmus(text, name);
  if (!read.ok) throw new Error(`${name}: ${read.error}`);
  return read.litmus;
};

export const BASES: Readonly<Record<BaseId, Base>> = {
  sb: {
    id: 'sb', title: 'Store buffering',
    litmus: litmus('Store buffering (SB)', 'T0: x = 1 ; r0 = y\nT1: y = 1 ; r1 = x'),
    target: { 'T0.r0': 0, 'T1.r1': 0 },
    targetMeaning: 'both loads read 0, so each thread read the other\'s variable before the other thread\'s store became visible',
    flag: null,
  },
  mp: {
    id: 'mp', title: 'Message passing',
    litmus: litmus('Message passing (MP)', 'T0: x = 1 ; y = 1\nT1: r1 = y ; r2 = x'),
    target: { 'T1.r1': 1, 'T1.r2': 0 },
    targetMeaning: 'the reader saw the flag set but read the old data',
    flag: { store: [0, 1], load: [1, 0] },
  },
  dekker: {
    id: 'dekker', title: 'Dekker-style entry',
    litmus: litmus('Dekker-style entry', 'T0: f0 = 1 ; r0 = f1\nT1: f1 = 1 ; r1 = f0'),
    target: { 'T0.r0': 0, 'T1.r1': 0 },
    targetMeaning: 'both threads saw the other\'s flag down, so both enter the critical section',
    flag: null,
  },
  corr: {
    id: 'corr', title: 'Coherence (CoRR)',
    litmus: litmus('Coherence (CoRR)', 'T0: x = 1 ; x = 2\nT1: r1 = x ; r2 = x'),
    target: { 'T1.r1': 2, 'T1.r2': 1 },
    targetMeaning: 'the reader saw x = 2 and then, later, the older x = 1',
    flag: null,
  },
};

// ── The learner's edits: a fence after an instruction, an order tag on an access ───────────────

export type Tag = Ord | undefined;
export interface Edit {
  /** fences[t][i]: a full fence right after instruction i of thread t (never after the last one). */
  fences: boolean[][];
  /** tags[t][i]: the order tag of instruction i (undefined is a plain access). */
  tags: Tag[][];
}

export const emptyEdit = (base: Base): Edit => ({
  fences: base.litmus.threads.map((t) => t.map(() => false)),
  tags: base.litmus.threads.map((t) => t.map(() => undefined)),
});
export const setFence = (e: Edit, t: number, i: number, on: boolean): Edit => ({ ...e, fences: e.fences.map((row, a) => (a === t ? row.map((v, b) => (b === i ? on : v)) : row)) });
export const setTag = (e: Edit, t: number, i: number, tag: Tag): Edit => ({ ...e, tags: e.tags.map((row, a) => (a === t ? row.map((v, b) => (b === i ? tag : v)) : row)) });
export const editKey = (e: Edit): string => JSON.stringify(e);
/** Fence gaps exist after every instruction but the last. */
export const hasGap = (base: Base, t: number, i: number): boolean => i < base.litmus.threads[t].length - 1;

/** The tags an access may take in the weak model. Plain is relaxed. */
export const STORE_TAGS: readonly Tag[] = [undefined, 'rel', 'sc'];
export const LOAD_TAGS: readonly Tag[] = [undefined, 'acq', 'sc'];
export const tagsFor = (ins: Instr): readonly Tag[] => (ins.op === 'store' ? STORE_TAGS : ins.op === 'load' ? LOAD_TAGS : [undefined]);
export const tagName = (t: Tag): string => (t === undefined ? 'relaxed' : t === 'rel' ? 'release' : t === 'acq' ? 'acquire' : 'seq_cst');
export const nextTag = (ins: Instr, t: Tag): Tag => {
  const all = tagsFor(ins);
  return all[(all.indexOf(t) + 1) % all.length];
};

/** The litmus program the explorer sees: the base with the learner's fences and tags applied. */
export function buildLitmus(base: Base, edit: Edit): Litmus {
  return {
    ...base.litmus,
    threads: base.litmus.threads.map((instrs, t) =>
      instrs.flatMap((ins, i): Instr[] => {
        const tag = edit.tags[t][i];
        const tagged: Instr = ins.op === 'fence' || tag === undefined ? ins : { ...ins, ord: tag };
        return edit.fences[t][i] ? [tagged, { op: 'fence' }] : [tagged];
      }),
    ),
  };
}

// ── Models ──────────────────────────────────────────────────────────────

export const MODEL_LABEL: Readonly<Record<Model, string>> = { sc: 'SC', tso: 'x86-style', relaxed: 'Weak' };
export const MODEL_FULL: Readonly<Record<Model, string>> = { sc: 'sequential consistency', tso: 'x86-style (TSO)', relaxed: 'weak (release/acquire)' };

export const RULES: Readonly<Record<Model, readonly string[]>> = {
  sc: [
    'One step at a time: every thread runs its instructions in program order.',
    'A store reaches memory at once, so every thread sees it at once.',
  ],
  tso: [
    'Each core has a FIFO store buffer: a store enters it and drains to memory later, in order.',
    'A load reads the core\'s own newest buffered store to that location if there is one, else memory.',
    'A full fence waits until the core\'s buffer has drained.',
  ],
  relaxed: [
    'Each location keeps a history of its writes; each thread has a view per location, the oldest write it may still read.',
    'A plain load may read any write at or after its view; a store moves the writer\'s own view to its write.',
    'A release store records the writer\'s whole view with the write; an acquire load that reads that write merges the view.',
    'A full fence moves the thread\'s view to the newest write of every location. seq_cst is modelled as a full fence before the access.',
  ],
};

/** What none of the three models covers (printed on the stage). */
export const NOT_COVERED: readonly string[] = [
  'load buffering', 'IRIW and multi-copy atomicity', '2+2W', 'out-of-thin-air values', 'consume',
  'compiler reordering (a separate source of reordering)', 'every detail of any real instruction set',
];

/** The weak model's seq_cst is a fence before the access: stronger than C++ in two corners. */
export const SC_TAG_NOTE =
  'The seq_cst tag here is a fence before the access, release or acquire as the access needs. In C++, seq_cst on only the stores, or only the loads, of store buffering still allows 0 and 0; this model forbids it, so it is stronger than C++ in that corner.';

// ── Reading the explorer ────────────────────────────────────────────────

const regLabel = (key: string) => key.split('.')[1];
/** "T0.r0=0 T1.r1=1" as "r0 = 0, r1 = 1". */
export const outcomeText = (regsKey: string): string => regsKey.split(' ').map((kv) => `${regLabel(kv.split('=')[0])} = ${kv.split('=')[1]}`).join(', ');

/** Every register key of a program, in the order `core/memModel` reports them (thread order, names sorted). */
function registerKeys(l: Litmus): string[] {
  return l.threads.flatMap((prog, t) => [...new Set(prog.flatMap((i) => (i.op === 'load' ? [i.reg] : [])))].sort().map((r) => `T${t}.${r}`));
}

/** The values a register could ever hold: what its location starts at and every value stored there. */
function registerDomains(l: Litmus): number[][] {
  const locOf = new Map<string, string>();
  l.threads.forEach((prog, t) => prog.forEach((i) => { if (i.op === 'load') locOf.set(`T${t}.${i.reg}`, i.loc); }));
  return registerKeys(l).map((key) => {
    const loc = locOf.get(key)!;
    const values = new Set<number>([l.init[loc] ?? 0]);
    for (const prog of l.threads) for (const i of prog) if (i.op === 'store' && i.loc === loc) values.add(i.value);
    return [...values].sort((a, b) => a - b);
  });
}

/** Every combination of register values the program could in principle end with, as `core/memModel` regsKeys. */
export function outcomeUniverse(l: Litmus): string[] {
  const keys = registerKeys(l);
  const domains = registerDomains(l);
  let combos: string[][] = [[]];
  domains.forEach((d, k) => { combos = combos.flatMap((c) => d.map((v) => [...c, `${keys[k]}=${v}`])); });
  return combos.map((c) => c.join(' '));
}

export const targetKey = (base: Base): string => Object.entries(base.target).map(([k, v]) => `${k}=${v}`).join(' ');

export interface Row {
  regsKey: string;
  label: string;
  reachable: boolean;
  /** Reachable here but not under SC: the model's relaxation made it possible. */
  viaRelaxation: boolean;
  isTarget: boolean;
  /** The shortest schedule, for a reachable row. */
  example: Step[];
}

export interface Table {
  model: Model;
  rows: Row[];
  states: number;
  truncated: boolean;
  start: Snapshot;
}

/** Fixed explorer budget (the kit default is 250,000 states). */
export const BUDGET = 250_000;

export function table(base: Base, edit: Edit, model: Model, budget: number = BUDGET): Table {
  const l = buildLitmus(base, edit);
  const run = outcomes(l, model, budget);
  const sc = model === 'sc' ? run : outcomes(l, 'sc', budget);
  const reachableSc = new Set([...sc.outcomes.values()].map((o) => o.regsKey));
  const witness = new Map<string, Step[]>();
  for (const o of run.outcomes.values()) if (!witness.has(o.regsKey) || o.example.length < witness.get(o.regsKey)!.length) witness.set(o.regsKey, o.example);
  const rows = outcomeUniverse(l).map((regsKey): Row => ({
    regsKey,
    label: outcomeText(regsKey),
    reachable: witness.has(regsKey),
    viaRelaxation: witness.has(regsKey) && !reachableSc.has(regsKey),
    isTarget: regsKey === targetKey(base),
    example: witness.get(regsKey) ?? [],
  }));
  return { model, rows, states: run.states, truncated: run.truncated, start: run.start };
}

export interface Reach { reachable: boolean; states: number; truncated: boolean }

/** Is the scene's surprising outcome reachable, in each of the three models, for this edit? */
export function targetReach(base: Base, edit: Edit, budget: number = BUDGET): Record<Model, Reach> {
  const l = buildLitmus(base, edit);
  const out = {} as Record<Model, Reach>;
  for (const m of MODELS) {
    const run = outcomes(l, m, budget);
    out[m] = { reachable: [...run.outcomes.values()].some((o) => o.regsKey === targetKey(base)), states: run.states, truncated: run.truncated };
  }
  return out;
}

// ── An independent SC oracle: plain recursion over thread positions, no explorer ───────────────

export interface ScCount {
  /** Interleavings of the program's steps (a fence is one step that changes nothing). */
  interleavings: number;
  steps: number;
  /** Interleavings per register outcome, keyed like `core/memModel` regsKeys; every possible outcome is present. */
  byOutcome: Map<string, number>;
}

export function scInterleavings(l: Litmus): ScCount {
  const keys = registerKeys(l);
  const byOutcome = new Map<string, number>(outcomeUniverse(l).map((k) => [k, 0]));
  const locs = [...new Set([...Object.keys(l.init), ...l.threads.flatMap((p) => p.flatMap((i) => (i.op === 'fence' ? [] : [i.loc])))])];
  let interleavings = 0;
  const go = (pcs: number[], mem: Record<string, number>, regs: Record<string, number>): void => {
    const live = l.threads.map((_, t) => t).filter((t) => pcs[t] < l.threads[t].length);
    if (live.length === 0) {
      interleavings += 1;
      const k = keys.map((key) => `${key}=${regs[key]}`).join(' ');
      byOutcome.set(k, (byOutcome.get(k) ?? 0) + 1);
      return;
    }
    for (const t of live) {
      const i = l.threads[t][pcs[t]];
      const next = pcs.map((p, a) => (a === t ? p + 1 : p));
      if (i.op === 'store') go(next, { ...mem, [i.loc]: i.value }, regs);
      else if (i.op === 'load') go(next, mem, { ...regs, [`T${t}.${i.reg}`]: mem[i.loc] });
      else go(next, mem, regs);
    }
  };
  const mem0 = Object.fromEntries(locs.map((x) => [x, l.init[x] ?? 0]));
  const regs0 = Object.fromEntries(keys.map((k) => [k, 0]));
  go(l.threads.map(() => 0), mem0, regs0);
  return { interleavings, steps: l.threads.reduce((n, p) => n + p.length, 0), byOutcome };
}

/** "6 interleavings of 4 steps: r0 = 0, r1 = 1 in 1, ..., r0 = 0, r1 = 0 in 0." */
export function scCountText(l: Litmus): string {
  const c = scInterleavings(l);
  const parts = [...c.byOutcome.entries()].map(([k, n]) => `(${outcomeText(k).replaceAll(/\w+ = /g, '')}) in ${n}`);
  return `${c.interleavings} interleavings of ${c.steps} steps: ${parts.join(', ')}`;
}

// ── Sentences computed from the tables ──────────────────────────────────

const exploredText = (t: { states: number; truncated: boolean }) => (t.truncated ? `the first ${t.states} states, not exhaustive` : `all ${t.states} states of this model explored`);

export const rowNote = (row: Row, t: Table): string => {
  if (row.reachable) return row.viaRelaxation ? 'SC cannot produce this outcome' : 'SC produces it too';
  return t.truncated ? `not found in the first ${t.states} states explored: not exhaustive` : `not reachable: ${exploredText(t)}`;
};

/** The verdict line of a scene: the surprising outcome in the chosen model, in the model's own words. */
export function verdict(base: Base, model: Model, reach: Record<Model, Reach>): string {
  const here = reach[model];
  const name = `${outcomeText(targetKey(base))} (${base.targetMeaning})`;
  if (here.truncated && !here.reachable) return `${name}: not found in the first ${here.states} states, not exhaustive.`;
  return here.reachable
    ? `${name}: allowed by the ${MODEL_FULL[model]} model.`
    : `${name}: not reachable in the ${MODEL_FULL[model]} model (${exploredText(here)}).`;
}

/** "SC no, x86-style no, Weak yes" for the three models at once. */
export function reachLine(reach: Record<Model, Reach>): string {
  return MODELS.map((m) => `${MODEL_LABEL[m]} ${reach[m].truncated && !reach[m].reachable ? 'not found (truncated)' : reach[m].reachable ? 'yes' : 'no'}`).join(', ');
}

const fencedThreads = (edit: Edit): number[] => edit.fences.flatMap((row, t) => (row.some(Boolean) ? [t] : []));

/**
 * Manipulation notes: what the page says when the learner makes the instructive wrong move.
 * null when no note applies to this edit and model.
 */
export function manipulationNote(base: Base, edit: Edit, model: Model, reach: Reach): string | null {
  if (!reach.reachable || reach.truncated) return null;
  if ((base.id === 'sb' || base.id === 'dekker') && model !== 'sc' && fencedThreads(edit).length === 1) {
    return model === 'tso'
      ? 'One fence is not enough: the other thread\'s store can still sit in its buffer while the load reads memory.'
      : 'One fence is not enough: the thread without a fence can still read an old write.';
  }
  const flag = base.flag;
  if (base.id === 'mp' && flag && model === 'relaxed') {
    const store = edit.tags[flag.store[0]][flag.store[1]];
    const load = edit.tags[flag.load[0]][flag.load[1]];
    const released = store === 'rel' || store === 'sc';
    const acquired = load === 'acq' || load === 'sc';
    if (released && !acquired && fencedThreads(edit).length === 0) return 'Release alone does not order the reader: its load has to be acquire to take over what the writer had done.';
    if (acquired && !released && fencedThreads(edit).length === 0) return 'Acquire alone has nothing to take over: the writer\'s flag store has to be release.';
  }
  return null;
}

// ── The numbers that the lesson text quotes, computed once from the model ───────────────────────

const countOf = (base: Base, model: Model, edit: Edit = emptyEdit(base)) => table(base, edit, model).states;
const reachCount = (base: Base, model: Model) => table(base, emptyEdit(base), model).rows.filter((r) => r.reachable).length;

export const FACTS = {
  sbScStates: countOf(BASES.sb, 'sc'),
  sbScOutcomes: reachCount(BASES.sb, 'sc'),
  sbTsoOutcomes: reachCount(BASES.sb, 'tso'),
  sbScInterleavings: scInterleavings(BASES.sb.litmus).interleavings,
};
