import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { originCaption, popsCaption, scrubCaption, synCaption } from './captions';
import lesson from './index';
import { initialOrigin, initialPops, initialSyn } from './init';
import { DEFENCES, LEGIT_RATE, LOAD_CLASSES, NO_DEFENCE, PRESETS, defaultInput, origin } from './origin';
import { LEGIT_TOTAL, pops, scoreSet, scrubAt } from './pops';
import { MODE_NAME, runSyn, type Mode } from './syn';

const text = expectCaption;
const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('this lesson stays on the page', () => {
  it('has no network call, no eval and no timers for probing in any source file', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(8);
    expect(forbiddenCalls(sources)).toEqual([]);
    for (const [file, src] of Object.entries(sources)) expect(/setInterval|setTimeout/.test(src), file).toBe(false);
  });

  it('names no tool, amplification figure or botnet detail', () => {
    for (const [file, src] of Object.entries(sources)) expect(/amplif|botnet|booter|stresser|reflector|exploit/i.test(src), file).toBe(false);
  });
});

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the volumetric default serves 64.5 of 200 requests (32%); more bandwidth serves 200', () => {
    const i = initialOrigin();
    expect(i).toMatchObject({ cls: 'volumetric', rate: 3000 });
    expect(i.defences).toEqual(NO_DEFENCE);
    expect(origin(i).goodput).toBeCloseTo(64.516, 3);
    expect(origin({ ...i, defences: { ...NO_DEFENCE, bandwidth: true } }).goodput).toBe(LEGIT_RATE);
    expect(lesson.tryThis[0]).toContain('only 64.5 of 200');
    expect(lesson.tryThis[0]).toContain('(32%)');
    expect(lesson.tryThis[0]).toContain('"more bandwidth": 200');
  });

  it('try-this 2: the distributed preset passes all 400 and serves 38%; with 1 source the limit admits 10 and all 200 are served', () => {
    const d = PRESETS[3].input();
    expect(origin(d).admittedRate).toBe(400);
    expect(Math.round(origin(d).goodputShare * 100)).toBe(38);
    expect(origin({ ...d, sources: 1 }).admittedRate).toBe(10);
    expect(origin({ ...d, sources: 1 }).goodputShare).toBe(1);
    expect(lesson.tryThis[1]).toContain('38% of legitimate requests are served');
    expect(lesson.tryThis[1]).toContain('admits 10 and 100% are served');
  });

  it('try-this 3: at the defaults site 1 is overloaded and 165 Mbit/s are dropped; rebalancing drops 0', () => {
    const p = initialPops();
    const r = pops(p.attack, LEGIT_TOTAL, p.skewPct, p.extra);
    expect(r.overloaded).toEqual([0]);
    expect(Math.round(r.legitDropped)).toBe(165);
    expect(Math.round(pops(p.attack, LEGIT_TOTAL, 0, p.extra).legitDropped)).toBe(0);
    expect(lesson.tryThis[2]).toContain('drops 165 Mbit/s');
    expect(lesson.tryThis[2]).toContain('"Rebalance the catchment": 0');
  });

  it('try-this 4: a threshold of 0.5 removes 92% of unwanted flows and drops 10% of legitimate ones; 0 drops 100% of both', () => {
    const p = initialPops();
    const s = scrubAt(scoreSet(p.seed), p.threshold);
    expect(Math.round(s.attackRemoved * 100)).toBe(92);
    expect(Math.round(s.legitDropped * 100)).toBe(10);
    const all = scrubAt(scoreSet(p.seed), 0);
    expect([all.attackRemoved, all.legitDropped]).toEqual([1, 1]);
    expect(lesson.tryThis[3]).toContain('removes 92% of unwanted flows and drops 10% of legitimate ones');
    expect(lesson.tryThis[3]).toContain('Set it to 0: 100% and 100%');
  });

  it('try-this 5: with no cookies 21 of 31 handshakes are refused; with cookies 0 and the table is empty', () => {
    const s = initialSyn();
    expect(s.mode).toBe('plain');
    const plain = runSyn({ seed: s.seed, flood: s.flood, mode: 'plain' }).final;
    const cookies = runSyn({ seed: s.seed, flood: s.flood, mode: 'cookies' });
    expect([plain.dropped, plain.started]).toEqual([21, 31]);
    expect(cookies.final.dropped).toBe(0);
    expect(cookies.sim.history.every((x) => x.table.length === 0)).toBe(true);
    expect(lesson.tryThis[4]).toContain('21 of 31 legitimate handshakes are refused');
    expect(lesson.tryThis[4]).toContain('0 are refused and the table stays empty');
  });
});

describe('hidden controls do not feed visible numbers', () => {
  it('the source count and the per-source limit matter only together; the other defences ignore the sources', () => {
    for (const cls of LOAD_CLASSES) {
      const a = origin({ ...defaultInput(cls), sources: 1 });
      const b = origin({ ...defaultInput(cls), sources: 1000 });
      expect(a).toEqual(b);
    }
    expect(DEFENCES).toHaveLength(5);
  });

  it('switching the kind of load resets the rate to that kind\'s default and keeps the defences the learner chose', () => {
    const base = { ...initialOrigin(), defences: { ...NO_DEFENCE, scrub: true }, sources: 10 };
    const next = { ...defaultInput('app'), defences: base.defences, sources: base.sources };
    expect(next.rate).toBe(400);
    expect(origin(next).goodputShare).toBeGreaterThan(0);
  });

  it('the seed changes the scores and the wobble, never the capacities', () => {
    expect(scoreSet(1)).not.toEqual(scoreSet(2));
    expect(pops(1000, LEGIT_TOTAL, 80, 0)).toEqual(pops(1000, LEGIT_TOTAL, 80, 0));
  });
});

describe('captions say what the model computed', () => {
  it('the origin caption quotes the admitted rate and the goodput, for every class and defence', () => {
    for (const cls of LOAD_CLASSES) {
      for (const d of [null, ...DEFENCES]) {
        const i = { ...defaultInput(cls), defences: d ? { ...NO_DEFENCE, [d]: true } : { ...NO_DEFENCE } };
        const r = origin(i);
        const t = text(originCaption(i, r));
        expect(t.includes('saturated'), `${cls} ${d}`).toBe(r.saturated.length > 0);
        expect(t).toContain(`${Math.round(r.admittedRate).toLocaleString('en-US')}`);
      }
    }
    const none = { ...defaultInput('app'), rate: 0 };
    expect(text(originCaption(none, origin(none)))).toContain('No unwanted load');
  });

  it('the anycast caption says whether a site is overloaded, and notes when the total capacity covers the attack', () => {
    const skewed = text(popsCaption(1000, 80, pops(1000, LEGIT_TOTAL, 80, 0)));
    expect(skewed).toContain('1 site overloaded');
    expect(skewed).toContain('even though the total capacity covers the whole load');
    expect(text(popsCaption(1000, 0, pops(1000, LEGIT_TOTAL, 0, 0)))).toContain('no site is overloaded');
    expect(text(popsCaption(1400, 100, pops(1400, LEGIT_TOTAL, 100, 0)))).not.toContain('even though');
  });

  it('the scrubbing caption quotes the confusion counts', () => {
    const p = scrubAt(scoreSet(0), 0.5);
    const t = text(scrubCaption(p));
    expect(t).toContain(`${p.confusion.tp} caught`);
    expect(t).toContain(`${p.confusion.fp} legitimate flows lost`);
  });

  it('the handshake caption follows the state at the tick: room, full, refused, or stateless', () => {
    const modes: Mode[] = ['plain', 'cookies', 'broken'];
    for (const mode of modes) {
      const { sim } = runSyn({ seed: 0, flood: 1, mode });
      for (const tick of [0, 40, 120, 240]) {
        const s = sim.history[tick];
        const t = text(synCaption(mode, s, tick));
        expect(t).toContain(`${s.table.length} of 8 half-open slots`);
        expect(t).toContain(MODE_NAME[mode]);
        if (mode === 'cookies') expect(t).toContain('no state is kept');
        else expect(t.includes('a legitimate SYN found no slot')).toBe(s.dropped > 0);
      }
    }
    expect(LEGIT_RATE).toBe(200);
  });
});
