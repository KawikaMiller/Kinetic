import { describe, expect, it } from 'vitest';
import { rowTone } from './rowTone';

describe('stream row colour', () => {
  it('a matched line is yellow whatever its level, as the legend promises', () => {
    for (const level of ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const) expect(rowTone({ level, match: true })).toBe('hi');
  });

  it('unmatched or unsearched lines keep the level colour', () => {
    expect(rowTone({ level: 'ERROR', match: false })).toBe('bad');
    expect(rowTone({ level: 'WARN', match: null })).toBe('orange');
    expect(rowTone({ level: 'INFO', match: null })).toBeNull();
  });

  it('secrets and their masks beat everything', () => {
    expect(rowTone({ level: 'INFO', match: true, flag: 'secret' })).toBe('bad');
    expect(rowTone({ level: 'ERROR', match: true, flag: 'redacted' })).toBe('ok');
  });
});
