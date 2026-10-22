import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { outboxMilestones } from './captions';
import { bugSetup, initialBug, initialOutbox, outboxSetupOf } from './init';
import { runOutbox, unpublishedOrders } from './outbox';

const restartCaptions = (run: ReturnType<typeof runOutbox>) =>
  outboxMilestones(run).map((m) => text(m.say)).filter((c) => c.includes('restarts'));

describe('restart captions', () => {
  it('a service restart that strands a committed order says there is nothing to send', () => {
    const run = runOutbox(bugSetup(initialBug()));
    expect(unpublishedOrders(run)).toEqual([1]);
    const captions = restartCaptions(run);
    expect(captions.length).toBeGreaterThan(0);
    expect(captions.some((c) => c.includes('nothing to send') && c.includes('order 1'))).toBe(true);
  });

  it('with an outbox the restart caption makes no such claim', () => {
    const run = runOutbox(outboxSetupOf({ ...initialOutbox(), fault: 'after-commit' }));
    expect(unpublishedOrders(run)).toEqual([]);
    expect(restartCaptions(run).every((c) => !c.includes('nothing to send'))).toBe(true);
  });
});
