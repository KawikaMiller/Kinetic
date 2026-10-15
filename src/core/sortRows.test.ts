import { describe, expect, it } from 'vitest';
import { nextSort, sortDirection, sortRows } from './sortRows';

interface Row {
  id: string;
  name: string;
  size: number;
}
const ROWS: Row[] = [
  { id: 'a', name: 'Zed', size: 2 },
  { id: 'b', name: 'amy', size: 1 },
  { id: 'c', name: 'Bob', size: 2 },
  { id: 'd', name: 'Cat', size: 1 },
];
const ids = (rows: Row[]) => rows.map((r) => r.id).join('');

describe('sortRows', () => {
  it('sorts numbers numerically (10 after 9, not after 1) and does not touch its input', () => {
    const nums = [{ n: 10 }, { n: 9 }, { n: 1 }];
    expect(sortRows(nums, (r) => r.n, true).map((r) => r.n)).toEqual([1, 9, 10]);
    expect(nums.map((r) => r.n)).toEqual([10, 9, 1]);
  });

  it('sorts text the way a reader expects: case-insensitively, by locale', () => {
    expect(sortRows(ROWS, (r) => r.name, true).map((r) => r.name)).toEqual(['amy', 'Bob', 'Cat', 'Zed']);
    expect(sortRows(ROWS, (r) => r.name, false).map((r) => r.name)).toEqual(['Zed', 'Cat', 'Bob', 'amy']);
  });

  it('is stable: ties keep their input order whichever way the column runs', () => {
    expect(ids(sortRows(ROWS, (r) => r.size, true))).toBe('bdac');
    expect(ids(sortRows(ROWS, (r) => r.size, false))).toBe('acbd');
  });

  it('a broken comparator is caught: reversing the ascending order would NOT give the descending one when there are ties', () => {
    const asc = sortRows(ROWS, (r) => r.size, true);
    expect(ids([...asc].reverse())).not.toBe(ids(sortRows(ROWS, (r) => r.size, false)));
  });
});

describe('column heading state', () => {
  it('a new column sorts ascending, the same column again reverses, and it flips back and forth', () => {
    let sort = nextSort<'a' | 'b'>(null, 'a');
    expect(sort).toEqual({ key: 'a', ascending: true });
    sort = nextSort(sort, 'a');
    expect(sort).toEqual({ key: 'a', ascending: false });
    sort = nextSort(sort, 'a');
    expect(sort.ascending).toBe(true);
    sort = nextSort({ key: 'a', ascending: false }, 'b');
    expect(sort).toEqual({ key: 'b', ascending: true });
  });

  it('aria-sort names the direction on the sorted column only', () => {
    expect(sortDirection({ key: 'a', ascending: true }, 'a')).toBe('ascending');
    expect(sortDirection({ key: 'a', ascending: false }, 'a')).toBe('descending');
    expect(sortDirection({ key: 'a', ascending: true }, 'b')).toBeUndefined();
    expect(sortDirection(null, 'a')).toBeUndefined();
  });
});
