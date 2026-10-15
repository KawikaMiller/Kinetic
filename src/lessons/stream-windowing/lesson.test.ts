import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { crossingCount, disorderCaption, processingCaption, watermarkCaption, windowsCaption } from './captions';
import { DEFAULT_BOUND, DEFAULT_LATENESS, ROOMY_LATENESS, droppedCount, heldWindows, newStream, runTo } from './engine';
import { DEFAULT_DELAY, EVENT_COUNT, MAX_DELAY, TIME_SEED, WATERMARK_SEED, WINDOWS_SEED, arrivalOrder, generate } from './events';
import { LONG_SLIDE, disorderFacts, latenessFacts, mergeFacts, replayFacts, slidingFacts } from './facts';
import lesson from './index';
import { BROKEN_DELAY, BROKEN_SEED, disagreeing, lowestDisagreeingSeed, perMinute, replayed } from './processing';
import { resultRows } from './results';
import { STRAGGLER_ID, withStraggler } from './straggler';
import { DEFAULT_SPEC, DEFAULT_WINDOW_CONTROLS, assign, specOf, type WindowSpec } from './windows';

const plain = (node: Parameters<typeof text>[0]) => text(node, { strict: true });
const tumbling = (lateness: number) => ({ spec: DEFAULT_SPEC.tumbling, bound: DEFAULT_BOUND, lateness, sideOutput: false });
const mergeAt = (seed: number): number => {
  const order = arrivalOrder(generate(seed, DEFAULT_DELAY).events);
  let s = newStream(order, { spec: DEFAULT_SPEC.session, bound: 0, lateness: 1e9, sideOutput: false });
  let before = 0;
  for (let k = 1; k <= EVENT_COUNT; k++) {
    s = runTo(s, k);
    if (s.windows.length < before) return k;
    before = s.windows.length;
  }
  return -1;
};

describe('the seeds each scene opens on are the lowest that show its point', () => {
  it('windows scene: the lowest seed where two sessions merge at the default gap and delay bound', () => {
    expect(mergeAt(WINDOWS_SEED)).toBeGreaterThan(0);
    for (let seed = 0; seed < WINDOWS_SEED; seed++) expect(mergeAt(seed), `seed ${seed}`).toBe(-1);
  });
  it('watermark scene: the lowest seed where defaults drop an event, a straggler is dropped without lateness and counted late with it', () => {
    const shows = (seed: number) => {
      const order = arrivalOrder(generate(seed, DEFAULT_DELAY).events);
      const dropped = droppedCount(runTo(newStream(order, tumbling(DEFAULT_LATENESS)), order.length));
      const st = withStraggler(order, order.length, DEFAULT_BOUND)!;
      const fate = (lateness: number) => runTo(newStream(st, tumbling(lateness)), st.length).fates[STRAGGLER_ID];
      return dropped > 0 && fate(DEFAULT_LATENESS) === 'dropped' && fate(ROOMY_LATENESS) === 'late';
    };
    expect(shows(WATERMARK_SEED)).toBe(true);
    for (let seed = 0; seed < WATERMARK_SEED; seed++) expect(shows(seed)).toBe(false);
  });
  it('broken-way scene: the lowest seed where counting by arrival disagrees at the default delay bound', () => {
    expect(lowestDisagreeingSeed(BROKEN_DELAY, 200)).toBe(BROKEN_SEED);
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: at D = 20 some clicks cross a minute and some minutes disagree; at D = 0 none do', () => {
    const f = disorderFacts();
    const events = generate(TIME_SEED, DEFAULT_DELAY).events;
    const crossing = events.filter((e) => Math.floor(e.time / 60) !== Math.floor(e.arrival / 60)).length;
    expect(f.atDefault.crossing).toBe(crossing);
    expect(f.atDefault.crossing).toBeGreaterThan(0);
    expect(f.atDefault.wrong).toBeGreaterThan(0);
    expect(f.atZero).toMatchObject({ crossing: 0, wrong: 0 });
    expect(lesson.tryThis[0]).toContain(`${f.atDefault.crossing} of 40 clicks cross a minute boundary and ${f.atDefault.wrong} of ${f.atDefault.minutes} minutes disagree`);
    expect(plain(disorderCaption(events, perMinute(events), DEFAULT_DELAY))).toContain(`${crossing} of 40 clicks cross a minute boundary`);
  });

  it('try-this 2: sliding 60 s every 20 s puts each event in 3 windows; a slide of 80 s leaves some in none', () => {
    const f = slidingFacts();
    expect(f.counts).toEqual([3]);
    const events = generate(WINDOWS_SEED, DEFAULT_DELAY).events;
    // Independent of assign(): an event is in no window when its time modulo the slide is at least the size.
    expect(f.gapEvents).toBe(events.filter((e) => e.time % LONG_SLIDE >= 60).length);
    expect(f.gapEvents).toBeGreaterThan(0);
    expect(lesson.tryThis[1]).toContain(`${f.gapEvents} events land in no window`);
    const long: WindowSpec = { kind: 'sliding', size: 60, slide: LONG_SLIDE };
    expect(plain(windowsCaption({ spec: long, arrived: 40, events, windows: 3 }))).toContain('some events land in none');
  });

  it('try-this 3: in session mode two sessions merge at the stated arrival, and the window count falls as stated', () => {
    const f = mergeFacts()!;
    expect(f.at).toBe(mergeAt(WINDOWS_SEED));
    expect(f.to).toBeLessThan(f.from);
    expect(lesson.tryThis[2]).toContain(`at arrival ${f.at} two sessions merge`);
  });

  it('try-this 4: at the end of the default watermark scene events are dropped and windows come up short; with 30 s of lateness none are; the straggler is counted late, then dropped', () => {
    const f = latenessFacts();
    expect(f.dropped).toBeGreaterThan(0);
    expect(f.undercounted).toBeGreaterThan(0);
    expect(f.roomyDropped).toBe(0);
    expect(f.roomyExact).toBe(true);
    expect([f.stragglerRoomy, f.stragglerStrict]).toEqual(['late', 'dropped']);
    const order = arrivalOrder(generate(WATERMARK_SEED, DEFAULT_DELAY).events);
    const s = runTo(newStream(order, tumbling(DEFAULT_LATENESS)), order.length);
    const rows = resultRows(s, order);
    const c = plain(watermarkCaption({ stream: s, rows, n: order.length }));
    expect(c).toContain(`${f.dropped} events dropped`.replace('1 events', '1 event'));
    expect(lesson.tryThis[3]).toContain(`${f.dropped} events are dropped`);
  });

  it('try-this 5: counting by arrival is wrong in some minutes; by event time never; a replay changes the arrival column and not the event one', () => {
    const f = replayFacts();
    expect(f).toMatchObject({ eventUnchanged: true, arrivalChanged: true });
    expect(f.wrong).toBeGreaterThan(0);
    expect(lesson.tryThis[4]).toContain(`wrong in ${f.wrong} of ${f.minutes} minutes`);
    const events = generate(BROKEN_SEED, BROKEN_DELAY).events;
    expect(plain(processingCaption({ rows: perMinute(events), job: 'event', replay: true, maxDelay: BROKEN_DELAY }))).toContain('every minute matches the truth');
    expect(plain(processingCaption({ rows: perMinute(events), job: 'processing', replay: false, maxDelay: BROKEN_DELAY }))).toContain(`wrong in ${f.wrong} of ${f.minutes} minutes`);
  });
});

describe('captions are computed from the model', () => {
  it('the disorder caption states the crossings and the disagreeing minutes for every delay bound', () => {
    for (let d = 0; d <= MAX_DELAY; d += 5) {
      for (const seed of [0, 1, 2]) {
        const events = generate(seed, d).events;
        const rows = perMinute(events);
        const c = plain(disorderCaption(events, rows, d));
        expect(c).toContain(`${crossingCount(events)} of 40 clicks cross a minute boundary`);
        expect(c.includes('Both clocks give the same count'), `d=${d} seed=${seed}`).toBe(disagreeing(rows).length === 0);
      }
    }
  });

  it('the windows caption says "exactly 1" for tumbling and the computed membership for sliding, over a grid of sizes and slides', () => {
    const events = generate(1, DEFAULT_DELAY).events;
    for (const size of [10, 30, 60, 120]) {
      expect(plain(windowsCaption({ spec: { kind: 'tumbling', size }, arrived: 5, events, windows: 2 }))).toContain('exactly 1 window');
      for (const slide of [10, 20, 45, 90]) {
        const spec: WindowSpec = { kind: 'sliding', size, slide };
        const counts = [...new Set(events.map((e) => assign(e.time, spec).length))].sort((a, b) => a - b);
        const c = plain(windowsCaption({ spec, arrived: 5, events, windows: 2 }));
        expect(c.includes('land in none'), `${size}/${slide}`).toBe(counts.includes(0));
        expect(c).toContain(counts.length === 1 ? `exactly ${counts[0]}` : `between ${counts[0]} and ${counts.at(-1)}`);
      }
    }
  });

  it('the watermark caption agrees with the stream at every arrival, bound, lateness and window type', () => {
    for (const spec of Object.values(DEFAULT_SPEC)) {
      for (const bound of [0, 10, 30]) {
        for (const lateness of [0, 15, 30]) {
          const order = arrivalOrder(generate(WATERMARK_SEED, MAX_DELAY).events);
          for (const k of [0, 5, 20, 40]) {
            const s = runTo(newStream(order, { spec, bound, lateness, sideOutput: bound === 10 }), k);
            const c = plain(watermarkCaption({ stream: s, rows: resultRows(s, order), n: order.length }));
            const id = `${spec.kind} b${bound} l${lateness} k${k}`;
            expect(c.includes('Nothing has been dropped'), id).toBe(droppedCount(s) === 0);
            expect(c.includes('not set yet'), id).toBe(!Number.isFinite(s.watermark));
            expect(c, id).toContain(`${heldWindows(s).length} `);
            expect(c.includes('side output'), id).toBe(droppedCount(s) > 0 && s.cfg.sideOutput);
          }
        }
      }
    }
  });
});

describe('nothing hidden feeds a number', () => {
  it('a window type carries only the sizes it uses: the hidden sliders cannot change its windows', () => {
    const c = DEFAULT_WINDOW_CONTROLS;
    expect(specOf({ ...c, kind: 'tumbling', size: 30, slide: 5, gap: 5 })).toEqual(specOf({ ...c, kind: 'tumbling', size: 30, slide: 90, gap: 60 }));
    expect(specOf({ ...c, kind: 'sliding', size: 30, slide: 10, gap: 5 })).toEqual(specOf({ ...c, kind: 'sliding', size: 30, slide: 10, gap: 60 }));
    expect(specOf({ ...c, kind: 'session', size: 5, slide: 5, gap: 25 })).toEqual(specOf({ ...c, kind: 'session', size: 120, slide: 90, gap: 25 }));
    expect(specOf({ ...c, kind: 'tumbling', size: 30 })).toEqual({ kind: 'tumbling', size: 30 });
  });

  it('the windows scene ignores the watermark bound and the allowed lateness, which it does not show', () => {
    const order = arrivalOrder(generate(WINDOWS_SEED, DEFAULT_DELAY).events);
    const a = runTo(newStream(order, { spec: DEFAULT_SPEC.session, bound: 0, lateness: 1e9, sideOutput: false }), 40);
    expect(droppedCount(a)).toBe(0);
    expect(a.windows.reduce((n, w) => n + w.ids.length, 0)).toBe(40);
  });

  it('the straggler is the only thing the straggler button changes: before its arrival the streams are identical', () => {
    const order = arrivalOrder(generate(WATERMARK_SEED, DEFAULT_DELAY).events);
    const st = withStraggler(order, 20, DEFAULT_BOUND)!;
    expect(st).toHaveLength(EVENT_COUNT + 1);
    const a = runTo(newStream(order, tumbling(0)), 20);
    const b = runTo(newStream(st, tumbling(0)), 20);
    expect(JSON.stringify(b.windows)).toBe(JSON.stringify(a.windows));
    expect(withStraggler(order, 0, DEFAULT_BOUND)).toBeNull();
    const w = runTo(newStream(order, tumbling(0)), 20).watermark;
    expect(st[20].time).toBe(Math.max(0, w - 20));
  });

  it('replaying never changes the event-time column, for any delay bound', () => {
    for (let d = 0; d <= MAX_DELAY; d += 10) {
      const events = generate(5, d).events;
      expect(replayed(events).map((r) => r.event)).toEqual(perMinute(events).map((r) => r.event));
    }
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
