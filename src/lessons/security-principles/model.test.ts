import { describe, expect, it } from 'vitest';
import {
  ACTIONS, EVERYTHING, LAYERS, NEEDED, RESOURCES, SCENARIOS, blastRadius, detected, missingNeeds, perm, stoppedBy, type LayerId,
} from './model';

/** Every subset of the layers, as the set of layers left switched on. */
const allCombinations = (): Set<LayerId>[] =>
  Array.from({ length: 2 ** LAYERS.length }, (_, mask) => new Set(LAYERS.filter((_, i) => mask & (1 << i)).map((l) => l.id)));

describe('which layer stops each attack', () => {
  it('is the first switched-on layer in the scenario\'s defeat list, for all 32 combinations of every scenario', () => {
    for (const s of SCENARIOS) {
      for (const on of allCombinations()) {
        const expected = s.defeatedBy.filter((l) => on.has(l))[0] ?? null;
        expect(stoppedBy(s, on)).toBe(expected);
      }
    }
  });
  it('with every layer on, every scenario is stopped', () => {
    const all = new Set(LAYERS.map((l) => l.id));
    for (const s of SCENARIOS) expect(stoppedBy(s, all)).not.toBeNull();
  });
  it('a perimeter alone stops only the attacks that come through the network', () => {
    const perimeter = new Set<LayerId>(['network']);
    const stopped = SCENARIOS.filter((s) => stoppedBy(s, perimeter)).map((s) => s.id);
    expect(stopped).toEqual(['ddos', 'admin']);
  });
  it('explains every layer it can be stopped by, and lists what a breach threatens', () => {
    for (const s of SCENARIOS) {
      for (const l of s.defeatedBy) expect(s.stops[l]).toBeTruthy();
      expect(s.threatens.length).toBeGreaterThan(0);
    }
  });
  it('covers all three CIA properties across the scenarios', () => {
    expect(new Set(SCENARIOS.flatMap((s) => s.threatens))).toEqual(new Set(['confidentiality', 'integrity', 'availability']));
  });
});

describe('least privilege', () => {
  it('trimming to what is needed shrinks the blast radius a lot, and keeps the job working', () => {
    expect(blastRadius(NEEDED)).toBeLessThan(blastRadius(EVERYTHING) / 5);
    expect(missingNeeds(NEEDED)).toEqual([]);
  });
  it('removing any permission never makes the blast radius bigger', () => {
    for (const p of EVERYTHING) {
      const fewer = new Set(EVERYTHING);
      fewer.delete(p);
      expect(blastRadius(fewer)).toBeLessThan(blastRadius(EVERYTHING));
    }
  });
  it('flags a needed permission that was taken away', () => {
    const broken = new Set(NEEDED);
    broken.delete(perm('email', 'write'));
    expect(missingNeeds(broken)).toEqual([perm('email', 'write')]);
  });
  it('an empty grant set has no blast radius', () => {
    expect(blastRadius(new Set())).toBe(0);
    expect(EVERYTHING.size).toBe(RESOURCES.length * ACTIONS.length);
  });
});

describe('the stolen laptop', () => {
  const laptop = SCENARIOS.find((s) => s.id === 'laptop')!;
  it('never reaches the logs, so detection cannot catch it', () => {
    expect(detected(laptop, true)).toBe(false);
    expect(detected(SCENARIOS.find((s) => s.id === 'phish')!, true)).toBe(true);
    expect(detected(SCENARIOS.find((s) => s.id === 'phish')!, false)).toBe(false);
  });
  it('enters at the layer that can stop it, skipping network and identity', () => {
    expect(laptop.entersAt).toBe('data');
    expect(laptop.defeatedBy).toEqual(['data']);
  });
});
