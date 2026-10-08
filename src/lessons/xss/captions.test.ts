import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { brokenRaw, contextsCaption, damageCaption, sinkCaption } from './captions';
import { SAMPLES, tally } from './contexts';
import { LAYER_COMBINATIONS, layersFromMask, reachedCount } from './defence';
import { keptAsData, SINKS } from './sinks';

describe('contexts caption', () => {
  it('states the real counts for every sample', () => {
    for (const s of SAMPLES) {
      const t = tally(s.value);
      const text = expectCaption(contextsCaption(s.value));
      expect(text).toContain(`stays data in ${t.raw} of 4 places`);
      expect(text).toContain(`keeps ${t.html}; the encoder for each context keeps ${t.right}`);
      const broken = brokenRaw(s.value);
      if (broken.length) expect(text).toContain(broken.join(', ').toLowerCase());
      else expect(text).toContain('only because of what it happens to contain');
    }
  });

  it('names exactly the places that break as typed', () => {
    expect(brokenRaw('use <b>bold</b>')).toEqual(['HTML text']);
    expect(brokenRaw('5 > 3 & 2 < 4')).toEqual(['Value inside a URL']);
    expect(brokenRaw('I <3 it')).toEqual([]);
  });
});

describe('sink caption, across every sink, sample and link value', () => {
  const links = ['https://shop.example/orders', '/orders/42', 'ftp://files.example/readme', 'custom-scheme:anything'];
  for (const sink of SINKS) {
    it(`${sink.id}`, () => {
      for (const s of SAMPLES) {
        for (const link of links) {
          const text = expectCaption(sinkCaption(sink.id, s.value, link));
          if (sink.id === 'href') {
            const web = link.startsWith('https:') || link.startsWith('/');
            expect(text.includes('allow-list lets it through')).toBe(web);
            expect(text.includes('refuses it')).toBe(!web);
          } else if (sink.safe) {
            expect(text).toContain('lands as plain text');
          } else if (keptAsData(sink.id, s.value)) {
            expect(text).toContain('luck, not safety');
          } else {
            expect(text).toContain('turns into 1 element');
            expect(text).toContain('<b>');
          }
        }
      }
    });
  }
});

describe('damage caption, across all 16 layer combinations', () => {
  it('matches the reach table', () => {
    for (let mask = 0; mask < LAYER_COMBINATIONS; mask++) {
      const l = layersFromMask(mask);
      const text = expectCaption(damageCaption(l));
      if (l.csp) {
        expect(reachedCount(l)).toBe(0);
        expect(text).toContain('never runs');
      } else {
        expect(text).toContain(`reaches ${reachedCount(l)} of 5`);
        expect(text.includes('kept the cookie out of reach')).toBe(l.httpOnly);
        expect(text.includes('is readable')).toBe(!l.httpOnly);
        expect(text.includes(l.shortSession ? '15 minutes' : '30 days')).toBe(!l.httpOnly);
        expect(text).toContain('SameSite changes nothing here');
      }
    }
  });
});
