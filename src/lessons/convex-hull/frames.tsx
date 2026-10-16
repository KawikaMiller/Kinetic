import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { HULLS, dedupe, type Algo, type HullEvent, type P, type Policy, type Tally } from './hull';
import { TURN_PHRASE, crossText, pt, turnOf } from './text';

export interface HullFrame extends Frame {
  pivot: P | null;
  /** Graham: the points in the order they will be walked. */
  order: P[];
  stack: P[];
  /** The point being tested or pushed. */
  current: P | null;
  popped: P | null;
  tests: number;
  chain: 'lower' | 'upper' | null;
  /** Jarvis: the hull vertex being wrapped from, and the best next point so far. */
  cur: P | null;
  best: P | null;
  /** The finished hull, once the run ends. */
  final: P[] | null;
}

export interface HullRun {
  frames: HullFrame[];
  hull: P[];
  orientations: number;
  /** Fewer than three distinct points, or all on one line: the run has no steps. */
  flat: boolean;
}

const hl = (v: ReactNode, tone = '') => <span className={`hl ${tone}`.trim()}>{v}</span>;
const verdict = (value: number) => {
  const turn = turnOf(value);
  return hl(TURN_PHRASE[turn], turn === 'left' ? 'ok' : turn === 'right' ? 'bad' : 'dim');
};
const WHAT: Record<Algo, string> = {
  graham: 'Graham scan',
  andrew: "Andrew's monotone chain",
  jarvis: "Jarvis's march (gift wrapping)",
};

/** One frame per event of the real run, narrated from the event itself. */
export function hullFrames(algo: Algo, input: readonly P[], policy: Policy): HullRun {
  const tally: Tally = { orientations: 0, events: [] };
  const hull = HULLS[algo](input, policy, tally);
  const events = tally.events as HullEvent[];
  const pts = dedupe(input);
  const rec = createRecorder<HullFrame>(
    { pivot: null, order: [], stack: [], current: null, popped: null, tests: 0, chain: null, cur: null, best: null, final: null },
    { transient: { popped: null } },
  );
  const rule = policy === 'drop' ? 'pop while the last two stack points and the new one do not make a left turn (cross <= 0)' : 'pop while they make a right turn (cross < 0); collinear points stay';
  if (events.length === 0) {
    rec.close(
      pts.length === 0 ? <>No points: no hull.</> : pts.length < 3 ? <>{plural(pts.length, 'distinct point')}: no hull, only the {pts.length === 1 ? 'point' : 'segment'} itself.</> : <>All the points lie on one line: the hull is flat, so the answer is its two ends{policy === 'keep' ? ' plus the points between them' : ''}.</>,
    );
    rec.frames[0].final = hull;
    return { frames: rec.frames, hull, orientations: 0, flat: true };
  }
  rec.snap(<>{WHAT[algo]} on {plural(pts.length, 'point')}. {algo === 'jarvis' ? 'From the leftmost point, repeatedly take the point that leaves every other point on its left.' : `Each step tests a turn with the cross product and ${rule}.`}</>);
  let tests = 0;
  for (const e of events) {
    const cur = rec.get();
    switch (e.kind) {
      case 'pivot':
        tests = e.sortTests;
        rec.snap(
          <>
            Pivot: the lowest point (ties: lowest x), {hl(pt(e.pivot), 'violet')}. The other {e.sorted.length} points are sorted by angle around it (ties by distance): {plural(e.sortTests, 'orientation test')} spent sorting. The walk goes in that order.
          </>,
          undefined,
          { pivot: e.pivot, order: e.sorted, stack: [e.pivot], tests },
        );
        break;
      case 'chain':
        rec.snap(<>Build the {hl(e.name, 'info')} hull: sweep the points {e.name === 'lower' ? 'left to right' : 'right to left'} with the same pop rule.</>, undefined, { chain: e.name, stack: [] });
        break;
      case 'test':
        tests++;
        rec.snap(
          <>
            Test {pt(e.a)}, {pt(e.b)}, then {hl(pt(e.c), 'hi')}: cross = {crossText(e.a, e.b, e.c).split(' = ').slice(1).join(' = ')}, {verdict(e.value)}.{' '}
            {e.pop ? <>{hl('Pop', 'bad')} {pt(e.b)} off the stack.</> : <>Keep {pt(e.b)}.</>}
          </>,
          undefined,
          { current: e.c, tests, popped: e.pop ? e.b : null },
        );
        if (e.pop) rec.set({ stack: cur.stack.slice(0, -1) });
        break;
      case 'push':
        rec.snap(<>Push {hl(pt(e.p), 'info')}: the stack now holds {e.stack.length}.</>, undefined, { current: e.p, stack: e.stack, tests });
        break;
      case 'wrap-start':
        rec.snap(<>Start at the leftmost point {hl(pt(e.start), 'violet')}, which is certainly on the hull.</>, undefined, { cur: e.start, stack: [e.start] });
        break;
      case 'wrap-test':
        tests++;
        rec.snap(
          <>
            From {pt(e.cur)}: is {hl(pt(e.p), 'hi')} to the right of the line to the best so far {pt(e.best)}? cross = {crossText(e.cur, e.best, e.p).split(' = ').slice(1).join(' = ')}, {verdict(e.value)}.{' '}
            {e.replace ? <>{hl(pt(e.p), 'info')} becomes the best.</> : <>The best stays.</>}
          </>,
          undefined,
          { cur: e.cur, best: e.replace ? e.p : e.best, current: e.p, tests },
        );
        break;
      case 'wrap-edge':
        rec.snap(<>Every other point is on the left of {pt(e.from)} to {pt(e.to)}: that is a hull edge. Move to {pt(e.to)}.</>, undefined, { cur: e.to, best: null, current: null, stack: [...cur.stack, e.to] });
        break;
    }
  }
  rec.set({ final: hull, current: null, cur: null, best: null, chain: null, stack: hull });
  rec.close(
    <>
      Done: {hl(plural(hull.length, 'hull point'), 'ok')} out of {pts.length}, {plural(tally.orientations, 'orientation test')} in all. {algo === 'andrew' ? 'The two chains join into the hull.' : ''}
    </>,
    2,
  );
  return { frames: rec.frames, hull, orientations: tally.orientations, flat: false };
}

