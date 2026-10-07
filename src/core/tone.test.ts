import { describe, expect, it } from 'vitest';
import { TOKENS } from './palette';
import { PLAIN_TONES, TONES, plainTone } from './tone';

describe('plainTone', () => {
  it('cycles amber, pink, sky, orange and wraps both ways', () => {
    expect([0, 1, 2, 3, 4, 5].map(plainTone)).toEqual(['amber', 'pink', 'sky', 'orange', 'amber', 'pink']);
    expect(plainTone(-1)).toBe('orange');
  });

  it('never hands out a semantic role, and every plain hue is a Tone with a canvas token', () => {
    for (const t of PLAIN_TONES) {
      expect(['hi', 'ok', 'bad', 'info', 'violet', 'dim', 'muted']).not.toContain(t);
      expect(TONES).toContain(t);
      expect(TOKENS[t]).toMatch(/^#/);
    }
  });
});
