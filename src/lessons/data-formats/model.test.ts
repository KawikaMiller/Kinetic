import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  EDITS, PITFALLS, SAMPLE, SAMPLE_TEXT, changedPaths, parseCsv, parseJson, resolveYaml11, toCsv, toXml, toYaml, unsafeNumberPaths,
  validateUsers, writeCsv, xmlEscape, type Json,
} from './model';

const edit = (id: string) => EDITS.find((e) => e.id === id)!.text;

describe('JSON is the real JSON.parse', () => {
  it('loses precision past 2^53, the documented way', () => {
    expect((JSON.parse('{"id":9007199254740993}') as { id: number }).id).toBe(9007199254740992);
    const parsed = parseJson(edit('bigid'));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(unsafeNumberPaths(parsed.value)).toEqual(new Set(['0.id']));
    expect(unsafeNumberPaths(SAMPLE)).toEqual(new Set());
  });

  it('reports a trailing comma with the line it is on', () => {
    const parsed = parseJson(edit('trailing'));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatch(/JSON/);
    expect(parsed.line).not.toBeNull();
    const lines = edit('trailing').split('\n');
    // the engine points at the character after the comma: the comma's line or the next one
    expect([lines[parsed.line!], lines[parsed.line! - 1]].some((l) => l.includes('"price": 20,'))).toBe(true);
  });

  it('finds exactly the leaf that changed', () => {
    const next = JSON.parse(SAMPLE_TEXT.replace('"London"', '"Paris"')) as Json;
    expect(changedPaths(SAMPLE, next)).toEqual(new Set(['0.address.city']));
    expect(changedPaths(null, SAMPLE)).toEqual(new Set());
  });
});

describe('CSV follows RFC 4180', () => {
  it('parses quoted commas, doubled quotes, CRLF and line breaks inside quotes', () => {
    expect(parseCsv('a,"b, c",d')).toEqual([['a', 'b, c', 'd']]);
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', 'x']]);
    expect(parseCsv('h1,h2\r\n1,"two\r\nlines"\r\n3,4\r\n')).toEqual([['h1', 'h2'], ['1', 'two\r\nlines'], ['3', '4']]);
    expect(parseCsv('a,b\n1,"x\ny"')).toEqual([['a', 'b'], ['1', 'x\ny']]);
    expect(parseCsv('a,,c\n,,')).toEqual([['a', '', 'c'], ['', '', '']]);
  });

  it('round-trips random fields full of commas, quotes and line breaks', () => {
    const rnd = mulberry32(7);
    const alphabet = ['a', 'b', ',', '"', '\n', '\r\n', ' ', 'é'];
    for (let n = 0; n < 500; n++) {
      const rows = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () =>
        Array.from({ length: 1 + Math.floor(rnd() * 4) }, () =>
          Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('')));
      expect(parseCsv(writeCsv(rows))).toEqual(rows);
    }
  });

  it('flattens the sample into columns and marks what CSV lost', () => {
    const table = toCsv(SAMPLE)!;
    expect(table.header).toEqual(['id', 'name', 'age', 'tags', 'address.city', 'address.country', 'joined', 'price']);
    expect(table.lossy).toEqual([{ column: 'tags', why: 'list' }, { column: 'address.city', why: 'nested' }, { column: 'address.country', why: 'nested' }]);
    const rows = parseCsv(table.text);
    expect(rows[1]).toEqual(['101', 'Ada Lovelace', '36', 'admin;math', 'London', 'GB', '2026-03-08', '12.5']);
    expect(table.lines[3].text).toContain('"Smith, Jane"');
    expect(toCsv({ not: 'a list' })).toBeNull();
  });
});

describe('YAML 1.1 scalar resolution', () => {
  it('reads the classic pitfalls the way YAML 1.1 parsers do', () => {
    expect(resolveYaml11('NO')).toEqual({ type: 'bool', value: false });
    expect(resolveYaml11('yes')).toEqual({ type: 'bool', value: true });
    expect(resolveYaml11('on')).toEqual({ type: 'bool', value: true });
    expect(resolveYaml11('1.10')).toEqual({ type: 'float', value: 1.1 });
    expect(resolveYaml11('012')).toEqual({ type: 'int', value: 10 });
    expect(resolveYaml11('0x1F')).toEqual({ type: 'int', value: 31 });
    expect(resolveYaml11('2026-03-08').type).toBe('timestamp');
    expect(resolveYaml11('~').type).toBe('null');
    expect(resolveYaml11('Oslo')).toEqual({ type: 'str', value: 'Oslo' });
    expect(resolveYaml11('Norway').type).toBe('str');
  });

  it('the emitter quotes every string a YAML 1.1 parser would misread', () => {
    const yaml = toYaml(SAMPLE).map((l) => l.text);
    expect(yaml).toContain('    country: "NO"');
    expect(yaml).toContain('  joined: "2026-03-08"');
    expect(yaml).toContain('- id: 101');
    expect(yaml).toContain('  name: Smith, Jane');
    expect(yaml).toContain('  tags: []');
    for (const s of ['yes', 'off', '1.0', '007', 'true', '', 'a: b', '- item', 'x #y', 'plain text', 'O\'Brien']) {
      const [line] = toYaml({ k: s }).map((l) => l.text);
      const scalar = line.slice('k: '.length);
      if (scalar.startsWith('"')) expect(JSON.parse(scalar)).toBe(s);
      else expect(resolveYaml11(scalar)).toEqual({ type: 'str', value: s });
    }
  });

  it('shows indentation as structure', () => {
    expect(toYaml({ address: { city: 'Oslo' } }).map((l) => l.text)).toEqual(['address:', '  city: Oslo']);
    expect(toYaml({ address: null, city: 'Oslo' }).map((l) => l.text)).toEqual(['address: null', 'city: Oslo']);
  });
});

describe('XML emitter', () => {
  it('escapes markup and offers attributes or elements', () => {
    expect(xmlEscape('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
    const user = [{ id: 1, name: 'A & B', tags: ['x'] }];
    expect(toXml(user).map((l) => l.text.trim())).toEqual([
      '<?xml version="1.0" encoding="UTF-8"?>', '<users>', '<user>', '<id>1</id>', '<name>A &amp; B</name>', '<tags>', '<tag>x</tag>', '</tags>', '</user>', '</users>',
    ]);
    expect(toXml(user, { attributes: true })[2].text.trim()).toBe('<user id="1" name="A &amp; B">');
  });

  it('tags each value line with its JSON path, in every format', () => {
    const paths = (lines: { paths: string[] }[]) => new Set(lines.flatMap((l) => l.paths));
    for (const lines of [toYaml(SAMPLE), toXml(SAMPLE)]) expect(paths(lines)).toContain('2.address.country');
    expect(toCsv(SAMPLE)!.lines[1].paths).toContain('0.address.city');
  });
});

describe('parse, then validate', () => {
  it('passes the sample and catches age: "thirty", which is still valid JSON', () => {
    expect(validateUsers(SAMPLE)).toEqual([]);
    const parsed = parseJson(edit('thirty'));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(validateUsers(parsed.value)).toEqual([{ path: '0.age', message: 'expected a number, got "thirty"' }]);
  });
});

describe('pitfall cards are computed, not typed', () => {
  const get = (id: string) => PITFALLS.find((p) => p.id === id)!;
  it('show the real results', () => {
    expect(get('csv-comma').before.lines[2]).toMatch(/^4 columns/);
    expect(get('csv-comma').after.lines[2]).toMatch(/^3 columns/);
    expect(get('csv-newline').before.lines.at(-1)).toMatch(/^4 rows/);
    expect(get('csv-newline').after.lines.at(-1)).toMatch(/^3 rows/);
    expect(get('json-bigid').before.lines[1]).toBe('→ id = 9007199254740992');
    expect(get('json-undefined').before.lines[0]).toBe('→ {"name":"Ada"}');
    expect(get('json-dates').before.lines[1]).toMatch(/is a string/);
    expect(get('yaml-norway').before.lines[1]).toBe('→ bool false');
    expect(get('yaml-norway').before.lines[3]).toBe('→ float 1.1');
    expect(get('json-trailing').before.lines[1]).toMatch(/SyntaxError: .+/);
  });
});

describe('numbers that do not survive JSON.parse', () => {
  it('flags big integers and Infinity, not ordinary numbers', () => {
    const parsed = parseJson('[{"id": 9007199254740993, "price": 1e400, "age": 36, "rate": 0.5}]');
    if (!parsed.ok) throw new Error('should parse');
    expect(unsafeNumberPaths(parsed.value)).toEqual(new Set(['0.id', '0.price']));
  });
  it('the indentation card shows YAML a learner would really write', () => {
    const card = PITFALLS.find((p) => p.id === 'yaml-indent')!;
    expect(card.before.lines.slice(0, 2)).toEqual(['address:', 'city: Oslo']);
    expect(card.before.lines[2]).toContain('address is null');
  });
});
