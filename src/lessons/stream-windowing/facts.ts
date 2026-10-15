/**
 * stream-windowing: the numbers the try-this entries quote, computed from the same models the scenes run, from each scene's
 * default state.
 */
import { DEFAULT_BOUND, DEFAULT_LATENESS, ROOMY_LATENESS, droppedCount, newStream, runTo, type StreamCfg } from './engine';
import { DEFAULT_DELAY, EVENT_COUNT, TIME_SEED, WATERMARK_SEED, WINDOWS_SEED, arrivalOrder, generate } from './events';
import { crossingCount } from './captions';
import { BROKEN_DELAY, BROKEN_SEED, disagreeing, perMinute, replayed } from './processing';
import { resultRows } from './results';
import { withStraggler } from './straggler';
import { DEFAULT_SPEC, assign, membershipCounts, type WindowSpec } from './windows';

/** The slide the "longer than the size" entry raises Slide L to. */
export const LONG_SLIDE = 80;
const KEEP_EVERYTHING = 1e9;

/** Try-this 1: the first scene at its default delay bound, and with none. */
export function disorderFacts() {
  const at = (d: number) => {
    const events = generate(TIME_SEED, d).events;
    return { crossing: crossingCount(events), wrong: disagreeing(perMinute(events)).length, minutes: perMinute(events).length };
  };
  return { atDefault: at(DEFAULT_DELAY), atZero: at(0) };
}

/** Try-this 2: sliding 60 s every 20 s, then a slide of LONG_SLIDE. */
export function slidingFacts() {
  const events = generate(WINDOWS_SEED, DEFAULT_DELAY).events;
  const normal = DEFAULT_SPEC.sliding as Extract<WindowSpec, { kind: 'sliding' }>;
  const long = { ...normal, slide: LONG_SLIDE };
  return {
    counts: membershipCounts(events, normal),
    gapEvents: events.filter((e) => assign(e.time, long).length === 0).length,
  };
}

/** Try-this 3: the first arrival at which two sessions merge into one (the window count falls). */
export function mergeFacts() {
  const order = arrivalOrder(generate(WINDOWS_SEED, DEFAULT_DELAY).events);
  const cfg: StreamCfg = { spec: DEFAULT_SPEC.session, bound: 0, lateness: KEEP_EVERYTHING, sideOutput: false };
  let s = newStream(order, cfg);
  let before = 0;
  for (let k = 1; k <= EVENT_COUNT; k++) {
    s = runTo(s, k);
    if (s.windows.length < before) return { at: k, from: before, to: s.windows.length };
    before = s.windows.length;
  }
  return null;
}

const tumbling = (lateness: number): StreamCfg => ({ spec: DEFAULT_SPEC.tumbling, bound: DEFAULT_BOUND, lateness, sideOutput: false });

/** Try-this 4: the third scene run to the end with no lateness, then with lateness at least the delay bound; and the straggler. */
export function latenessFacts() {
  const order = arrivalOrder(generate(WATERMARK_SEED, DEFAULT_DELAY).events);
  const finish = (lateness: number) => runTo(newStream(order, tumbling(lateness)), order.length);
  const strict = finish(DEFAULT_LATENESS);
  const roomy = finish(ROOMY_LATENESS);
  const stragglerFate = (lateness: number) => {
    const arrivals = withStraggler(order, order.length, DEFAULT_BOUND)!;
    const s = runTo(newStream(arrivals, tumbling(lateness)), arrivals.length);
    return s.fates[EVENT_COUNT + 1];
  };
  return {
    dropped: droppedCount(strict),
    undercounted: resultRows(strict, order).filter((r) => r.streamed < r.truth).length,
    roomyDropped: droppedCount(roomy),
    roomyExact: resultRows(roomy, order).every((r) => r.streamed === r.truth),
    stragglerStrict: stragglerFate(DEFAULT_LATENESS),
    stragglerRoomy: stragglerFate(ROOMY_LATENESS),
  };
}

/** Try-this 5: the last scene at its defaults, as an event-time job, and read backwards. */
export function replayFacts() {
  const events = generate(BROKEN_SEED, BROKEN_DELAY).events;
  const original = perMinute(events);
  const back = replayed(events);
  return {
    wrong: disagreeing(original).length,
    minutes: original.length,
    replayWrong: disagreeing(back).length,
    eventUnchanged: JSON.stringify(original.map((r) => r.event)) === JSON.stringify(back.map((r) => r.event)),
    arrivalChanged: JSON.stringify(original.map((r) => r.processing)) !== JSON.stringify(back.map((r) => r.processing)),
  };
}
