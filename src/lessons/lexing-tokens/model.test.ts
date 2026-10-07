import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { lexFrames } from './frames';
import { PRESETS, checkSource, errorAt, kept, lex, scans, type Kind, type Token } from './model';

/**
 * The reference: an ordered list of regex rules. At each position every rule is tried,
 * the longest match wins, and a tie goes to the rule listed first. No DFA involved.
 */
function referenceLex(source: string, keywordsFirst = true): Token[] {
  const keyword: [Kind, RegExp] = ['KEYWORD', /(?:let|fn|if|then|else|true|false)/y];
  const ident: [Kind, RegExp] = ['IDENT', /[A-Za-z_][A-Za-z0-9_]*/y];
  const rules: [Kind, RegExp][] = [
    ['WS', /[ \t\n]+/y],
    ['COMMENT', /\/\/[^\n]*/y],
    ['NUMBER', /[0-9]+(?:\.[0-9]+)?/y],
    ...(keywordsFirst ? [keyword, ident] : [ident, keyword]),
    ['STRING', /"[^"\n]*"/y],
    ['OP', /\+\+|[-+*/^=]/y],
    ['LPAREN', /\(/y],
    ['RPAREN', /\)/y],
  ];
  const out: Token[] = [];
  let pos = 0;
  while (pos < source.length) {
    let best: { kind: Kind; len: number } | null = null;
    for (const [kind, re] of rules) {
      re.lastIndex = pos;
      const m = re.exec(source);
      if (m && m[0].length > 0 && (!best || m[0].length > best.len)) best = { kind, len: m[0].length };
    }
    if (!best) {
      const err = errorAt(source, pos);
      out.push(err);
      pos = err.end;
      continue;
    }
    const before = source.slice(0, pos).split('\n');
    out.push({ kind: best.kind, text: source.slice(pos, pos + best.len), start: pos, end: pos + best.len, line: before.length, col: Array.from(before[before.length - 1]).length + 1 });
    pos += best.len;
  }
  return out;
}

const brief = (ts: Token[]) => ts.map((t) => `${t.kind}:${t.text}`);

describe('the lexer against the reference tokenizer', () => {
  it.each(PRESETS.map((p) => [p.id, p.source] as const))('agrees on the %s preset, both rule orders', (_, src) => {
    expect(lex(src)).toEqual(referenceLex(src));
    expect(lex(src, { keywordsFirst: false })).toEqual(referenceLex(src, false));
  });

  it('agrees on 500 seeded random lines over the language alphabet', () => {
    const rnd = mulberry32(2026);
    const pieces = ['let', 'fn', 'if', 'iffy', 'then', 'else', 'true', 'x', 'total_2', '_a', '42', '3', '.', '14', '+', '++', '-', '*', '/', '//', '^', '=', '(', ')', '"', 'hi', ' ', '  ', '\t', '\n', '#', 'é', '😀', '<b>'];
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rnd() * 14);
      const src = Array.from({ length: n }, () => pieces[Math.floor(rnd() * pieces.length)]).join('');
      expect(lex(src)).toEqual(referenceLex(src));
      expect(lex(src, { keywordsFirst: false })).toEqual(referenceLex(src, false));
    }
  });
});

describe('maximal munch cases the lesson shows', () => {
  it('a+++b lexes as a, ++, +, b', () => {
    expect(brief(kept(lex('a+++b')))).toEqual(['IDENT:a', 'OP:++', 'OP:+', 'IDENT:b']);
  });

  it('iffy is one identifier, and if alone is a keyword', () => {
    expect(brief(kept(lex('iffy = 1')))).toEqual(['IDENT:iffy', 'OP:=', 'NUMBER:1']);
    expect(brief(kept(lex('if')))).toEqual(['KEYWORD:if']);
  });

  it('with the identifier rule first, if lexes as an identifier', () => {
    expect(brief(kept(lex('if x then 1', { keywordsFirst: false })))).toEqual(['IDENT:if', 'IDENT:x', 'IDENT:then', 'NUMBER:1']);
  });

  it('3.14.15: the number stops at the second dot, which is an error at line 1 column 9', () => {
    const t = kept(lex('x = 3.14.15'));
    expect(brief(t)).toEqual(['IDENT:x', 'OP:=', 'NUMBER:3.14', 'ERROR:.', 'NUMBER:15']);
    expect(t[3]).toMatchObject({ line: 1, col: 9, message: 'unexpected character "."' });
  });

  it('n = 3.x reads 3, ., x, dies, and gives two characters back', () => {
    const s = scans('n = 3.x').find((x) => x.token.text === '3')!;
    expect(s.steps.map((st) => st.state)).toEqual(['int', 'dot', null]);
    expect(s.givenBack).toBe(2);
  });

  it('an unterminated string is one error to the end of its line', () => {
    const t = lex('say "oops\nx');
    expect(t[2]).toMatchObject({ kind: 'ERROR', text: '"oops', line: 1, col: 5, message: 'string never closed' });
    expect(t[4]).toMatchObject({ kind: 'IDENT', text: 'x', line: 2, col: 1 });
  });

  it('error tokens carry 1-based line and column, counting characters', () => {
    const t = lex('a\n  😀 #');
    expect(t.filter((x) => x.kind === 'ERROR').map((x) => [x.text, x.line, x.col])).toEqual([['😀', 2, 3], ['#', 2, 5]]);
  });

  it('a lexer does not check grammar: 1 + + 2 lexes fine', () => {
    expect(brief(kept(lex('1 + + 2')))).toEqual(['NUMBER:1', 'OP:+', 'OP:+', 'NUMBER:2']);
  });
});

describe('frames', () => {
  it('end with every kept token in the tray, for every preset and both orders', () => {
    for (const p of PRESETS) {
      for (const keywordsFirst of [true, false]) {
        const frames = lexFrames(p.source, { keywordsFirst });
        const last = frames[frames.length - 1];
        expect(last.emitted).toBe(lex(p.source, { keywordsFirst }).length);
      }
    }
  });

  it('an empty line has one frame and no tokens', () => {
    expect(lexFrames('', { keywordsFirst: true })).toHaveLength(1);
  });
});

describe('the source field', () => {
  it('lexes anything up to the cap and refuses longer lines', () => {
    for (const s of ['', '   ', '1e400', '-1', '😀', '<b>x</b>', '1,2,,3', '12345678901234567890123']) expect(checkSource(s)).toEqual({ ok: true, source: s });
    expect(checkSource('x'.repeat(81))).toEqual({ ok: false, error: 'Keep the line to 80 characters or fewer.' });
  });
});
