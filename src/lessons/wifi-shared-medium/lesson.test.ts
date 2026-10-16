import { describe, expect, it } from 'vitest';
import { pct } from '../../core/format';
import { mulberry32 } from '../../core/random';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { backoffStory } from './backoff';
import { backoffFrames, contentionFrames, goodputText, hiddenIntro, names, ratesIntro, withoutSlow } from './captions';
import { DCF_TICKS, STATIONS_RANGE, airtimeShare, analysisAirtime, analysisCollision, collisionShare, initDcf, stepDcf } from './dcf';
import { FRAME_RANGE, RANGE, exchange, hearing, type Pt } from './hidden';
import {
  DEFAULT_BACKOFF_SEED, DEFAULT_CONTENTION_SEED, initialBackoff, initialContention, initialHidden, initialRates, setSlow, type HiddenState,
} from './init';
import lesson from './index';
import { COUNT_RANGE, ratesFor, shares } from './rates';

const clean = (node: unknown) => {
  const t = text(node as never, { strict: true });
  expect(t).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return t;
};
const shown = (n: number, seed: number) => {
  const rnd = mulberry32(seed);
  let s = initDcf(n, rnd);
  const history = [s];
  for (let i = 0; i < DCF_TICKS; i++) {
    s = stepDcf(s, rnd);
    history.push(s);
  }
  return { s, history };
};

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: seed 1 draws 10, freezes at 8 when B returns, sends at the stated slot; a missing ACK doubles the window to 31 and draws 0', () => {
    expect(initialBackoff()).toEqual({ seed: DEFAULT_BACKOFF_SEED, ackLost: false });
    const story = backoffStory(1, false);
    expect(story.draws).toEqual([10]);
    const freeze = story.slots.find((s, i) => s.medium === 'busy-other' && story.slots[i - 1]?.medium === 'idle');
    expect(freeze?.counter).toBe(8);
    const send = story.slots.findIndex((s) => s.medium === 'a-sends');
    const lost = backoffStory(1, true);
    expect(lost.draws).toEqual([10, 0]);
    const t = lesson.tryThis[0];
    expect(t).toContain('A draws a backoff of 10');
    expect(t).toContain('freezes at 8');
    expect(t).toContain(`sends at slot ${send}`);
    expect(t).toContain('doubles its window to 31 and draws again (0 this time)');
  });

  it('try-this 2: after 160 slots the stated shares collide and carry a frame at 5 stations and at 12, and the analysis falls', () => {
    expect(initialContention()).toEqual({ stations: 5, seed: DEFAULT_CONTENTION_SEED });
    const five = shown(5, 1).s;
    const twelve = shown(12, 1).s;
    expect(collisionShare(twelve) as number).toBeGreaterThan(collisionShare(five) as number);
    expect(airtimeShare(twelve) as number).toBeLessThan(airtimeShare(five) as number);
    expect(analysisAirtime(12)).toBeLessThan(analysisAirtime(5));
    const t = lesson.tryThis[1];
    expect(t).toContain(`${pct(collisionShare(five) as number)} of attempts collided and ${pct(airtimeShare(five) as number)} of the airtime carried a frame`);
    expect(t).toContain(`${pct(collisionShare(twelve) as number)} collide and ${pct(airtimeShare(twelve) as number)} carries a frame`);
    expect(t).toContain(`falls from ${pct(analysisAirtime(5))} to ${pct(analysisAirtime(12))}`);
  });

  it('try-this 3: hidden with 10-slot frames, 84% of attempts collide and 28% of the airtime delivers; RTS/CTS makes data collisions 0% and delivery 70%', () => {
    const hs = initialHidden();
    const h = hearing({ a: hs.a, c: hs.c, range: hs.range });
    expect(exchange(h, 10, false).pCollide).toBe(214 / 256);
    expect(goodputText(exchange(h, 10, false).goodput)).toBe('28%');
    expect(goodputText(exchange(h, 10, true).goodput)).toBe('70%');
    expect(exchange(h, 10, true).pDataCollide).toBe(0);
    const t = lesson.tryThis[2];
    expect(t).toContain('84% of attempts collide and 28% of the airtime delivers payload');
    expect(t).toContain('data frames collide in 0% of attempts and 70% of the airtime delivers payload');
  });

  it('try-this 4: at 40 slots plain delivers nothing and reads "–", RTS/CTS reads a share; at 2 slots RTS/CTS loses', () => {
    const hs = initialHidden();
    const h = hearing({ a: hs.a, c: hs.c, range: hs.range });
    expect(exchange(h, 40, false).goodput).toBe(0);
    expect(goodputText(exchange(h, 40, false).goodput)).toBe('–');
    expect(exchange(h, 40, true).goodput).toBeGreaterThan(0.8);
    expect(exchange(h, 2, true).goodput).toBeLessThan(exchange(h, 2, false).goodput);
    const t = lesson.tryThis[3];
    expect(t).toContain(`reads –, with it ${goodputText(exchange(h, 40, true).goodput)}`);
    expect(t).toContain(`${goodputText(exchange(h, 2, true).goodput)} against ${goodputText(exchange(h, 2, false).goodput)}`);
  });

  it('try-this 5: three stations with S3 at 6 Mbit/s each get 4.4 Mbit/s; with S3 fast each gets 12.4', () => {
    const r = initialRates();
    expect(r.count).toBe(3);
    expect(r.slow.slice(0, 3)).toEqual([false, false, true]);
    expect(shares(ratesFor(3, r.slow)).stations[0].mbps.toFixed(1)).toBe('4.4');
    expect(shares(ratesFor(3, setSlow(r, 2, false).slow)).stations[0].mbps.toFixed(1)).toBe('12.4');
    const t = lesson.tryThis[4];
    expect(t).toContain('each station gets 4.4 Mbit/s');
    expect(t).toContain('each gets 12.4 Mbit/s');
  });
});

describe('scene 1: every seed and both ACK choices', () => {
  it('builds one clean caption per slot, ending on the ACK, and names the frozen counter at the interruption', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const ackLost of [false, true]) {
        const story = backoffStory(seed, ackLost);
        const frames = backoffFrames(story);
        expect(frames).toHaveLength(story.slots.length);
        const said = frames.map((f) => clean(f.say));
        expect(said[said.length - 1]).toContain('ACK');
        expect(said.some((t) => t.includes('no ACK'))).toBe(ackLost);
        expect(said.some((t) => t.includes('freezes at')) === story.draws[0] > 2).toBe(true);
      }
    }
  });
});

describe('scene 2: every station count', () => {
  it('captions state the run\'s own collision and airtime shares next to the analysis, for 2 to 12 stations on several seeds', () => {
    for (let n = STATIONS_RANGE.min; n <= STATIONS_RANGE.max; n++) {
      for (const seed of [1, 2, 9]) {
        const { s, history } = shown(n, seed);
        const frames = contentionFrames(history, n);
        frames.forEach((f) => clean(f.say ?? ''));
        expect(frames[frames.length - 1].now).toBe(DCF_TICKS);
        const summary = clean(frames[frames.length - 1].say);
        expect(summary).toContain(`${pct(collisionShare(s) as number)} of attempts collided (the analysis says ${pct(analysisCollision(n))}`);
        expect(summary).toContain(`${pct(airtimeShare(s) as number)} of the airtime carried a frame (long run ${pct(analysisAirtime(n))})`);
      }
    }
  });

  it('the first collision milestone names the stations that sent together, and exists only when a collision happened', () => {
    const { history } = shown(8, 1);
    const frames = contentionFrames(history, 8);
    const first = history.findIndex((s) => s.kind === 'collision');
    const said = frames.filter((f) => f.say !== undefined).map((f) => clean(f.say));
    const senders = history[first].senders;
    expect(said.some((t) => t.startsWith(`Slot ${first}: ${names(senders)} ${senders.length === 2 ? 'both' : 'all'} hit 0`))).toBe(true);
    expect(names([1])).toBe('S2');
    expect(names([1, 3])).toBe('S2 and S4');
    expect(names([1, 3, 4])).toBe('S2, S4 and S5');
  });

  it('the analysis matches the long simulation: airtime within 0.01 at 2, 5 and 10 stations', () => {
    for (const n of [2, 5, 10]) {
      const rnd = mulberry32(21);
      let s = initDcf(n, rnd);
      for (let i = 0; i < 200_000; i++) s = stepDcf(s, rnd);
      expect(Math.abs((airtimeShare(s) as number) - analysisAirtime(n))).toBeLessThan(0.01);
    }
  });
});

describe('scene 3: the whole control cross product', () => {
  const corners: Pt[] = [{ x: 0, y: 0 }, { x: 15, y: 50 }, { x: 50, y: 50 }, { x: 85, y: 50 }, { x: 100, y: 100 }];

  it('every pair of positions, range and frame extreme, with RTS/CTS on and off, has a clean caption and never prints 0% for a delivery share', () => {
    for (const a of corners) for (const c of corners) for (const range of [RANGE.min, RANGE.default, RANGE.max]) for (const frame of [FRAME_RANGE.min, FRAME_RANGE.max]) for (const rtsCts of [false, true]) {
      const s: HiddenState = { a, c, range, frame, rtsCts };
      const t = clean(hiddenIntro(s));
      const h = hearing({ a, c, range });
      if (!h.aToAp || !h.cToAp) expect(t).toContain('out of range');
      if (h.aToAp && h.cToAp) {
        for (const mode of [false, true]) expect(goodputText(exchange(h, frame, mode).goodput)).not.toBe('0%');
      }
    }
  });

  it('a hidden node says so, an audible pair says carrier sensing works, and out of range says nothing is delivered', () => {
    const base = initialHidden();
    expect(clean(hiddenIntro(base))).toContain('hidden from each other');
    expect(clean(hiddenIntro({ ...base, range: 80 }))).toContain('hear each other');
    expect(clean(hiddenIntro({ ...base, range: 20 }))).toContain('out of the access point');
  });

  it('hearing stays symmetric: A hears C exactly when C hears A, for every corner pair and range', () => {
    for (const a of corners) for (const c of corners) for (const range of [10, 45, 100]) {
      expect(hearing({ a, c, range }).aToC).toBe(hearing({ a: c, c: a, range }).aToC);
    }
  });
});

describe('scene 4: every count and every choice of slow stations', () => {
  it('the caption reads its numbers from the shares and names the without-slow comparison only when there is one', () => {
    for (let n = COUNT_RANGE.min; n <= COUNT_RANGE.max; n++) {
      for (let mask = 0; mask < 2 ** n; mask++) {
        const slow = Array.from({ length: n }, (_, i) => Boolean(mask & (1 << i)));
        const rates = ratesFor(n, slow);
        const sh = shares(rates);
        const without = withoutSlow(rates);
        const t = clean(ratesIntro(rates, sh, without));
        expect(t).toContain(`${sh.stations[0].mbps.toFixed(1)} Mbit/s`);
        expect(t.includes('instead of')).toBe(without !== null);
        expect(without !== null).toBe(slow.some(Boolean) && !slow.every(Boolean));
      }
    }
  });
});

describe('content', () => {
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });

  it('the opening states are each their own: only the hidden scene opens with a radio range, only the rate scene with slow stations', () => {
    expect(initialHidden().rtsCts).toBe(false);
    expect(initialRates().slow.filter(Boolean)).toHaveLength(1);
    expect(initialBackoff().ackLost).toBe(false);
  });
});
