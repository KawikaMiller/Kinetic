import { afterEach, describe, expect, it, vi } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { buildFrames, nodeStates, verdicts } from './frames';
import lesson from './index';
import { NOTHING_BUILT, fileHash, makeRun, targets, type Mode } from './model';
import { ENV, PRESETS, edit, filesOf, graphFor, initialEdits, revertEdits, type EditKind, type PresetId, type SourceId } from './presets';

async function scenario(preset: PresetId, fixed: boolean, mode: Mode, src: SourceId, kind: EditKind, workers = 2) {
  const graph = graphFor(preset, fixed);
  const edits = initialEdits();
  const first = await makeRun({ graph, files: filesOf(edits), prev: NOTHING_BUILT, cache: {}, options: { mode, env: ENV.mine, clock: 1 }, workers: 1, clean: true });
  edits[src] = edit(edits[src], kind, first.result.clock + 1);
  return makeRun({
    graph, files: filesOf(edits), prev: first.result.built, cache: first.result.cache, workers, clean: false,
    options: { mode, env: ENV.mine, clock: first.result.clock + 1 },
  });
}

const combos = PRESETS.flatMap((p) => [false, true].flatMap((fixed) => (['hash', 'time'] as const).flatMap((mode) =>
  (['math.h', 'math.c'] as const).flatMap((src) => (['code', 'comment', 'touch'] as const).map((kind) => ({ preset: p.id, fixed, mode, src, kind }))))));

describe('build frames, every preset × fix × mode × edit', () => {
  it.each(combos.map((c) => [`${c.preset} ${c.fixed ? 'fixed' : ''} ${c.mode} ${c.src} ${c.kind}`, c] as const))('%s', async (_, c) => {
    const run = await scenario(c.preset, c.fixed, c.mode, c.src, c.kind);
    const frames = buildFrames(run);
    const final = text(frames[frames.length - 1].say);
    const v = verdicts(run);
    const rebuilt = Object.values(run.result.results).filter((r) => r.status === 'rebuilt').length;
    expect(final).toContain(`rebuilt ${rebuilt} of ${targets(run.graph).length} targets`);
    expect(final.includes('Stale:')).toBe(Object.values(v).includes('stale'));
    expect(final.includes('Poisoned:')).toBe(Object.values(v).includes('poisoned'));
    expect(final.includes('Every output matches')).toBe(Object.values(v).every((x) => x === 'ok'));
    const all = frames.map((fr) => text(fr.say)).join(' ');
    expect(all.includes('early cutoff')).toBe(Object.values(run.result.results).some((r) => r.status === 'cutoff'));
    expect(text(frames[0].say).includes('Nothing to do') || text(frames[0].say).includes('nothing to do')).toBe(run.result.changed.length === 0);
    // A missing edge is only ever blamed when the preset really has one.
    expect(final.includes('without declaring it')).toBe(c.preset === 'missing' && !c.fixed && Object.values(v).includes('stale'));
    // Verdicts show only on the summary frame, and frames never go back in time.
    for (let i = 1; i < frames.length; i++) expect(frames[i].t).toBeGreaterThanOrEqual(frames[i - 1].t);
    const mid = nodeStates(run, frames[0].t, false);
    expect(Object.values(mid)).not.toContain('stale');
    const end = nodeStates(run, frames[frames.length - 1].t, true);
    for (const id of Object.keys(v)) if (v[id] !== 'ok') expect(end[id]).toBe(v[id]);
  });
});

describe('specific claims', () => {
  it('the comment-only edit stops at the object: the rest turn green on the frame math.o finishes', async () => {
    const run = await scenario('good', false, 'hash', 'math.c', 'comment');
    const frames = buildFrames(run);
    const done = frames.find((fr) => text(fr.say).includes('math.o rebuilt'))!;
    expect(text(done.say)).toContain('unchanged');
    const st = nodeStates(run, done.t, false);
    expect(st['libmath.a']).toBe('hit');
    expect(st.app).toBe('hit');
    expect(st['io.o']).toBe('uptodate');
  });

  it('the missing-dependency try-this works from the default state and ends stale', async () => {
    const run = await scenario('missing', false, 'hash', 'math.h', 'code');
    const final = text(buildFrames(run).at(-1)!.say);
    expect(final).toContain('Stale: main.o and app');
    expect(final).toContain('main.o reads math.h without declaring it');
  });

  it('the hermeticity try-this: a clean build with the remote cache is poisoned until LOG_LEVEL is declared', async () => {
    for (const fixed of [false, true]) {
      const graph = graphFor('env', fixed);
      const files = filesOf(initialEdits());
      const theirs = await makeRun({ graph, files, prev: NOTHING_BUILT, cache: {}, options: { mode: 'hash', env: ENV.teammate, clock: 0 }, workers: 1, clean: true });
      const mine = await makeRun({ graph, files, prev: NOTHING_BUILT, cache: {}, options: { mode: 'hash', env: ENV.mine, clock: 0, remote: theirs.result.cache }, workers: 2, clean: true });
      const final = text(buildFrames(mine).at(-1)!.say);
      expect(final.includes('Poisoned: main.o')).toBe(!fixed);
    }
  });

  it('the quiz numbers come from the preset schedule', async () => {
    const graph = graphFor('good', false);
    const run = await makeRun({ graph, files: filesOf(initialEdits()), prev: NOTHING_BUILT, cache: {}, options: { mode: 'hash', env: ENV.mine, clock: 0 }, workers: 4, clean: true });
    expect(run.critical).toBe(8);
    expect(run.slots.reduce((a, s) => a + (s.end - s.start), 0)).toBe(24);
    const q = lesson.quiz[2];
    expect(q.options[q.answer]).toBe(`${run.critical} s`);
  });
});

async function remoteClean(fixed: boolean) {
  const graph = graphFor('env', fixed);
  const files = filesOf(initialEdits());
  const theirs = await makeRun({ graph, files, prev: NOTHING_BUILT, cache: {}, options: { mode: 'hash', env: ENV.teammate, clock: 0 }, workers: 1, clean: true });
  return makeRun({ graph, files, prev: NOTHING_BUILT, cache: {}, options: { mode: 'hash', env: ENV.mine, clock: 0, remote: theirs.result.cache }, workers: 2, clean: true });
}

describe('fetching is not building (hermeticity try-this, remote on, Clean build)', () => {
  it('says fetch, never build, and shows a fetch in flight in its own state', async () => {
    const run = await remoteClean(false);
    expect(run.slots).toHaveLength(8);
    const frames = buildFrames(run);
    const all = frames.map((fr) => text(fr.say)).join(' | ');
    expect(all).not.toContain('Now building');
    expect(all).toContain('Now fetching');
    expect(all).toContain('from the remote cache');
    const start = text(frames[0].say);
    expect(start).toContain('8 actions');
    expect(start).toContain('none to run, 8 to fetch from a cache');
    const first = run.slots[0];
    const mid = nodeStates(run, first.start + 0.1, false);
    expect(mid[first.id]).toBe('fetching');
    expect(Object.values(mid)).not.toContain('building');
  });
  it('still says building for a real rebuild, with the fixed build file', async () => {
    const run = await remoteClean(true);
    const all = buildFrames(run).map((fr) => text(fr.say)).join(' | ');
    expect(all).toContain('main.o rebuilt');
    expect(all).toContain('Now building app');
    expect(all).toContain('Now fetching');
    expect(text(buildFrames(run)[0].say)).toContain('2 to run, 6 to fetch from a cache');
  });
  it('final caption: only main.o leaves an input out of its key, app inherits the poison', async () => {
    const final = text(buildFrames(await remoteClean(false)).at(-1)!.say);
    expect(final).toContain('Poisoned: main.o and app');
    expect(final).toContain("Only main.o's key leaves out an input");
    expect(final).toContain('app inherits it through its inputs');
  });
});

describe('Revert last edit (the local cache hit), from the default state', () => {
  async function editBuildRevertBuild(mode: Mode) {
    const graph = graphFor('good', false);
    const e0 = initialEdits();
    const first = await makeRun({ graph, files: filesOf(e0), prev: NOTHING_BUILT, cache: {}, options: { mode, env: ENV.mine, clock: 1 }, workers: 1, clean: true });
    const e1 = { ...e0, 'math.c': edit(e0['math.c'], 'code', first.result.clock + 1) };
    const second = await makeRun({ graph, files: filesOf(e1), prev: first.result.built, cache: first.result.cache, workers: 2, clean: false, options: { mode, env: ENV.mine, clock: first.result.clock + 1 } });
    const tick = second.result.clock + 1;
    const e2 = revertEdits(e1, e0, tick);
    const third = await makeRun({ graph, files: filesOf(e2), prev: second.result.built, cache: second.result.cache, workers: 2, clean: false, options: { mode, env: ENV.mine, clock: tick } });
    return { e1, e2, third };
  }
  it('with content hashes, the old outputs come back from the local cache and nothing rebuilds', async () => {
    const { third } = await editBuildRevertBuild('hash');
    const statuses = Object.fromEntries(Object.entries(third.result.results).map(([k, r]) => [k, r.status]));
    expect(Object.keys(statuses).filter((k) => statuses[k] === 'hit-local').sort()).toEqual(['app', 'libmath.a', 'math.o', 'tests']);
    expect(Object.values(statuses)).not.toContain('rebuilt');
    const final = text(buildFrames(third).at(-1)!.say);
    expect(final).toContain('rebuilt 0 of 8 targets');
    expect(final).toContain('Every output matches a from-scratch build');
    expect(text(buildFrames(third).map((f) => f.say).join(' ') && buildFrames(third)[1].say)).toContain('local cache');
  });
  it('with make, the reverted file is newer, so the whole chain rebuilds', async () => {
    const { third } = await editBuildRevertBuild('time');
    expect(Object.keys(third.result.results).filter((k) => third.result.results[k].status === 'rebuilt').sort()).toEqual(['app', 'libmath.a', 'math.o', 'tests']);
  });
  it('revertEdits restores only the files that changed and stamps them with the new tick', () => {
    const e0 = initialEdits();
    const e1 = { ...e0, 'math.c': edit(e0['math.c'], 'code', 5), 'io.c': edit(e0['io.c'], 'comment', 6) };
    const r = revertEdits(e1, { ...e1, 'io.c': e0['io.c'] }, 9);
    expect(r['io.c']).toEqual({ ...e0['io.c'], mtime: 9 });
    expect(r['math.c']).toBe(e1['math.c']);
  });
});

describe('without crypto.subtle', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('a hash refuses instead of returning a key that is the same for everything', async () => {
    vi.stubGlobal('crypto', {});
    await expect(fileHash({ code: 'a', comment: 'b', mtime: 0 })).rejects.toThrow('SHA-256 is unavailable');
  });
});

describe('sources are only "edited" when the learner edited them', () => {
  it('a clean build leaves every source idle; an incremental build marks just the edited one', async () => {
    const clean = await remoteClean(false);
    expect(Object.entries(nodeStates(clean, 0, false)).filter(([id]) => /\.[ch]$/.test(id)).map(([, s]) => s)).toEqual(Array(6).fill('idle'));
    const inc = await scenario('good', false, 'hash', 'math.c', 'code');
    const st = nodeStates(inc, 0, false);
    expect(Object.entries(st).filter(([, s]) => s === 'edited').map(([id]) => id)).toEqual(['math.c']);
  });
});
