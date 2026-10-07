import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { tripFrames, verdictCaption } from './frames';
import { DEFAULT_ORDER, deliver, parseOrder, randomKey, type TagKind } from './model';

const order = (t: string) => {
  const r = parseOrder(t);
  if (!r.ok) throw new Error(r.error);
  return r.order;
};

describe('tripFrames', () => {
  it('walks the full tag × channel cross product to the right verdict', async () => {
    const key = randomKey();
    const want: Record<string, string> = {
      'hmac:false': 'accepted',
      'hmac:true': 'Rejected',
      'hash:false': 'accepted',
      'hash:true': 'forged',
    };
    for (const kind of ['hmac', 'hash'] as TagKind[]) {
      for (const tamper of [false, true]) {
        const d = (await deliver(kind, key, order(DEFAULT_ORDER), tamper))!;
        const frames = tripFrames(d, tamper);
        expect(frames.map((f) => f.phase)).toEqual([0, 1, 2, 3, 4]);
        const last = text(frames.at(-1)!.say);
        expect(last).toContain(want[`${kind}:${tamper}`]);
        if (kind === 'hmac' && tamper) expect(last).toMatch(/\d+ of 32 bytes differ/);
        if (!(kind === 'hash' && tamper)) expect(last).not.toContain('forged');
        const channel = text(frames[2].say);
        if (tamper) expect(channel).toContain('1000');
        else expect(channel).toBe('Nobody in the channel touches it.');
      }
    }
  });

  it('says so when the editor finds no amount to change, instead of claiming an edit', async () => {
    // A unicode-escaped key is still "amount" to JSON, but not to the editor's search.
    const d = (await deliver('hmac', randomKey(), order('{"\\u0061mount": 5}'), true))!;
    expect(d.edit).toBeNull();
    expect(text(tripFrames(d, true)[2].say)).toContain('can\'t find one, so it changes nothing');
    expect(text(verdictCaption(d, true))).toContain('nothing was changed');
  });
});
