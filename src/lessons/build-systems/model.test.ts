import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import {
  NOTHING_BUILT, actionKey, actionsOf, build, criticalPath, makespan, schedule, targets, topoOrder, truthBuild, verdictOf,
  type BuildGraph, type BuildNode, type Files, type Mode, type Status,
} from './model';
import { ENV, SOURCES, edit, filesOf, graphFor, initialEdits, type EditKind, type SourceId } from './presets';

const clean = (g: BuildGraph, files: Files, env: string = ENV.mine, mode: Mode = 'hash', remote = {}) =>
  build(g, files, NOTHING_BUILT, {}, { mode, env, remote, clock: 1 });
const ids = (r: Record<string, { status: Status }>, ...s: Status[]) => Object.keys(r).filter((k) => s.includes(r[k].status)).sort();

/** Independent reference: breadth-first walk over "who declares me", written separately from the model. */
function dependents(g: BuildGraph, from: string): string[] {
  const out = new Set<string>();
  let frontier = [from];
  while (frontier.length) {
    frontier = g.nodes.filter((n) => !out.has(n.id) && frontier.some((f) => g.declared[n.id].includes(f))).map((n) => n.id);
    frontier.forEach((f) => out.add(f));
  }
  return [...out].sort();
}
const direct = (g: BuildGraph, from: string) => g.nodes.filter((n) => g.declared[n.id].includes(from)).map((n) => n.id).sort();

async function editAndRebuild(g: BuildGraph, src: SourceId, kind: EditKind, mode: Mode = 'hash') {
  const edits = initialEdits();
  const first = await clean(g, filesOf(edits), ENV.mine, mode);
  edits[src] = edit(edits[src], kind, first.clock + 1);
  const files = filesOf(edits);
  const second = await build(g, files, first.built, first.cache, { mode, env: ENV.mine, clock: first.clock + 1 });
  return { first, second, files };
}

describe('the preset DAG, content hashes', () => {
  const g = graphFor('good', false);

  it.each(SOURCES)('a code edit to %s rebuilds exactly what can reach it', async (src) => {
    const { second } = await editAndRebuild(g, src, 'code');
    expect(ids(second.results, 'rebuilt')).toEqual(dependents(g, src));
    expect(ids(second.results, 'cutoff')).toEqual([]);
  });

  it.each(SOURCES)('a comment-only edit to %s stops at its objects (early cutoff)', async (src) => {
    const { second } = await editAndRebuild(g, src, 'comment');
    expect(ids(second.results, 'rebuilt')).toEqual(direct(g, src));
    expect(direct(g, src).every((t) => t.endsWith('.o'))).toBe(true);
    // rebuilt ∪ cutoff = the reverse-reachable set; the rest is untouched
    expect([...ids(second.results, 'rebuilt'), ...ids(second.results, 'cutoff')].sort()).toEqual(dependents(g, src));
    for (const t of direct(g, src)) expect(second.results[t].out).toBe(second.built.targets[t].out);
  });

  it('hand-worked: math.h feeds three objects, and through them everything but io', async () => {
    const { second } = await editAndRebuild(g, 'math.h', 'code');
    expect(ids(second.results, 'rebuilt')).toEqual(['app', 'libmath.a', 'main.o', 'math.o', 'test.o', 'tests']);
    expect(ids(second.results, 'uptodate')).toEqual(['io.o', 'libio.a']);
  });

  it('a touch (save with no change) rebuilds nothing', async () => {
    const { second } = await editAndRebuild(g, 'math.c', 'touch');
    expect(second.changed).toEqual([]);
    expect(ids(second.results, 'rebuilt', 'cutoff')).toEqual([]);
  });

  it('a clean build after a clean build is all cache hits', async () => {
    const files = filesOf(initialEdits());
    const a = await clean(g, files);
    const b = await build(g, files, NOTHING_BUILT, a.cache, { mode: 'hash', env: ENV.mine, clock: a.clock });
    expect(ids(b.results, 'hit-local')).toEqual(targets(g).map((n) => n.id).sort());
  });
});

describe('the preset DAG, timestamps (make)', () => {
  const g = graphFor('good', false);
  it.each(['comment', 'touch'] as const)('a %s rebuilds the whole chain: no early cutoff', async (kind) => {
    const { second } = await editAndRebuild(g, 'math.c', kind, 'time');
    expect(ids(second.results, 'rebuilt')).toEqual(dependents(g, 'math.c'));
  });
  it('stays correct when the edges are right', async () => {
    const { second, files } = await editAndRebuild(g, 'math.h', 'code', 'time');
    const truth = await truthBuild(g, files, ENV.mine);
    for (const t of targets(g)) expect(verdictOf(second.results[t.id], truth[t.id])).toBe('ok');
  });
});

describe('missing dependency', () => {
  it.each(['hash', 'time'] as const)('skips main.o after a math.h edit and ships a stale app (%s)', async (mode) => {
    const g = graphFor('missing', false);
    const { second, files } = await editAndRebuild(g, 'math.h', 'code', mode);
    expect(second.results['main.o'].status).toBe('uptodate');
    const truth = await truthBuild(g, files, ENV.mine);
    expect(verdictOf(second.results['main.o'], truth['main.o'])).toBe('stale');
    expect(verdictOf(second.results.app, truth.app)).toBe('stale');
    expect(verdictOf(second.results.tests, truth.tests)).toBe('ok');
  });
  it('is fixed by declaring the header', async () => {
    const g = graphFor('missing', true);
    const { second, files } = await editAndRebuild(g, 'math.h', 'code');
    expect(second.results['main.o'].status).toBe('rebuilt');
    const truth = await truthBuild(g, files, ENV.mine);
    for (const t of targets(g)) expect(verdictOf(second.results[t.id], truth[t.id])).toBe('ok');
  });
});

describe('hermeticity', () => {
  const files = filesOf(initialEdits());
  it('two "identical" builds on different machines give different main.o bytes under the same key', async () => {
    const g = graphFor('env', false);
    const mine = await clean(g, files, ENV.mine);
    const theirs = await clean(g, files, ENV.teammate);
    expect(mine.results['main.o'].key).toBe(theirs.results['main.o'].key);
    expect(mine.results['main.o'].out).not.toBe(theirs.results['main.o'].out);
    expect(mine.results['math.o'].out).toBe(theirs.results['math.o'].out);
  });
  it("poisons the cache: a remote hit hands this machine the teammate's main.o", async () => {
    const g = graphFor('env', false);
    const theirs = await clean(g, files, ENV.teammate);
    const mine = await clean(g, files, ENV.mine, 'hash', theirs.cache);
    const truth = await truthBuild(g, files, ENV.mine);
    expect(mine.results['main.o'].status).toBe('hit-remote');
    expect(verdictOf(mine.results['main.o'], truth['main.o'])).toBe('poisoned');
    expect(verdictOf(mine.results['math.o'], truth['math.o'])).toBe('ok');
  });
  it('is fixed by declaring the variable: different keys, a local rebuild, correct outputs', async () => {
    const g = graphFor('env', true);
    const theirs = await clean(g, files, ENV.teammate);
    const mine = await clean(g, files, ENV.mine, 'hash', theirs.cache);
    const truth = await truthBuild(g, files, ENV.mine);
    expect(mine.results['main.o'].status).toBe('rebuilt');
    expect(mine.results['math.o'].status).toBe('hit-remote');
    for (const t of targets(g)) expect(verdictOf(mine.results[t.id], truth[t.id])).toBe('ok');
  });
});

describe('the action key', () => {
  it('is a deterministic function of the command and the declared inputs only', async () => {
    const g = graphFor('env', false);
    const k = (h: string[], env: string) => actionKey(g, 'main.o', h, env);
    expect(await k(['a', 'b'], 'info')).toBe(await k(['a', 'b'], 'info'));
    expect(await k(['a', 'b'], 'info')).toBe(await k(['a', 'b'], 'debug')); // undeclared env: not in the key
    expect(await k(['a', 'b'], 'info')).not.toBe(await k(['a', 'c'], 'info'));
    expect(await k(['a', 'b'], 'info')).not.toBe(await actionKey(g, 'math.o', ['a', 'b'], 'info')); // the command counts
    const declared = graphFor('env', true);
    expect(await actionKey(declared, 'main.o', ['a'], 'info')).not.toBe(await actionKey(declared, 'main.o', ['a'], 'debug'));
  });
  it('ignores an undeclared header: editing it leaves the key unchanged', async () => {
    const g = graphFor('missing', false);
    const { first, second } = await editAndRebuild(g, 'math.h', 'code');
    expect(second.results['main.o'].key).toBe(first.results['main.o'].key);
  });
  it('is real SHA-256 hex', async () => {
    const files = filesOf(initialEdits());
    const r = await clean(graphFor('good', false), files);
    for (const t of Object.values(r.results)) expect(t.key).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── 200 seeded DAGs ─────────────────────────────────────────────────

function randomGraph(rnd: Rnd): { g: BuildGraph; files: Files } {
  const src = Array.from({ length: randInt(2, 6, rnd) }, (_, i) => `s${i}`);
  const objs = Array.from({ length: randInt(1, 5, rnd) }, (_, i) => `o${i}`);
  const libs = Array.from({ length: randInt(0, 3, rnd) }, (_, i) => `l${i}`);
  const bins = Array.from({ length: randInt(1, 3, rnd) }, (_, i) => `b${i}`);
  const some = (xs: string[], lo: number, hi: number) => xs.filter(() => rnd() < 0.5).slice(0, hi).concat(xs.length ? [xs[randInt(0, xs.length - 1, rnd)]] : []).filter((x, i, a) => a.indexOf(x) === i).slice(0, Math.max(lo, hi));
  const declared: Record<string, string[]> = {};
  src.forEach((s) => (declared[s] = []));
  objs.forEach((o) => (declared[o] = some(src, 1, 3)));
  libs.forEach((l) => (declared[l] = some(objs, 1, 3)));
  bins.forEach((b) => (declared[b] = some([...objs, ...libs], 1, 4)));
  const node = (id: string, kind: BuildNode['kind']): BuildNode => ({ id, kind, cmd: kind === 'src' ? '' : `${kind} ${id}` });
  const nodes = [...src.map((s) => node(s, 'src')), ...objs.map((o) => node(o, 'obj')), ...libs.map((l) => node(l, 'lib')), ...bins.map((b) => node(b, 'bin'))];
  const files: Files = Object.fromEntries(src.map((s) => [s, { code: `${s} v0`, comment: 'c0', mtime: 0 }]));
  return { g: { nodes, declared, actual: declared, readsEnv: [], envDeclared: false }, files };
}

describe('200 seeded DAGs', () => {
  it('rebuild exactly the reverse-reachable set, minus early-cutoff hits, and schedule in a valid order', async () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const { g, files } = randomGraph(rnd);
      const first = await clean(g, files);
      const srcs = Object.keys(files);
      const s = srcs[randInt(0, srcs.length - 1, rnd)];
      const kind = rnd() < 0.5 ? 'code' : 'comment';
      const f = files[s];
      const next: Files = { ...files, [s]: kind === 'code' ? { ...f, code: `${f.code}!`, mtime: 9 } : { ...f, comment: `${f.comment}!`, mtime: 9 } };
      const second = await build(g, next, first.built, first.cache, { mode: 'hash', env: ENV.mine, clock: first.clock });
      const reach = dependents(g, s);
      const expected = kind === 'code' ? reach : direct(g, s);
      expect(ids(second.results, 'rebuilt'), `seed ${seed}`).toEqual(expected);
      expect(ids(second.results, 'cutoff'), `seed ${seed}`).toEqual(reach.filter((t) => !expected.includes(t)));

      const actions = actionsOf(g, second.results);
      for (const workers of [1, 2, 4, 64]) {
        const slots = schedule(g, actions, workers);
        expect(slots.map((x) => x.id).sort()).toEqual(actions.map((a) => a.id).sort());
        const end = new Map(slots.map((x) => [x.id, x.end]));
        for (const x of slots) for (const d of g.declared[x.id]) if (end.has(d)) expect(x.start).toBeGreaterThanOrEqual(end.get(d)!);
        for (const x of slots) for (const y of slots) if (x !== y && x.worker === y.worker) expect(x.end <= y.start || y.end <= x.start).toBe(true);
        const total = actions.reduce((a, b) => a + b.seconds, 0);
        expect(makespan(slots)).toBeGreaterThanOrEqual(Math.max(criticalPath(g, actions), total / workers) - 1e-9);
        if (workers >= actions.length) expect(makespan(slots)).toBeCloseTo(criticalPath(g, actions), 9);
      }
      expect(() => topoOrder(g)).not.toThrow();
    }
  });
});

describe('the preset schedule', () => {
  it('a clean build: 4 objects, 2 archives, 2 links; 24 s on one worker, critical path 8 s', async () => {
    const g = graphFor('good', false);
    const r = await clean(g, filesOf(initialEdits()));
    const actions = actionsOf(g, r.results);
    expect(makespan(schedule(g, actions, 1))).toBe(4 * 4 + 2 * 1 + 2 * 3);
    expect(criticalPath(g, actions)).toBe(4 + 1 + 3);
    expect(makespan(schedule(g, actions, 4))).toBe(8);
    expect(makespan(schedule(g, actions, 2))).toBe(12);
  });
});
