import { describe, expect, it } from 'vitest';
import { interleavingName, interleavings, run } from './aggregate';
import { ALL_IN_ONE, START_STATE, SUGGESTED, resolveEdges, statsOf } from './contextMap';
import lesson from './index';
import { REQUESTS, blastRadius } from './monolith';

/** Default state: the first request selected; nothing placed, Customer unsplit; independent records on R1 R2 W1 W2. */
describe('the try-this prompts work from the default state, as written', () => {
  it('has five prompts', () => {
    expect(lesson.tryThis).toHaveLength(5);
  });

  it('try-this 1: "Support renames tier" touches 3 of 4 teams, and so does every other request', () => {
    expect(blastRadius(REQUESTS[0])).toBe(3);
    expect(REQUESTS[0].label).toBe('Support renames "tier"');
    for (const r of REQUESTS.slice(1)) expect(blastRadius(r)).toBe(3);
  });

  it('try-this 2: Suggested placement crosses on 7 edges, and the split brings it to 4', () => {
    expect(statsOf({ ...START_STATE, assign: SUGGESTED }).crossing).toBe(7);
    expect(statsOf({ ...START_STATE, assign: SUGGESTED, split: true }).crossing).toBe(4);
  });

  it('try-this 3: everything in one context crosses nowhere, cohesion is 100%, and Customer still has several meanings', () => {
    const s = statsOf({ ...START_STATE, assign: ALL_IN_ONE });
    expect(s.crossing).toBe(0);
    expect(s.cohesion).toBe(1);
    expect(s.unsplitMeanings).toEqual(['Customer']);
  });

  it('try-this 4: with Invoice moved to Fulfilment, the Payer to Invoice edge is translated', () => {
    const state = { ...START_STATE, assign: { ...SUGGESTED, Invoice: 'fulfilment' as const }, split: true };
    const translated = resolveEdges(state).filter((e) => e.kind === 'translated');
    expect(translated.map((e) => [e.from, e.to])).toEqual([['Payer', 'Invoice']]);
  });

  it('try-this 5: the default run ends with 6 lines on records and 5 on an aggregate', () => {
    const racing = interleavings().find((o) => interleavingName(o) === 'R1 R2 W1 W2')!;
    expect(run('records', racing).finalLines).toBe(6);
    expect(run('aggregate', racing).finalLines).toBe(5);
  });
});
