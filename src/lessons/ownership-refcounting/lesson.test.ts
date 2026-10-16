import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { countCaption, fateText, ownCaption } from './captions';
import { FACTS } from './facts';
import { CHAIN_SCRIPT, CYCLE_SCRIPT, apply, emptyHeap, replay, WEAK_BACK_SCRIPT, type Op } from './heap';
import lesson from './index';
import { OPENING } from './opening';
import { checkSequential, PRESETS } from './ownership';
import { summaryColumns } from './summary';

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('ownership-refcounting');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('ownership-refcounting')).toEqual([]);
  });

  it('each scene opens on a fixed, pure state', () => {
    expect(OPENING.scene).toBe('counting');
    expect(OPENING.counting.log).toBe(CYCLE_SCRIPT);
    expect(OPENING.counting).toMatchObject({ view: 'counting', atomic: false, tray: { kind: 'new', first: 'a', second: 'b', weak: false } });
    expect(OPENING.ownership.preset).toBe('nll');
    expect(OPENING.ownership.program).toBe(PRESETS[2].program);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the cycle leaves 2 leaked objects; a collect at op 7 frees 2 under tracing and counting still leaks 2', () => {
    expect([FACTS.openLeaked, FACTS.collectOp, FACTS.collectFreed]).toEqual([2, 7, 2]);
    expect(lesson.tryThis[0]).toContain('2 objects show as leaked');
  });

  it('try-this 2: the weak cycle frees at ops 5 and 6 and leaks none; the chain frees 3 objects together at op 8', () => {
    expect(FACTS.weakFreedAt).toEqual([5, 6]);
    expect([FACTS.weakLeaked, FACTS.chainFreed, FACTS.chainFreedAt[0]]).toEqual([0, 3, 8]);
    expect(lesson.tryThis[1]).toContain('ops 5 and 6');
  });

  it('try-this 3: 6 updates cost 6 plain and 18 atomic', () => {
    expect([FACTS.updates, FACTS.plainCost, FACTS.atomicCost]).toEqual([6, 6, 18]);
    expect(lesson.tryThis[2]).toContain('costing 6');
  });

  it('try-this 4: the opening program is accepted and memory goes back at the scope end; the three rejected presets name lines 4, 3 and 3', () => {
    expect(FACTS.openingAccepted).toBe(true);
    expect(FACTS.openingFreed).toContain('end of the program');
    expect([FACTS.sharedThenMutLine, FACTS.twoMutLine, FACTS.afterMoveLine]).toEqual([4, 3, 3]);
    expect([FACTS.sharedThenMutRule, FACTS.twoMutRule, FACTS.afterMoveRule]).toEqual(['E0502', 'E0499', 'E0382']);
    expect(lesson.tryThis[3]).toContain('rejected at line 4');
  });
});

describe('captions and the summary', () => {
  it('the counting caption is clean for every script, with and without atomic counts and a refusal', () => {
    for (const log of [[], CYCLE_SCRIPT, WEAK_BACK_SCRIPT, CHAIN_SCRIPT, [...CYCLE_SCRIPT, { kind: 'collect' } as Op]]) {
      for (const atomic of [false, true]) {
        for (const note of [null, 'a is already null']) {
          const text = expectCaption(countCaption({ log, counting: replay(log, 'counting'), tracing: replay(log, 'tracing'), atomic, note }));
          expect(text).not.toMatch(/NaN|undefined|\[object/);
        }
      }
    }
  });

  it('the ownership caption is clean for the empty program and every preset', () => {
    expect(expectCaption(ownCaption([], checkSequential([])))).toContain('empty');
    for (const p of PRESETS) expect(expectCaption(ownCaption(p.program, checkSequential(p.program)))).toMatch(p.accepted ? /^Accepted/ : /^Rejected/);
  });

  it('every fate has a sentence, and the weak-reference tracing run frees the same objects as counting', () => {
    for (const f of [{ kind: 'unused' }, { kind: 'live' }, { kind: 'freed', at: 3 }, { kind: 'leaked' }, { kind: 'pending' }] as const) expect(fateText(f)).toMatch(/\w/);
    expect(replay([...WEAK_BACK_SCRIPT, { kind: 'collect' }], 'tracing').fates.slice(0, 2).every((f) => f.kind === 'freed')).toBe(true);
  });

  it('the summary columns are generated from the runs: counting leaks obj 0 and obj 1, tracing frees them at op 7, ownership frees at scope end', () => {
    const [counting, tracing, ownership] = summaryColumns();
    expect(counting.cost).toContain('obj 0, obj 1');
    expect(tracing.when).toContain('obj 0 at op 7, obj 1 at op 7');
    expect(ownership.when).toContain('end of the program');
    expect(apply(emptyHeap(), { kind: 'new', slot: 'a' }, 'counting').refused).toBeNull();
  });
});
