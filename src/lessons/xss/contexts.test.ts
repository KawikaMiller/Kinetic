import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  CONTEXTS, SAMPLES, TEMPLATES, encode, styleRuns, encodeJsString, escapeHtml, tally, verdict, type ContextId, type EncoderId,
} from './contexts';
import { decodeReferences, readMarkup } from './html';

/**
 * Which (sample, context) pairs stay plain data, worked out by hand from the HTML, URL and string
 * rules (not by running the model). Rows are samples; each string lists the contexts that stay
 * intact in the order text, attr, url, script, with "-" for one that breaks.
 */
const HAND_TABLE: Record<string, Record<EncoderId, string>> = {
  heart: { raw: 'TAUS', html: 'TAU-', right: 'TAUS' },
  bold: { raw: '-AUS', html: 'TAU-', right: 'TAUS' },
  quotes: { raw: 'T---', html: 'TAU-', right: 'TAUS' },
  math: { raw: 'TA-S', html: 'TA--', right: 'TAUS' },
  link: { raw: 'TA-S', html: 'TA--', right: 'TAUS' },
  path: { raw: 'TAU-', html: 'TAU-', right: 'TAUS' },
};

const CTX_ORDER: ContextId[] = ['text', 'attr', 'url', 'script'];
const CODES = ['T', 'A', 'U', 'S'];

describe('which contexts break (the structure diff the screen reports)', () => {
  for (const sample of SAMPLES) {
    for (const enc of ['raw', 'html', 'right'] as EncoderId[]) {
      it(`${sample.id} / ${enc}`, () => {
        const got = CTX_ORDER.map((c, i) => (verdict(c, enc, sample.value).reading.intact ? CODES[i] : '-')).join('');
        expect(got).toBe(HAND_TABLE[sample.id][enc]);
      });
    }
  }

  it('the table covers every sample and context', () => {
    expect(Object.keys(HAND_TABLE).sort()).toEqual(SAMPLES.map((s) => s.id).sort());
    expect(CONTEXTS.map((c) => c.id)).toEqual(CTX_ORDER);
  });

  it('tally counts the intact contexts per encoder', () => {
    expect(tally('use <b>bold</b>')).toEqual({ raw: 3, html: 3, right: 4 });
    expect(tally('5 > 3 & 2 < 4')).toEqual({ raw: 3, html: 2, right: 4 });
  });
});

describe('HTML-escaping everywhere is not enough', () => {
  it('the right encoder is never worse than HTML-escaping, and is strictly better for at least one sample in a URL and in a script', () => {
    for (const s of SAMPLES) {
      for (const c of CTX_ORDER) {
        const html = verdict(c, 'html', s.value).reading.intact;
        const right = verdict(c, 'right', s.value).reading.intact;
        expect(right || !html).toBe(true);
      }
    }
    const better = (c: ContextId) => SAMPLES.some((s) => verdict(c, 'right', s.value).reading.intact && !verdict(c, 'html', s.value).reading.intact);
    expect(better('url')).toBe(true);
    expect(better('script')).toBe(true);
  });

  it('for the two HTML contexts the HTML encoder is the right one', () => {
    for (const s of SAMPLES) {
      for (const c of ['text', 'attr'] as ContextId[]) expect(encode(c, 'html', s.value)).toBe(encode(c, 'right', s.value));
    }
  });
});

describe('every right encoder round-trips', () => {
  const ALPHABET = ['<', '>', '&', '"', "'", '/', '\\', '=', '#', ';', ' ', 'a', 'Z', '3', 'é', '😀', '\n', '\t', '%', '?', '+', '\u2028'];
  const rnd = mulberry32(4242);
  const strings = [
    '',
    ' ',
    ...SAMPLES.map((s) => s.value),
    ...Array.from({ length: 500 }, () => Array.from({ length: Math.floor(rnd() * 24) }, () => ALPHABET[Math.floor(rnd() * ALPHABET.length)]).join('')),
  ];

  for (const c of CTX_ORDER) {
    it(`${c}: the page recovers the original from the encoded output, for ${strings.length} strings`, () => {
      for (const s of strings) {
        const v = verdict(c, 'right', s);
        expect(v.reading.issues).toEqual([]);
        expect(v.reading.value).toBe(s);
      }
    });
  }

  it('the script encoder leaves no < > & or quote-like characters raw, so the page parser never sees a tag in it', () => {
    for (const s of strings) {
      const lit = encodeJsString(s);
      expect(lit.slice(1, -1)).not.toMatch(/[<>&'\u2028\u2029]/);
      expect(JSON.parse(lit)).toBe(s);
    }
  });

  it('percent-encoding leaves nothing that could split a URL value or close a quoted attribute', () => {
    for (const s of strings) expect(encode('url', 'right', s)).not.toMatch(/[&#"<>\s=?]/);
  });

  it('escapeHtml output contains no raw < > " or lone &', () => {
    for (const s of strings) {
      const e = escapeHtml(s);
      expect(e).not.toMatch(/[<>"]/);
      expect(e.replace(/&(amp|lt|gt|quot|#39);/g, '')).not.toContain('&');
    }
  });
});

describe('the reader', () => {
  it('finds tags only where a letter follows the angle bracket', () => {
    expect(readMarkup('I <3 it').tags).toEqual([]);
    expect(readMarkup('a < b').tags).toEqual([]);
    expect(readMarkup('x<b>y</b>').tags.map((t) => [t.name, t.end])).toEqual([['b', false], ['b', true]]);
    expect(readMarkup('x<b>y</b>').text).toBe('xy');
  });

  it('treats an end-tag opener followed by a non-letter as a bogus comment, but not at the very end', () => {
    expect(readMarkup('a</>b').text).toBe('ab');
    expect(readMarkup('a</ b>c').text).toBe('ac');
    expect(readMarkup('a</').text).toBe('a</');
  });

  it('drops a tag cut off by the end of the input', () => {
    expect(readMarkup('hi <b').text).toBe('hi ');
  });

  it('decodes the five named references and numeric ones, and leaves the rest alone', () => {
    expect(decodeReferences('&amp;&lt;&gt;&quot;&#39;&#x27;')).toBe('&<>"\'\'');
    expect(decodeReferences('&c=2 &nosuch;')).toBe('&c=2 &nosuch;');
  });
});

describe('the template', () => {
  it('puts the encoded value between the template halves', () => {
    for (const c of CTX_ORDER) {
      const v = verdict(c, 'right', 'x');
      expect(v.output.startsWith(TEMPLATES[c].before)).toBe(true);
      expect(v.output.endsWith(TEMPLATES[c].after)).toBe(true);
      expect(v.output.slice(v.from, v.to)).toBe(encode(c, 'right', 'x'));
    }
  });

  it('marks name the characters that changed the structure', () => {
    const bold = verdict('text', 'raw', 'use <b>bold</b>');
    expect(bold.reading.marks.map(([a, b]) => bold.output.slice(a, b))).toEqual(['<b>', '</b>']);
    const math = verdict('url', 'raw', '5 > 3 & 2 < 4');
    expect(math.reading.marks.map(([a, b]) => math.output.slice(a, b))).toEqual(['&']);
    const escaped = verdict('url', 'html', '5 > 3 & 2 < 4');
    expect(escaped.reading.marks.map(([a, b]) => escaped.output.slice(a, b))).toEqual(['&amp;']);
    expect(verdict('text', 'right', 'use <b>bold</b>').reading.marks).toEqual([]);
  });
});

describe('styleRuns', () => {
  it('joins back to the output and colours only what the reading says', () => {
    for (const s of SAMPLES) {
      for (const c of CTX_ORDER) {
        for (const enc of ['raw', 'html', 'right'] as EncoderId[]) {
          const v = verdict(c, enc, s.value);
          const runs = styleRuns(v, enc);
          expect(runs.map((r) => r.text).join('')).toBe(v.output);
          expect(runs.some((r) => r.kind === 'structure')).toBe(v.reading.marks.length > 0);
          if (v.reading.intact) expect(runs.every((r) => r.kind !== 'structure')).toBe(true);
        }
      }
    }
  });

  it('an intact encoded value is "encoded", an intact raw one stays "data"', () => {
    expect(styleRuns(verdict('text', 'right', 'use <b>bold</b>'), 'right').map((r) => r.kind)).toEqual(['template', 'encoded', 'template']);
    expect(styleRuns(verdict('text', 'raw', 'I <3 it'), 'raw').map((r) => r.kind)).toEqual(['template', 'data', 'template']);
  });
});
