import { describe, expect, it } from 'vitest';
import { b64url } from '../../core/crypto';
import { mulberry32 } from '../../core/random';
import { BASE64_PRESETS, decodeToText, encode, PERCENT_PRESETS, percentEncode, toBlocks, utf8 } from './model';

const viaBtoa = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const SAMPLES = ['', 'M', 'Ma', 'Man', 'Many', 'Many ', 'hello world', 'héllo', '👍🏽', '日本語テキスト', '{"alg":"HS256","typ":"JWT"}', 'a+b/c=d?'];

describe('base64 built from the bits equals the built-ins', () => {
  it('standard matches btoa(String.fromCharCode(...utf8)) for every sample and preset', () => {
    for (const s of [...SAMPLES, ...BASE64_PRESETS.map((p) => p.text)]) expect(encode(utf8(s), 'standard')).toBe(viaBtoa(utf8(s)));
  });

  it('base64url matches core b64url', () => {
    for (const s of SAMPLES) expect(encode(utf8(s), 'url')).toBe(b64url(utf8(s)));
  });

  it('matches for random byte strings of every length 0..40 (all lengths mod 3)', () => {
    const rnd = mulberry32(7);
    for (let n = 0; n <= 40; n++) {
      for (let trial = 0; trial < 20; trial++) {
        const bytes = Uint8Array.from({ length: n }, () => Math.floor(rnd() * 256));
        expect(encode(bytes, 'standard')).toBe(viaBtoa(bytes));
        expect(encode(bytes, 'url')).toBe(b64url(bytes));
      }
    }
  });

  it('pads 1 leftover byte with "==" and 2 with "="', () => {
    expect(encode(utf8('M'), 'standard')).toBe('TQ==');
    expect(encode(utf8('Ma'), 'standard')).toBe('TWE=');
    expect(encode(utf8('Man'), 'standard')).toBe('TWFu');
    expect(encode(utf8(''), 'standard')).toBe('');
    const [m] = toBlocks(utf8('M'), 'standard');
    expect(m.dataBits).toBe(8);
    expect(m.bits.slice(8).every((b) => b === 0)).toBe(true);
    expect(m.sextets).toEqual([19, 16, null, null]);
    expect(m.zeroPadBits).toBe(4);
    expect(toBlocks(utf8('Ma'), 'standard')[0].zeroPadBits).toBe(2);
    expect(toBlocks(utf8('Man'), 'standard')[0].zeroPadBits).toBe(0);
  });

  it('the JWT header encodes to the familiar eyJ… string', () => {
    expect(encode(utf8('{"alg":"HS256","typ":"JWT"}'), 'url')).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('decodes back without any key', () => {
    for (const s of SAMPLES) {
      expect(decodeToText(encode(utf8(s), 'standard'), 'standard')).toBe(s);
      expect(decodeToText(encode(utf8(s), 'url'), 'url')).toBe(s);
    }
  });
});

describe('percent-encoding', () => {
  const STRINGS = [...SAMPLES, ...PERCENT_PRESETS.map((p) => p.text), "it's (fine)!*~", 'a b', '100%', 'x/y?z#w&=+', 'tab\there'];

  it('component mode equals encodeURIComponent', () => {
    for (const s of STRINGS) expect(percentEncode(s, 'component')).toBe(encodeURIComponent(s));
  });

  it('form mode equals URLSearchParams (space → +)', () => {
    for (const s of STRINGS) expect(percentEncode(s, 'form')).toBe(new URLSearchParams({ q: s }).toString().slice(2));
    expect(percentEncode('a b', 'form')).toBe('a+b');
    expect(percentEncode('a b', 'component')).toBe('a%20b');
  });
});
