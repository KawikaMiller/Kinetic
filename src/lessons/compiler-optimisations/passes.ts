/**
 * The toy optimiser: seven small passes over the lesson's IR. They are written for this lesson
 * and are labelled toys on screen; real compilers run many more, with analyses in between.
 */
import {
  allInstrs, defOf, evalBin, mapOperands, operandsOf, sameInstr, successors, usesOf,
  type Block, type Func, type Instr, type Program, type Val,
} from './ir';

export type PassId = 'propagate' | 'fold' | 'cse' | 'dce' | 'algebra';

export const PASS_IDS: readonly PassId[] = ['propagate', 'fold', 'cse', 'dce', 'algebra'];

export const PASS_LABEL: Record<PassId, string> = {
  propagate: 'Copy and constant propagation',
  fold: 'Constant folding',
  cse: 'Common subexpression elimination',
  dce: 'Dead-code elimination',
  algebra: 'Algebraic simplification',
};

export const PASS_SHORT: Record<PassId, string> = {
  propagate: 'propagate',
  fold: 'fold',
  cse: 'CSE',
  dce: 'DCE',
  algebra: 'algebra',
};

export interface PassResult {
  program: Program;
  /** Instructions rewritten, moved or removed. */
  changed: number;
  /** A rewrite the pass looked at and refused, with the reason. */
  refused: string[];
  /** Names of instructions a pass moved or created, for the listing to mark. */
  touched: string[];
}

const same = (program: Program): PassResult => ({ program, changed: 0, refused: [], touched: [] });

const mapBlocks = (p: Program, f: (b: Block) => Instr[]): Program => ({ ...p, blocks: p.blocks.map((b) => ({ ...b, instrs: f(b) })) });

const isLiteral = (v: Val): v is number => typeof v === 'number';

/** Replace every use of a name that is a copy of a literal or another name with that source. */
export function propagate(p: Program): PassResult {
  const source = new Map<string, Val>();
  for (const i of allInstrs(p)) if (i.op === 'copy') source.set(i.dst, i.a);
  const resolve = (v: Val): Val => {
    let cur = v;
    while (typeof cur === 'string' && source.has(cur)) cur = source.get(cur) as Val;
    return cur;
  };
  let changed = 0;
  const touched: string[] = [];
  const program = mapBlocks(p, (b) =>
    b.instrs.map((i) => {
      const out = mapOperands(i, resolve);
      if (!sameInstr(i, out)) {
        changed++;
        const d = defOf(out);
        if (d) touched.push(d);
      }
      return out;
    }),
  );
  return { program, changed, refused: [], touched };
}

/** Evaluate an operation whose operands are both literals. */
export function fold(p: Program): PassResult {
  let changed = 0;
  const touched: string[] = [];
  const program = mapBlocks(p, (b) =>
    b.instrs.map((i) => {
      if (i.op === 'bin' && isLiteral(i.a) && isLiteral(i.b)) {
        changed++;
        touched.push(i.dst);
        return { op: 'copy', dst: i.dst, a: evalBin(i.kind, i.a, i.b, i.ty) } as Instr;
      }
      return i;
    }),
  );
  return { program, changed, refused: [], touched };
}

/**
 * x * 1, x + 0 and x - 0 become x; x * 0 becomes 0 only for integers. For floats x * 0 can be NaN or -0, and
 * x + 0 turns -0 into +0, so those two rewrites are refused with the reason.
 */
export function algebra(p: Program): PassResult {
  let changed = 0;
  const refused: string[] = [];
  const touched: string[] = [];
  const program = mapBlocks(p, (b) =>
    b.instrs.map((i) => {
      if (i.op !== 'bin' || i.kind === 'lt') return i;
      const rewrite = (a: Val): Instr => {
        changed++;
        touched.push(i.dst);
        return { op: 'copy', dst: i.dst, a };
      };
      const unit = i.kind === 'mul' ? 1 : 0;
      if (i.kind !== 'sub' && i.b === unit && !(i.ty === 'f64' && i.kind === 'add')) return rewrite(i.a);
      if (i.kind !== 'sub' && i.a === unit && !(i.ty === 'f64' && i.kind === 'add')) return rewrite(i.b);
      if (i.kind === 'sub' && i.b === 0) return rewrite(i.a);
      if (i.kind === 'add' && i.ty === 'f64' && (i.a === 0 || i.b === 0)) {
        refused.push('x + 0 is not x for floats, because -0 + 0 is +0');
        return i;
      }
      if (i.kind === 'mul' && (i.a === 0 || i.b === 0)) {
        if (i.ty === 'i32') return rewrite(0);
        refused.push('x * 0 is not 0 for floats, because x may be NaN, infinity or negative');
      }
      return i;
    }),
  );
  return { program, changed, refused, touched };
}

const commutative = (kind: string) => kind === 'add' || kind === 'mul';

/** The value-numbering key of a pure instruction: operation, type and operands, commutative ones in a fixed order. */
function keyOf(i: Instr): string | null {
  if (i.op === 'bin') {
    const operands = [String(i.a), String(i.b)];
    if (commutative(i.kind)) operands.sort();
    return `${i.kind}:${i.ty}:${operands.join(',')}`;
  }
  if (i.op === 'load') return `load:${String(i.addr)}`;
  return null;
}

/**
 * Local value numbering: inside a block, a second computation of the same operation on the same operands
 * becomes a copy of the first. A store forgets every remembered load, because it may have changed memory.
 * `forgetLoadsAtStores: false` is the deliberately broken variant the tests use.
 */
export function cse(p: Program, o: { forgetLoadsAtStores?: boolean } = {}): PassResult {
  const forget = o.forgetLoadsAtStores ?? true;
  let changed = 0;
  const touched: string[] = [];
  const program = mapBlocks(p, (b) => {
    const seen = new Map<string, string>();
    return b.instrs.map((i) => {
      if (i.op === 'store' && forget) {
        for (const k of [...seen.keys()]) if (k.startsWith('load:')) seen.delete(k);
        return i;
      }
      const key = keyOf(i);
      if (key === null) return i;
      const earlier = seen.get(key);
      if (earlier !== undefined && (i.op === 'bin' || i.op === 'load')) {
        changed++;
        touched.push(i.dst);
        return { op: 'copy', dst: i.dst, a: earlier } as Instr;
      }
      if (i.op === 'bin' || i.op === 'load') seen.set(key, i.dst);
      return i;
    });
  });
  return { program, changed, refused: [], touched };
}

/** Does the instruction have an effect beyond its result? Those are the roots that keep other code alive. */
function isRoot(i: Instr, funcs: Record<string, Func>): boolean {
  if (i.op === 'call') return !funcs[i.fn].pure;
  return i.op === 'ret' || i.op === 'store' || i.op === 'br' || i.op === 'jmp';
}

/** Mark from the roots, sweep the rest: a dead cycle of phis goes too. */
export function dce(p: Program): PassResult {
  const defs = new Map<string, Instr>();
  for (const i of allInstrs(p)) {
    const d = defOf(i);
    if (d) defs.set(d, i);
  }
  const live = new Set<string>();
  const work: Instr[] = allInstrs(p).filter((i) => isRoot(i, p.funcs));
  while (work.length) {
    const i = work.pop() as Instr;
    for (const u of usesOf(i)) {
      if (live.has(u)) continue;
      live.add(u);
      const def = defs.get(u);
      if (def) work.push(def);
    }
  }
  let changed = 0;
  const program = mapBlocks(p, (b) =>
    b.instrs.filter((i) => {
      const keep = isRoot(i, p.funcs) || (defOf(i) !== null && live.has(defOf(i) as string));
      if (!keep) changed++;
      return keep;
    }),
  );
  return { program, changed, refused: [], touched: [] };
}

/** The passes of the straight-line scene, by id. */
export const PASSES: Record<PassId, (p: Program) => PassResult> = { propagate, fold, cse, dce, algebra };

export interface RoundStep {
  pass: PassId;
  changed: number;
  refused: string[];
}

export interface Round {
  steps: RoundStep[];
  changed: number;
}

export interface Pipeline {
  program: Program;
  rounds: Round[];
  /** Rounds that changed something. */
  changedRounds: number;
}

const MAX_ROUNDS = 12;

/**
 * Apply the passes in `order` once, or repeat the whole list until a round changes nothing.
 * An empty order returns the program as it was.
 */
export function runPipeline(p: Program, order: readonly PassId[], fixedPoint: boolean): Pipeline {
  let program = p;
  const rounds: Round[] = [];
  if (order.length === 0) return { program, rounds, changedRounds: 0 };
  for (let r = 0; r < (fixedPoint ? MAX_ROUNDS : 1); r++) {
    const steps: RoundStep[] = [];
    for (const pass of order) {
      const res = PASSES[pass](program);
      program = res.program;
      steps.push({ pass, changed: res.changed, refused: res.refused });
    }
    const changed = steps.reduce((s, x) => s + x.changed, 0);
    rounds.push({ steps, changed });
    if (changed === 0) break;
  }
  return { program, rounds, changedRounds: rounds.filter((r) => r.changed > 0).length };
}

/* ---------- the loop scene: inlining, loop-invariant code motion, dead loop removal ---------- */

/** Replace a call to a single-block callee with the callee's body, names made fresh. */
export function inline(p: Program): PassResult {
  let changed = 0;
  const touched: string[] = [];
  let fresh = 0;
  const program = mapBlocks(p, (b) =>
    b.instrs.flatMap((i): Instr[] => {
      if (i.op !== 'call') return [i];
      const f = p.funcs[i.fn];
      changed++;
      const id = fresh++;
      const rename = new Map<string, Val>(f.params.map((n, k) => [n, i.args[k]]));
      const ret = f.instrs[f.instrs.length - 1];
      const retName = ret.op === 'ret' && typeof ret.a === 'string' ? ret.a : null;
      for (const callee of f.instrs) {
        const d = defOf(callee);
        if (d) rename.set(d, d === retName ? i.dst : `${i.fn}${id}_${d}`);
      }
      const renamed = (v: Val): Val => (typeof v === 'string' ? (rename.get(v) ?? v) : v);
      const body = f.instrs.slice(0, -1).map((callee) => ({ ...mapOperands(callee, renamed), dst: rename.get(defOf(callee) as string) as string }) as Instr);
      touched.push(...body.map((x) => defOf(x) as string));
      if (retName === null && ret.op === 'ret') {
        const v = ret.a;
        body.push({ op: 'copy', dst: i.dst, a: renamed(v) });
        touched.push(i.dst);
      }
      return body;
    }),
  );
  return { program, changed, refused: [], touched };
}

interface Loop {
  header: number;
  latch: number;
  preheader: number;
  exit: number;
}

/** A natural loop in a structured program: a back edge to an earlier block, one outside predecessor, one exit. */
function findLoop(p: Program): Loop | null {
  const index = new Map(p.blocks.map((b, k) => [b.label, k]));
  for (let latch = 0; latch < p.blocks.length; latch++) {
    for (const target of successors(p.blocks[latch])) {
      const header = index.get(target) as number;
      if (header > latch) continue;
      const outside = p.blocks.flatMap((b, k) => (k < header && successors(b).includes(target) ? [k] : []));
      const exits = p.blocks
        .slice(header, latch + 1)
        .flatMap((b) => successors(b))
        .map((l) => index.get(l) as number)
        .filter((k) => k > latch || k < header);
      if (outside.length === 1 && new Set(exits).size === 1) return { header, latch, preheader: outside[0], exit: exits[0] };
    }
  }
  return null;
}

const isPureInstr = (i: Instr) => i.op === 'bin' || i.op === 'copy';

/** Move instructions whose operands do not change inside the loop to the block before it. */
export function licm(p: Program): PassResult {
  const loop = findLoop(p);
  if (!loop) return same(p);
  const inLoop = (k: number) => k >= loop.header && k <= loop.latch;
  const definedInLoop = new Set<string>();
  p.blocks.forEach((b, k) => {
    if (inLoop(k)) for (const i of b.instrs) if (defOf(i)) definedInLoop.add(defOf(i) as string);
  });
  const hoisted: Instr[] = [];
  const moved = new Set<Instr>();
  for (let progress = true; progress; ) {
    progress = false;
    for (let k = loop.header; k <= loop.latch; k++) {
      for (const i of p.blocks[k].instrs) {
        if (moved.has(i) || !isPureInstr(i) || operandsOf(i).some((v) => typeof v === 'string' && definedInLoop.has(v))) continue;
        moved.add(i);
        hoisted.push(i);
        definedInLoop.delete(defOf(i) as string);
        progress = true;
      }
    }
  }
  if (hoisted.length === 0) return same(p);
  const blocks = p.blocks.map((b, k) => {
    if (k === loop.preheader) return { ...b, instrs: [...b.instrs.slice(0, -1), ...hoisted, b.instrs[b.instrs.length - 1]] };
    return inLoop(k) ? { ...b, instrs: b.instrs.filter((i) => !moved.has(i)) } : b;
  });
  return { program: { ...p, blocks }, changed: hoisted.length, refused: [], touched: hoisted.map((i) => defOf(i) as string) };
}

export interface LoopDeleteResult extends PassResult {
  /** Why a loop that was looked at stays, or null. */
  blocker: string | null;
}

/**
 * Remove a loop with no effects whose results nothing after it reads. A loop with no side effects may be
 * assumed to terminate in C and C++ (a forward-progress rule, quoted from memory on screen), so it may go.
 */
export function deleteLoop(p: Program): LoopDeleteResult {
  const loop = findLoop(p);
  if (!loop) return { ...same(p), blocker: null };
  const inLoop = (k: number) => k >= loop.header && k <= loop.latch;
  const loopInstrs = p.blocks.filter((_, k) => inLoop(k)).flatMap((b) => b.instrs);
  const effect = loopInstrs.find((i) => i.op === 'store' || i.op === 'ret' || (i.op === 'call' && !p.funcs[i.fn].pure));
  if (effect) return { ...same(p), blocker: 'the loop stores, returns or calls something with effects, so it stays' };
  const defined = new Set(loopInstrs.map(defOf).filter((d): d is string => d !== null));
  const usedAfter = p.blocks.filter((_, k) => !inLoop(k)).flatMap((b) => b.instrs).flatMap(usesOf).filter((u) => defined.has(u));
  if (usedAfter.length > 0) return { ...same(p), blocker: `the loop's result ${[...new Set(usedAfter)].join(', ')} is read after it, so it stays` };
  const header = p.blocks[loop.header].label;
  const exitLabel = p.blocks[loop.exit].label;
  const blocks = p.blocks
    .filter((_, k) => !inLoop(k))
    .map((b, k) => (k === loop.preheader ? { ...b, instrs: b.instrs.map((i) => (i.op === 'jmp' && i.to === header ? ({ op: 'jmp', to: exitLabel } as Instr) : i)) } : b));
  return { program: { ...p, blocks }, changed: loopInstrs.length, refused: [], touched: [], blocker: null };
}

/** The loop scene's four steps, applied in this fixed order when switched on. */
export interface LoopOptions {
  inlining: boolean;
  hoisting: boolean;
  dce: boolean;
  deleteLoops: boolean;
}

export interface LoopRun {
  program: Program;
  hoisted: string[];
  blocker: string | null;
  changed: number;
}

export function optimiseLoop(p: Program, o: LoopOptions): LoopRun {
  let program = p;
  let changed = 0;
  let hoisted: string[] = [];
  let blocker: string | null = null;
  if (o.inlining) {
    const r = inline(program);
    program = r.program;
    changed += r.changed;
  }
  if (o.hoisting) {
    const r = licm(program);
    program = r.program;
    changed += r.changed;
    hoisted = r.touched;
  }
  if (o.dce) {
    const r = dce(program);
    program = r.program;
    changed += r.changed;
  }
  if (o.deleteLoops) {
    const r = deleteLoop(program);
    program = r.program;
    changed += r.changed;
    blocker = r.blocker;
  }
  return { program, hoisted, blocker, changed };
}

/* ---------- the aliasing scene ---------- */

/**
 * Store-to-load forwarding inside a block: a load of the address a store just wrote becomes a copy of the
 * stored value. A store to a different name in between may have hit the same address, so the rewrite is made
 * only when the programmer promised (restrict) that the two names are distinct.
 */
export function forwardLoads(p: Program, o: { noAlias: boolean }): PassResult {
  let changed = 0;
  const refused: string[] = [];
  const touched: string[] = [];
  const program = mapBlocks(p, (b) => {
    const out: Instr[] = [];
    b.instrs.forEach((i, k) => {
      if (i.op !== 'load') {
        out.push(i);
        return;
      }
      const lastStore = [...b.instrs.slice(0, k)].reverse().find((s) => s.op === 'store' && s.addr === i.addr);
      if (!lastStore || lastStore.op !== 'store') {
        out.push(i);
        return;
      }
      const between = b.instrs.slice(b.instrs.indexOf(lastStore) + 1, k).filter((s) => s.op === 'store');
      if (between.length > 0 && !o.noAlias) {
        refused.push(`a store to another pointer may have changed what ${String(i.addr)} holds, so the load of ${i.dst} stays`);
        out.push(i);
        return;
      }
      changed++;
      touched.push(i.dst);
      out.push({ op: 'copy', dst: i.dst, a: lastStore.val });
    });
    return out;
  });
  return { program, changed, refused, touched };
}
