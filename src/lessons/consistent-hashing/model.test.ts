import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { changeCaption, expectedJoinMoves, schemeCaption, vnodesCaption } from './captions';
import { modOwner, ringOwner, ringPoints, type Point } from './hash';
import lesson from './index';
import {
  ALL_SERVERS, busiestRatio, compareChange, countKeys, KEY_COUNT, KEYS, loadColor, LOAD_BAD, LOAD_OK, makeKeys, owners,
  SERVER_COLORS, START_SERVERS, VNODE_RANGE,
} from './model';

/** Reference owner: scan every point for the nearest one at or clockwise of `pos` (no binary search). */
function bruteOwner(points: Point[], pos: number): string {
  let best: Point | null = null;
  let bestDistance = Infinity;
  for (const p of points) {
    const clockwise = (p.pos - pos + 1) % 1;
    if (clockwise < bestDistance) {
      bestDistance = clockwise;
      best = p;
    }
  }
  return best!.server;
}

const BIG = makeKeys(20000);
const upTo = (n: number) => ALL_SERVERS.slice(0, n);
const VNODE_SETTINGS = [VNODE_RANGE.min, 3, VNODE_RANGE.max];

describe('ring lookup', () => {
  it('matches a brute-force scan for every key, server count and virtual-node setting', () => {
    for (const v of VNODE_SETTINGS) {
      for (let n = 2; n <= ALL_SERVERS.length; n++) {
        const pts = ringPoints(upTo(n), v);
        const o = owners(upTo(n), v, BIG);
        for (const k of BIG.filter((_, i) => i % 7 === 0)) expect(o.ring[k.i]).toBe(bruteOwner(pts, k.pos));
      }
    }
  });

  it('puts every server on the ring with exactly the requested number of points', () => {
    for (const v of VNODE_SETTINGS) {
      const pts = ringPoints(upTo(5), v);
      expect(pts).toHaveLength(5 * v);
      for (const s of upTo(5)) expect(pts.filter((p) => p.server === s)).toHaveLength(v);
    }
  });

  it('wraps: a key past the last point belongs to the first point', () => {
    const pts = ringPoints(upTo(4), 1);
    expect(ringOwner(pts, pts[pts.length - 1].pos + 1e-9).server).toBe(pts[0].server);
  });
});

describe('hash % N: how many keys move when a server is added', () => {
  it('over one full period of hashes, exactly n² of every n·(n+1) hashes change server (n/(n+1))', () => {
    for (let n = 2; n <= 7; n++) {
      const period = n * (n + 1);
      let moved = 0;
      for (let h = 0; h < period; h++) if (modOwner(upTo(n), h) !== modOwner(upTo(n + 1), h)) moved++;
      expect(moved).toBe(n * n);
    }
  });

  it('moves about n/(n+1) of 20,000 keys for every n the lesson allows (4 → 5 is the quiz: about 80%)', () => {
    for (let n = 2; n < ALL_SERVERS.length; n++) {
      const c = compareChange(upTo(n), upTo(n + 1), 1, BIG);
      expect(c.modMoved.size / BIG.length).toBeCloseTo(n / (n + 1), 1);
      expect(Math.abs(c.modMoved.size / BIG.length - n / (n + 1))).toBeLessThan(0.02);
    }
    const quiz = compareChange(upTo(4), upTo(5), 1, BIG);
    expect(quiz.modMoved.size / BIG.length).toBeGreaterThan(0.78);
    expect(quiz.modMoved.size / BIG.length).toBeLessThan(0.82);
  });
});

describe('the ring: how many keys move, and where they go', () => {
  it('with many points per server a join moves about 1/(n+1) of 20,000 keys', () => {
    for (let n = 2; n < ALL_SERVERS.length; n++) {
      const c = compareChange(upTo(n), upTo(n + 1), 200, BIG);
      const share = c.ringMoved.size / BIG.length;
      expect(Math.abs(share - 1 / (n + 1)) / (1 / (n + 1)), `n=${n}`).toBeLessThan(0.3);
    }
  });

  it('averaged over many draws of the points, even one point per server moves 1/(n+1) of the keys', () => {
    const keys = makeKeys(3000);
    const TRIALS = 300;
    for (const n of [3, 5, 7]) {
      let total = 0;
      for (let t = 0; t < TRIALS; t++) {
        const names = Array.from({ length: n + 1 }, (_, i) => `draw${t}-server${i}`);
        total += compareChange(names.slice(0, n), names, 1, keys).ringMoved.size / keys.length;
      }
      expect(Math.abs(total / TRIALS - 1 / (n + 1)), `n=${n}`).toBeLessThan(0.02);
    }
  });

  it('every key that moves on a join lands on the new server, and every key that moves on a leave was on the leaver', () => {
    for (const v of VNODE_SETTINGS) {
      for (let n = 2; n < ALL_SERVERS.length; n++) {
        const joined = compareChange(upTo(n), upTo(n + 1), v, BIG);
        const before = owners(upTo(n), v, BIG).ring;
        const after = owners(upTo(n + 1), v, BIG).ring;
        for (const i of joined.ringMoved) {
          expect(after[i], `v=${v} n=${n}`).toBe(ALL_SERVERS[n]);
          expect(before[i]).not.toBe(ALL_SERVERS[n]);
        }
        const left = compareChange(upTo(n + 1), upTo(n), v, BIG);
        for (const i of left.ringMoved) expect(after[i]).toBe(ALL_SERVERS[n]);
        expect(left.ringMoved.size).toBe(after.filter((s) => s === ALL_SERVERS[n]).length);
      }
    }
  });

  it('the same property fails for hash % N (so the test would catch a ring that behaved like it)', () => {
    const before = owners(upTo(4), 1, BIG).mod;
    const after = owners(upTo(5), 1, BIG).mod;
    const strays = BIG.filter((k) => before[k.i] !== after[k.i] && after[k.i] !== 'E');
    expect(strays.length).toBeGreaterThan(0);
  });

  it('with one point per server a join takes keys from at most one donor; with 50 points it can take from several', () => {
    for (let n = 2; n < ALL_SERVERS.length; n++) {
      expect(compareChange(upTo(n), upTo(n + 1), 1, BIG).ringDonors.length, `n=${n}`).toBeLessThanOrEqual(1);
    }
    expect(compareChange(START_SERVERS, upTo(5), VNODE_RANGE.max, BIG).ringDonors.length).toBeGreaterThan(1);
  });

  it('on one point per server the keys moved by a join vary a lot from one set of names to the next', () => {
    const keys = makeKeys(3000);
    const shares = Array.from({ length: 60 }, (_, t) => {
      const names = Array.from({ length: 5 }, (_, i) => `draw${t}-server${i}`);
      return compareChange(names.slice(0, 4), names, 1, keys).ringMoved.size / keys.length;
    });
    expect(Math.max(...shares)).toBeGreaterThan(2 * (1 / 5));
    expect(Math.min(...shares)).toBeLessThan((1 / 5) / 2);
  });
});

describe('virtual nodes even out the load', () => {
  const spread = (v: number) => {
    const keys = makeKeys(4000);
    const ratios = Array.from({ length: 80 }, (_, t) => {
      const names = Array.from({ length: 4 }, (_, i) => `draw${t}-server${i}`);
      return busiestRatio(countKeys(names, owners(names, v, keys).ring), keys.length);
    });
    return ratios.reduce((a, b) => a + b, 0) / ratios.length;
  };

  it('the busiest server of four is much closer to the fair share at 50 points than at 1, averaged over 80 draws', () => {
    const one = spread(1);
    const fifty = spread(VNODE_RANGE.max);
    expect(fifty).toBeLessThan(1.3);
    expect(one).toBeGreaterThan(1.7);
    expect(fifty - 1).toBeLessThan((one - 1) / 3);
  });

  it('counts add up to the key count, and the busiest ratio is at least 1', () => {
    for (let n = 2; n <= ALL_SERVERS.length; n++) {
      const o = owners(upTo(n), 5);
      for (const own of [o.ring, o.mod]) {
        const counts = countKeys(upTo(n), own);
        expect(counts.reduce((a, b) => a + b, 0)).toBe(KEY_COUNT);
        expect(busiestRatio(counts, KEY_COUNT)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('loadColor is red above the bad line, green at or below the ok line, uncoloured between', () => {
    expect(loadColor(LOAD_BAD + 0.01)).toBe('var(--bad)');
    expect(loadColor(LOAD_OK)).toBe('var(--ok)');
    expect(loadColor((LOAD_OK + LOAD_BAD) / 2)).toBeUndefined();
  });
});

describe('hidden controls and colours', () => {
  it('the hash % N owners (and so its bars and busiest number) do not depend on the virtual-node setting', () => {
    const base = owners(START_SERVERS, VNODE_RANGE.min).mod;
    for (let v = VNODE_RANGE.min; v <= VNODE_RANGE.max; v++) expect(owners(START_SERVERS, v).mod).toEqual(base);
  });

  it('server colours are never a status colour (ok, bad, hi) and are all different', () => {
    const colours = ALL_SERVERS.map((s) => SERVER_COLORS[s]);
    expect(new Set(colours).size).toBe(ALL_SERVERS.length);
    for (const c of colours) expect(['var(--ok)', 'var(--bad)', 'var(--hi)', 'var(--info)', 'var(--violet)']).not.toContain(c);
  });

  it('the 100 keys have distinct names and hashes', () => {
    expect(new Set(KEYS.map((k) => k.name)).size).toBe(KEY_COUNT);
    expect(new Set(KEYS.map((k) => k.h)).size).toBe(KEY_COUNT);
  });
});

describe('captions state the numbers the model computed', () => {
  /** Count of keys that change owner between two server lists, by brute force on the lesson's own keys. */
  const bruteMoved = (before: string[], after: string[], v: number, scheme: 'ring' | 'mod') => {
    const a = ringPoints(before, v);
    const b = ringPoints(after, v);
    return KEYS.filter((k) =>
      scheme === 'ring' ? bruteOwner(a, k.pos) !== bruteOwner(b, k.pos) : modOwner(before, k.h) !== modOwner(after, k.h),
    ).length;
  };

  it('a join, on the ring and under hash % N', () => {
    for (const v of VNODE_SETTINGS) {
      const change = compareChange(START_SERVERS, upTo(5), v);
      const ring = bruteMoved(START_SERVERS, upTo(5), v, 'ring');
      const mod = bruteMoved(START_SERVERS, upTo(5), v, 'mod');
      const onRing = captionText(changeCaption('ring', change, 4), { strict: true });
      const onMod = captionText(changeCaption('mod', change, 4), { strict: true });
      expect(onRing).toContain('Server E joined');
      expect(onRing).toContain(ring === 0 ? 'no key moved' : `${ring} ${ring === 1 ? 'key' : 'keys'} moved`);
      expect(onRing).toContain(`would have been ${mod}`);
      expect(onMod).toContain(`${mod} of ${KEY_COUNT} keys`);
      expect(onMod).toContain(`A ring would have moved ${ring}`);
      if (ring > 0) {
        expect(onRing).toContain(`taken from ${change.ringDonors.length} server`);
        expect(onRing).toContain(`about ${expectedJoinMoves(4).toFixed(0)} moves`);
      }
    }
    expect(expectedJoinMoves(4)).toBe(20);
  });

  it('a leave names where the keys went and says nothing else moved', () => {
    const change = compareChange(upTo(5), START_SERVERS, VNODE_RANGE.max);
    const text = captionText(changeCaption('ring', change, 5), { strict: true });
    expect(text).toContain('Server E left');
    expect(text).toContain(`${bruteMoved(upTo(5), START_SERVERS, VNODE_RANGE.max, 'ring')} keys moved`);
    expect(text).toContain('no other key moved');
    expect(text).not.toContain('averages about');
  });

  it('the points slider caption quotes the ring\'s busiest ratio, and says hash % N has no points', () => {
    const ratio = busiestRatio(countKeys(START_SERVERS, owners(START_SERVERS, 1).ring), KEY_COUNT);
    expect(captionText(vnodesCaption('ring', 1, ratio), { strict: true })).toContain(`${ratio.toFixed(2)}×`);
    expect(captionText(vnodesCaption('mod', 1, ratio), { strict: true })).toContain('no points');
    expect(captionText(schemeCaption('ring'), { strict: true })).toContain('locally');
  });
});

describe('try-this, from the lesson as it loads (hash ring, 4 servers, 1 virtual node)', () => {
  it('try-this 1: adding a server on the ring moves a few keys, all onto the new server', () => {
    const change = compareChange(START_SERVERS, upTo(5), VNODE_RANGE.min);
    const before = owners(START_SERVERS, VNODE_RANGE.min).ring;
    const after = owners(upTo(5), VNODE_RANGE.min).ring;
    expect(change.ringMoved.size).toBeGreaterThan(0);
    expect(change.ringMoved.size).toBeLessThan(change.modMoved.size / 2);
    for (const i of change.ringMoved) {
      expect(after[i]).toBe('E');
      expect(before[i]).not.toBe('E');
    }
  });

  it('try-this 2: under hash % N the same join moves the large majority of keys', () => {
    const change = compareChange(START_SERVERS, upTo(5), VNODE_RANGE.min);
    expect(change.modMoved.size / KEY_COUNT).toBeGreaterThan(0.75);
    expect(change.modMoved.size).toBeGreaterThan(3 * change.ringMoved.size);
  });

  it('try-this 3: one point leaves the busiest of four above twice its fair share; fifty bring it to 1.2× or less', () => {
    const at = (v: number) => busiestRatio(countKeys(START_SERVERS, owners(START_SERVERS, v).ring), KEY_COUNT);
    expect(at(1)).toBeGreaterThan(2);
    expect(at(50)).toBeLessThanOrEqual(LOAD_OK);
  });

  it('try-this 4: every key\'s walk ends at the first point clockwise from it', () => {
    const pts = ringPoints(START_SERVERS, VNODE_RANGE.min);
    const own = owners(START_SERVERS, VNODE_RANGE.min).ring;
    for (const k of KEYS) {
      expect(ringOwner(pts, k.pos).server).toBe(bruteOwner(pts, k.pos));
      expect(own[k.i]).toBe(bruteOwner(pts, k.pos));
    }
  });
});

describe('the lesson text', () => {
  it('has a try-this for each behaviour tested above', () => {
    expect(lesson.tryThis).toHaveLength(4);
  });
});
