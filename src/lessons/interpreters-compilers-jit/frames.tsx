import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { runVm, type Instr } from './bytecode';
import {
  COST, COUNTS, HOT_THRESHOLD, fmtCount, fmtTime, opsAt, type Lane, type Race, type Segment,
} from './costModel';
import { SUM_SQUARES, nodeLabel, treeWalk, type Env, type Node, type Value } from './lang';
import { NATIVE, runNative, type Regs } from './native';
import { BYTECODE, NODES } from './program';

export type Strategy = 'tree' | 'vm' | 'native';

export const show = (v: Value | null | undefined) => (v === undefined || v === null ? '–' : typeof v === 'string' ? `"${v}"` : String(v));

export interface StepFrame extends Frame {
  /** Tree-walker: the node visited now. */
  node: number | null;
  /** VM: the instruction just run. Native: the line just run. */
  pc: number | null;
  stack: Value[];
  env: Env;
  regs: Regs | null;
  /** Operations so far, in this strategy's unit. */
  count: number;
  /** Loop checks so far (each is one back-edge for the JIT's counter). */
  checks: number;
  deopt: boolean;
  done: boolean;
}

const EMPTY_REGS: Regs = { xmm0: null, xmm1: null, xmm2: null, xmm3: null };

const truth = (v: Value) => (v === 1 ? '1 (true)' : '0 (false)');

function treeCaption(node: Node, value: Value | undefined, env: Env): ReactNode {
  switch (node.kind) {
    case 'fn': return <>Call <code>sumSquares({show(env.n)})</code>: start at the root of the tree.</>;
    case 'num': return <>Visit the number <code>{node.value}</code>: a constant.</>;
    case 'var': return <>Visit <code>{node.name}</code>: look it up in the locals, {show(value)}.</>;
    case 'bin':
      return node.op === '<=' ? (
        <>Visit <code>&lt;=</code>: both sides are done, so compare them: {truth(value!)}.{value === 1 ? ' Run the loop body.' : ' Leave the loop.'}</>
      ) : (
        <>Visit <code>{node.op}</code>: both children are done, so combine them: {show(value)}.</>
      );
    case 'let':
    case 'assign': return <>Visit <code>{nodeLabel(node)}</code>: store {show(env[node.name])} in {node.name}.</>;
    case 'while': return <>Visit <code>while</code>: it will check its condition subtree, then walk its body, again and again.</>;
    case 'return': return <>Visit <code>return</code>: hand back {show(value)}.</>;
  }
}

function vmCaption(ins: Instr, before: Value[], after: Value[], env: Env): ReactNode {
  const top = before.at(-1);
  switch (ins.op) {
    case 'PUSH': return <><code>PUSH {ins.arg}</code>: push the constant {ins.arg}.</>;
    case 'LOAD': return <><code>LOAD {ins.arg}</code>: push the value of {ins.arg}, {show(env[ins.arg])}.</>;
    case 'STORE': return <><code>STORE {ins.arg}</code>: pop {show(top)} into {ins.arg}.</>;
    case 'ADD':
    case 'MUL':
    case 'LE': {
      const [a, b] = before.slice(-2);
      const mixed = ins.op === 'LE' && typeof a !== typeof b;
      return (
        <>
          <code>{ins.op}</code>: pop {show(a)} and {show(b)}, push {ins.op === 'LE' ? truth(after.at(-1)!) : show(after.at(-1))}.
          {mixed && ' A number and a string compare as numbers, as in JavaScript.'}
        </>
      );
    }
    case 'JMP': return <><code>JMP {ins.arg}</code>: jump back to the loop&apos;s condition.</>;
    case 'JMP_IF_FALSE': return top === 1 ? <><code>JMP_IF_FALSE</code>: pop 1, true, so fall through into the body.</> : <><code>JMP_IF_FALSE {ins.arg}</code>: pop 0, false, so jump past the loop.</>;
    case 'RET': return <><code>RET</code>: pop {show(top)} and return it.</>;
  }
}

function nativeCaption(line: number, regs: Regs, arg: Value): ReactNode {
  const sem = NATIVE[line].sem;
  switch (sem.k) {
    case 'guard': return typeof arg === 'number'
      ? <>The guard: the JIT compiled this on the assumption that n is always a number. It is ({show(arg)}), so carry on.</>
      : <>The guard: the JIT compiled this on the assumption that n is always a number, and n is {show(arg)}, a string.</>;
    case 'deoptJump': return <>The guard passed, so no jump to deopt: the fast path is safe to run.</>;
    case 'loadN': return <>Load n into a register, xmm2 = {show(regs.xmm2)}. From here on no lookups: the locals live in registers.</>;
    case 'zero': return <>s = 0 in register xmm0.</>;
    case 'one': return <>i = 1 in register xmm1.</>;
    case 'cmp': return <>Compare n with i ({show(regs.xmm2)} and {show(regs.xmm1)}): one instruction.</>;
    case 'jb': return regs.xmm2! < regs.xmm1! ? <>n &lt; i, so jump to done: the loop is over.</> : <>n ≥ i, so no jump: run the body.</>;
    case 'mov': return <>Copy i into a scratch register.</>;
    case 'mul': return <>i * i = {show(regs.xmm3)}, one multiply instruction.</>;
    case 'add': return <>s = s + i * i = {show(regs.xmm0)}.</>;
    case 'addOne': return <>i = i + 1 = {show(regs.xmm1)}.</>;
    case 'jmp': return <>Jump back to loop.</>;
    case 'ret': return <>Return s = {show(regs.xmm0)}, straight from the register.</>;
    default: return null;
  }
}

/** Step-by-step run of one strategy on one argument, with a caption per operation. */
export function stepFrames(strategy: Strategy, arg: Value): StepFrame[] {
  const r = createRecorder<StepFrame>(
    { node: null, pc: null, stack: [], env: { n: arg }, regs: strategy === 'native' ? EMPTY_REGS : null, count: 0, checks: 0, deopt: false, done: false },
  );
  if (strategy === 'tree') {
    const run = treeWalk(SUM_SQUARES, arg, { trace: true });
    for (const s of run.steps!) {
      const node = NODES.get(s.node)!;
      r.snap(treeCaption(node, s.value, s.env), 1, { node: s.node, env: s.env, count: r.get().count + 1, checks: r.get().checks + (s.loopCheck ? 1 : 0) });
    }
    const perIter = COUNTS.tree.perIter;
    r.set({ node: null, done: true });
    r.close(
      <>Done: <code>sumSquares({show(arg)})</code> returned {show(run.result)} after {plainCount(run.visits)} node visits. Every iteration walked the same {perIter} nodes again.</>,
      2,
    );
  } else if (strategy === 'vm') {
    const run = runVm(BYTECODE, SUM_SQUARES.param, arg, { trace: true });
    let before: Value[] = [];
    for (const s of run.steps!) {
      const ins = BYTECODE.code[s.pc];
      r.snap(vmCaption(ins, before, s.stack, s.env), 1, { pc: s.pc, stack: s.stack, env: s.env, count: r.get().count + 1, checks: r.get().checks + (s.pc === BYTECODE.loopHead ? 1 : 0) });
      before = s.stack;
    }
    r.set({ pc: null, done: true });
    r.close(
      <>Done: returned {show(run.result)} after {plainCount(run.executed)} instructions. The tree was compiled once; each iteration is {COUNTS.vm.perIter} cheap steps through a flat array.</>,
      2,
    );
  } else {
    const run = runNative(arg, { trace: true });
    for (const s of run.steps!) {
      const failed = run.deopt && s === run.steps!.at(-1);
      r.snap(
        failed ? (
          <>The guard failed, so jump to deopt: this machine code can&apos;t handle a string. The JIT throws it away (deoptimises), and this call carries on in the bytecode VM, which handles any value.</>
        ) : (
          nativeCaption(s.line, s.regs, arg)
        ),
        failed ? 2 : 1,
        { pc: s.line, regs: s.regs, env: {}, count: r.get().count + 1, checks: r.get().checks + (s.loopCheck ? 1 : 0), deopt: failed },
      );
    }
    r.set({ pc: run.deopt ? r.get().pc : null, done: true });
    r.close(
      run.deopt
        ? <>Deoptimised after {plainCount(run.executed)} instructions. The VM still gets the right answer, {show(runVm(BYTECODE, SUM_SQUARES.param, arg).result)} for <code>sumSquares({show(arg)})</code>, just at VM speed.</>
        : <>Done: returned {show(run.result)} after {plainCount(run.executed)} machine instructions, {COUNTS.native.perIter} per iteration, with no lookups and no dispatch.</>,
      2,
    );
  }
  return r.frames;
}

const plainCount = (n: number) => n.toLocaleString('en-US');

/* ---------- the race ---------- */

export interface RaceFrame extends Frame {
  now: number;
}

const START_PHRASE: Record<string, (seg: Segment, lane: Lane) => string> = {
  compile: (seg, lane) => (seg.what === 'JIT compile'
    ? `${lane.name}: the counter reached ${fmtCount(HOT_THRESHOLD)}, so it compiles machine code (a ${fmtTime(COST.jitCompile)} pause in this model)`
    : seg.what === 'build (before the run)'
      ? `${lane.name}: building the program (${fmtTime(seg.end - seg.start)})`
      : `${lane.name}: ${seg.what}`),
  interp: (seg, lane) => `${lane.name}: running ${seg.what.replace(' in the VM', '')}${lane.id === 'jit' ? ' in the bytecode VM, counting' : ''}`,
  native: (seg, lane) => `${lane.name}: running ${seg.what.replace(' in machine code', '')} as machine code`,
  deopt: (_seg, lane) => `${lane.name}: the guard fails, n is a string. It deoptimises: the machine code is thrown away and the counter starts again`,
};

/**
 * One frame per moment something changes in any lane: a phase starts or a lane finishes.
 * Each caption lists what happened at that moment, read from the lanes.
 */
export function raceFrames(r: Race): RaceFrame[] {
  const moments = new Map<number, string[]>();
  const add = (t: number, text: string) => {
    const list = moments.get(t) ?? [];
    list.push(text);
    moments.set(t, list);
  };
  for (const lane of r.lanes) {
    lane.segments.forEach((seg, i) => {
      const prev = lane.segments[i - 1];
      // A new call in the same mode is not news; the phase change is.
      if (prev && prev.kind === seg.kind && seg.kind !== 'compile') return;
      add(seg.start, START_PHRASE[seg.kind](seg, lane));
    });
    if (lane.failed) add(lane.total, `${lane.name}: ${lane.failed}`);
    else add(lane.total, `${lane.name} finishes: ${fmtTime(lane.total)}, ${fmtCount(lane.ops)} ${lane.unit}`);
  }
  // Moments that print as the same time share one frame, so no two captions say "At 60 ms" for different events.
  const groups = new Map<string, { now: number; texts: string[] }>();
  for (const t of [...moments.keys()].sort((a, b) => a - b)) {
    const key = fmtTime(t);
    const g = groups.get(key) ?? { now: t, texts: [] };
    g.texts.push(...moments.get(t)!);
    groups.set(key, g);
  }
  const frames: RaceFrame[] = [...groups.values()].map((g) => ({
    now: g.now,
    say: <>{g.now === 0 ? 'At the start' : `At ${fmtTime(g.now)}`}: {g.texts.join('. ')}.</>,
    hold: 1.4,
  }));
  frames.push({ now: Math.max(...r.lanes.map((l) => l.total)), say: verdict(r), hold: 3 });
  return frames;
}

/** Who finished first, and why, from the lane totals. */
export function verdict(r: Race): ReactNode {
  const ran = r.lanes.filter((l) => !l.failed).sort((a, b) => a.total - b.total);
  const first = ran[0];
  const jit = r.lanes.find((l) => l.id === 'jit')!;
  const vm = r.lanes.find((l) => l.id === 'vm')!;
  const compiles = r.jitEvents.filter((e) => e.kind === 'hot').length;
  const hot = compiles > 0;
  const deopts = r.jitEvents.filter((e) => e.kind === 'deopt').length;
  const tied = ran.filter((l) => l.total === first.total);
  const parts: string[] = [tied.length > 1 ? `${tied.map((l) => l.name).join(' and ')} tied for first, in ${fmtTime(first.total)}.` : `${first.name} finished first, in ${fmtTime(first.total)}.`];
  if (!hot) parts.push(`The JIT never got hot, so it ran exactly like the bytecode VM: warm-up only pays off when code runs long enough.`);
  else parts.push(`The JIT took ${fmtTime(jit.total)} against the VM's ${fmtTime(vm.total)}: it started at VM speed and only sped up after compiling.`);
  if (deopts) parts.push(compiles > 1 ? 'The string call cost it a deoptimisation, then a second warm-up in the VM and a second compile.' : 'The string call cost it a deoptimisation.');
  const aot = r.lanes.find((l) => l.id === 'aot')!;
  if (!aot.failed && aot.segments.some((s) => s.kind === 'compile') && aot !== first) parts.push(`AOT's build time counts here; flip it to "built ahead" to see a shipped binary.`);
  return parts.join(' ');
}

/** Total ops of each lane at a moment, for the counters. */
export const laneOpsAt = (lane: Lane, t: number) => Math.round(opsAt(lane, t));
