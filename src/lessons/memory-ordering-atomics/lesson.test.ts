import { describe, expect, it } from 'vitest';
import { forbiddenCalls, NO_CLOCK_OR_TIMER } from '../../core/testing/forbidden';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import lesson from './index';
import { BASES, FACTS, emptyEdit, rowNote, setFence, setTag, table, targetReach, verdict } from './model';

const sources = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const lessonSources = Object.fromEntries(Object.entries(sources).filter(([file]) => !file.includes('.test.')));

describe('source', () => {
  it('makes no network call, evaluates no text, reads no clock and starts no timer', () => {
    expect(forbiddenCalls(lessonSources, { also: NO_CLOCK_OR_TIMER, ignoreComments: true })).toEqual([]);
  });
});

describe('scenes', () => {
  it('every scene component carries its own key, and none is shared between scenes', () => {
    const els = sceneElements('memory-ordering-atomics');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('memory-ordering-atomics')).toEqual([]);
  });

  it('every scene opens on SC with no fence and no tag, on its first preset', () => {
    for (const id of ['sb', 'mp', 'dekker'] as const) {
      const base = BASES[id];
      const e = emptyEdit(base);
      expect(e.fences.flat().some(Boolean)).toBe(false);
      expect(e.tags.flat().some((x) => x !== undefined)).toBe(false);
    }
  });
});

describe('try-this entries, in written order from the default state', () => {
  const sb = BASES.sb;
  const mp = BASES.mp;

  it('try-this 1: SC lists 3 outcomes and 0,0 is not reachable (all 13 states explored); x86-style adds it with both stores buffered while both loads read 0', () => {
    const sc = table(sb, emptyEdit(sb), 'sc');
    expect(sc.rows.filter((r) => r.reachable)).toHaveLength(3);
    const zero = sc.rows.find((r) => r.isTarget)!;
    expect(rowNote(zero, sc)).toBe(`not reachable: all ${FACTS.sbScStates} states of this model explored`);
    expect(FACTS.sbScStates).toBe(13);
    const tso = table(sb, emptyEdit(sb), 'tso');
    expect(tso.rows.filter((r) => r.reachable)).toHaveLength(4);
    const witness = tso.rows.find((r) => r.isTarget)!.example.map((s) => s.label.text);
    expect(witness.filter((x) => x.includes('into the buffer'))).toHaveLength(2);
    expect(witness.filter((x) => x.includes('reads 0 from memory'))).toHaveLength(2);
    expect(lesson.tryThis[0]).toContain('all 13 states explored');
  });

  it('try-this 2: a fence in T0 only leaves 0,0 reachable on x86-style; a fence in T1 as well removes it', () => {
    const one = setFence(emptyEdit(sb), 0, 0, true);
    expect(targetReach(sb, one).tso.reachable).toBe(true);
    expect(targetReach(sb, setFence(one, 1, 0, true)).tso.reachable).toBe(false);
  });

  it('try-this 3: MP in Weak with plain tags reaches 1,0; flag store release still does; flag load acquire too removes it', () => {
    const [flagStore, flagLoad] = [mp.flag!.store, mp.flag!.load];
    const rel = setTag(emptyEdit(mp), ...flagStore, 'rel');
    expect(targetReach(mp, emptyEdit(mp)).relaxed.reachable).toBe(true);
    expect(targetReach(mp, rel).relaxed.reachable).toBe(true);
    expect(targetReach(mp, setTag(rel, ...flagLoad, 'acq')).relaxed.reachable).toBe(false);
    expect(lesson.tryThis[2]).toContain('y = 1');
    expect(lesson.tryThis[2]).toContain('r1 = y');
  });

  it('try-this 4: the coherence preset never reaches r1 = 2, r2 = 1 in SC, x86-style or Weak', () => {
    const corr = BASES.corr;
    const r = targetReach(corr, emptyEdit(corr));
    expect([r.sc.reachable, r.tso.reachable, r.relaxed.reachable]).toEqual([false, false, false]);
    expect(verdict(corr, 'relaxed', r)).toContain('not reachable in the weak (release/acquire) model (all');
  });
});

describe('the lesson text agrees with the model', () => {
  it('key idea 1 and quiz 1 quote the SB outcome counts', () => {
    expect([FACTS.sbScOutcomes, FACTS.sbTsoOutcomes]).toEqual([3, 4]);
    expect(lesson.keyIdeas[0]).toContain('3 outcomes under SC, 4 under x86-style');
    expect(lesson.quiz[0].why).toContain('3 outcomes');
  });

  it('a truncated search never prints "not reachable"', () => {
    const t = table(sb(), emptyEdit(sb()), 'tso', 3);
    expect(t.truncated).toBe(true);
    const reach = targetReach(sb(), emptyEdit(sb()), 3);
    expect(verdict(sb(), 'tso', reach)).not.toContain('not reachable');
    for (const r of t.rows.filter((x) => !x.reachable)) expect(rowNote(r, t)).toContain('not exhaustive');
  });
});

function sb() {
  return BASES.sb;
}
