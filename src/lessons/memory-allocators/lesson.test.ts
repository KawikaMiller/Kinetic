import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { ALLOC_CHIPS, POLICIES, SCRIPT, arenaFrom, holesOf, metrics, runScript } from './arena';
import { arenaCaption, classesCaption, n, pagesCaption } from './captions';
import {
  FREE_PATTERNS, OBJECTS_PER_PAGE, PAGES, SPACINGS, classTable, internalWaste, pagesOpening, requestSizes, spacingOpening, summarisePages, worstCaseWaste,
} from './classes';
import { classFacts, coalesceFacts, fragmentedFacts, pageFacts, scriptFacts } from './facts';
import lesson from './index';
import { allocate, freeBlock, playScript, reset, sessionOpening, type ArenaSession } from './session';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
const press = (s: ArenaSession, sizes: readonly number[]) => sizes.reduce(allocate, s);

describe('scene switches', () => {
  it('every scene is its own component and carries its own key, so no scene opens on another scene\'s state', () => {
    expect(sceneElements('memory-allocators')).toHaveLength(3);
    expect(sharedSceneComponents('memory-allocators')).toEqual([]);
    expect(sceneElements('memory-allocators').every((e) => e.keyed)).toBe(true);
  });

  it('each scene\'s opening state is the one its try-this assumes', () => {
    const s = sessionOpening();
    expect(s).toMatchObject({ policy: 'first', coalesce: true, last: null });
    expect(s.arena.segs).toEqual([{ start: 0, size: 64, id: null }]);
    expect(spacingOpening()).toBe('quarter');
    expect(pagesOpening()).toEqual({ objectsPerPage: 8, freed: 0.9, pattern: 'random' });
  });
});

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the script leaves 3 holes and 25.8% fragmentation under first fit, and every policy fails some allocations', () => {
    const f = scriptFacts();
    expect([f.policy, f.holes, f.fragmentation]).toEqual(['first', 3, '25.8%']);
    expect(f.failures).toEqual({ first: 6, next: 7, best: 6, worst: 9 });
    for (const p of POLICIES) expect(f.failures[p]).toBeGreaterThan(0);
    expect(lesson.tryThis[0]).toContain('3 holes remain and external fragmentation is 25.8%');
    expect(lesson.tryThis[0]).toContain('worst fit 9, next fit 7, first fit 6 and best fit 6');
  });

  it('try-this 2: the written presses leave 40 units free in 4 holes, the largest 12, and alloc(16) fails as fragmented', () => {
    expect(fragmentedFacts()).toEqual({ free: 40, largest: 12, holes: 4, outcome: 'fragmented' });
    expect(lesson.tryThis[1]).toContain('40 units are free in 4 holes but the largest is 12');
  });

  it('try-this 3: coalescing on leaves 1 hole after freeing two neighbours; off leaves 3, the largest 48', () => {
    expect(coalesceFacts()).toEqual({ on: 1, off: 3, offLargest: 48 });
    expect(lesson.tryThis[2]).toContain('1 hole remains');
    expect(lesson.tryThis[2]).toContain('3 holes remain and the largest is 48');
  });

  it('try-this 4: 25% spacing is 25 classes and 11.1% waste; powers of two 10 classes and 28.0%', () => {
    const f = classFacts();
    expect(f.quarter).toEqual({ classes: 25, waste: '11.1%' });
    expect(f.pow2).toEqual({ classes: 10, waste: '28.0%' });
    expect(lesson.tryThis[3]).toContain('25 classes and 11.1%');
    expect(lesson.tryThis[3]).toContain('10 classes and 28.0%');
  });

  it('try-this 5: 90% freed at random over 8-object pages returns 112 of 256 pages; oldest first returns 230', () => {
    const f = pageFacts();
    expect([f.randomReturnable, f.oldestReturnable, f.pages]).toEqual([112, 230, 256]);
    expect(lesson.tryThis[4]).toContain('112 of 256 pages are returnable');
    expect(lesson.tryThis[4]).toContain('230 of 256');
  });
});

describe('the arena session', () => {
  it('press, free, reset and the script behave as the buttons say', () => {
    let s = press(sessionOpening(), [8, 8]);
    expect(metrics(s.arena)).toMatchObject({ blocks: 2, freeTotal: 48 });
    s = freeBlock(s, 1);
    expect(s.last).toMatchObject({ kind: 'free', id: 1, size: 8 });
    expect(freeBlock(s, 99)).toBe(s);
    expect(reset(s).arena.segs).toHaveLength(1);
    const played = playScript(sessionOpening());
    expect(played.arena).toEqual(runScript('first', true).arena);
    expect(played.last).toMatchObject({ kind: 'script', operations: SCRIPT.length });
  });

  it('every chip is a valid size, and the policy table is the same script for every policy', () => {
    expect(ALLOC_CHIPS.every((c) => c >= 1 && c <= 32)).toBe(true);
    for (const p of POLICIES) expect(runScript(p, true).history).toHaveLength(SCRIPT.length + 1);
  });
});

describe('captions say what the model did', () => {
  it('arena captions name the real outcome: placed, fragmented, out of memory, merged or not, and the script', () => {
    const open = sessionOpening();
    for (const policy of POLICIES) {
      const placed = allocate({ ...open, policy }, 8);
      const say = text(arenaCaption(placed.last, placed.arena));
      expect(say).toContain('took');
      expect(say).toContain('64 units at unit 0');
    }
    const fragmented = allocate({ ...open, arena: arenaFrom([[10, false], [8, true], [10, false], [8, true], [10, false], [8, true], [10, false]]) }, 16);
    expect(text(arenaCaption(fragmented.last, fragmented.arena))).toContain('fragmented, not out of memory');
    expect(text(arenaCaption(fragmented.last, fragmented.arena))).toContain('40 units are free in 4 holes, but the largest is 10');
    const full = allocate({ ...open, arena: arenaFrom([[60, true], [4, false]]) }, 8);
    expect(text(arenaCaption(full.last, full.arena))).toContain('out of memory, not fragmentation');
    let s = press(open, [8, 8, 8]);
    expect(text(arenaCaption(freeBlock(s, 2).last, freeBlock(s, 2).arena))).toContain('both neighbours are live');
    s = freeBlock(s, 1);
    expect(text(arenaCaption(freeBlock(s, 2).last, freeBlock(s, 2).arena))).toContain('merged with a free neighbour');
    const off = freeBlock(press({ ...open, coalesce: false }, [8, 8, 8]), 2);
    expect(text(arenaCaption(off.last, off.arena))).toContain('coalescing is off');
    const played = playScript(open);
    expect(text(arenaCaption(played.last, played.arena))).toContain(`${holesOf(played.arena).length} holes remain`);
  });

  it('the fragmented caption appears exactly when total free >= n and the largest hole < n, over every chip and policy', () => {
    const arena = arenaFrom([[10, false], [8, true], [10, false], [8, true], [10, false], [8, true], [10, false]]);
    for (const policy of POLICIES) {
      for (const size of ALLOC_CHIPS) {
        const r = allocate({ ...sessionOpening(), arena, policy }, size);
        const say = text(arenaCaption(r.last, r.arena));
        expect(say.includes('fragmented, not out of memory')).toBe(size > 10 && size <= 40);
        expect(say.includes('out of memory, not fragmentation')).toBe(size > 40);
      }
    }
  });

  it('the class caption quotes the model\'s waste and class count at every spacing', () => {
    const reqs = requestSizes();
    for (const spacing of SPACINGS) {
      const table = classTable(spacing);
      const say = text(classesCaption(spacing, table.length, internalWaste(table, reqs), worstCaseWaste(table)));
      expect(say).toContain(`${n(table.length)} size classes`);
      expect(say).toContain('internal waste');
    }
  });

  it('the page caption quotes the same pages as the grid, at the slider extremes and for every pattern', () => {
    for (const objectsPerPage of [OBJECTS_PER_PAGE.min, OBJECTS_PER_PAGE.max]) {
      for (const freed of [0, 0.5, 1]) {
        for (const pattern of FREE_PATTERNS) {
          const setup = { objectsPerPage, freed, pattern };
          const sum = summarisePages(setup);
          const say = text(pagesCaption(setup, sum));
          expect(say).toContain(`${n(sum.freedObjects)} of ${n(PAGES * objectsPerPage)}`);
          expect(say).toContain(`${n(sum.returnable)} ${sum.returnable === 1 ? 'page is' : 'pages are'} completely empty`);
          expect(sum.full + sum.partial + sum.returnable).toBe(PAGES);
        }
      }
    }
  });
});

describe('honesty and quiz', () => {
  it('no model file reads a clock, starts a timer or touches the network, and the model keeps no metadata bytes', () => {
    const files = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts') && !name.endsWith('.tsx'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const [name, source] of files) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
      expect(code, name).not.toMatch(/performance\.now|Date\.now|new Date|setTimeout|setInterval|requestAnimationFrame|fetch\(|Uint8Array|ArrayBuffer/);
    }
  });

  it('the correct quiz option is the strictly longest in at most half the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(lesson.quiz.length / 2);
  });

  it('the quiz numbers come from the model', () => {
    const a = arenaFrom([[10, false], [8, true], [10, false], [8, true], [10, false], [8, true], [10, false]]);
    expect(metrics(a)).toMatchObject({ freeTotal: 40, largestFree: 10, holes: 4 });
    expect(lesson.quiz[0].why).toContain('40 units are free in the lab example, with the largest hole 12');
    expect(lesson.quiz[1].why).toContain('112 of 256 pages in the lab, against 230');
    expect(lesson.quiz[3].why).toContain('powers of two waste 28.0% of the bytes handed out with 10 classes');
  });
});
