import { describe, expect, it } from 'vitest';
import { lastRows, rowTone } from './logRows';

describe('rowTone', () => {
  it('a tone the row names wins over its level', () => {
    expect(rowTone({ tone: 'ok', level: 'ERROR' })).toBe('ok');
  });

  it('ERROR is red and WARN or WARNING orange, whatever the case; other levels stay neutral', () => {
    expect(rowTone({ level: 'ERROR' })).toBe('bad');
    expect(rowTone({ level: 'error' })).toBe('bad');
    expect(rowTone({ level: 'WARN' })).toBe('orange');
    expect(rowTone({ level: 'Warning' })).toBe('orange');
    expect(rowTone({ level: 'INFO' })).toBeUndefined();
    expect(rowTone({})).toBeUndefined();
  });
});

describe('lastRows', () => {
  const rows = [1, 2, 3, 4, 5];

  it('keeps the newest max rows, in order', () => {
    expect(lastRows(rows, 2)).toEqual([4, 5]);
    expect(lastRows(rows, 5)).toEqual(rows);
  });

  it('keeps everything without a max, or when max is larger than the log', () => {
    expect(lastRows(rows)).toBe(rows);
    expect(lastRows(rows, 50)).toEqual(rows);
  });

  it('a max of 0 keeps nothing and does not touch its input', () => {
    expect(lastRows(rows, 0)).toEqual([]);
    expect(rows).toEqual([1, 2, 3, 4, 5]);
  });
});
