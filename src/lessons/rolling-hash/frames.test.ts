import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { chunkCaption, searchFrames, spuriousByModulus } from './frames';
import { CHUNK_TEXT, chunksOf, compareChunks, hashDirect, MODULI, naiveComparisons, PRESETS, rabinKarp, valuesOf } from './model';

const text = (f: { say?: unknown }) => captionText(f.say as never);

describe('searchFrames', () => {
  it('every preset × modulus: the closing caption states the run\'s own counts', () => {
    for (const p of PRESETS) for (const m of MODULI) {
      const fr = searchFrames(p.text, p.pattern, m);
      const run = rabinKarp(p.text, p.pattern, m);
      const last = fr[fr.length - 1];
      const say = text(last);
      expect(say).toContain(`${run.matches.length} match`);
      expect(say).toContain(`${run.spurious.length} spurious hit`);
      expect(say).toContain(`a naïve scan makes ${naiveComparisons(p.text, p.pattern)}`);
      expect(last.matches).toEqual(run.matches);
      expect(last.spurious).toEqual(run.spurious);
      expect(last.rolls).toBe(run.rolls);
      expect(last.verifyChars).toBe(run.verifyChars);
    }
  });

  it('says "spurious" exactly on the frames where verification failed, and "real match" exactly on confirmed ones', () => {
    for (const p of PRESETS) for (const m of MODULI) {
      const fr = searchFrames(p.text, p.pattern, m);
      const run = rabinKarp(p.text, p.pattern, m);
      const spuriousAt = fr.filter((f) => text(f).includes('a spurious hit')).map((f) => f.s);
      const matchAt = fr.filter((f) => text(f).includes('a real match')).map((f) => f.s);
      expect(spuriousAt).toEqual(run.spurious);
      expect(matchAt).toEqual(run.matches);
    }
  });

  it('every slide caption\'s hash equals hashing that window from scratch', () => {
    const p = PRESETS[1];
    for (const m of MODULI) {
      for (const f of searchFrames(p.text, p.pattern, m)) {
        if (f.s === null || f.hash === null || f.done) continue;
        expect(f.hash).toBe(hashDirect(valuesOf(p.text.slice(f.s, f.s + p.pattern.length)), m));
      }
    }
  });

  it('a pattern longer than the text says so', () => {
    expect(text(searchFrames('ab', 'abc', 101n)[0])).toContain('longer than the text');
  });

  it('backs the try-this numbers', () => {
    expect(spuriousByModulus(PRESETS[0].text, PRESETS[0].pattern).map((o) => o.spurious)).toEqual([3, 2, 0]);
    expect(rabinKarp(PRESETS[1].text, PRESETS[1].pattern, 101n).matches.slice(0, 2)).toEqual([1, 3]);
  });
});

describe('chunkCaption', () => {
  it('states the comparison for every insertion point, and the "within a window" claim holds', () => {
    for (let at = 0; at <= CHUNK_TEXT.length; at++) {
      const c = compareChunks(CHUNK_TEXT, at);
      const edited = CHUNK_TEXT.slice(0, at) + 'X' + CHUNK_TEXT.slice(at);
      const before = new Set(chunksOf(CHUNK_TEXT, c.before));
      const after = chunksOf(edited, c.after);
      const reused = after.filter((x) => before.has(x)).length;
      const say = captionText(chunkCaption(at, c.keptBefore, c.shiftedAfter, c.changed, reused, after.length, after.length - reused));
      expect(say).toContain(`${c.keptBefore} cut`);
      expect(say.includes('No cut appeared or vanished')).toBe(c.changed === 0);
      expect(say).toContain(`${reused} of ${after.length} chunk`);
      // Cuts entirely before the insert are all kept.
      expect(c.keptBefore).toBe(c.before.filter((x) => x <= at).length);
    }
  });
});
