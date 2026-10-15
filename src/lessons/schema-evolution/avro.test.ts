import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, pick, type Rnd } from '../../core/random';
import {
  ATYPES, LESSON_HISTORY, MODES, NARROWING_HISTORY, PROMOTES_TO, PROMOTION_HISTORY, avroLines, checkPair, decodeWithWriter, encodeRecord, nameProblem, pairsToCheck, promotable, register,
  resolve, roundTrip, ruleProblems, sampleRecord, sampleValue, type AField, type AType, type ASchema, type Mode,
} from './avro';

const hex = (bytes: readonly number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
const one = (type: AType): ASchema => [{ name: 'x', type, hasDefault: false }];
const bytesOf = (type: AType, v: bigint | number | string | boolean) => hex(encodeRecord(one(type), { x: v }).bytes);

describe('the codec reproduces the specification', () => {
  it('long 3 is 06, long 64 is 80 01', () => {
    expect(bytesOf('long', 3n)).toBe('06');
    expect(bytesOf('long', 64n)).toBe('80 01');
  });

  it('int and long share the zigzag varint: 0, -1, 1, -2, 2 are 00, 01, 02, 03, 04', () => {
    expect([0n, -1n, 1n, -2n, 2n].map((v) => bytesOf('int', v))).toEqual(['00', '01', '02', '03', '04']);
    expect(bytesOf('long', -64n)).toBe('7f');
    expect(bytesOf('long', -65n)).toBe('81 01');
  });

  it('string "foo" is 06 66 6f 6f', () => {
    expect(bytesOf('string', 'foo')).toBe('06 66 6f 6f');
  });

  it('boolean is one byte, float is 4 little-endian bytes, double is 8', () => {
    expect(bytesOf('boolean', true)).toBe('01');
    expect(bytesOf('boolean', false)).toBe('00');
    expect(bytesOf('float', 1.5)).toBe('00 00 c0 3f');
    expect(bytesOf('double', 1.5)).toBe('00 00 00 00 00 00 f8 3f');
  });

  it('every type round-trips its sample, and a record is just its fields back to back', () => {
    for (const t of ATYPES) {
      const s = one(t);
      expect(decodeWithWriter(s, encodeRecord(s, sampleRecord(s)).bytes)).toEqual({ ok: true, value: sampleRecord(s) });
    }
    const all: ASchema = ATYPES.map((t) => ({ name: `f_${t}`, type: t, hasDefault: false }));
    const enc = encodeRecord(all, sampleRecord(all));
    expect(enc.segments.map((s) => s.field)).toEqual(all.map((f) => f.name));
    expect(enc.segments.at(-1)?.to).toBe(enc.bytes.length - 1);
    expect(decodeWithWriter(all, enc.bytes)).toEqual({ ok: true, value: sampleRecord(all) });
  });

  it('refuses truncated bytes, leftovers, an int outside 32 bits and a boolean that is neither 0 nor 1', () => {
    expect(decodeWithWriter(one('string'), [0x06, 0x66])).toMatchObject({ ok: false });
    expect(decodeWithWriter(one('int'), [0x06, 0x00])).toEqual({ ok: false, error: '1 bytes are left over after the last field' });
    expect(decodeWithWriter(one('int'), hex(encodeRecord(one('long'), { x: 2n ** 40n }).bytes).split(' ').map((h) => parseInt(h, 16)))).toMatchObject({ ok: false });
    expect(decodeWithWriter(one('boolean'), [2])).toMatchObject({ ok: false });
    expect(decodeWithWriter(one('float'), [0, 0])).toMatchObject({ ok: false });
  });
});

describe('resolution follows the specification', () => {
  it('the promotions are int to long, float, double; long to float, double; float to double, and nothing else', () => {
    const allowed = new Set(['int>long', 'int>float', 'int>double', 'long>float', 'long>double', 'float>double']);
    for (const a of ATYPES) for (const b of ATYPES) expect(promotable(a, b), `${a}>${b}`).toBe(allowed.has(`${a}>${b}`));
    expect(Object.values(PROMOTES_TO).flat()).toHaveLength(allowed.size);
  });

  it('an int written is read as a long, a float and a double with the same value', () => {
    const w = one('int');
    for (const t of ['long', 'float', 'double'] as const) expect(roundTrip(one(t), w, { x: 7n })).toEqual({ ok: true, value: { x: t === 'long' ? 7n : 7 } });
  });

  it('a long written is not read as an int, and a string is not read as a number', () => {
    expect(roundTrip(one('int'), one('long'))).toMatchObject({ ok: false });
    expect(roundTrip(one('long'), one('string'))).toMatchObject({ ok: false });
    expect(roundTrip(one('boolean'), one('int'))).toMatchObject({ ok: false });
  });

  it('a missing reader field takes its default, or fails without one', () => {
    const w: ASchema = [{ name: 'a', type: 'int', hasDefault: false }];
    const withDefault: ASchema = [...w, { name: 'b', type: 'string', hasDefault: true }];
    const without: ASchema = [...w, { name: 'b', type: 'string', hasDefault: false }];
    expect(roundTrip(withDefault, w)).toEqual({ ok: true, value: { a: 7n, b: '' } });
    expect(roundTrip(without, w)).toEqual({ ok: false, error: 'reader field b has no default and the writer did not write it' });
  });

  it('a field only the writer has is skipped, wherever it sits in the bytes', () => {
    const w: ASchema = [{ name: 'x', type: 'string', hasDefault: false }, { name: 'a', type: 'int', hasDefault: false }];
    const r: ASchema = [{ name: 'a', type: 'int', hasDefault: false }];
    expect(roundTrip(r, w)).toEqual({ ok: true, value: { a: 7n } });
  });

  it('resolve alone matches by name, not position', () => {
    const r: ASchema = [{ name: 'b', type: 'int', hasDefault: false }, { name: 'a', type: 'int', hasDefault: false }];
    expect(resolve(r, LESSON_HISTORY[2], { a: 1n, b: 2n })).toEqual({ ok: true, value: { b: 2n, a: 1n } });
  });
});

// ── An independent oracle: 200 seeded schema pairs ──────────────────────

const NAMES = ['a', 'b', 'c', 'd', 'e'];
function randomSchema(rnd: Rnd): ASchema {
  const names = NAMES.filter(() => rnd() < 0.6);
  return names.map((name): AField => ({ name, type: pick(ATYPES, rnd), hasDefault: rnd() < 0.5 }));
}

/** What a correct reader must hold, worked from the spec without touching the codec. */
function expectedRead(reader: ASchema, writer: ASchema): Record<string, unknown> | 'fail' {
  const out: Record<string, unknown> = {};
  for (const rf of reader) {
    const wf = writer.find((f) => f.name === rf.name);
    if (!wf) {
      if (!rf.hasDefault) return 'fail';
      out[rf.name] = rf.type === 'string' ? '' : rf.type === 'boolean' ? false : rf.type === 'int' || rf.type === 'long' ? 0n : 0;
    } else if (wf.type === rf.type) out[rf.name] = sampleValue(wf.type);
    else if (promotable(wf.type, rf.type)) out[rf.name] = rf.type === 'long' ? sampleValue(wf.type) : Math.fround(Number(sampleValue(wf.type)));
    else return 'fail';
  }
  return out;
}

describe('the rule-based checker agrees with the real round trip', () => {
  it('on 200 seeded random schema pairs, in verdict and in the values read', () => {
    const rnd = mulberry32(2024);
    let compatible = 0;
    for (let i = 0; i < 200; i++) {
      const reader = randomSchema(rnd);
      const writer = randomSchema(rnd);
      const real = roundTrip(reader, writer);
      const rules = ruleProblems(reader, writer);
      expect(rules.length === 0, `pair ${i}`).toBe(real.ok);
      const want = expectedRead(reader, writer);
      expect(want === 'fail', `pair ${i}`).toBe(!real.ok);
      if (real.ok && want !== 'fail') {
        compatible++;
        for (const f of reader) {
          const got = real.value[f.name];
          // A float is compared as the float it is: promoting a 3,000,000,000 long to float rounds it.
          expect(String(got), `pair ${i} field ${f.name}`).toBe(String(want[f.name]));
        }
      }
    }
    expect(compatible, 'the sample includes compatible pairs').toBeGreaterThan(20);
    expect(compatible, 'and incompatible ones').toBeLessThan(180);
  });

  /** The mistake the preset exists to expose: a checker that lets a missing field through whether or not it has a default. */
  const ignoresDefaults = (reader: ASchema, writer: ASchema) =>
    reader.filter((rf) => { const wf = writer.find((f) => f.name === rf.name); return wf && wf.type !== rf.type && !promotable(wf.type, rf.type); }).map((f) => f.name);

  it('a checker that ignores defaults disagrees with the round trip on the lesson preset (v3 reading v1)', () => {
    const [v1, , v3] = LESSON_HISTORY;
    expect(ignoresDefaults(v3, v1)).toEqual([]);
    expect(roundTrip(v3, v1).ok).toBe(false);
    expect(ruleProblems(v3, v1)).toEqual(['b has no default and the writer lacks it']);
  });
});

describe('the registry modes', () => {
  const accepted = (mode: Mode, history: readonly ASchema[], n: number) => register(mode, history, n).accepted;

  it('lists the pairs each mode checks', () => {
    expect(pairsToCheck('NONE', 2)).toEqual([]);
    expect(pairsToCheck('BACKWARD', 2)).toEqual([{ reader: 2, writer: 1 }]);
    expect(pairsToCheck('FORWARD', 2)).toEqual([{ reader: 1, writer: 2 }]);
    expect(pairsToCheck('FULL', 2)).toEqual([{ reader: 2, writer: 1 }, { reader: 1, writer: 2 }]);
    expect(pairsToCheck('BACKWARD_TRANSITIVE', 2)).toEqual([{ reader: 2, writer: 0 }, { reader: 2, writer: 1 }]);
    expect(pairsToCheck('FORWARD_TRANSITIVE', 2)).toEqual([{ reader: 0, writer: 2 }, { reader: 1, writer: 2 }]);
    expect(pairsToCheck('FULL_TRANSITIVE', 2)).toHaveLength(4);
    expect(pairsToCheck('BACKWARD_TRANSITIVE', 0)).toEqual([]);
  });

  it('the lesson example: v3 passes plain BACKWARD (against v2) and fails BACKWARD_TRANSITIVE (against v1)', () => {
    expect(accepted('BACKWARD', LESSON_HISTORY, 2)).toBe(true);
    expect(accepted('BACKWARD_TRANSITIVE', LESSON_HISTORY, 2)).toBe(false);
    const failing = register('BACKWARD_TRANSITIVE', LESSON_HISTORY, 2).checks.filter((c) => c.problems.length);
    expect(failing).toHaveLength(1);
    expect(failing[0]).toMatchObject({ reader: 2, writer: 0 });
    expect(failing[0].real).toMatchObject({ ok: false });
    expect(failing[0].agree).toBe(true);
  });

  it('the lesson example under every mode, worked by hand', () => {
    // v2 adds b with a default: every mode accepts it. v3 makes b required: only a reader that never meets v1 data is safe.
    const v2 = Object.fromEntries(MODES.map((m) => [m, accepted(m, LESSON_HISTORY, 1)]));
    expect(Object.values(v2).every(Boolean)).toBe(true);
    expect(Object.fromEntries(MODES.map((m) => [m, accepted(m, LESSON_HISTORY, 2)]))).toEqual({
      NONE: true,
      BACKWARD: true,
      FORWARD: true,
      FULL: true,
      BACKWARD_TRANSITIVE: false,
      FORWARD_TRANSITIVE: true,
      FULL_TRANSITIVE: false,
    });
  });

  it('narrowing a long to an int is refused by any mode that has the new version read the old data', () => {
    expect(accepted('BACKWARD', NARROWING_HISTORY, 1)).toBe(false);
    expect(accepted('FORWARD', NARROWING_HISTORY, 1)).toBe(true);
    expect(accepted('FULL', NARROWING_HISTORY, 1)).toBe(false);
  });

  it('widening is backward compatible and not forward compatible', () => {
    expect(accepted('BACKWARD', PROMOTION_HISTORY, 1)).toBe(true);
    expect(accepted('FORWARD', PROMOTION_HISTORY, 1)).toBe(false);
  });

  it('on 100 seeded histories: NONE accepts, FULL is BACKWARD and FORWARD, transitive is a brute-force check of every earlier version', () => {
    const rnd = mulberry32(77);
    for (let i = 0; i < 100; i++) {
      const history = Array.from({ length: randInt(2, 4, rnd) }, () => randomSchema(rnd));
      for (let n = 1; n < history.length; n++) {
        expect(accepted('NONE', history, n)).toBe(true);
        expect(accepted('FULL', history, n)).toBe(accepted('BACKWARD', history, n) && accepted('FORWARD', history, n));
        const earlier = history.slice(0, n);
        const brute = {
          back: earlier.every((old) => roundTrip(history[n], old).ok),
          fwd: earlier.every((old) => roundTrip(old, history[n]).ok),
        };
        expect(accepted('BACKWARD_TRANSITIVE', history, n), `h${i} v${n}`).toBe(brute.back);
        expect(accepted('FORWARD_TRANSITIVE', history, n), `h${i} v${n}`).toBe(brute.fwd);
        expect(accepted('FULL_TRANSITIVE', history, n), `h${i} v${n}`).toBe(brute.back && brute.fwd);
        if (accepted('BACKWARD_TRANSITIVE', history, n)) expect(accepted('BACKWARD', history, n)).toBe(true);
        for (const m of MODES) for (const c of register(m, history, n).checks) expect(c.agree).toBe(true);
      }
    }
  });
});

describe('what the learner may type', () => {
  const s: ASchema = [{ name: 'a', type: 'int', hasDefault: false }];
  it('accepts a lowercase name and refuses the rest with a reason', () => {
    expect(nameProblem('b', s)).toBeNull();
    expect(nameProblem('user_id2', s)).toBeNull();
    for (const bad of ['', 'A', '1a', 'a b', 'ünï', 'a'.repeat(21), '__proto__', 'a-b']) expect(nameProblem(bad, s), bad).not.toBeNull();
    expect(nameProblem('a', s)).toBe('a is already a field here.');
  });

  it('refuses a ninth field', () => {
    const full: ASchema = Array.from({ length: 8 }, (_, i) => ({ name: `f${i}`, type: 'int', hasDefault: false }));
    expect(nameProblem('extra', full)).toBe('At most 8 fields.');
  });

  it('an empty record is allowed and prints', () => {
    expect(roundTrip([], [])).toEqual({ ok: true, value: {} });
    expect(avroLines([])).toHaveLength(2);
    expect(checkPair([[], []], { reader: 0, writer: 1 }).agree).toBe(true);
  });

  it('prints a default into the schema text', () => {
    expect(avroLines(LESSON_HISTORY[1])[2]).toBe('  { "name": "b", "type": "int", "default": 0 }');
  });
});
