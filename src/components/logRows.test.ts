import { describe, expect, it } from 'vitest';
import { lastRows, rowTabStop, rowTone } from './logRows';

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

describe('rowTabStop', () => {
  const shown = [{ id: 'a' }, { id: 2 }, { id: 'c' }];
  it('is the row with that id, numeric ids included', () => {
    expect(rowTabStop(shown, 'c')).toBe(2);
    expect(rowTabStop(shown, 2)).toBe(1);
  });
  it('falls back to the first row when nothing is chosen or the row scrolled out of `max`', () => {
    expect(rowTabStop(shown, null)).toBe(0);
    expect(rowTabStop(shown, 'gone')).toBe(0);
    expect(rowTabStop([], 'a')).toBe(0);
  });
});
