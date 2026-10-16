import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { MAX_PASTE, MAX_TEXT, OPEN, checkInsert, clampCursor, parsePosition } from './editing';
import { FACTS } from './facts';
import lesson from './index';
import { SCRIPTS, scriptCost } from './scripts';
import { toneIn } from './tones';
import { WORKLOADS, runWorkload } from './workloads';
import { codePoints, gapBackspace, gapCreate, gapInsert, gapMoveTo, gapText, ropeBuild, ropeCreate, ropeIndex, ropeInsert, ropeLeaves, ropeReachable } from './structures';

describe('scenes', () => {
  it('every scene component carries its own key', () => {
    const els = sceneElements('ropes-gap-buffers');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('ropes-gap-buffers')).toEqual([]);
  });

  it('each scene opens on a pure fixed state within the drawn limits', () => {
    for (const t of [OPEN.array.text, OPEN.gap.text, OPEN.rope.text]) expect(codePoints(t).length).toBeLessThanOrEqual(MAX_TEXT);
    expect(OPEN.array.cursor).toBeLessThanOrEqual(codePoints(OPEN.array.text).length);
    expect(OPEN.rope.index).toBeLessThan(codePoints(OPEN.rope.text).length);
    expect(OPEN.rope.insertAt).toBeLessThanOrEqual(codePoints(OPEN.rope.text).length);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: an insert at 10 of 43 moves 33, at the start 43, at the end 0 (n - i, by plain arithmetic)', () => {
    const n = codePoints(OPEN.array.text).length;
    expect(n).toBe(43);
    expect([n - 10, n - 0, n - n]).toEqual([33, 43, 0]);
    expect([FACTS.arrayMoves, FACTS.arrayMovesStart, FACTS.arrayMovesEnd]).toEqual([33, 43, 0]);
    expect(lesson.tryThis[0]).toContain('33 characters move');
    // the hand-worked case from the spec
    expect(60 - 10).toBe(50);
  });

  it('try-this 2: typing at the end is 1 write and 0 moves, Jump to start carries 20 characters, then typing is 1 write', () => {
    const g = gapCreate(codePoints(OPEN.gap.text), OPEN.gap.capacity);
    gapInsert(g, g.start, ['x']);
    expect([g.moves, g.writes]).toEqual([0, 1]);
    const before = g.moves;
    gapMoveTo(g, 0);
    expect(g.moves - before).toBe(20);
    expect(gapText(g).join('')).toBe(`${OPEN.gap.text}x`);
    gapInsert(g, 0, ['x']);
    expect([g.moves - before, g.writes]).toEqual([20, 2]);
    expect(FACTS.gapHome).toBe(20);
    const cost = Object.fromEntries(SCRIPTS.map((s) => [s.id, scriptCost(s.id)]));
    expect(cost.typical.gap).toBeLessThan(cost.typical.array);
    expect(cost.replace.gap).toBeLessThan(cost.replace.array);
    expect(cost.replace.gap / cost.replace.array).toBeGreaterThan(cost.typical.gap / cost.typical.array);
    expect(lesson.tryThis[1]).toContain('3,200 touches against 120,642');
  });

  it('try-this 3: index 20 reads the characters the string says, in as many nodes as the path is long; the insert shares what it does not rebuild', () => {
    const chars = codePoints(OPEN.rope.text);
    expect(chars).toHaveLength(51);
    const rope = ropeCreate();
    rope.root = ropeBuild(rope, chars);
    const found = ropeIndex(rope, OPEN.rope.index);
    expect(found.char).toBe(chars[OPEN.rope.index]);
    expect(found.path).toHaveLength(FACTS.lookupNodes);
    expect([FACTS.ropeLeaves, FACTS.ropeDepth, FACTS.lookupNodes]).toEqual([7, 4, 4]);
    const before = rope.nodes.length;
    const liveBefore = ropeReachable(rope);
    ropeInsert(rope, OPEN.rope.insertAt, codePoints(OPEN.rope.insert));
    const live = ropeReachable(rope);
    const created = [...live].filter((id) => id >= before);
    const shared = [...live].filter((id) => id < before);
    expect([created.length, shared.length]).toEqual([FACTS.insertCreated, FACTS.insertShared]);
    expect([created.length, shared.length]).toEqual([8, 9]);
    for (const id of shared) expect(liveBefore.has(id), `node ${id} was in the old rope`).toBe(true);
    expect(ropeLeaves(rope).length).toBeGreaterThan(7);
    expect(lesson.tryThis[2]).toContain('8 new nodes and 9 nodes shared');
  });

  it('try-this 4: the default workload and the two others quote the counts the model gives', () => {
    const type = runWorkload('type', 1000);
    expect([type.array.touches, type.gap.touches, type.rope.touches]).toEqual([100_200, 700, 6636]);
    expect(type.winners).toEqual(['gap']);
    expect(type.loser).toBe('array');
    const jump = runWorkload('jump', 1000);
    expect([jump.array.touches, jump.gap.touches, jump.rope.touches]).toEqual([25_650, 51_250, 1068]);
    expect(jump.loser).toBe('gap');
    const undo = runWorkload('undo', 1_000_000);
    expect([undo.array.touches, undo.rope.touches]).toEqual([11_132_066, 544]);
    expect(lesson.tryThis[3]).toContain('array 100,200 touches, gap buffer 700, rope 6,636');
    expect(lesson.tryThis[3]).toContain('array 11,132,066, rope 544');
  });
});

describe('the colours are computed from the touches, and swap between workloads', () => {
  it('the best is green and the worst red for each workload, per workload', () => {
    const tones = new Map<string, string>();
    for (const w of WORKLOADS) {
      const r = runWorkload(w.id, 1000);
      for (const s of ['array', 'gap', 'rope'] as const) {
        tones.set(`${w.id}:${s}`, toneIn(r, s));
        if (r.winners.includes(s)) expect(toneIn(r, s)).toBe('ok');
      }
    }
    expect(tones.get('type:gap')).toBe('ok');
    expect(tones.get('type:array')).toBe('bad');
    expect(tones.get('jump:gap')).toBe('bad');
    expect(tones.get('jump:rope')).toBe('ok');
    expect(tones.get('append:array')).toBe('ok');
    expect(tones.get('append:gap')).toBe('ok');
    expect(tones.get('append:rope')).toBe('bad');
  });

  it('appending is where the array and the gap buffer tie, and the rope pays for its depth rule', () => {
    const r = runWorkload('append', 1000);
    expect(r.array.touches).toBe(r.gap.touches);
    expect(r.rope.touches).toBeGreaterThan(r.array.touches);
    expect(r.ropeRebuilds).toBeGreaterThan(0);
    expect(FACTS.appendRope).toBe('5,718');
  });
});

describe('hostile input', () => {
  it('typed text: lone surrogates are refused, control characters dropped, empty refused, the cap and the paste limit enforced', () => {
    expect(checkInsert(10, 'ab')).toEqual({ ok: true, items: ['a', 'b'] });
    expect(checkInsert(10, 'a\tb')).toEqual({ ok: true, items: ['a', 'b'] });
    expect(checkInsert(10, '😀')).toEqual({ ok: true, items: ['😀'] });
    expect(checkInsert(10, '\ud83d')).toMatchObject({ ok: false });
    expect(checkInsert(10, '')).toMatchObject({ ok: false });
    expect(checkInsert(10, '\t\n')).toMatchObject({ ok: false });
    expect(checkInsert(MAX_TEXT, 'a')).toMatchObject({ ok: false });
    expect(checkInsert(0, 'a'.repeat(MAX_PASTE + 1), 1000)).toMatchObject({ ok: false });
  });

  it('positions are whole numbers from 0 to the length, never wrapped; the cursor clamps', () => {
    expect(parsePosition('7', 20)).toEqual({ ok: true, value: 7 });
    for (const bad of ['', '-1', '21', '2.5', 'x', '1e1']) expect(parsePosition(bad, 20).ok, bad).toBe(false);
    expect([clampCursor(-3, 10), clampCursor(99, 10), clampCursor(4, 10)]).toEqual([0, 10, 4]);
  });

  it('backspace on an empty text is a no-op, and a gap backspace moves nothing', () => {
    const g = gapCreate([]);
    gapBackspace(g);
    expect(gapText(g)).toEqual([]);
    const h = gapCreate(codePoints('abc'));
    gapBackspace(h);
    expect(gapText(h).join('')).toBe('ab');
    expect(h.moves).toBe(0);
  });
});
