import { describe, expect, it } from 'vitest';
import { fromBits } from '../../core/bits';
import { codePoints, counts, decodeAs, encodeCodePoint, flagLetters, graphemes, hasFlagLetters, normalisation, PRESETS, prefixLength, utf8 } from './model';

describe('flag detection', () => {
  it('finds a regional-indicator pair, and nothing else', () => {
    expect(hasFlagLetters(PRESETS.find((p) => p.id === 'flag')!.text)).toBe(true);
    expect(hasFlagLetters('JP')).toBe(false);
    expect(hasFlagLetters('café 日本')).toBe(false);
    expect(hasFlagLetters('\u{1F1EF}')).toBe(false); // a single indicator isn't a flag
  });
  it('reads the letters of the flag', () => {
    expect(flagLetters('\u{1F1EF}\u{1F1F5}')).toBe('JP');
    expect(flagLetters('vive la \u{1F1EB}\u{1F1F7}!')).toBe('FR');
  });
});

describe('é: the classic mojibake', () => {
  it('encodes to C3 A9 and decodes as Windows-1252 to "Ã©"', () => {
    expect([...utf8('é')]).toEqual([0xc3, 0xa9]);
    const wrong = decodeAs(utf8('é'), 'windows-1252');
    expect(wrong.text).toBe('Ã©');
    expect(wrong.garbled).toEqual([true, true]);
    expect(decodeAs(utf8('é'), 'utf-8').text).toBe('é');
    expect(decodeAs(utf8('café'), 'windows-1252').text).toBe('cafÃ©');
  });
});

describe('what .length really counts', () => {
  it('👍🏽 is 1 grapheme, 2 code points, 4 UTF-16 units, 8 UTF-8 bytes', () => {
    expect(counts('\u{1F44D}\u{1F3FD}')).toEqual({ graphemes: 1, codePoints: 2, utf16: 4, utf8Bytes: 8 });
  });

  it('a flag is two regional-indicator code points', () => {
    expect(counts('\u{1F1EF}\u{1F1F5}')).toEqual({ graphemes: 1, codePoints: 2, utf16: 4, utf8Bytes: 8 });
  });

  it('日本 is 2 characters but 6 UTF-8 bytes', () => {
    expect(counts('日本')).toEqual({ graphemes: 2, codePoints: 2, utf16: 2, utf8Bytes: 6 });
  });

  it('NFC café is 4 long, NFD café is 5, and they are different strings that look the same', () => {
    const nfc = 'café';
    const nfd = 'café';
    expect(nfc.length).toBe(4);
    expect(nfd.length).toBe(5);
    expect(nfc).not.toBe(nfd);
    expect(nfd.normalize('NFC')).toBe(nfc);
    expect(graphemes(nfd)).toHaveLength(4);
    expect(codePoints(nfd)).toHaveLength(5);
    expect(normalisation(nfd)).toMatchObject({ isNfc: false, nfcLength: 4, nfdLength: 5 });
    expect(normalisation(nfc).isNfc).toBe(true);
  });

  it('every preset agrees with the built-ins', () => {
    for (const p of PRESETS) {
      const c = counts(p.text);
      expect(c.utf16).toBe(p.text.length);
      expect(c.codePoints).toBe([...p.text].length);
      expect(c.utf8Bytes).toBe(new TextEncoder().encode(p.text).length);
    }
  });
});

describe('UTF-8 structure', () => {
  it('prefix lengths for each byte kind', () => {
    expect(prefixLength(0x41)).toBe(1);
    expect(prefixLength(0xa9)).toBe(2);
    expect(prefixLength(0xc3)).toBe(3);
    expect(prefixLength(0xe6)).toBe(4);
    expect(prefixLength(0xf0)).toBe(5);
  });

  it('payload bits reassemble the code point, and bytes match TextEncoder, across Unicode', () => {
    for (let cp = 0; cp <= 0x10ffff; cp += cp < 0x800 ? 1 : 61) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue; // lone surrogates aren't characters
      const e = encodeCodePoint(cp);
      expect(fromBits(e.payload)).toBe(cp);
      expect(e.bytes.map((b) => b.byte)).toEqual([...new TextEncoder().encode(String.fromCodePoint(cp))]);
      const expectedLength = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      expect(e.bytes).toHaveLength(expectedLength);
      expect(e.payloadRuns).toHaveLength(expectedLength);
    }
  });

  it('é is 110 00011 10 101001: 5 + 6 payload bits', () => {
    const e = encodeCodePoint(0xe9);
    expect(e.bytes.map((b) => b.prefix)).toEqual([3, 2]);
    expect(e.payloadRuns).toEqual([[0, 4], [5, 10]]);
  });
});

describe('Windows-1252 decoding is one character per byte', () => {
  it('garbles exactly the bytes ≥ 0x80', () => {
    for (const p of PRESETS) {
      const bytes = utf8(p.text);
      const { text, garbled } = decodeAs(bytes, 'windows-1252');
      expect([...text]).toHaveLength(bytes.length);
      expect(garbled.filter(Boolean)).toHaveLength([...bytes].filter((b) => b >= 0x80).length);
    }
  });
});
