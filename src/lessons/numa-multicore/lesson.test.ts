import { describe, expect, it } from 'vitest';
import { forbiddenCalls, NO_CLOCK_OR_TIMER } from '../../core/testing/forbidden';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import { DEFAULT_SOCKETS, bandwidth, defaultMachine, latency, place, placementCause, sharedDataNote, type Machine, type Node } from './numa';

const sources = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const lessonSources = Object.fromEntries(Object.entries(sources).filter(([file]) => !file.includes('.test.')));
const withHomes = (homes: Node[]): Machine => ({ sockets: [...DEFAULT_SOCKETS], homes });

describe('source', () => {
  it('makes no network call, evaluates no text, reads no clock and starts no timer', () => {
    expect(forbiddenCalls(lessonSources, { also: NO_CLOCK_OR_TIMER, ignoreComments: true })).toEqual([]);
  });
});

describe('scenes', () => {
  it('every scene component carries its own key, and none is shared between scenes', () => {
    const els = sceneElements('numa-multicore');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('numa-multicore')).toEqual([]);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: default 80 ns; T2\'s pages (P4, P5) on node 0 give T2 140 ns and a 95 ns mean; T3\'s pages too give 110', () => {
    const base = defaultMachine();
    expect(latency(base, 'own').mean).toBe(80);
    const t2 = base.homes.map((h, p) => (p === 4 || p === 5 ? (0 as Node) : h));
    const l = latency(withHomes(t2), 'own');
    expect([l.perThread[2].ns, l.mean]).toEqual([140, 95]);
    const t3 = t2.map((h, p) => (p === 6 || p === 7 ? (0 as Node) : h));
    expect(latency(withHomes(t3), 'own').mean).toBe(110);
    expect(lesson.tryThis[0]).toContain('95 ns');
    expect(lesson.tryThis[0]).toContain('110 ns');
  });

  it('try-this 2: first touch with the main thread filling gives 110 ns and 50% remote; each worker filling gives 80 ns', () => {
    const serial = latency(withHomes(place('first-touch', 'serial', DEFAULT_SOCKETS)), 'own');
    expect([serial.mean, serial.remoteShare]).toEqual([110, 0.5]);
    expect(latency(withHomes(place('first-touch', 'parallel', DEFAULT_SOCKETS)), 'own').mean).toBe(80);
    expect(lesson.tryThis[1]).toContain('110 ns, 50% remote');
    expect(lesson.tryThis[1]).toContain('80 ns');
  });

  it('try-this 3: everyone reads everything gives 110 ns on the default placement and on all 256 placements of the pages', () => {
    expect(latency(defaultMachine(), 'all').mean).toBe(110);
    for (let h = 0; h < 256; h++) {
      const homes = Array.from({ length: 8 }, (_, i) => ((h >> i) & 1) as Node);
      expect(latency(withHomes(homes), 'all').mean).toBeCloseTo(110, 9);
    }
    expect(FACTS.everyone).toBe('110 ns');
  });

  it('try-this 4: bind to node 0 gives 40 GB/s with the node 0 controller over 100%; interleave gives 64 GB/s', () => {
    const bound = bandwidth(withHomes(place('bind0', 'parallel', DEFAULT_SOCKETS)));
    expect(bound.total).toBeCloseTo(40, 9);
    expect(bound.nodeLoad[0]).toBeGreaterThan(1);
    expect(bandwidth(withHomes(place('interleave', 'parallel', DEFAULT_SOCKETS))).total).toBeCloseTo(64, 9);
    // The scene opens on first touch with parallel init: all local, 64 GB/s, so "choose bind" is a visible change.
    expect(bandwidth(withHomes(place('first-touch', 'parallel', DEFAULT_SOCKETS))).total).toBeCloseTo(64, 9);
    expect(lesson.tryThis[3]).toContain('40 GB/s');
    expect(lesson.tryThis[3]).toContain('64 GB/s');
  });
});

describe('the lesson text agrees with the model', () => {
  it('key ideas quote the model\'s numbers', () => {
    expect(lesson.keyIdeas[1]).toContain('110 ns, 50% remote');
    expect(lesson.keyIdeas[3]).toContain('40 GB/s of the 64 GB/s');
  });
});

describe('fix pass: captions derive from the model state', () => {
  it('shared data is "not local to everyone" only when threads sit on both sockets; with every thread on socket 0 and every page on node 0 the model says 80 ns and 0% remote', () => {
    const allOnZero: Machine = { sockets: [0, 0, 0, 0], homes: Array.from({ length: 8 }, () => 0 as Node) };
    const l = latency(allOnZero, 'all');
    expect([l.mean, l.remoteShare]).toEqual([80, 0]);
    expect(sharedDataNote(allOnZero.sockets)).not.toContain('cannot be local');
    expect(sharedDataNote(allOnZero.sockets)).toContain('local to all of them');
    expect(sharedDataNote([0, 0, 1, 1])).toContain('cannot be local to everyone');
    // the scene uses it
    expect(sources['./PinScene.tsx']).toContain('sharedDataNote(machine.sockets)');
  });

  it('manipulation 2: under everyone-reads-everything no placement policy gets below 110 ns, reachable from the first-touch scene (it has the pattern picker)', () => {
    for (const policy of ['first-touch', 'interleave', 'bind0'] as const) {
      for (const init of ['serial', 'parallel'] as const) {
        expect(latency(withHomes(place(policy, init, DEFAULT_SOCKETS)), 'all').mean).toBeCloseTo(110, 9);
      }
    }
    expect(sources['./TouchScene.tsx']).toContain('PATTERN_OPTIONS');
  });

  it('the bandwidth scene opening says why nothing is saturated, and says "local" exactly when no access is remote', () => {
    expect(placementCause('first-touch', 'parallel')).toContain('local');
    for (const policy of ['first-touch', 'interleave', 'bind0'] as const) {
      for (const init of ['serial', 'parallel'] as const) {
        const remote = latency(withHomes(place(policy, init, DEFAULT_SOCKETS)), 'own').remoteShare;
        expect(placementCause(policy, init).startsWith('Every page is local')).toBe(remote === 0);
      }
    }
  });

  it('quiz 3: every number in the options is arithmetic the model confirms (80 + a quarter of 140 is 115, the mean is 95)', () => {
    const q = lesson.quiz[2];
    expect(q.options.join(' ')).not.toContain('105 ns');
    expect(q.options[2]).toContain(`${80 + 140 / 4} ns`);
    expect(80 * 0.75 + 140 * 0.25).toBe(95);
    expect(q.options[1]).toContain('95 ns');
  });
});
