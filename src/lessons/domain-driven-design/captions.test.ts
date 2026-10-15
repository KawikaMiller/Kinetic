import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { interleavingName, interleavings, run, tally } from './aggregate';
import { START_RUN_NOTE, mapCaption, monolithCaption, runCaption, summaryCaption } from './captions';
import { ALL_IN_ONE, CONCEPTS, CONTEXTS, START_STATE, SUGGESTED, statsOf, type Assignment, type MapState } from './contextMap';
import { REQUESTS, blastRadius, widelyShared } from './monolith';

describe('monolith captions state the blast radius the bar shows', () => {
  it('for every request', () => {
    for (const r of REQUESTS) {
      const text = expectCaption(monolithCaption(r));
      expect(text, r.id).toContain(`${blastRadius(r)} teams of 4 must change their code`);
      expect(text, r.id).toContain(`${widelyShared().length} attributes here are used by three or more teams`);
    }
  });

  it('pins the first sentence', () => {
    expect(monolithCaption(REQUESTS[0])).toBe(
      `Support renames "tier": it touches 1 attribute of one Customer with 14, and 3 teams of 4 must change their code (Billing, Shipping and Support). ${widelyShared().length} attributes here are used by three or more teams.`,
    );
  });
});

describe('map captions follow the placement', () => {
  const states: MapState[] = [
    START_STATE,
    { ...START_STATE, assign: SUGGESTED },
    { ...START_STATE, assign: SUGGESTED, split: true },
    { ...START_STATE, assign: ALL_IN_ONE },
    { ...START_STATE, assign: ALL_IN_ONE, split: true },
    { ...START_STATE, assign: { ...SUGGESTED, Invoice: 'fulfilment' }, split: true },
  ];

  it('state the inside count, the crossing count and the split, for six states', () => {
    for (const s of states) {
      const text = expectCaption(mapCaption(s));
      const st = statsOf(s);
      if (st.placed === 0) {
        expect(text).toContain('No edge has both ends placed yet');
      } else {
        expect(text).toContain(`${st.inside} of ${st.placed} placed edges stay inside a context (${Math.round((st.cohesion ?? 0) * 100)}% cohesion)`);
        if (st.crossing === 0) expect(text).toContain('no edge crosses a boundary');
        else expect(text).toContain(`${st.crossing} edge${st.crossing === 1 ? '' : 's'} cross${st.crossing === 1 ? 'es' : ''} a boundary (${st.raw} raw, ${st.translated} translated)`);
      }
      expect(text.includes('Customer is split'), JSON.stringify(s.assign)).toBe(s.split);
    }
  });

  it('pins the suggested placement before and after the split', () => {
    expect(mapCaption({ ...START_STATE, assign: SUGGESTED })).toBe(
      '10 of 17 placed edges stay inside a context (59% cohesion) and 7 edges cross a boundary (7 raw, 0 translated). Customer is still one model that three contexts each read differently.',
    );
    expect(mapCaption({ ...START_STATE, assign: SUGGESTED, split: true })).toBe(
      '13 of 17 placed edges stay inside a context (76% cohesion) and 4 edges cross a boundary (4 raw, 0 translated). Customer is split into Payer, Recipient and Requester, joined only by the customer id.',
    );
  });

  it('is true for 200 placements of any one concept in any context', () => {
    let n = 0;
    for (const c of CONCEPTS) {
      for (const ctx of CONTEXTS) {
        const assign: Assignment = { ...SUGGESTED, [c]: ctx.id };
        for (const split of [false, true]) {
          const st = statsOf({ ...START_STATE, assign, split });
          expect(mapCaption({ ...START_STATE, assign, split })).toContain(`${st.inside} of ${st.placed} placed edges`);
          n++;
        }
      }
    }
    expect(n).toBe(54);
  });
});

describe('aggregate captions follow the run', () => {
  it('says over the limit exactly when the run broke it, for both designs and all six orders', () => {
    for (const design of ['records', 'aggregate'] as const) {
      for (const o of interleavings()) {
        const r = run(design, o);
        const text = expectCaption(runCaption(r));
        expect(text.includes('over the limit'), `${design} ${interleavingName(o)}`).toBe(r.violated);
        expect(text).toContain(`ends with ${r.finalLines} lines`);
      }
    }
  });

  it('pins a violation, a refused retry and the summaries', () => {
    const racing = interleavings().find((o) => interleavingName(o) === 'R1 R2 W1 W2')!;
    expect(runCaption(run('records', racing))).toBe('Independent records, R1 R2 W1 W2: the order ends with 6 lines, over the limit of 5.');
    expect(runCaption(run('aggregate', racing))).toBe('Order as an aggregate, R1 R2 W1 W2: the order ends with 5 lines, within the limit of 5.');
    expect(summaryCaption('records')).toBe('Independent records: 4 of 6 interleavings break the limit of 5 lines, starting from 4.');
    expect(summaryCaption('aggregate')).toBe('Order as an aggregate: 0 of 6 interleavings break the limit of 5 lines, starting from 4.');
    expect(START_RUN_NOTE).toContain('4 lines and may hold 5');
    expect(tally('records').violations).toBe(4);
  });
});
