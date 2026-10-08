import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { buildFrames, nodeStates, verdicts } from './frames';
import lesson from './index';
import { NOTHING_BUILT, makeRun, targets, type Mode } from './model';
import { ENV, PRESETS, edit, filesOf, graphFor, initialEdits, type EditKind, type PresetId, type SourceId } from './presets';

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
