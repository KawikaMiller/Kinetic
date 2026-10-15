import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { createTickSim } from '../../core/simTick';
import { checkStream, compare, droppedCount, fireDelay, refusedPlacements, heldWindows, newStream, runTo, step, strayWindows, type Stream, type StreamCfg } from './engine';
import { DEFAULT_DELAY, EVENT_COUNT, MAX_DELAY, arrivalOrder, generate, longestDelay, reversedArrival, type Evt } from './events';
import { disagreeing, lowestDisagreeingSeed, perMinute, replayed } from './processing';
import { makeSim } from './sim';
import { ANY_KEY, DEFAULT_SPEC, assign, membershipCounts, offlineWindows, type WindowSpec } from './windows';

const SPECS: WindowSpec[] = [DEFAULT_SPEC.tumbling, DEFAULT_SPEC.sliding, DEFAULT_SPEC.session];
const cfg = (spec: WindowSpec, bound: number, lateness: number, sideOutput = false): StreamCfg => ({ spec, bound, lateness, sideOutput });
const ev = (id: number, time: number, arrival: number, key: Evt['key'] = 'A'): Evt => ({ id, key, time, delay: arrival - time, arrival });

/** The definition of a window, written out: brute force over every start on the grid. */
const bruteAssign = (t: number, size: number, slide: number): number[] => {
  const starts: number[] = [];
  for (let s = -size; s <= t; s += 1) if (s % slide === 0 && s <= t && t < s + size) starts.push(s);
  return starts;
};
/** The session answer, written out: sort a key's events and split where the gap is at least `gap`. */
const bruteSessions = (events: readonly Evt[], gap: number): string[] => {
  const out: string[] = [];
  for (const key of ['A', 'B', 'C']) {
    const times = events.filter((e) => e.key === key).map((e) => e.time).sort((a, b) => a - b);
    let group: number[] = [];
    const flush = () => group.length && out.push(`${key}:${group[0]}-${group.at(-1)! + gap}:${group.length}`);
    for (const t of times) {
      if (group.length && t - group.at(-1)! >= gap) {
        flush();
        group = [];
      }
      group.push(t);
    }
    flush();
  }
  return out.sort();
};
const seeds = Array.from({ length: 200 }, (_, i) => i);

describe('the events', () => {
  it('event times and keys depend only on the seed; the delay bound only scales the delays', () => {
    for (const seed of [0, 1, 2, 3]) {
      const a = generate(seed, 0).events;
      const b = generate(seed, 30).events;
      expect(a.map((e) => [e.time, e.key])).toEqual(b.map((e) => [e.time, e.key]));
      expect(a.every((e) => e.delay === 0 && e.arrival === e.time)).toBe(true);
      expect(b.every((e) => e.delay >= 0 && e.delay <= 30 && e.arrival === e.time + e.delay)).toBe(true);
      expect(longestDelay(b)).toBeLessThanOrEqual(30);
      expect(b).toHaveLength(EVENT_COUNT);
      expect(b.every((e, i) => e.id === i + 1 && (i === 0 || e.time >= b[i - 1].time))).toBe(true);
    }
    expect(generate(5, 20)).toEqual(generate(5, 20));
    expect(generate(5, 20)).not.toEqual(generate(6, 20));
  });

  it('a bigger delay bound never makes any event arrive sooner', () => {
    const a = generate(2, 10).events;
    const b = generate(2, 30).events;
    a.forEach((e, i) => expect(b[i].delay).toBeGreaterThanOrEqual(e.delay));
  });

  it('arrivals are ordered by arrival time, ties by id, and some seed puts an event after one that happened later', () => {
    const order = arrivalOrder(generate(1, DEFAULT_DELAY).events);
    order.forEach((e, i) => { if (i) expect(e.arrival >= order[i - 1].arrival).toBe(true); });
    expect(seeds.some((s) => arrivalOrder(generate(s, DEFAULT_DELAY).events).some((e, i, all) => i > 0 && e.time < all[i - 1].time))).toBe(true);
  });

  it('a replay mirrors the arrival times inside the same span, keeping gaps, and leaves what happened alone', () => {
    const events = generate(4, 20).events;
    const back = reversedArrival(events);
    const order = arrivalOrder(events);
    expect(Math.min(...back.map((e) => e.arrival))).toBe(order[0].arrival);
    expect(Math.max(...back.map((e) => e.arrival))).toBe(order.at(-1)!.arrival);
    const mirror = order[0].arrival + order.at(-1)!.arrival;
    back.forEach((e, i) => expect([e.time, e.key, e.arrival]).toEqual([events[i].time, events[i].key, mirror - events[i].arrival]));
    for (let i = 1; i < events.length; i++) expect(Math.abs(back[i].arrival - back[i - 1].arrival)).toBe(Math.abs(events[i].arrival - events[i - 1].arrival));
  });
});

describe('which windows an event belongs to', () => {
  it('tumbling puts each time in exactly one window, [k*size, (k+1)*size)', () => {
    for (const size of [5, 10, 60, 120]) {
      for (let t = 0; t < 400; t++) {
        const w = assign(t, { kind: 'tumbling', size });
        expect(w).toHaveLength(1);
        expect(w[0].start <= t && t < w[0].end && w[0].end - w[0].start === size && w[0].start % size === 0).toBe(true);
      }
    }
  });

  it('sliding agrees with the half-open definition on a grid of size and slide, floor or ceil of size/slide windows when slide <= size, none or one when slide > size', () => {
    for (const size of [5, 10, 20, 30, 60]) {
      for (const slide of [5, 10, 15, 20, 25, 40, 60, 90]) {
        for (let t = 0; t < 200; t++) {
          const got = assign(t, { kind: 'sliding', size, slide }).map((w) => w.start);
          expect(got, `${size}/${slide}@${t}`).toEqual(bruteAssign(t, size, slide));
          if (slide <= size) expect([Math.floor(size / slide), Math.ceil(size / slide)]).toContain(got.length);
          else expect(got.length).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(membershipCounts(generate(1, 0).events, { kind: 'sliding', size: 60, slide: 20 })).toEqual([3]);
    expect(membershipCounts(generate(1, 0).events, { kind: 'sliding', size: 10, slide: 40 }).includes(0)).toBe(true);
  });

  it('session windows equal "sort a key\'s events and split where the gap is at least G", over 200 seeds and several gaps', () => {
    for (const seed of seeds) {
      for (const gap of [5, 20, 45]) {
        const events = generate(seed, DEFAULT_DELAY).events;
        const got = offlineWindows(events, { kind: 'session', gap }).map((w) => `${w.key}:${w.start}-${w.end}:${w.ids.length}`).sort();
        expect(got, `seed ${seed} gap ${gap}`).toEqual(bruteSessions(events, gap));
      }
    }
  });
});

describe('the streaming engine, by hand', () => {
  const arrivals = [ev(1, 1, 1), ev(2, 12, 12), ev(3, 3, 13)];
  const tumbling = { kind: 'tumbling', size: 10 } as const;
  it('with no lateness the straggler is dropped from a fired window; with room it updates it as a late firing', () => {
    const strict = runTo(newStream(arrivals, cfg(tumbling, 0, 0)), 3);
    expect(strict.windows.find((w) => w.start === 0)).toMatchObject({ fired: true, firedAt: 12, lateCount: 0 });
    expect(strict.windows.find((w) => w.start === 0)!.ids).toEqual([1]);
    expect(strict.fates[3]).toBe('dropped');
    expect(strict.refusals).toHaveLength(1);
    const room = runTo(newStream(arrivals, cfg(tumbling, 0, 5)), 3);
    expect(room.windows.find((w) => w.start === 0)).toMatchObject({ ids: [1, 3], lateCount: 1 });
    expect(room.fates[3]).toBe('late');
    const edge = runTo(newStream(arrivals, cfg(tumbling, 0, 2)), 3);
    expect(edge.fates[3]).toBe('dropped');
  });

  it('a larger bound holds the watermark back, so the window has not fired and the straggler is on time', () => {
    const s = runTo(newStream(arrivals, cfg(tumbling, 5, 0)), 3);
    expect(s.watermark).toBe(7);
    expect(s.windows.find((w) => w.start === 0)).toMatchObject({ fired: false, ids: [1, 3] });
    expect(s.fates[3]).toBe('on-time');
  });

  it('the side output keeps what was dropped, and only when asked', () => {
    expect(runTo(newStream(arrivals, cfg(tumbling, 0, 0, true)), 3).side).toEqual([3]);
    expect(runTo(newStream(arrivals, cfg(tumbling, 0, 0, false)), 3).side).toEqual([]);
  });

  it('a bridging event merges two sessions into one', () => {
    const merged = runTo(newStream([ev(1, 0, 0), ev(2, 30, 30), ev(3, 15, 31)], cfg({ kind: 'session', gap: 20 }, 0, 100)), 3);
    expect(merged.windows).toHaveLength(1);
    expect(merged.windows[0]).toMatchObject({ start: 0, end: 50, ids: [1, 2, 3] });
    const apart = runTo(newStream([ev(1, 0, 0), ev(2, 30, 30)], cfg({ kind: 'session', gap: 20 }, 0, 100)), 2);
    expect(apart.windows).toHaveLength(2);
  });

  it('an empty stream has no windows and a watermark of minus infinity', () => {
    const s = newStream([], cfg(tumbling, 0, 0));
    expect(s.windows).toEqual([]);
    expect(s.watermark).toBe(-Infinity);
    expect(compare(s, [])).toEqual([]);
    expect(fireDelay(s)).toEqual({ mean: 0, longest: 0, windows: 0 });
  });

  it('is immutable: stepping returns a new state and the old one is unchanged', () => {
    const s = newStream(arrivals, cfg(tumbling, 0, 0));
    const before = JSON.stringify(step(s));
    step(step(s));
    expect(JSON.stringify(step(s))).toBe(before);
    expect(s.k).toBe(0);
  });
});

describe('the streamed answer against the offline one, over 200 seeds', () => {
  const finish = (events: Evt[], c: StreamCfg): Stream => runTo(newStream(arrivalOrder(events), c), events.length);

  it('with allowed lateness at least the longest delay, every window of every type holds exactly the offline events', () => {
    for (const seed of seeds) {
      const fixture = generate(seed, MAX_DELAY);
      const late = longestDelay(fixture.events);
      for (const spec of SPECS) {
        for (const bound of [0, 7, 30]) {
          const s = finish(fixture.events, cfg(spec, bound, late));
          expect(droppedCount(s), `seed ${seed} ${spec.kind}`).toBe(0);
          if (spec.kind === 'session') {
            expect(s.windows.map((w) => `${w.key}:${w.start}-${w.end}:${w.ids.length}`).sort()).toEqual(bruteSessions(fixture.events, spec.gap));
          } else {
            const slide = spec.kind === 'sliding' ? spec.slide : spec.size;
            const expected = new Map<number, number>();
            for (const e of fixture.events) for (const start of bruteAssign(e.time, spec.size, slide)) expected.set(start, (expected.get(start) ?? 0) + 1);
            expect(new Map(s.windows.map((w) => [w.start, w.ids.length]))).toEqual(expected);
          }
          expect(strayWindows(s, fixture.events)).toEqual([]);
          expect(compare(s, fixture.events).every((r) => r.truth === r.streamed)).toBe(true);
        }
      }
    }
  });

  it('with less room, truth minus streamed per window is exactly the events dropped from it (tumbling and sliding), and the total follows for sessions', () => {
    const rnd = mulberry32(8);
    for (const seed of seeds) {
      const fixture = generate(seed, MAX_DELAY);
      const c = (spec: WindowSpec) => cfg(spec, Math.floor(rnd() * 15), Math.floor(rnd() * 15));
      for (const spec of [DEFAULT_SPEC.tumbling, DEFAULT_SPEC.sliding]) {
        const s = finish(fixture.events, c(spec));
        for (const r of compare(s, fixture.events)) {
          const dropped = s.refusals.filter((x) => x.span.start === r.span.start && x.span.end === r.span.end).length;
          expect(r.truth - r.streamed, `seed ${seed} ${spec.kind} [${r.span.start}, ${r.span.end})`).toBe(dropped);
        }
      }
      const sessions = finish(fixture.events, c(DEFAULT_SPEC.session));
      expect(sessions.windows.reduce((n, w) => n + w.ids.length, 0)).toBe(fixture.events.length - droppedCount(sessions));
    }
  });

  it('some seed really drops events when the bound and the lateness are both 0 and the delay is large', () => {
    expect(seeds.some((seed) => droppedCount(finish(generate(seed, MAX_DELAY).events, cfg(DEFAULT_SPEC.tumbling, 0, 0))) > 0)).toBe(true);
  });

  it('a larger bound never makes a window fire sooner, so the mean wait to fire does not fall', () => {
    for (const seed of seeds.slice(0, 60)) {
      const events = generate(seed, MAX_DELAY).events;
      const wait = (bound: number) => fireDelay(finish(events, cfg(DEFAULT_SPEC.tumbling, bound, 30))).mean;
      expect(wait(20)).toBeGreaterThanOrEqual(wait(0));
    }
  });

  it('state held is the windows not yet past their end plus the lateness, and shrinks as the watermark passes them', () => {
    const events = generate(3, 0).events;
    const early = runTo(newStream(arrivalOrder(events), cfg(DEFAULT_SPEC.tumbling, 0, 0)), 3);
    const end = finish(events, cfg(DEFAULT_SPEC.tumbling, 0, 0));
    expect(heldWindows(early).length).toBeGreaterThanOrEqual(1);
    expect(heldWindows(end).every((w) => w.end > end.watermark)).toBe(true);
    expect(heldWindows(finish(events, cfg(DEFAULT_SPEC.tumbling, 0, 1e6))).length).toBe(end.windows.length);
  });
});

describe('the safety check', () => {
  it('holds after every tick for all three window types, over 200 seeds and random settings', () => {
    const rnd = mulberry32(2);
    for (const seed of seeds) {
      for (const spec of SPECS) {
        const fixture = generate(seed, MAX_DELAY);
        const sim = makeSim(seed, arrivalOrder(fixture.events), cfg(spec, Math.floor(rnd() * 31), Math.floor(rnd() * 31)));
        sim.run(EVENT_COUNT);
        expect(sim.violation, `seed ${seed} ${spec.kind}`).toBeNull();
        expect(sim.ticks).toBe(EVENT_COUNT);
      }
    }
  });

  it('scrubbing is free: the state at tick k equals running k arrivals', () => {
    const events = arrivalOrder(generate(1, 20).events);
    const c = cfg(DEFAULT_SPEC.session, 5, 5);
    const sim = makeSim(1, events, c);
    sim.run(EVENT_COUNT);
    for (const k of [0, 1, 7, 20, 40]) expect(JSON.stringify(sim.at(k))).toBe(JSON.stringify(runTo(newStream(events, c), k)));
  });

  it('rejects a broken engine: a watermark taken from the last event instead of the largest moves backwards on some seed', () => {
    const lowest = seeds.find((seed) => {
      const events = arrivalOrder(generate(seed, MAX_DELAY).events);
      const c = cfg(DEFAULT_SPEC.tumbling, 0, 30);
      const sim = createTickSim<Stream>({
        seed,
        init: () => newStream(events, c),
        step: (s) => {
          const next = step(s);
          const last = events[s.k].time - c.bound;
          return { ...next, watermark: last, history: [...s.history, last] };
        },
        check: checkStream,
      });
      sim.run(EVENT_COUNT);
      return sim.violation !== null;
    });
    expect(lowest).toBeDefined();
  });

  it('rejects an event counted twice in a window', () => {
    const s = runTo(newStream([ev(1, 1, 1), ev(2, 2, 2)], cfg(DEFAULT_SPEC.tumbling, 0, 0)), 2);
    expect(checkStream(s)).toBeNull();
    const doubled = { ...s, windows: s.windows.map((w) => ({ ...w, ids: [...w.ids, w.ids[0]] })) };
    expect(checkStream(doubled)).toContain('counted twice');
    const twoWindows = { ...s, windows: [...s.windows, { ...s.windows[0], start: 60, end: 120 }] };
    expect(checkStream(twoWindows)).toContain('tumbling windows');
  });
});

describe('processing time against event time', () => {
  it('with no delay the two clocks agree in every minute, on every seed', () => {
    for (const seed of seeds) expect(disagreeing(perMinute(generate(seed, 0).events))).toEqual([]);
  });

  it('with delay they disagree where a delay crosses a minute boundary: the lowest such seed is pinned', () => {
    const lowest = lowestDisagreeingSeed(DEFAULT_DELAY, 200);
    expect(lowest).toBe(0);
    for (let seed = 0; seed < lowest!; seed++) expect(disagreeing(perMinute(generate(seed, DEFAULT_DELAY).events))).toEqual([]);
    const rows = perMinute(generate(lowest!, DEFAULT_DELAY).events);
    const events = generate(lowest!, DEFAULT_DELAY).events;
    for (const r of disagreeing(rows)) {
      const crossing = events.filter((e) => Math.floor(e.time / 60) !== Math.floor(e.arrival / 60));
      expect(crossing.length).toBeGreaterThan(0);
      expect(r.processing).not.toBe(r.event);
    }
  });

  it('the event-time column is the offline group-by and its total is every event; the processing column also totals every event', () => {
    for (const seed of seeds.slice(0, 50)) {
      const events = generate(seed, DEFAULT_DELAY).events;
      const rows = perMinute(events);
      expect(rows.reduce((n, r) => n + r.event, 0)).toBe(EVENT_COUNT);
      expect(rows.reduce((n, r) => n + r.processing, 0)).toBe(EVENT_COUNT);
      const oracle = new Map<number, number>();
      for (const e of events) oracle.set(Math.floor(e.time / 60), (oracle.get(Math.floor(e.time / 60)) ?? 0) + 1);
      rows.forEach((r, i) => expect(r.event).toBe(oracle.get(i) ?? 0));
    }
  });

  it('a replay in reverse leaves the event-time answer unchanged and changes the processing-time one', () => {
    let changed = 0;
    for (const seed of seeds.slice(0, 50)) {
      const events = generate(seed, DEFAULT_DELAY).events;
      const a = perMinute(events);
      const b = replayed(events);
      expect(b.map((r) => r.event)).toEqual(a.map((r) => r.event));
      if (JSON.stringify(b.map((r) => r.processing)) !== JSON.stringify(a.map((r) => r.processing))) changed++;
    }
    expect(changed).toBeGreaterThan(40);
  });

  it('uses the wildcard key only for windows that ignore who clicked', () => {
    expect(assign(5, { kind: 'tumbling', size: 10 })[0].key).toBe(ANY_KEY);
  });
});

describe('dropped events are counted as events, not as (window, event) refusals', () => {
  it('seed 17, D=30, bound 0, lateness 0, sliding 60/20: the stat is the number of events whose fate is dropped, and placements are counted apart', () => {
    const events = arrivalOrder(generate(17, 30).events);
    const s = runTo(newStream(events, cfg({ kind: 'sliding', size: 60, slide: 20 }, 0, 0)), events.length);
    const droppedEvents = Object.values(s.fates).filter((f) => f === 'dropped').length;
    expect(droppedCount(s)).toBe(droppedEvents);
    expect(refusedPlacements(s)).toBeGreaterThan(droppedEvents);
  });
});
