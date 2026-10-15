import { describe, expect, it } from 'vitest';
import { nextSort, sortDirection, sortRows } from '../../core/sortRows';
import { CHANGES, ROW_COLUMNS, DEFAULT_NAME, matrix, rowFor } from './api';
import lesson from './index';
import { cacheRun } from './strategies';
import { simulate } from './sunset';

/** Default state of each scene: change selected "Add an optional response field", strategy path, window 90 days. */
describe('the try-this prompts work from the default state, as written', () => {
  it('has five prompts', () => {
    expect(lesson.tryThis).toHaveLength(5);
  });

  it('try-this 1: adding an optional field breaks only the partner, with "unexpected property nickname"', () => {
    const row = rowFor(CHANGES[0], DEFAULT_NAME);
    expect(row.cells.partner).toEqual({ status: 'broken', reason: 'unexpected property nickname' });
    expect([row.cells.mobile.status, row.cells.web.status, row.cells.batch.status]).toEqual(['ok', 'ok', 'ok']);
  });

  it('try-this 2: the default sort order change throws nothing and turns the batch job orange', () => {
    const sort = rowFor(CHANGES.find((c) => c.id === 'sort')!, DEFAULT_NAME);
    expect(sort.broken).toBe(0);
    expect(sort.cells.batch.status).toBe('changed');
  });

  it('try-this 3: the Broken header sorts ascending, then descending, with ties in table order both ways', () => {
    const rows = matrix(DEFAULT_NAME);
    let sort = nextSort(null, 'broken' as const);
    expect(sortDirection(sort, 'broken')).toBe('ascending');
    const up = sortRows(rows, ROW_COLUMNS.broken, sort.ascending).map((r) => r.change.id);
    expect(up.slice(0, 2)).toEqual(['sort', 'key-order']);
    expect(rows.map((r) => r.broken)).not.toEqual([...rows.map((r) => r.broken)].sort((a, b) => a - b));
    sort = nextSort(sort, 'broken');
    expect(sortDirection(sort, 'broken')).toBe('descending');
    const down = sortRows(rows, ROW_COLUMNS.broken, sort.ascending).map((r) => r.change.id);
    expect(down[0]).toBe('required-param');
    expect(down.slice(-2)).toEqual(['sort', 'key-order']);
  });

  it('try-this 4: a header version is served from the cache as v1 to the v2 client, and Vary fixes it', () => {
    expect(cacheRun('header', false).correct).toBe(false);
    expect(cacheRun('header', true).correct).toBe(true);
  });

  it('try-this 5: 90 days leaves two clients on v1, and 120 days or more leaves only the batch job', () => {
    const left = (days: number) => simulate(days, 'break').clients.filter((c) => c.onOldAtSunset).map((c) => c.id);
    expect(left(90)).toEqual(['partner', 'batch']);
    expect(left(119)).toEqual(['partner', 'batch']);
    expect(left(120)).toEqual(['batch']);
    expect(left(730)).toEqual(['batch']);
  });
});
