import { describe, expect, it } from 'vitest';
import { ACTIONS, CONFLICTS, DIAGNOSES, KIND_OF, POLICIES, REMOVABLE, SUPPORT_EDGES, read, toggle, type NodeId } from './model';

const removing = (...ids: NodeId[]): ReadonlySet<NodeId> => new Set(ids);

describe('the canvas', () => {
  it('has two diagnoses, four policies, seven actions, two conflicts and the support edges the spec lists', () => {
    expect([DIAGNOSES.length, POLICIES.length, ACTIONS.length, CONFLICTS.length]).toEqual([2, 4, 7, 2]);
    expect(SUPPORT_EDGES).toHaveLength(4 + 7);
    expect(REMOVABLE).toHaveLength(11);
    expect(KIND_OF.D1).toBe('diagnosis');
    expect(KIND_OF.P3).toBe('policy');
    expect(KIND_OF.A7).toBe('action');
  });
});

describe('the hand-worked states of the spec', () => {
  it('everything present: 0 orphans, 0 uncovered diagnoses, 2 conflicts (P2 against P4, A4 against A7)', () => {
    expect(read(removing())).toEqual({ orphans: [], uncovered: [], conflicts: [['P2', 'P4'], ['A4', 'A7']] });
  });

  it('removing P1 orphans A1 and A2 and keeps both conflicts', () => {
    const r = read(removing('P1'));
    expect([r.orphans, r.uncovered, r.conflicts.length]).toEqual([['A1', 'A2'], [], 2]);
  });

  it('removing P3 orphans A5 and uncovers D2', () => {
    const r = read(removing('P3'));
    expect([r.orphans, r.uncovered, r.conflicts.length]).toEqual([['A5'], ['D2'], 2]);
  });

  it('removing P2 orphans A3 and A4 and leaves the action conflict only', () => {
    const r = read(removing('P2'));
    expect([r.orphans, r.uncovered, r.conflicts]).toEqual([['A3', 'A4'], [], [['A4', 'A7']]]);
  });

  it('removing P4 orphans A6 and A7, and A4 against A7 stays because an orphan is still on the roadmap', () => {
    const r = read(removing('P4'));
    expect([r.orphans, r.uncovered, r.conflicts]).toEqual([['A6', 'A7'], [], [['A4', 'A7']]]);
  });

  it('removing P2 and P4 orphans A3, A4, A6, A7, keeps D1 covered by P1 and leaves one conflict', () => {
    const r = read(removing('P2', 'P4'));
    expect([r.orphans, r.uncovered, r.conflicts]).toEqual([['A3', 'A4', 'A6', 'A7'], [], [['A4', 'A7']]]);
  });

  it('removing all four policies orphans all 7 actions, uncovers both diagnoses and keeps one conflict', () => {
    const r = read(removing('P1', 'P2', 'P3', 'P4'));
    expect([r.orphans.length, r.uncovered, r.conflicts]).toEqual([7, ['D1', 'D2'], [['A4', 'A7']]]);
  });

  it('removing an action removes it from the orphans and from the conflicts', () => {
    const r = read(removing('P2', 'P4', 'A7'));
    expect([r.orphans, r.conflicts]).toEqual([['A3', 'A4', 'A6'], []]);
  });
});

describe('all 2^4 x 2^7 = 2,048 canvas states against an independent bitmask calculation', () => {
  it('agrees on orphans, uncovered diagnoses and conflicts in every state', () => {
    // Bits: P1..P4 are bits 0..3 of the policy mask, A1..A7 bits 0..6 of the action mask; a set bit means PRESENT.
    const supportMask = [0b0001, 0b0001, 0b0010, 0b0010, 0b0100, 0b1000, 0b1000];
    const d1 = 0b1011;
    const d2 = 0b0100;
    let states = 0;
    for (let policies = 0; policies < 16; policies += 1) {
      for (let actions = 0; actions < 128; actions += 1) {
        const removed = new Set<NodeId>();
        POLICIES.forEach((p, i) => { if (!(policies & (1 << i))) removed.add(p.id); });
        ACTIONS.forEach((a, i) => { if (!(actions & (1 << i))) removed.add(a.id); });
        const r = read(removed);
        const orphans = ACTIONS.filter((_, i) => actions & (1 << i) && !(policies & supportMask[i])).map((a) => a.id);
        const uncovered = [...((policies & d1) === 0 ? ['D1'] : []), ...((policies & d2) === 0 ? ['D2'] : [])];
        const conflicts = [...((policies & 0b0010) && (policies & 0b1000) ? ['P2-P4'] : []), ...((actions & 0b0001000) && (actions & 0b1000000) ? ['A4-A7'] : [])];
        expect(r.orphans, `${policies}/${actions}`).toEqual(orphans);
        expect(r.uncovered, `${policies}/${actions}`).toEqual(uncovered);
        expect(r.conflicts.map(([a, b]) => `${a}-${b}`), `${policies}/${actions}`).toEqual(conflicts);
        states += 1;
      }
    }
    expect(states).toBe(2048);
  });
});

describe('remove and restore', () => {
  it('toggles a policy or action and ignores a diagnosis or an unknown id', () => {
    const once = toggle(removing(), 'P1');
    expect([...once]).toEqual(['P1']);
    expect([...toggle(once, 'P1')]).toEqual([]);
    expect(toggle(removing(), 'D1')).toEqual(removing());
    expect(toggle(removing(), 'X9' as NodeId)).toEqual(removing());
  });

  it('never mutates the set it was given', () => {
    const start = removing('P2');
    toggle(start, 'P1');
    expect([...start]).toEqual(['P2']);
  });
});
