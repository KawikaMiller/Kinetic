import { describe, expect, it } from 'vitest';
import { leaseEvents } from './events';
import { initialFailure } from './init';
import { runLease } from './model';

describe('same-instant milestones', () => {
  it('a lease lapse is captioned before the grant that follows it at the same instant', () => {
    const events = leaseEvents(runLease(initialFailure()));
    const lapse = events.findIndex((e) => e.kind === 'expiry');
    expect(lapse).toBeGreaterThanOrEqual(0);
    const next = events[lapse + 1];
    expect(next.kind).toBe('grant');
    expect(next.t).toBe(events[lapse].t);
  });
});
