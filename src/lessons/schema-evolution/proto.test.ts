import { describe, expect, it } from 'vitest';
import {
  BIG_QTY, CHANGES, REUSE_DIFF_CAUTION, DEFAULT_PARAMS, V1, V1_MESSAGE, crossBoth, decode, decodeJson, encode, encodeJson, evolve, jsonName, parseFieldNumber, protoLines,
  type ChangeId, type Verdict,
} from './proto';

const hex = (bytes: readonly number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');

describe('the encoder reproduces the published examples', () => {
  it('field 1 varint 150 is 08 96 01', () => {
    expect(hex(encode(V1, { id: 150n }).bytes)).toBe('08 96 01');
  });

  it('field 2 string "testing" is 12 07 74 65 73 74 69 6e 67', () => {
    expect(hex(encode(V1, { name: 'testing' }).bytes)).toBe('12 07 74 65 73 74 69 6e 67');
  });

  it('the whole v1 message is the three records in field order, qty 300 as ac 02', () => {
    expect(hex(encode(V1, V1_MESSAGE).bytes)).toBe('08 96 01 12 07 74 65 73 74 69 6e 67 18 ac 02');
  });

  it('a default value is not sent', () => {
    expect(encode(V1, { id: 0n, name: '' }).bytes).toEqual([]);
  });

  it('the schema prints as .proto lines, with a reserved line when there is one', () => {
    expect(protoLines(V1)).toEqual(['message Item {', '  int32 id = 1;', '  string name = 2;', '  int32 qty = 3;', '}']);
    expect(protoLines(evolve('remove', { ...DEFAULT_PARAMS, reserved: true }).schema!).at(-2)).toBe('  reserved 3;');
  });
});

describe('decoding', () => {
  it('round-trips a message with its own schema', () => {
    const d = decode(V1, encode(V1, V1_MESSAGE).bytes);
    expect(d).toEqual({ ok: true, values: { id: 150n, name: 'testing', qty: 300n }, unknown: [] });
  });

  it('cuts an int64 value to 32 bits when the reader says int32', () => {
    const wide = evolve('widen', DEFAULT_PARAMS);
    const d = decode(V1, encode(wide.schema!, wide.message).bytes);
    expect(d.ok && d.values.qty).toBe(300n);
    expect(BIG_QTY).toBe(4294967596n);
  });

  it('keeps a negative int32 intact through the 10-byte sign extension', () => {
    const s = { fields: [{ concept: 'x', name: 'x', number: 1, type: 'int32' as const }], reserved: [] };
    const e = encode(s, { x: -5n });
    expect(e.bytes.length).toBe(11);
    expect(decode(s, e.bytes)).toMatchObject({ ok: true, values: { x: -5n } });
  });

  it('refuses truncated bytes and invalid UTF-8 with a reason', () => {
    expect(decode(V1, [0x12, 0x07, 0x74])).toMatchObject({ ok: false });
    expect(decode(V1, [0x12, 0x01, 0xff])).toEqual({ ok: false, error: 'name is not valid UTF-8' });
  });
});

describe('the JSON mapping goes by name', () => {
  it('writes int32 as a number and int64 as a string, lowerCamelCase names', () => {
    expect(encodeJson(V1, V1_MESSAGE)).toBe('{"id":150,"name":"testing","qty":300}');
    const wide = evolve('widen', DEFAULT_PARAMS);
    expect(encodeJson(wide.schema!, wide.message)).toBe('{"id":150,"name":"testing","qty":"4294967596"}');
    expect(jsonName('first_name')).toBe('firstName');
  });

  it('reads by name, refusing or ignoring a name it does not know', () => {
    expect(decodeJson(V1, '{"id":1,"extra":2}', true)).toEqual({ ok: false, error: 'unknown field "extra"' });
    expect(decodeJson(V1, '{"id":1,"extra":2}', false)).toMatchObject({ ok: true, values: { id: 1n, name: '', qty: 0n }, ignored: ['extra'] });
  });

  it('refuses text that is not JSON, a non-integer, an out-of-range int32 and a number where a string belongs', () => {
    expect(decodeJson(V1, '{"id":', true)).toEqual({ ok: false, error: 'not valid JSON' });
    expect(decodeJson(V1, '{"id":1.5}', true)).toEqual({ ok: false, error: 'id is not an integer' });
    expect(decodeJson(V1, '{"id":2147483648}', true)).toEqual({ ok: false, error: '2147483648 does not fit in int32' });
    expect(decodeJson(V1, '{"name":5}', true)).toEqual({ ok: false, error: 'name is not a string' });
  });

  it('a prototype key in the JSON is just an unknown name', () => {
    const r = decodeJson(V1, '{"__proto__":{"id":9},"id":1}', true);
    expect(r).toEqual({ ok: false, error: 'unknown field "__proto__"' });
    expect(({} as Record<string, unknown>).id).toBeUndefined();
  });
});

describe('field numbers a learner may type', () => {
  const ok = (t: string) => parseFieldNumber(t, V1.fields).ok;
  it('accepts 1 to 2^29 - 1 outside the implementation range', () => {
    expect(ok('4')).toBe(true);
    expect(ok('18999')).toBe(true);
    expect(ok('20000')).toBe(true);
    expect(ok('536870911')).toBe(true);
  });

  it('refuses 0, the top plus one, the reserved range, duplicates and junk, each with a reason', () => {
    for (const bad of ['0', '536870912', '19000', '19999', '3', '1', '', '4.5', '1e3', '-2', 'abc']) {
      const r = parseFieldNumber(bad, V1.fields);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.length, bad).toBeGreaterThan(5);
    }
    expect(parseFieldNumber('3', V1.fields)).toEqual({ ok: false, error: '3 is already used by qty.' });
  });
});

type Row = { oldToNew: Verdict; newToOld: Verdict };
const row = (oldToNew: Verdict, newToOld: Verdict): Row => ({ oldToNew, newToOld });

/**
 * Worked by hand from the wire rules, one change at a time (not copied from the decoder).
 * Binary: a reader skips a field number it lacks, and also one whose wire type differs.
 */
const BINARY: Record<ChangeId, Row> = {
  add: row('ok', 'ok'),
  remove: row('ok', 'ok'),
  rename: row('ok', 'ok'),
  widen: row('ok', 'lossy'),
  'to-string': row('lossy', 'lossy'),
  renumber: row('lossy', 'lossy'),
  'reuse-same': row('lossy', 'lossy'),
  'reuse-diff': row('ok', 'ok'),
};
/** JSON by name; a strict parser refuses a name it lacks. */
const JSON_STRICT: Record<ChangeId, Row> = {
  add: row('ok', 'error'),
  remove: row('error', 'ok'),
  rename: row('error', 'error'),
  widen: row('ok', 'error'),
  'to-string': row('error', 'ok'),
  renumber: row('ok', 'ok'),
  'reuse-same': row('error', 'error'),
  'reuse-diff': row('error', 'error'),
};
const JSON_LENIENT: Record<ChangeId, Row> = {
  add: row('ok', 'ok'),
  remove: row('ok', 'ok'),
  rename: row('lossy', 'lossy'),
  widen: row('ok', 'error'),
  'to-string': row('error', 'ok'),
  renumber: row('ok', 'ok'),
  'reuse-same': row('ok', 'ok'),
  'reuse-diff': row('ok', 'ok'),
};

describe('every change in both directions matches the hand-worked table', () => {
  const verdicts = (c: ChangeId, format: 'binary' | 'json', strict: boolean) => {
    const { crossing } = crossBoth(c, DEFAULT_PARAMS, format, strict);
    return crossing ? row(crossing.oldToNew.verdict, crossing.newToOld.verdict) : null;
  };
  it.each(CHANGES.map((c) => c.id))('binary: %s', (c) => expect(verdicts(c, 'binary', true)).toEqual(BINARY[c]));
  it.each(CHANGES.map((c) => c.id))('JSON, strict parser: %s', (c) => expect(verdicts(c, 'json', true)).toEqual(JSON_STRICT[c]));
  it.each(CHANGES.map((c) => c.id))('JSON, ignoring unknown names: %s', (c) => expect(verdicts(c, 'json', false)).toEqual(JSON_LENIENT[c]));

  it('the strict switch changes only JSON, never the binary readings', () => {
    for (const { id } of CHANGES) {
      expect(crossBoth(id, DEFAULT_PARAMS, 'binary', true).crossing).toEqual(crossBoth(id, DEFAULT_PARAMS, 'binary', false).crossing);
    }
  });

  it('an unknown field is kept, never an error: the v1 reader of an added field', () => {
    const r = crossBoth('add', DEFAULT_PARAMS, 'binary', true).crossing!.newToOld;
    expect(r.unknown).toHaveLength(1);
    expect(r.unknown[0].field).toBe(4);
    expect(r.findings.some((f) => f.kind === 'unknown')).toBe(true);
  });

  it('reusing number 3 for another int32 reads old qty 300 as discount, with no error and no unknown field', () => {
    const r = crossBoth('reuse-same', DEFAULT_PARAMS, 'binary', true).crossing!.oldToNew;
    expect(r.verdict).toBe('lossy');
    expect(r.shown).toContain('discount: 300');
    expect(r.unknown).toEqual([]);
  });

  it('a lossy reading says why, from the decode: the widened qty is cut to 300', () => {
    const r = crossBoth('widen', DEFAULT_PARAMS, 'binary', true).crossing!.newToOld;
    expect(r.shown).toContain('qty: 300');
    expect(r.findings.find((f) => f.kind === 'lossy')?.text).toContain('does not fit in int32');
  });

  it('renaming changes no byte: the bytes of v1 and of the renamed schema are identical', () => {
    const renamed = evolve('rename', DEFAULT_PARAMS);
    expect(encode(renamed.schema!, renamed.message).bytes).toEqual(encode(V1, V1_MESSAGE).bytes);
    expect(encodeJson(renamed.schema!, renamed.message)).not.toBe(encodeJson(V1, V1_MESSAGE));
  });
});

describe('reserved numbers', () => {
  it('a reuse of a reserved number is refused with a reason, and nothing is read', () => {
    for (const c of ['reuse-same', 'reuse-diff'] as const) {
      const out = crossBoth(c, { ...DEFAULT_PARAMS, reserved: true }, 'binary', true);
      expect(out.crossing).toBeNull();
      expect(out.evolved.refusal).toContain('reserved');
    }
  });

  it('removing with reserved reads the same as removing without it: the line guards the future, not the bytes', () => {
    const a = crossBoth('remove', { ...DEFAULT_PARAMS, reserved: true }, 'binary', true).crossing;
    const b = crossBoth('remove', DEFAULT_PARAMS, 'binary', true).crossing;
    expect(a).toEqual(b);
  });
});

describe('reusing a number with another type', () => {
  const wireType = (schema: Parameters<typeof encode>[0], msg: Parameters<typeof encode>[1], concept: string) => {
    const { bytes, segments } = encode(schema, msg);
    const tag = segments.find((x) => x.concept === concept && x.role === 'tag')!;
    return bytes[tag.from] & 0b111;
  };

  it('is green in binary only because the wire types differ (0 for an int32, 2 for a string), so the lesson says so', () => {
    const v2 = evolve('reuse-diff', DEFAULT_PARAMS);
    expect(wireType(V1, V1_MESSAGE, 'qty')).toBe(0);
    expect(wireType(v2.schema!, v2.message, 'label')).toBe(2);
    const same = evolve('reuse-same', DEFAULT_PARAMS);
    expect(wireType(same.schema!, same.message, 'discount')).toBe(wireType(V1, V1_MESSAGE, 'qty'));
    expect(CHANGES.find((c) => c.id === 'reuse-diff')!.caution).toBe(REUSE_DIFF_CAUTION);
    expect(REUSE_DIFF_CAUTION).toContain('wire types differ');
    expect(REUSE_DIFF_CAUTION).toContain('reserved');
  });

  it('only that chip carries the caution', () => {
    expect(CHANGES.filter((c) => c.caution).map((c) => c.id)).toEqual(['reuse-diff']);
  });
});
