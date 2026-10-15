import { describe, expect, it } from 'vitest';
import type { LogRow } from '../../components/logRows';
import { streamHighlight, toLogRows, type StreamRow } from './streamRows';

const row = (key: number, over: Partial<StreamRow> = {}): StreamRow => ({
  key, service: 'orders', level: 'INFO', head: '09:14:00.018 INFO', tag: '[orders]', body: 'Processing order', match: null, ...over,
});

describe('toLogRows', () => {
  it('maps the head to the muted timestamp, the tag to the coloured source and the body to the text', () => {
    const [r] = toLogRows([row(7)]);
    expect(r).toMatchObject({ id: 7, at: '09:14:00.018 INFO', source: '[orders]', text: 'Processing order' });
    expect(r.sourceTone).toBeDefined();
  });

  it('leaves the timestamp out of a JSON line (empty head)', () => {
    expect(toLogRows([row(1, { head: '' })])[0].at).toBeUndefined();
  });

  it('colours a secret red, a mask green, a match yellow, and an ERROR red only when nothing else applies', () => {
    expect(toLogRows([row(1, { flag: 'secret' })])[0].tone).toBe('bad');
    expect(toLogRows([row(1, { flag: 'redacted' })])[0].tone).toBe('ok');
    expect(toLogRows([row(1, { match: true, level: 'ERROR' })])[0].tone).toBe('hi');
    expect(toLogRows([row(1, { level: 'ERROR' })])[0].tone).toBe('bad');
    expect(toLogRows([row(1)])[0].tone).toBeUndefined();
  });
});

describe('streamHighlight', () => {
  const lookup = (rows: StreamRow[]) => {
    const h = streamHighlight(rows);
    return toLogRows(rows).map((r: LogRow) => h(r));
  };

  it('highlights nothing while no search is active', () => {
    expect(lookup([row(1), row(2)])).toEqual([null, null]);
  });

  it('dims what the filter ruled out and marks the matches', () => {
    expect(lookup([row(1, { match: true }), row(2, { match: false })])).toEqual([true, false]);
  });

  it('a secret or a mask is marked even without a search, but a filtered-out one is still dimmed', () => {
    expect(lookup([row(1, { flag: 'secret' }), row(2, { flag: 'redacted' })])).toEqual([true, true]);
    expect(lookup([row(1, { flag: 'secret', match: false })])).toEqual([false]);
  });
});
