import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  canaryChanged, changedSlots, FRAME_BYTES, initialFrame, le64, MAX_NAME_BYTES, NO_DEFENCES, parseName, PRESETS, runLayout, rustCopy, stackRun,
  writeString, type DefenceId, type Defences,
} from './model';

const enc = (t: string) => new TextEncoder().encode(t);
const IDS: DefenceId[] = ['memorySafe', 'boundsCheck', 'canary', 'nx', 'aslr'];
/** All 32 defence combinations. */
const COMBOS: Defences[] = Array.from({ length: 32 }, (_, m) => Object.fromEntries(IDS.map((id, i) => [id, Boolean(m & (1 << i))])) as Defences);
/** Seeded random printable input of n bytes (no NUL inside, as a C string). */
const randomInput = (n: number, seed: number) => {
  const rnd = mulberry32(seed);
  return Uint8Array.from({ length: n }, () => randInt(0x20, 0x7e, rnd));
};

describe('le64', () => {
  it('matches DataView little-endian for addresses in range', () => {
    for (const v of [0, 1, 0x1189, 0x7fffffffe0c0, 0x555555555189, 2 ** 53 - 1]) {
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt(v), true);
      expect(le64(v)).toEqual(Array.from(new Uint8Array(dv.buffer)));
    }
  });
});

describe('writeString', () => {
  const frame = initialFrame(runLayout(false, 1), true);

  it('unchecked (strcpy): writes len + 1 bytes and overflows by max(0, len + 1 - 8), for every allowed length', () => {
    for (let len = 0; len <= MAX_NAME_BYTES; len++) {
      const input = randomInput(len, len + 7);
      const r = writeString(frame, input, { boundsCheck: false });
      expect(r.overflow).toBe(Math.max(0, len + 1 - 8));
      expect(r.written).toBe(len + 1);
      // Reference: build the expected frame byte by byte.
      const expected = Array.from(frame);
      for (let i = 0; i < len; i++) expected[i] = input[i];
      expected[len] = 0;
      expect(Array.from(r.bytes)).toEqual(expected);
    }
  });

  it('bounds-checked (snprintf): never changes a byte past the buffer, and NUL-terminates', () => {
    for (let len = 0; len <= MAX_NAME_BYTES; len++) {
      const input = randomInput(len, len + 99);
      const r = writeString(frame, input, { boundsCheck: true });
      expect(r.overflow).toBe(0);
      expect(Array.from(r.bytes.subarray(8))).toEqual(Array.from(frame.subarray(8)));
      const kept = Math.min(len, 7);
      expect(Array.from(r.bytes.subarray(0, kept))).toEqual(Array.from(input.subarray(0, kept)));
      expect(r.bytes[kept]).toBe(0);
    }
  });

  it('does not touch the frame it was given', () => {
    const copy = frame.slice();
    writeString(frame, enc('Grace Hopper'), { boundsCheck: false });
    expect(frame).toEqual(copy);
  });
});

describe('rustCopy', () => {
  it('panics at index 8 exactly when the input is longer than 8 bytes, and never writes past name', () => {
    const frame = initialFrame(runLayout(false, 1), false);
    for (let len = 0; len <= MAX_NAME_BYTES; len++) {
      const r = rustCopy(frame, randomInput(len, len));
      expect(r.panicAt).toBe(len > 8 ? 8 : null);
      expect(Array.from(r.bytes.subarray(8))).toEqual(Array.from(frame.subarray(8)));
    }
  });
});

describe('canary check', () => {
  it('fires if and only if some canary byte differs (every subset of the 8 bytes)', () => {
    const before = initialFrame(runLayout(false, 3), true);
    for (let mask = 0; mask < 256; mask++) {
      const after = before.slice();
      for (let i = 0; i < 8; i++) if (mask & (1 << i)) after[8 + i] ^= 0x5a;
      expect(canaryChanged(before, after)).toBe(mask !== 0);
    }
  });

  it('ignores changes outside the canary', () => {
    const before = initialFrame(runLayout(false, 3), true);
    const after = before.slice();
    after[0] ^= 1;
    after[20] ^= 1;
    expect(canaryChanged(before, after)).toBe(false);
  });

  it('in a full run: aborted exactly when the canary is on, nothing earlier stops the copy, and its bytes changed', () => {
    for (let len = 0; len <= MAX_NAME_BYTES; len += 3) {
      for (const d of COMBOS) {
        for (const seed of [1, 2, 3]) {
          const run = stackRun(randomInput(len, len * 31 + seed), d, seed);
          const differs = run.before.subarray(8, 16).some((b, i) => b !== run.after[8 + i]);
          expect(run.kind === 'aborted').toBe(d.canary && !d.memorySafe && !d.boundsCheck && differs);
        }
      }
    }
  });

  it("glibc-style canary: its lowest byte is zero, so an off-by-one NUL doesn't change it", () => {
    for (const seed of [1, 2, 3, 4]) expect(runLayout(false, seed).canary[0]).toBe(0);
    const run = stackRun(enc('Margaret'), { ...NO_DEFENCES, canary: true }, 1);
    expect(run.wouldOverflow).toBe(1);
    expect(run.changed).toEqual([]);
    expect(run.kind).toBe('quiet');
  });
});

describe('defence order', () => {
  const long = enc(PRESETS[2].text);
  const expectedKind: Record<string, string> = { memorySafe: 'panic', boundsCheck: 'truncated', canary: 'aborted', nx: 'corrupted', aslr: 'corrupted', none: 'corrupted' };

  it('for an overflow that reaches the return address, the outcome comes from the first enabled defence in the fixed order', () => {
    for (const d of COMBOS) {
      const first = IDS.find((id) => d[id]);
      const run = stackRun(long, d, 5);
      expect(run.by).toBe(first);
      expect(run.kind).toBe(expectedKind[first ?? 'none']);
    }
  });

  it('a name that fits is "fits" whatever is switched on', () => {
    for (const d of COMBOS) expect(stackRun(enc('Ada'), d, 1).kind).toBe('fits');
  });
});

describe('hand-worked cases', () => {
  it('the presets are 3, 12 and 40 characters', () => {
    expect(PRESETS.map((p) => p.text.length)).toEqual([3, 12, 40]);
  });

  it('Grace Hopper: 13 bytes, 5 past the buffer, only into the slot above name', () => {
    const off = stackRun(enc('Grace Hopper'), NO_DEFENCES, 1);
    expect(off.written).toBe(13);
    expect(off.wouldOverflow).toBe(5);
    expect(off.changed).toEqual(['canary']);
    expect(off.kind).toBe('quiet');
    expect(stackRun(enc('Grace Hopper'), { ...NO_DEFENCES, canary: true }, 1).kind).toBe('aborted');
  });

  it('the 40-character name reaches the saved rbp, the return address and main\'s frame', () => {
    const run = stackRun(enc(PRESETS[2].text), NO_DEFENCES, 1);
    expect(run.wouldOverflow).toBe(33);
    expect(run.changed).toEqual(['canary', 'rbp', 'ret', 'caller']);
    expect(run.kind).toBe('corrupted');
  });

  it('changedSlots compares slot by slot', () => {
    const before = new Uint8Array(FRAME_BYTES);
    const after = before.slice();
    after[24] = 1;
    expect(changedSlots(before, after)).toEqual(['ret']);
  });
});

describe('ASLR', () => {
  it('off: the same addresses every run; on: they change per run and stay 16-byte aligned', () => {
    const fixed = [1, 2, 3].map((s) => runLayout(false, s));
    expect(new Set(fixed.map((l) => l.frameAddr)).size).toBe(1);
    expect(new Set(fixed.map((l) => l.returnTo)).size).toBe(1);
    const random = [1, 2, 3, 4, 5].map((s) => runLayout(true, s));
    expect(new Set(random.map((l) => l.frameAddr)).size).toBe(5);
    expect(new Set(random.map((l) => l.returnTo)).size).toBe(5);
    for (const l of random) {
      expect(l.frameAddr % 16).toBe(0);
      expect(l.frameAddr).toBeLessThan(2 ** 47);
    }
  });

  it('the canary changes per run even with ASLR off', () => {
    expect(runLayout(false, 1).canary).not.toEqual(runLayout(false, 2).canary);
  });
});

describe('parseName (hostile input)', () => {
  it('accepts empty, spaces, markup, digits and a list with a gap as plain bytes', () => {
    for (const t of ['', '   ', '<b>Ada</b>', '12345678901234567890123', '1, 2, , 4', '-1', '1e400']) {
      const p = parseName(t);
      expect(p.ok).toBe(true);
      if (p.ok) expect(Array.from(p.bytes)).toEqual(Array.from(enc(t)));
    }
  });

  it('refuses more than 64 bytes, counting UTF-8', () => {
    expect(parseName('a'.repeat(64)).ok).toBe(true);
    expect(parseName('a'.repeat(65)).ok).toBe(false);
    const emoji = parseName('🙂'.repeat(17));
    expect(emoji.ok).toBe(false);
    if (!emoji.ok) expect(emoji.error).toContain('68 bytes');
  });

  it('refuses control characters', () => {
    expect(parseName('Ada\tLovelace').ok).toBe(false);
    expect(parseName('Ada\n').ok).toBe(false);
  });
});

describe('the 70% claim', () => {
  it('carries its source in index.tsx', () => {
    const src = Object.values(import.meta.glob<string>('./index.tsx', { query: '?raw', import: 'default', eager: true }))[0];
    expect(src).toContain('70%');
    expect(src).toMatch(/MSRC[^]*2019/);
    expect(src).toContain('Chromium');
  });
});
