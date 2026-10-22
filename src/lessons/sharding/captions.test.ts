import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { buildFrames } from './frames';

describe('write captions', () => {
  it('outside a run that stays on one shard, every order after the first has a caption naming how many orders have landed', () => {
    const { frames } = buildFrames('hash', 'user', false);
    const writes = frames.filter((f) => f.phase === 'write' && f.incoming !== null);
    expect(writes.length).toBeGreaterThan(5);
    writes.slice(1).forEach((f, i) => {
      expect(captionText(f.say), `order ${i + 2}`).toContain(`After ${i + 2} orders`);
    });
  });
});
