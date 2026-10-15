import { describe, expect, it } from 'vitest';
import { bandOfValue, type MeterBand } from './meterBands';

const BANDS: MeterBand[] = [
  { upTo: 200, tone: 'ok', label: 'good' },
  { upTo: 500, tone: 'orange', label: 'needs improvement' },
  { upTo: 1000, tone: 'bad', label: 'poor' },
];

describe('bandOfValue', () => {
  it('a value equal to an edge belongs to the lower band', () => {
    expect(bandOfValue(200, BANDS).label).toBe('good');
    expect(bandOfValue(200.5, BANDS).label).toBe('needs improvement');
    expect(bandOfValue(500, BANDS).label).toBe('needs improvement');
  });

  it('a value past the last edge still lands in the last band', () => {
    expect(bandOfValue(5000, BANDS).label).toBe('poor');
  });

  it('zero is in the first band', () => {
    expect(bandOfValue(0, BANDS).tone).toBe('ok');
  });
});
