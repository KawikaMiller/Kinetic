import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { makeProof } from './passkey';
import { LOOKALIKE_HOST, REAL_HOST, frames, ladder, whoGetsIn, type Method, type Site } from './phish';

const combos: [Method, Site][] = [['totp', 'real'], ['totp', 'lookalike'], ['passkey', 'real'], ['passkey', 'lookalike']];

describe('the sign-in ladders, across all four combinations', () => {
  it('who gets in follows from the method and the site', () => {
    expect(whoGetsIn('totp', 'real')).toBe('you');
    expect(whoGetsIn('totp', 'lookalike')).toBe('attacker');
    expect(whoGetsIn('passkey', 'real')).toBe('you');
    expect(whoGetsIn('passkey', 'lookalike')).toBe('nobody');
  });

  it('the last message and caption say what happened', async () => {
    const proof = await makeProof();
    for (const [m, s] of combos) {
      const last = ladder(m, s, proof).at(-1)!;
      const text = expectCaption(frames(m, s, proof).at(-1)!.say);
      const who = whoGetsIn(m, s);
      expect(last.tone).toBe(who === 'attacker' ? 'bad' : 'ok');
      if (who === 'attacker') expect(text).toContain('signed in as you');
      if (who === 'nobody') expect(text).toContain('no credential');
      if (who === 'you') expect(/Accepted|Verified/.test(text)).toBe(true);
    }
  });

  it('only a phishable method ever passes a credential from the look-alike to the real site', async () => {
    const proof = await makeProof();
    for (const [m, s] of combos) {
      const relays = ladder(m, s, proof).filter((x) => x.from === 'fake' && x.to === 'real');
      expect(relays.length > 0).toBe(m === 'totp' && s === 'lookalike');
    }
  });

  it('each frame has its own strict caption, and the signature shown is the real one', async () => {
    const proof = (await makeProof())!;
    for (const [m, s] of combos) for (const f of frames(m, s, proof)) expectCaption(f.say);
    expect(ladder('passkey', 'real', proof).some((x) => x.label.includes(proof.signatureHex.slice(0, 8)))).toBe(true);
  });

  it('messages only use the four actors, and the hosts are the fictional ones', () => {
    for (const [m, s] of combos) {
      for (const x of ladder(m, s, null)) {
        expect(['you', 'device', 'real', 'fake']).toContain(x.from);
        expect(['you', 'device', 'real', 'fake']).toContain(x.to as string);
      }
    }
    expect(REAL_HOST).toBe('shop.example');
    expect(LOOKALIKE_HOST).toBe('shop-example.test');
  });
});
