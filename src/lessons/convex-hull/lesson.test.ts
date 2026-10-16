import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements } from '../../core/testing/sceneKeys';
import { BOARD, MAX_POINTS, OPENING_POINTS, SQUARE_PRESET, addPoint, parseTypedPoint, scatterPreset } from './board';
import { FACTS } from './facts';
import { hullFrames } from './frames';
import { HULLS, andrew, cross, graham, jarvis, type Algo, type P, type Policy } from './hull';
import lesson from './index';
import { circlePoints, discPoints, scaling, SCALING_SIZES } from './scaling';
import { findMismatches, hullDemo } from './robust';
import { TURN_OPEN, TURN_PRESETS } from './turn';
import { crossText, turnOf } from './text';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const key = (p: P) => `${p.x},${p.y}`;
const ALGOS: Algo[] = ['graham', 'andrew', 'jarvis'];

describe('scenes', () => {
  it('every scene component carries its own key (StepScene serves two scenes, each keyed)', () => {
    const els = sceneElements('convex-hull');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
  });

  it('each scene opens on a pure, fixed state: the left-turn preset, the seeded scatter, no hidden carry-over', () => {
    expect(TURN_OPEN).toEqual(TURN_PRESETS[0].points);
    expect(OPENING_POINTS).toEqual(scatterPreset());
    expect(OPENING_POINTS).toHaveLength(16);
    expect(scatterPreset()).toEqual(scatterPreset());
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the default triangle is a left turn with cross 90 and area 45; the right preset is -90; collinear is 0 (shoelace oracle)', () => {
    const [a, b, c] = TURN_OPEN;
    const shoelace = (a.x * b.y - b.x * a.y + b.x * c.y - c.x * b.y + c.x * a.y - a.x * c.y);
    expect(cross(a, b, c)).toBe(shoelace);
    expect([FACTS.left, FACTS.right, FACTS.collinear, FACTS.leftArea]).toEqual([90, -90, 0, 45]);
    expect(Math.abs(shoelace) / 2).toBe(45);
    expect(turnOf(FACTS.left)).toBe('left');
    expect(turnOf(FACTS.right)).toBe('right');
    expect(turnOf(FACTS.collinear)).toBe('collinear');
    expect(lesson.tryThis[0]).toContain('cross product is 90');
  });

  it('try-this 2: the scatter gives an 8-point hull in 62 tests with 8 pops, and the square gives 4 dropped or 8 kept (hand-known corners)', () => {
    const run = hullFrames('graham', OPENING_POINTS, 'drop');
    expect(run.hull).toHaveLength(8);
    expect(run.frames[run.frames.length - 1].tests).toBe(run.orientations);
    expect([FACTS.grahamHull, FACTS.grahamTests, FACTS.grahamPops]).toEqual([8, 62, 8]);
    const corners = ['2,2', '18,2', '18,18', '2,18'];
    expect(graham(SQUARE_PRESET, 'drop').map(key).sort()).toEqual([...corners].sort());
    expect(graham(SQUARE_PRESET, 'keep').map(key).sort()).toEqual([...corners, '10,2', '18,10', '10,18', '2,10'].sort());
    expect(FACTS.squareDrop).toBe(4);
    expect(FACTS.squareKeep).toBe(8);
    expect(lesson.tryThis[1]).toContain('8 hull points, 62 orientation tests and 8 pops');
  });

  it('try-this 3: Andrew spends 48 tests and Jarvis 91 on the scatter, with the same hull; on 80 circle points Jarvis spends 3159 against 234', () => {
    expect([FACTS.andrewTests, FACTS.jarvisTests]).toEqual([48, 91]);
    expect(andrew(OPENING_POINTS).map(key)).toEqual(jarvis(OPENING_POINTS).map(key));
    const circle = circlePoints(80);
    // every circle point is a strict hull vertex: each has all other points on the left of some supporting line through it
    expect(andrew(circle)).toHaveLength(80);
    expect([FACTS.circleN, FACTS.circleH, FACTS.circleJarvis, FACTS.circleAndrew]).toEqual([80, 80, 3159, 234]);
    expect([FACTS.discH, FACTS.discJarvis, FACTS.discAndrew]).toEqual([13, 948, 297]);
    expect(discPoints(80)).toHaveLength(80);
    expect(lesson.tryThis[2]).toContain('3159 tests against Andrew');
  });

  it('try-this 4: lattice point 170, 189 gives double 0 and exact positive; the double hull has 2 points, the exact one 3', () => {
    const m = findMismatches()[0];
    expect([m.i, m.j, m.double, m.exact.sign]).toEqual([170, 189, 0, 1]);
    expect(Math.sign(m.j - m.i)).toBe(1);
    const demo = hullDemo(m);
    expect([demo.withDouble.length, demo.withExact.length]).toEqual([2, 3]);
    expect([FACTS.demoDouble, FACTS.demoExact, FACTS.mismatchI, FACTS.mismatchJ]).toEqual([2, 3, 170, 189]);
    expect(lesson.tryThis[3]).toContain('170 and 189 steps');
  });
});

describe('the counts and the shapes', () => {
  it('orientation counts grow with n, and on a circle Jarvis grows much faster than the sorted methods (real runs)', () => {
    const rows = scaling('circle');
    expect(rows.map((r) => r.n)).toEqual([...SCALING_SIZES]);
    for (const r of rows) expect(r.h).toBe(r.n);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].jarvis).toBeGreaterThan(rows[i - 1].jarvis);
      expect(rows[i].andrew).toBeGreaterThan(rows[i - 1].andrew);
    }
    const last = rows[rows.length - 1];
    expect(last.jarvis).toBeGreaterThan(5 * last.andrew);
    const disc = scaling('disc');
    expect(disc[disc.length - 1].h).toBeLessThan(disc[disc.length - 1].n / 3);
    expect(disc[disc.length - 1].jarvis / disc[disc.length - 1].andrew).toBeLessThan(last.jarvis / last.andrew);
  });

  it('Jarvis count on a circle is n times (n + 1) minus the visited exclusions: bounded by n * n', () => {
    for (const r of scaling('circle')) expect(r.jarvis).toBeLessThanOrEqual(r.n * r.n);
  });
});

describe('every caption is computed from the model and reads cleanly', () => {
  it('walks every algorithm x policy over the presets and edge cases: no NaN, the closing hull equals the algorithm, the counter ends on the total', () => {
    const sets: P[][] = [OPENING_POINTS, SQUARE_PRESET, [], [{ x: 3, y: 3 }], [{ x: 1, y: 1 }, { x: 5, y: 5 }], [0, 1, 2, 3].map((x) => ({ x, y: x })), scatterPreset(9)];
    let frames = 0;
    for (const pts of sets) {
      for (const algo of ALGOS) {
        for (const policy of ['drop', 'keep'] as Policy[]) {
          const run = hullFrames(algo, pts, policy);
          for (const f of run.frames) {
            expect(text(f.say), `${algo} ${policy}`).not.toMatch(/NaN|undefined|null|Infinity/);
            frames++;
          }
          expect(run.hull.map(key)).toEqual(HULLS[algo](pts, policy).map(key));
          const last = run.frames[run.frames.length - 1];
          expect(last.final?.map(key)).toEqual(run.hull.map(key));
          if (!run.flat) expect(last.tests).toBe(run.orientations);
        }
      }
    }
    expect(frames).toBeGreaterThan(500);
  });

  it('the cross product in a caption equals the real cross product, for 1,000 seeded triples', () => {
    const rnd = mulberry32(8);
    for (let n = 0; n < 1000; n++) {
      const [a, b, c] = [0, 1, 2].map(() => ({ x: Math.floor(rnd() * 21), y: Math.floor(rnd() * 21) }));
      const shown = Number(crossText(a, b, c).split(' = ').pop());
      expect(shown === cross(a, b, c)).toBe(true);
    }
  });

  it('fewer than three distinct points say "no hull" instead of drawing one', () => {
    expect(text(hullFrames('graham', [], 'drop').frames[0].say)).toContain('No points: no hull');
    expect(text(hullFrames('graham', [{ x: 1, y: 1 }, { x: 1, y: 1 }], 'drop').frames[0].say)).toContain('1 distinct point: no hull');
  });
});

describe('hidden controls do not feed the numbers', () => {
  it('the scaling dataset toggle never changes the counts for the learner\'s own points', () => {
    const before = hullFrames('andrew', OPENING_POINTS, 'drop').orientations;
    scaling('disc');
    scaling('circle');
    expect(hullFrames('andrew', OPENING_POINTS, 'drop').orientations).toBe(before);
  });

  it('the collinear policy changes the hull only where a point lies on an edge: one such point on the scatter', () => {
    const drop = graham(OPENING_POINTS, 'drop');
    const keep = graham(OPENING_POINTS, 'keep');
    const extra = keep.filter((p) => !drop.some((q) => key(q) === key(p)));
    expect(keep).toHaveLength(drop.length + 1);
    expect(FACTS.scatterKeep).toBe(9);
    expect(extra).toHaveLength(1);
    const onEdge = drop.some((a, i) => cross(a, drop[(i + 1) % drop.length], extra[0]) === 0);
    expect(onEdge).toBe(true);
    expect(lesson.tryThis[1]).toContain('9 points, because one point sits on an edge');
  });
});

describe('hostile input', () => {
  it('duplicate points are merged with a message, the board clamps to its grid, the 41st point is refused', () => {
    const one = addPoint([], { x: 3.4, y: 7.6 });
    expect(one.points).toEqual([{ x: 3, y: 8 }]);
    const dup = addPoint(one.points, { x: 3, y: 8 });
    expect(dup.points).toHaveLength(1);
    expect(dup.message).toContain('duplicate points are merged');
    expect(addPoint([], { x: -50, y: 900 }).points).toEqual([{ x: 0, y: BOARD }]);
    const full = Array.from({ length: MAX_POINTS }, (_, i) => ({ x: i % 21, y: Math.floor(i / 21) }));
    const refused = addPoint(full, { x: 20, y: 20 });
    expect(refused.points).toHaveLength(MAX_POINTS);
    expect(refused.message).toContain(String(MAX_POINTS));
  });

  it('typed coordinates: non-numeric, decimal, negative and huge values are refused with a sentence', () => {
    expect(parseTypedPoint('7', '12')).toEqual({ ok: true, point: { x: 7, y: 12 } });
    for (const bad of ['', 'seven', '2.5', '-1', '21', '99999999999999999999', '1e3']) {
      expect(parseTypedPoint(bad, '5').ok, bad).toBe(false);
      expect(parseTypedPoint('5', bad).ok, bad).toBe(false);
    }
    const huge = parseTypedPoint('99999999999999999999', '1');
    expect(!huge.ok && huge.error).toContain('refused, not clamped');
  });
});
