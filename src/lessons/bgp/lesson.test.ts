import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { ASES, GRAPH, LEAKER, ORIGIN, edgeId } from './asgraph';
import { PREF_RANGE, finalRound, linkLoads, propagate } from './bgp';
import { announceFrames, hijackIntro, leakIntro, policyIntro, reachCounts } from './captions';
import { DEFAULT_HIJACK, VALIDATOR_MAX, hijackResult, type HijackSetup, type Kind } from './hijack';
import {
  announcePrefix, announcedOf, baseConfig, changedFromDefault, initialAnnounce, initialHijack, initialLeak, initialPolicy, pickAs, policyRun, preferProvider, prefFor, setPref,
} from './init';
import lesson from './index';

const clean = (node: unknown) => {
  const t = text(node as never, { strict: true });
  expect(t).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return t;
};
const result = (over: Partial<HijackSetup>, prefixText = DEFAULT_HIJACK.prefixText) => {
  const s = { ...DEFAULT_HIJACK, ...over, prefixText };
  return { s, r: hijackResult(s, announcedOf(s)) };
};

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the route settles in 3 rounds with 8 of 8 ASes holding it; AS64498 shows one discarded loop', () => {
    const run = propagate(baseConfig());
    expect(run.roundsToConverge).toBe(3);
    expect(ASES.filter((a) => finalRound(run).best[a])).toHaveLength(8);
    expect(initialAnnounce().selected).toBe(64498);
    expect(finalRound(run).candidates[64498].filter((c) => c.status === 'loop')).toHaveLength(1);
    const t = lesson.tryThis[0];
    expect(t).toContain('settles after 3 rounds with 8 of 8 ASes');
    expect(t).toContain('lists 1 path discarded as a loop');
  });

  it('try-this 2: AS64499 sends through 64498 at preference 200 and length 2; raising its 64497 slider to 350 switches it to 64497 and changes the stated number of paths', () => {
    const p = initialPolicy();
    expect(p.as).toBe(64499);
    expect(prefFor(p, 64497)).toBe(100);
    const before = finalRound(policyRun(p)).candidates[64499].find((c) => c.status === 'chosen');
    expect([before?.from, before?.pref, before?.path.length]).toEqual([64498, 200, 2]);
    const after = setPref(p, 64497, 350);
    expect(after.prefs).toEqual(preferProvider().prefs);
    const chosen = finalRound(policyRun(after)).candidates[64499].find((c) => c.status === 'chosen');
    expect([chosen?.from, chosen?.path.length]).toEqual([64497, 4]);
    const changed = changedFromDefault(after);
    expect(changed).toEqual([64499, 64501]);
    const t = lesson.tryThis[1];
    expect(t).toContain('sends through AS64498 (local preference 200, path length 2)');
    expect(t).toContain('switches to AS64497 although that path is 4 long');
    expect(t).toContain(`reads ${changed.length}`);
    expect(t).toContain('"Pref for 64497"');
    expect(PREF_RANGE.max).toBe(350);
  });

  it('try-this 3: the leak sends AS64499 through AS64502 and overflows both thin links', () => {
    expect(initialLeak().policy).toBe('valley-free');
    const best = finalRound(propagate(baseConfig({ policy: 'leak' }))).best;
    expect(best[64499]?.via).toBe(LEAKER);
    const loads = linkLoads({ graph: GRAPH }, best);
    expect([loads.get(edgeId(64498, LEAKER)), loads.get(edgeId(64499, LEAKER))]).toEqual([4, 3]);
    expect(lesson.tryThis[2]).toContain('2 of the 2 thin access links overflow');
  });

  it('try-this 4: the default /25 with no validators ends all 8 ASes at the hijacker; the /24 chip splits the map', () => {
    const h = initialHijack();
    expect([h.setup.kind, h.setup.prefixText, h.setup.validators, h.setup.forged]).toEqual(['hijack', '203.0.113.0/25', 0, false]);
    const r25 = reachCounts(result({}).r);
    expect(r25).toEqual({ origin: 0, second: 8, lost: 0 });
    const r24 = reachCounts(result({}, '203.0.113.0/24').r);
    expect(r24.origin).toBeGreaterThan(0);
    expect(r24.second).toBeGreaterThan(0);
    expect(r24.origin + r24.second + r24.lost).toBe(8);
    const t = lesson.tryThis[3];
    expect(t).toContain('8 of 8 ASes end at the hijacker and 0 at the real origin');
    expect(t).toContain(`${r24.origin} to the origin and ${r24.second} to the hijacker`);
    expect(announcePrefix(h, '203.0.113.0/24').setup.prefixText).toBe('203.0.113.0/24');
  });

  it('try-this 5: all 8 validating drops the /24 hijack; forging the origin makes it valid and captures again; the /25 stays dropped', () => {
    const plain = result({ validators: VALIDATOR_MAX }, '203.0.113.0/24');
    const forged = result({ validators: VALIDATOR_MAX, forged: true }, '203.0.113.0/24');
    const slash25 = result({ validators: VALIDATOR_MAX, forged: true });
    expect(plain.r.validity).toBe('invalid');
    expect(forged.r.validity).toBe('valid');
    expect(reachCounts(plain.r).second).toBe(1);
    expect(reachCounts(forged.r).second).toBeGreaterThan(1);
    expect(reachCounts(slash25.r).second).toBe(1);
    const t = lesson.tryThis[4];
    expect(t).toContain('8 of 8');
    expect(t).toContain(`(${reachCounts(plain.r).second} end at the second AS, itself)`);
    expect(t).toContain(`reads valid and ${reachCounts(forged.r).second} end at it again`);
    expect(t).toContain(`With the /25 and everyone validating, ${reachCounts(result({ validators: VALIDATOR_MAX }).r).second} end at it.`);
  });
});

describe('scene 1: announcement frames', () => {
  it('one frame per round, the last of which says nothing changed, and every caption is clean', () => {
    const run = propagate(baseConfig());
    const frames = announceFrames(run);
    expect(frames).toHaveLength(run.rounds.length);
    frames.forEach((f, i) => {
      clean(f.say);
      expect(f.round).toBe(i);
    });
    expect(clean(frames[frames.length - 1].say)).toContain('nothing changed');
    expect(clean(frames[1].say)).toMatch(/^Round 1: 1 UPDATE in flight, 1 AS changed their best route\. AS64498 now holds 64500/);
  });
});

describe('scene 2: every AS, and the extremes of every slider', () => {
  it('the caption names the chosen neighbour and what decided it, for every AS and every preference at its extremes', () => {
    for (const as of ASES) {
      if (as === ORIGIN) continue;
      for (const v of [PREF_RANGE.min, PREF_RANGE.max]) {
        let s = pickAs(initialPolicy(), as);
        for (const n of GRAPH.edges.filter((e) => e.a === as || e.b === as)) s = setPref(s, n.a === as ? n.b : n.a, v);
        const list = finalRound(policyRun(s)).candidates[as];
        const t = clean(policyIntro(as, list, true));
        const chosen = list.find((c) => c.status === 'chosen');
        if (chosen) expect(t).toContain(`AS${chosen.from}`);
        else expect(t).toContain('no usable route');
      }
    }
  });

  it('with equal preferences everywhere at an AS the caption says path length decided, and the lower neighbour breaks a full tie', () => {
    let s = pickAs(initialPolicy(), 64499);
    s = setPref(setPref(s, 64497, 200), 64498, 200);
    const t = clean(policyIntro(64499, finalRound(policyRun(s)).candidates[64499], true));
    expect(t).toContain('shorter AS_PATH');
    expect(t).toContain('decided it only because local preference was tied');
  });

  it('picking another AS keeps the preferences already set', () => {
    const s = pickAs(setPref(initialPolicy(), 64497, 350), 64498);
    expect(s.prefs).toEqual(preferProvider().prefs);
    expect(prefFor(s, 64499)).toBe(200);
  });
});

describe('scene 3: both policies', () => {
  it('the caption states the policy, the path of AS64499, and the overflow count from the loads', () => {
    for (const policy of ['valley-free', 'leak'] as const) {
      const best = finalRound(propagate(baseConfig({ policy }))).best;
      const t = clean(leakIntro(policy, best));
      expect(t).toContain(`${best[64499]!.path.join(' ')}`);
      expect(t.includes('A route leak')).toBe(policy === 'leak');
      expect(t.includes('2 thin links overflow')).toBe(policy === 'leak');
      expect(t.includes('neither access link')).toBe(policy === 'valley-free');
    }
  });
});

describe('scene 4: the whole control cross product', () => {
  it('every announcer, kind, prefix, forging and validator count gives clean captions whose counts add up to 8', () => {
    const prefixes = ['203.0.113.0/24', '203.0.113.0/25', '203.0.113.128/25', '203.0.113.0/28'];
    for (const announcer of ASES.filter((a) => a !== ORIGIN)) {
      for (const kind of ['hijack', 'anycast'] as Kind[]) {
        for (const prefix of prefixes) {
          for (const forged of [false, true]) {
            for (const validators of [0, 4, VALIDATOR_MAX]) {
              const { s, r } = result({ announcer, kind, forged, validators }, prefix);
              const c = reachCounts(r);
              expect(c.origin + c.second + c.lost).toBe(8);
              clean(hijackIntro(s, r));
              if (validators === VALIDATOR_MAX && kind === 'hijack' && !forged && prefix !== '203.0.113.0/24') {
                // Everyone drops the announcement, so only the announcer itself and the ASes whose legitimate path runs through it end there.
                const legit = finalRound(propagate(baseConfig())).best;
                const through = ASES.filter((a) => a === announcer || legit[a]?.path.includes(announcer));
                expect(ASES.filter((a) => r.reach[a].outcome === 'other'), `${announcer} ${prefix}`).toEqual(through);
              }
            }
          }
        }
      }
    }
  });

  it('no lost packets at all: a loop or a missing route would show as lost, and none occurs for any validator count with the default hijacker', () => {
    for (let k = 0; k <= VALIDATOR_MAX; k++) expect(reachCounts(result({ validators: k }).r).lost).toBe(0);
  });

  it('forging and validation do nothing for a legitimate second site (hidden controls feed no number)', () => {
    const base = result({ kind: 'anycast' }, '203.0.113.0/24').r.reach;
    for (const forged of [false, true]) for (const validators of [0, VALIDATOR_MAX]) expect(result({ kind: 'anycast', forged, validators }, '203.0.113.0/24').r.reach).toEqual(base);
  });

  it('the typed prefix: a bad entry is refused with its reason and the old prefix stays; a good one is announced', () => {
    const h = initialHijack();
    for (const bad of ['', 'abc', '10.0.0.0/24', '203.0.113.5/25', '203.0.113.0/29', '<script>1</script>', 'x'.repeat(4000)]) {
      const r = announcePrefix(h, bad);
      expect(r.setup.prefixText).toBe('203.0.113.0/25');
      expect(r.note).toContain('Keeping 203.0.113.0/25');
      expect((r.note ?? '').length).toBeLessThan(420);
    }
    const ok = announcePrefix({ ...h, field: ' 203.0.113.128/26 ' });
    expect(ok.setup.prefixText).toBe('203.0.113.128/26');
    expect(ok.field).toBe('203.0.113.128/26');
    expect(announcedOf(ok.setup)).toMatchObject({ len: 26 });
  });

  it('the opening state of each scene is its own', () => {
    expect(initialAnnounce()).toEqual({ selected: 64498 });
    expect(initialPolicy()).toEqual({ as: 64499, prefs: {} });
    expect(initialLeak()).toEqual({ policy: 'valley-free' });
    expect(initialHijack().setup).toEqual(DEFAULT_HIJACK);
    expect(initialHijack().note).toBeNull();
  });
});

describe('content', () => {
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
