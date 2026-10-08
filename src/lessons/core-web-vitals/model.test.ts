import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  CHUNK_MS, LCP_TIMES, SHIFTS, THRESHOLDS, VIEWPORT, bandOf, chunksOf, clsOf, distanceFraction, heroFetch, impactArea, impactFraction, inpOf, interactionTotal, lcpCandidates, lcpOf,
  mainThreadWork, pageElements, sessionWindows, shiftScore, shiftsFor, windowIndexOf, type Interaction, type LayoutShift, type LcpOptions, type PageElement, type Rect, type ShiftId,
} from './model';

const shift = (id: string, at: number, score: number, recentInput = false): LayoutShift => ({ id, at, score, recentInput });
const lcpOpts = (o: Partial<LcpOptions> = {}): LcpOptions => ({ preload: false, lazy: true, small: false, inputAt: null, ...o });

describe('threshold bands', () => {
  it('match the published edges', () => {
    expect(THRESHOLDS).toEqual({ lcp: { good: 2500, poor: 4000 }, inp: { good: 200, poor: 500 }, cls: { good: 0.1, poor: 0.25 } });
  });

  it('are inclusive at the good and poor edges, exactly', () => {
    expect(bandOf('lcp', 2500)).toBe('good');
    expect(bandOf('lcp', 2501)).toBe('needs');
    expect(bandOf('lcp', 4000)).toBe('needs');
    expect(bandOf('lcp', 4001)).toBe('poor');
    expect(bandOf('inp', 200)).toBe('good');
    expect(bandOf('inp', 201)).toBe('needs');
    expect(bandOf('inp', 500)).toBe('needs');
    expect(bandOf('inp', 501)).toBe('poor');
    expect(bandOf('cls', 0.1)).toBe('good');
    expect(bandOf('cls', 0.1001)).toBe('needs');
    expect(bandOf('cls', 0.25)).toBe('needs');
    expect(bandOf('cls', 0.2501)).toBe('poor');
    expect(bandOf('cls', 0)).toBe('good');
  });
});

describe('LCP candidates', () => {
  const el = (id: PageElement['id'], area: number, at: number): PageElement => ({ id, label: id, area, at });

  it('an element is a candidate only when it is larger than every earlier one', () => {
    const out = lcpCandidates([el('heading', 10, 100), el('text', 50, 200), el('hero', 30, 300)], null);
    expect(out.map((c) => c.id)).toEqual(['heading', 'text']);
  });

  it('a larger, later element replaces the earlier candidate', () => {
    const out = lcpCandidates([el('heading', 10, 100), el('text', 50, 200), el('hero', 90, 300)], null);
    expect(out.map((c) => c.id)).toEqual(['heading', 'text', 'hero']);
  });

  it('nothing painted after the first input is a candidate, but what was painted at the input moment is', () => {
    const els = [el('heading', 10, 100), el('text', 50, 200), el('hero', 90, 300)];
    expect(lcpCandidates(els, 250).map((c) => c.id)).toEqual(['heading', 'text']);
    expect(lcpCandidates(els, 300).map((c) => c.id)).toEqual(['heading', 'text', 'hero']);
    expect(lcpCandidates(els, 99)).toEqual([]);
  });

  it('elements painted in the same frame: the largest ends up as the candidate', () => {
    const out = lcpCandidates([el('hero', 90, 200), el('text', 50, 200)], null);
    expect(out[out.length - 1].id).toBe('hero');
  });

  it('is independent of the order the elements are listed in', () => {
    const rnd = mulberry32(7);
    for (let n = 0; n < 100; n++) {
      const els = Array.from({ length: 6 }, (_, i) => el('heading', 1 + Math.floor(rnd() * 100), Math.floor(rnd() * 50) * 10 + i));
      const shuffled = [...els].sort(() => rnd() - 0.5);
      expect(lcpCandidates(shuffled, null)).toEqual(lcpCandidates(els, null));
    }
  });

  it('matches brute force: the LCP is the largest element painted by the input, the earliest when sizes tie', () => {
    const rnd = mulberry32(11);
    for (let n = 0; n < 200; n++) {
      const els = Array.from({ length: 5 }, (_, i) => el('heading', 1 + Math.floor(rnd() * 20), 100 * (1 + Math.floor(rnd() * 20)) + i));
      const inputAt = rnd() < 0.5 ? null : 100 * Math.floor(rnd() * 22);
      const painted = els.filter((e) => inputAt === null || e.at <= inputAt);
      const got = lcpCandidates(els, inputAt).at(-1);
      if (!painted.length) {
        expect(got).toBeUndefined();
        continue;
      }
      const biggest = Math.max(...painted.map((e) => e.area));
      expect(got?.area).toBe(biggest);
      expect(got?.at).toBe(Math.min(...painted.filter((e) => e.area === biggest).map((e) => e.at)));
    }
  });
});

describe('the scripted page load, worked by hand', () => {
  it('the hero download is a round trip plus its size over 0.5 KB per ms', () => {
    expect(heroFetch({ preload: false, lazy: false, small: false })).toEqual({ start: 700, done: 700 + 150 + 2400 });
    expect(heroFetch({ preload: true, lazy: false, small: true })).toEqual({ start: 300, done: 300 + 150 + 600 });
    expect(heroFetch({ preload: false, lazy: true, small: false }).start).toBe(1500);
  });

  it('the default (lazy-loaded, big file, no preload) is a poor LCP of 4100 ms, set by the hero', () => {
    const { value, element } = lcpOf(lcpOpts());
    expect(value).toBe(4100);
    expect(element.id).toBe('hero');
    expect(bandOf('lcp', value)).toBe('poor');
  });

  it('the try-this steps, one at a time from the default: set in CSS 3300, preload 2900, smaller file 1100', () => {
    expect(lcpOf(lcpOpts({ lazy: false })).value).toBe(3300);
    expect(lcpOf(lcpOpts({ lazy: false, preload: true })).value).toBe(2900);
    expect(lcpOf(lcpOpts({ lazy: false, preload: true, small: true })).value).toBe(1100);
    expect(bandOf('lcp', 1100)).toBe('good');
  });

  it('the stylesheet is parsed no later than the first paint, since nothing paints before render-blocking CSS is in', () => {
    expect(LCP_TIMES.cssParsed).toBeLessThanOrEqual(LCP_TIMES.heading);
    expect(LCP_TIMES.html).toBeLessThan(LCP_TIMES.cssParsed);
  });

  it('a preloaded hero is found at the HTML, earlier than one set in CSS or in a lazy script', () => {
    const start = (o: Partial<LcpOptions>) => heroFetch({ preload: false, lazy: false, small: false, ...o }).start;
    expect(start({ preload: true })).toBeLessThan(start({}));
    expect(start({})).toBeLessThan(start({ lazy: true }));
  });

  it('with lazy loading on, even a preloaded small hero cannot be painted before the lazy script has run', () => {
    expect(lcpOf(lcpOpts({ lazy: true, preload: true, small: true })).value).toBe(1550);
  });

  it('the text block is the candidate when the hero comes later than it, and not at all when the hero is first', () => {
    expect(lcpCandidates(pageElements(lcpOpts({ lazy: false })), null).map((c) => c.id)).toEqual(['heading', 'text', 'hero']);
    expect(lcpCandidates(pageElements(lcpOpts({ lazy: false, preload: true, small: true })), null).map((c) => c.id)).toEqual(['heading', 'hero']);
  });

  it('a tap at 2 s freezes the LCP at the text block, long before the hero', () => {
    const { value, element } = lcpOf(lcpOpts({ inputAt: 2000 }));
    expect(element.id).toBe('text');
    expect(value).toBe(1700);
  });

  it('no option makes the LCP earlier than its own request allows', () => {
    for (const preload of [false, true]) for (const lazy of [false, true]) for (const small of [false, true]) {
      const o = lcpOpts({ preload, lazy, small });
      expect(lcpOf(o).value).toBeGreaterThanOrEqual(heroFetch(o).done);
    }
  });
});

describe('layout-shift score', () => {
  const rect = (y: number, h: number, x = 0, w: number = VIEWPORT.w): Rect => ({ x, y, w, h });

  it('is impact fraction times distance fraction, worked by hand', () => {
    // a 360x340 block at y=260 moves 160 px down in a 360x640 viewport
    const before = rect(260, 340);
    const after = rect(420, 340);
    // union covers y 260..760, 380 px of it inside the viewport
    expect(impactArea(before, after)).toBe(380 * 360);
    expect(impactFraction(before, after)).toBeCloseTo(380 / 640, 12);
    expect(distanceFraction(before, after)).toBeCloseTo(160 / 640, 12);
    expect(shiftScore(before, after)).toBeCloseTo((380 / 640) * (160 / 640), 12);
  });

  it('a block that does not move scores 0, and one that moves out of view counts only the part that was visible', () => {
    expect(shiftScore(rect(100, 200), rect(100, 200))).toBe(0);
    expect(impactArea(rect(500, 100), rect(900, 100))).toBe(100 * 360);
  });

  it('distance uses the larger of the two viewport sides, and the larger of the two directions', () => {
    expect(distanceFraction(rect(0, 10, 0, 10), rect(0, 10, 64, 10))).toBeCloseTo(64 / 640, 12);
    expect(distanceFraction(rect(0, 10, 0, 10), rect(30, 10, 64, 10))).toBeCloseTo(64 / 640, 12);
  });

  it('the five scripted shifts score as worked by hand', () => {
    const score = (id: ShiftId) => {
      const s = SHIFTS.find((x) => x.id === id)!;
      return shiftScore(s.before, s.after);
    };
    expect(score('image')).toBeCloseTo((380 / 640) * (160 / 640), 12);
    expect(score('ad')).toBeCloseTo((500 / 640) * (250 / 640), 12);
    expect(score('font')).toBeCloseTo((324 / 640) * (24 / 640), 12);
    expect(score('tap')).toBeCloseTo((440 / 640) * (120 / 640), 12);
    expect(score('banner')).toBeCloseTo((580 / 640) * (60 / 640), 12);
  });
});

describe('session windows', () => {
  it('shifts less than 1 s apart share a window; 1 s or more starts a new one', () => {
    const w = sessionWindows([shift('a', 0, 0.01), shift('b', 999, 0.02), shift('c', 1998, 0.04), shift('d', 3998, 0.08)]);
    expect(w.map((x) => x.shifts.map((s) => s.id))).toEqual([['a', 'b', 'c'], ['d']]);
    expect(w.map((x) => x.value)).toEqual([0.07, 0.08].map((v) => expect.closeTo(v, 12)));
  });

  it('a window is capped at 5 s from its first shift, even with shifts always less than 1 s apart', () => {
    const w = sessionWindows([0, 900, 1800, 2700, 3600, 4500, 5400].map((at) => shift(`s${at}`, at, 0.01)));
    expect(w.map((x) => x.shifts.length)).toEqual([6, 1]);
    const exactly = sessionWindows([0, 900, 1800, 2700, 3600, 4500, 4999, 5000].map((at) => shift(`s${at}`, at, 1)));
    expect(exactly.map((x) => x.shifts.length)).toEqual([7, 1]);
  });

  it('CLS is the largest window, not the total', () => {
    const shifts = [shift('a', 0, 0.06), shift('b', 500, 0.06), shift('c', 9000, 0.1)];
    expect(clsOf(shifts)).toBeCloseTo(0.12, 12);
    expect(shifts.reduce((s, x) => s + x.score, 0)).toBeCloseTo(0.22, 12);
  });

  it('a shift with recent input is excluded, and does not bridge two windows', () => {
    const shifts = [shift('a', 0, 0.05), shift('t', 800, 0.9, true), shift('b', 1600, 0.05)];
    const w = sessionWindows(shifts);
    expect(w.map((x) => x.shifts.map((s) => s.id))).toEqual([['a'], ['b']]);
    expect(clsOf(shifts)).toBeCloseTo(0.05, 12);
    expect(windowIndexOf(w, 't')).toBeNull();
    expect(windowIndexOf(w, 'b')).toBe(2);
  });

  it('is independent of the order shifts are listed in, and a window value never exceeds the sum of all scores (200 random sequences)', () => {
    const rnd = mulberry32(3);
    for (let n = 0; n < 200; n++) {
      const shifts = Array.from({ length: 8 }, (_, i) => shift(`s${i}`, Math.floor(rnd() * 12000), Math.floor(rnd() * 20) / 100, rnd() < 0.2));
      const reversed = [...shifts].reverse();
      expect(clsOf(reversed)).toBeCloseTo(clsOf(shifts), 12);
      const total = shifts.filter((s) => !s.recentInput).reduce((s, x) => s + x.score, 0);
      expect(clsOf(shifts)).toBeLessThanOrEqual(total + 1e-12);
      for (const w of sessionWindows(shifts)) {
        expect(w.end - w.start).toBeLessThan(5000);
        for (let i = 1; i < w.shifts.length; i++) expect(w.shifts[i].at - w.shifts[i - 1].at).toBeLessThan(1000);
      }
    }
  });

  it('empty is 0', () => {
    expect(clsOf([])).toBe(0);
  });
});

describe('the scripted page, from its default', () => {
  const cls = (fixed: ShiftId[]) => clsOf(shiftsFor(new Set(fixed)));

  it('has two windows: the image, ad and font shifts together, the banner on its own; the tap shift is excluded', () => {
    const w = sessionWindows(shiftsFor(new Set()));
    expect(w.map((x) => x.shifts.map((s) => s.id))).toEqual([['image', 'ad', 'font'], ['banner']]);
    expect(windowIndexOf(w, 'tap')).toBeNull();
    expect(cls([])).toBeCloseTo(0.1484375 + 0.30517578125 + 0.018984375, 9);
    expect(bandOf('cls', cls([]))).toBe('poor');
  });

  it('the try-this steps: fix the ad (the font swap is then more than 1 s after the image, so it gets its own window), then the image', () => {
    expect(cls(['ad'])).toBeCloseTo(0.1484375, 9);
    expect(bandOf('cls', cls(['ad']))).toBe('needs');
    expect(cls(['ad', 'image'])).toBeCloseTo(0.0849609375, 9);
    expect(bandOf('cls', cls(['ad', 'image']))).toBe('good');
    expect(cls(['ad', 'image', 'font', 'banner'])).toBe(0);
  });

  it('fixing a shift never makes CLS worse (every subset)', () => {
    const ids: ShiftId[] = ['image', 'ad', 'font', 'banner'];
    for (let mask = 0; mask < 16; mask++) {
      const fixed = ids.filter((_, i) => mask & (1 << i));
      for (let extra = 0; extra < ids.length; extra++) expect(cls([...fixed, ids[extra]])).toBeLessThanOrEqual(cls(fixed) + 1e-12);
    }
  });
});

describe('INP', () => {
  const inter = (id: number, total: number): Interaction => ({ id, inputDelay: 0, processing: total, presentation: 0 });

  it('is the worst interaction when there are fewer than 50', () => {
    expect(interactionTotal(inpOf([inter(1, 40), inter(2, 300), inter(3, 120)])!)).toBe(300);
    expect(inpOf([])).toBeNull();
  });

  it('adds up the three phases', () => {
    expect(interactionTotal({ id: 1, inputDelay: 12, processing: 130, presentation: 31 })).toBe(173);
  });

  it('ignores the single worst interaction once there are 50, and the two worst at 100', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => inter(i, i === 7 ? 900 : i === 9 ? 400 : 20));
    expect(interactionTotal(inpOf(fifty)!)).toBe(400);
    const hundred = Array.from({ length: 100 }, (_, i) => inter(i, i === 1 ? 900 : i === 2 ? 700 : i === 3 ? 400 : 20));
    expect(interactionTotal(inpOf(hundred)!)).toBe(400);
    const fortyNine = Array.from({ length: 49 }, (_, i) => inter(i, i === 7 ? 900 : 20));
    expect(interactionTotal(inpOf(fortyNine)!)).toBe(900);
  });

  it('matches a brute-force reference on 200 random lists', () => {
    const rnd = mulberry32(5);
    for (let n = 0; n < 200; n++) {
      const count = 1 + Math.floor(rnd() * 160);
      const list = Array.from({ length: count }, (_, i) => inter(i, 10 + Math.floor(rnd() * 600)));
      const skip = Math.floor(count / 50);
      const totals = list.map(interactionTotal);
      // drop the largest value `skip` times, then take the maximum of what remains
      const rest = [...totals];
      for (let k = 0; k < skip; k++) rest.splice(rest.indexOf(Math.max(...rest)), 1);
      const reference = Math.max(...rest);
      expect(interactionTotal(inpOf(list)!)).toBe(reference);
    }
  });
});

describe('the INP handler fixes', () => {
  it('yielding holds the main thread for one slice at most; the worker holds it for none; neither loses work', () => {
    expect(mainThreadWork('none', 300)).toBe(300);
    expect(mainThreadWork('yield', 300)).toBe(CHUNK_MS);
    expect(mainThreadWork('yield', 3)).toBe(3);
    expect(mainThreadWork('worker', 300)).toBe(0);
    for (const work of [0, 1, 7, 8, 9, 100, 333, 600]) {
      const chunks = chunksOf(work);
      expect(chunks.reduce((a, b) => a + b, 0)).toBe(work);
      expect(Math.max(0, ...chunks)).toBeLessThanOrEqual(CHUNK_MS);
    }
  });
});
