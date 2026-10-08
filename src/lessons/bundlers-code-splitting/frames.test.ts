import { describe, expect, it } from 'vitest';
import { buildFrames, removedKb, shakeEvents } from './buildFrames';
import { APP_DEFAULTS, APP_IDS, buildApp, type AppOptions } from './model';
import { navFrames, scenariosFor, firstLoadKb, type Level } from './navFrames';
import { bytesSegments, nodeState } from './view';

const COMBOS: AppOptions[] = [false, true].flatMap((buttonSideEffects) =>
  [false, true].flatMap((datelibCjs) => [false, true].map((splitPages) => ({ buttonSideEffects, datelibCjs, splitPages }))),
);
const total = (segments: { value: number }[]) => segments.reduce((s, x) => s + x.value, 0);

describe('the build story, for every combination of the toggles', () => {
  it('walks every module once, then shakes, then splits; the visited list only grows', () => {
    for (const o of COMBOS) {
      const b = buildApp(o);
      const frames = buildFrames(b, o);
      const walk = frames.filter((f) => f.phase === 'walk' && f.current);
      expect(walk.map((f) => f.current)).toEqual(b.walk);
      frames.forEach((f, i) => i && expect(f.visited.length).toBeGreaterThanOrEqual(frames[i - 1].visited.length));
      const phases = frames.map((f) => f.phase);
      expect(phases).toEqual([...phases].sort((a, c) => ['walk', 'shake', 'split'].indexOf(a) - ['walk', 'shake', 'split'].indexOf(c)));
    }
  });

  it('the bytes shown add up: the walk ends at the full size, shaking ends at the shaken size, the chunks sum to the shaken size', () => {
    for (const o of COMBOS) {
      const b = buildApp(o);
      const frames = buildFrames(b, o);
      const walkEnd = frames.filter((f) => f.phase === 'walk').at(-1)!;
      expect(bytesSegments(walkEnd, b).shown).toBe(b.fullKb);
      const last = frames.at(-1)!;
      const { segments, shown } = bytesSegments(last, b);
      expect(shown).toBe(b.shakenKb);
      expect(total(segments)).toBe(b.fullKb);
      expect(removedKb(shakeEvents(b), shakeEvents(b).length)).toBe(b.fullKb - b.shakenKb);
    }
  });

  it('the node states match the model at the end: dropped modules are exactly the shaken-out ones, the others sit in their chunk', () => {
    for (const o of COMBOS) {
      const b = buildApp(o);
      const last = buildFrames(b, o).at(-1)!;
      for (const id of APP_IDS) {
        const state = nodeState(last, b, id);
        if (b.shaken.dropped.includes(id)) expect(state).toBe('dropped');
        else {
          const chunk = b.chunks.find((c) => c.modules.includes(id))!;
          expect(state).toBe(chunk.kind === 'lazy' ? 'lazy' : chunk.kind === 'shared' ? 'shared' : 'initial');
        }
      }
      expect(b.shaken.sideEffectOnly.length > 0).toBe(o.buttonSideEffects);
    }
  });

  it('a module kept for its side effects is orange before the split and has an event of its own', () => {
    const o = { ...APP_DEFAULTS, buttonSideEffects: true };
    const b = buildApp(o);
    expect(shakeEvents(b).some((e) => e.kind === 'sideEffect' && e.id === 'button')).toBe(true);
    const shakeEnd = buildFrames(b, o).filter((f) => f.phase === 'shake').at(-1)!;
    expect(nodeState(shakeEnd, b, 'button')).toBe('sideEffect');
  });

  it('the default scene has the events the try-this steps describe', () => {
    const b = buildApp(APP_DEFAULTS);
    expect(shakeEvents(b).map((e) => [e.kind, e.id])).toEqual([['exports', 'datelib'], ['drop', 'button'], ['exports', 'utils']]);
  });
});

describe('the navigate story', () => {
  const LEVELS: Level[] = ['bundle', 'shaken', 'split', 'fine'];

  it('is in time order, and ends after the last thing that happens', () => {
    for (const o of COMBOS) {
      const scenarios = scenariosFor(o);
      for (const level of LEVELS) {
        const s = scenarios[level];
        const frames = navFrames(s);
        frames.forEach((f, i) => i && expect(f.now).toBeGreaterThan(frames[i - 1].now));
        expect(frames.at(-1)!.now).toBe(s.plan.lazyChunks.length ? s.plan.visibleAt : s.plan.clickAt);
      }
    }
  });

  it('ships the same bytes however it is cut, and the unshaken bundle is the biggest first load', () => {
    for (const o of COMBOS) {
      const sc = scenariosFor(o);
      expect(sc.bundle.chunks[0].kb).toBeGreaterThanOrEqual(sc.shaken.chunks[0].kb);
      expect(sc.fine.chunks.reduce((s, c) => s + c.kb, 0)).toBe(sc.split.chunks.reduce((s, c) => s + c.kb, 0));
      expect(firstLoadKb(sc.bundle)).toBe(sc.bundle.chunks[0].kb);
    }
  });

  it('the first load is the same 22 KB (4 + 6 + 8 + 4) whether the split is sensible or too fine, and reports (with the shared date library and the chart library) comes after the click in both', () => {
    const sc = scenariosFor(APP_DEFAULTS);
    expect(firstLoadKb(sc.split)).toBe(22);
    expect(firstLoadKb(sc.fine)).toBe(22);
    expect(sc.fine.plan.lazyChunks).toEqual(['module:datelib', 'module:reports', 'module:chartlib']);
  });

  it('the default table tells the story the lesson claims: split is usable first, one bundle never waits at the click, too fine is slower than split', () => {
    const sc = scenariosFor(APP_DEFAULTS);
    expect(sc.split.plan.interactiveAt).toBeLessThan(sc.shaken.plan.interactiveAt);
    expect(sc.shaken.plan.interactiveAt).toBeLessThan(sc.bundle.plan.interactiveAt);
    expect(sc.bundle.plan.visibleAt).toBe(sc.bundle.plan.clickAt);
    expect(sc.shaken.plan.visibleAt).toBe(sc.shaken.plan.clickAt);
    expect(sc.split.plan.visibleAt).toBeGreaterThan(sc.split.plan.clickAt);
    expect(sc.fine.plan.interactiveAt).toBeGreaterThan(sc.split.plan.interactiveAt);
    expect(sc.fine.plan.fetches.length).toBeGreaterThan(sc.split.plan.fetches.length);
  });
});
