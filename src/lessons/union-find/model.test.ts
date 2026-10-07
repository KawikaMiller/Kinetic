import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { freeFrames, scriptedFrames } from './frames';
import { CHAIN, COMBOS, N, replay, rootOf, SCRIPT, setsOf, totals, type Op } from './model';

function randomOps(rnd: Rnd, n: number, count: number): Op[] {
  return Array.from({ length: count }, () =>
    rnd() < 0.6 ? { kind: 'union', a: randInt(0, n - 1, rnd), b: randInt(0, n - 1, rnd) } : { kind: 'find', a: randInt(0, n - 1, rnd) },
  );
}

/** Reference connectivity: BFS over the union edges, as a component label per element. */
function bfsComponents(n: number, ops: readonly Op[]): number[] {
  const adj = Array.from({ length: n }, () => [] as number[]);
  for (const op of ops) {
    if (op.kind !== 'union') continue;
    adj[op.a].push(op.b);
    adj[op.b].push(op.a);
  }
  const label = new Array<number>(n).fill(-1);
  for (let s = 0; s < n; s++) {
    if (label[s] >= 0) continue;
    const queue = [s];
    label[s] = s;
    while (queue.length) {
      for (const v of adj[queue.shift()!]) {
        if (label[v] >= 0) continue;
        label[v] = s;
        queue.push(v);
      }
    }
  }
  return label;
}

describe('union-find model', () => {
  it('agrees with BFS connectivity on 1,000 seeded sequences (n = 10 to 200, all four settings)', () => {
    const rnd = mulberry32(21);
    for (let t = 0; t < 1000; t++) {
      const n = randInt(10, 200, rnd);
      const ops = randomOps(rnd, n, randInt(1, n * 2, rnd));
      const steps = replay(n, ops, COMBOS[t % 4].opts);
      const ref = bfsComponents(n, ops);
      const parents = steps[steps.length - 1].after;
      for (let i = 0; i < n; i++) {
        const j = randInt(0, n - 1, rnd);
        expect(rootOf(parents, i) === rootOf(parents, j)).toBe(ref[i] === ref[j]);
      }
      expect(setsOf(parents).length).toBe(new Set(ref).size);
      expect(steps[steps.length - 1].count).toBe(new Set(ref).size);
    }
  });

  it('keeps every tree within ⌊log₂ n⌋ with union by rank, checked after every operation', () => {
    const rnd = mulberry32(22);
    for (let t = 0; t < 300; t++) {
      const n = randInt(2, 200, rnd);
      const bound = Math.floor(Math.log2(n));
      for (const s of replay(n, randomOps(rnd, n, n * 2), { byRank: true, compress: t % 2 === 0 })) expect(s.height).toBeLessThanOrEqual(bound);
    }
    // Without rank the chain reaches n - 1.
    expect(totals(N, CHAIN, { byRank: false, compress: false }).maxHeight).toBe(N - 1);
  });

  it('path compression points every node on the find path at the root', () => {
    const rnd = mulberry32(23);
    for (let t = 0; t < 300; t++) {
      const n = randInt(5, 60, rnd);
      for (const s of replay(n, randomOps(rnd, n, n * 3), { byRank: t % 2 === 0, compress: true })) {
        if (s.op.kind !== 'find') continue;
        const ev = s.events.find((e) => e.kind === 'find')!;
        if (ev.kind !== 'find') continue;
        const root = ev.path[ev.path.length - 1];
        for (const node of ev.path) expect(s.after[node]).toBe(root);
      }
    }
  });

  it('pins the hop totals for the 30-operation script and the chain under all four settings', () => {
    expect(SCRIPT).toHaveLength(30);
    expect(COMBOS.map((c) => totals(N, SCRIPT, c.opts))).toEqual([
      { hops: 115, maxHeight: 9, finalHeight: 9 },
      { hops: 28, maxHeight: 1, finalHeight: 1 },
      { hops: 35, maxHeight: 5, finalHeight: 1 },
      { hops: 28, maxHeight: 1, finalHeight: 1 },
    ]);
    expect(COMBOS.map((c) => totals(N, CHAIN, c.opts).hops)).toEqual([18, 9, 10, 9]);
  });
});

describe('frames', () => {
  const runs = (['chain', 'script'] as const).flatMap((mode) => COMBOS.map((c) => ({ mode, ...c })));

  it.each(runs.map((r) => [`${r.mode} · ${r.label}`, r] as const))('%s: counters and the closing caption come from the run', (_, { mode, opts }) => {
    const ops = mode === 'chain' ? CHAIN : SCRIPT;
    const frames = scriptedFrames(mode, opts);
    const last = frames[frames.length - 1];
    const all = COMBOS.map((c) => totals(N, ops, c.opts));
    const mine = totals(N, ops, opts);
    expect(last.hops).toBe(mine.hops);
    expect(last.parents).toEqual(replay(N, ops, opts).at(-1)!.after);
    const text = captionText(last.say);
    expect(text).toContain(`${mine.hops} pointer hops`);
    COMBOS.forEach((c, i) => expect(text).toContain(`${c.label} ${all[i].hops}`));
    expect(text).toContain(`tallest tree ${mine.maxHeight}`);
    // Every frame's height matches its parent array, and hop captions match the path shown.
    for (const f of frames) {
      let max = 0;
      f.parents.forEach((_, i) => {
        let d = 0;
        for (let x = i; f.parents[x] !== x; x = f.parents[x]) d++;
        max = Math.max(max, d);
      });
      expect(f.height).toBe(max);
      const m = captionText(f.say).match(/^find\((\d+)\): follow parent pointers [\d → ]+\. (\d+) hops?/);
      if (m) expect(Number(m[2])).toBe(f.path.length - 1);
    }
  });

  it('the playground replays the newest operation and ends on the replayed structure', () => {
    expect(freeFrames([], { byRank: false, compress: false })).toHaveLength(1);
    const rnd = mulberry32(24);
    for (let t = 0; t < 100; t++) {
      const ops = randomOps(rnd, N, randInt(1, 25, rnd));
      const opts = COMBOS[t % 4].opts;
      const frames = freeFrames(ops, opts);
      const steps = replay(N, ops, opts);
      expect(frames[0].parents).toEqual(steps.at(-1)!.before);
      expect(frames.at(-1)!.parents).toEqual(steps.at(-1)!.after);
      expect(frames.at(-1)!.hops).toBe(steps.reduce((s, x) => s + x.hops, 0));
      expect(captionText(frames.at(-1)!.say)).toContain(`${steps.at(-1)!.hops} hop`);
    }
  });

  it('says why a link went the way it did from the ranks it saw', () => {
    const tie = scriptedFrames('chain', { byRank: true, compress: false }).map((f) => captionText(f.say));
    expect(tie.some((c) => /both ranks are 0, a tie/.test(c))).toBe(true);
    expect(tie.some((c) => /shorter tree goes under the taller/.test(c))).toBe(true);
    const naive = scriptedFrames('chain', { byRank: false, compress: false }).map((f) => captionText(f.say));
    expect(naive.some((c) => /Without union by rank/.test(c))).toBe(true);
  });
});
