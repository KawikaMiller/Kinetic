// Pure model behind profiling-flame-graphs: a small fictional request handler as an ordered
// call tree, laid out on a timeline, sampled by a simulated CPU profiler, and the samples
// folded into the tree a flame graph draws. Durations are illustrative milliseconds.
import { mulberry32 } from '../../core/random';

/** A function's body, in order: on-CPU work of its own (ms), off-CPU waits, and calls. */
export type Step = number | { wait: number } | Call;
export interface Call {
  name: string;
  body: Step[];
}

export interface Fixes {
  /** Build the Intl.NumberFormat once, outside the loop, instead of on every formatPrice call. */
  hoist: boolean;
  /** A faster JSON parser: the decoy fix. */
  fastJson: boolean;
}

export const NO_FIXES: Fixes = { hoist: false, fastJson: false };
export const LOOP = 20;
export const MS = {
  handlerSelf: 0.5,
  parse: 6,
  fastParse: 4.5,
  loadUserBefore: 1,
  loadUserAfter: 0.5,
  queryBuild: 1,
  queryWait: 25,
  queryRows: 1,
  renderBefore: 1.5,
  renderAfter: 1.5,
  newFormatter: 2,
  format: 0.25,
  formatPriceSelf: 0.05,
  log: 2,
} as const;

const call = (name: string, ...body: Step[]): Call => ({ name, body });

/** The handler, with or without the fixes applied. */
export function program(f: Fixes): Call {
  const formatter = call('Intl.NumberFormat', MS.newFormatter);
  const formatPrice = f.hoist
    ? call('formatPrice', call('format', MS.format), MS.formatPriceSelf)
    : call('formatPrice', formatter, call('format', MS.format), MS.formatPriceSelf);
  return call(
    'handleRequest',
    MS.handlerSelf,
    call('parseJson', f.fastJson ? MS.fastParse : MS.parse),
    call('loadUser', MS.loadUserBefore, call('db.query', MS.queryBuild, { wait: MS.queryWait }, MS.queryRows), MS.loadUserAfter),
    call('renderPage', MS.renderBefore, ...(f.hoist ? [formatter] : []), ...Array<Step>(LOOP).fill(formatPrice), MS.renderAfter),
    call('logLine', MS.log),
    MS.handlerSelf,
  );
}

/** A stretch of the run with one stack on (or off) the CPU. Times are wall-clock ms. */
export interface Segment {
  start: number;
  end: number;
  stack: readonly string[];
  onCpu: boolean;
}

/** The run in time order: one segment per stretch of own work or waiting. */
export function timeline(root: Call): Segment[] {
  const out: Segment[] = [];
  let t = 0;
  const walk = (c: Call, stack: string[]) => {
    const here = [...stack, c.name];
    for (const step of c.body) {
      if (typeof step === 'number') {
        out.push({ start: t, end: t + step, stack: here, onCpu: true });
        t += step;
      } else if ('wait' in step) {
        out.push({ start: t, end: t + step.wait, stack: here, onCpu: false });
        t += step.wait;
      } else walk(step, here);
    }
  };
  walk(root, []);
  return out;
}

export const cpuTime = (segs: readonly Segment[]) => segs.filter((s) => s.onCpu).reduce((a, s) => a + s.end - s.start, 0);
export const wallTime = (segs: readonly Segment[]) => (segs.length ? segs[segs.length - 1].end : 0);

/** True share of on-CPU time with `name` anywhere on the stack (inclusive), or as the leaf (self). */
export function trueShare(segs: readonly Segment[], name: string, mode: 'total' | 'self'): number {
  const cpu = segs.filter((s) => s.onCpu);
  const hit = cpu.filter((s) => (mode === 'self' ? s.stack[s.stack.length - 1] === name : s.stack.includes(name)));
  return hit.reduce((a, s) => a + s.end - s.start, 0) / cpuTime(segs);
}

export interface Sample {
  /** Wall-clock time of the sample. */
  at: number;
  stack: readonly string[];
}

/**
 * A CPU-time sampling profiler: n samples, one per equal slice of on-CPU time, at a seeded
 * random point inside each slice (jitter, so it can't lock onto the loop). Time spent off the
 * CPU (the database wait) is never sampled.
 */
export function sample(segs: readonly Segment[], n: number, seed: number): Sample[] {
  const rnd = mulberry32(seed);
  const cpu = segs.filter((s) => s.onCpu);
  const total = cpuTime(segs);
  const out: Sample[] = [];
  let i = 0;
  let before = 0; // CPU time before segment i
  for (let k = 0; k < n; k++) {
    const t = ((k + rnd()) / n) * total;
    while (i < cpu.length - 1 && before + (cpu[i].end - cpu[i].start) <= t) {
      before += cpu[i].end - cpu[i].start;
      i++;
    }
    out.push({ at: cpu[i].start + (t - before), stack: cpu[i].stack });
  }
  return out;
}

export interface FlameNode {
  name: string;
  /** Samples with this frame on the stack at this position (inclusive of children). */
  total: number;
  /** Samples where this frame was the leaf: its own work. */
  self: number;
  /** Merged by name and sorted alphabetically, like flamegraph.pl. */
  children: FlameNode[];
  /** Path from the root, joined with ';' (a folded-stack prefix): a stable id. */
  id: string;
}

/** Fold stacks into the flame-graph tree: identical frames under the same parent merge. */
export function foldStacks(samples: readonly { stack: readonly string[] }[]): FlameNode {
  const root: FlameNode = { name: 'all', total: 0, self: 0, children: [], id: 'all' };
  for (const s of samples) {
    root.total++;
    let node = root;
    for (const name of s.stack) {
      let child = node.children.find((c) => c.name === name);
      if (!child) {
        child = { name, total: 0, self: 0, children: [], id: `${node.id};${name}` };
        node.children.push(child);
      }
      child.total++;
      node = child;
    }
    if (s.stack.length) node.self++;
    else root.self++;
  }
  const sort = (n: FlameNode) => {
    n.children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

export interface FlameBox {
  node: FlameNode;
  depth: number;
  /** Left edge and width as shares of the root's samples (0..1). */
  x: number;
  w: number;
}

/** Flame-graph boxes: each child starts where the previous sibling ended, widths ∝ samples. */
export function layoutFlame(root: FlameNode): FlameBox[] {
  const out: FlameBox[] = [];
  const total = root.total || 1;
  const walk = (n: FlameNode, depth: number, x: number) => {
    out.push({ node: n, depth, x: x / total, w: n.total / total });
    let at = x;
    for (const c of n.children) {
      walk(c, depth + 1, at);
      at += c.total;
    }
  };
  walk(root, 0, 0);
  return out;
}

export interface ChartBox {
  name: string;
  depth: number;
  /** First sample index and how many, in time order. */
  from: number;
  count: number;
}

/** A flame chart (time order): at each depth, consecutive samples with the same stack prefix merge. */
export function layoutChart(samples: readonly Sample[]): ChartBox[] {
  const ordered = [...samples].sort((a, b) => a.at - b.at);
  const out: ChartBox[] = [];
  const depth = Math.max(0, ...ordered.map((s) => s.stack.length));
  for (let d = 0; d < depth; d++) {
    let run: ChartBox | null = null;
    let runKey = '';
    ordered.forEach((s, i) => {
      const key = s.stack.length > d ? s.stack.slice(0, d + 1).join(';') : '';
      if (run && key === runKey && key) run.count++;
      else {
        if (run) out.push(run);
        run = key ? { name: s.stack[d], depth: d + 1, from: i, count: 1 } : null;
        runKey = key;
      }
    });
    if (run) out.push(run);
  }
  return out;
}

/** 95% margin of a sampled share, in the binomial approximation (conservative for stratified samples). */
export const margin95 = (share: number, n: number) => (n > 0 ? 1.96 * Math.sqrt((share * (1 - share)) / n) : 1);

export const HOT_LEAF = 'Intl.NumberFormat';
export const SAMPLE_STEPS = [20, 50, 100, 200, 500, 1000, 2000] as const;
