import { describe, expect, it } from 'vitest';
import { forbiddenCalls, NO_CLOCK_OR_TIMER } from '../../core/testing/forbidden';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import { DEFAULT_SOCKETS, bandwidth, defaultMachine, latency, place, type Machine, type Node } from './numa';

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
