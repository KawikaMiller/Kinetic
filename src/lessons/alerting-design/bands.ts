import type { MeterBand } from '../../components/meterBands';

/** Illustrative bands for pages in a week: about one a day is quiet, about three a day is noisy. Not recommendations. */
export const QUIET_PAGES = 7;
export const NOISY_PAGES = 21;
export const PAGE_METER_MAX = 40;

export const PAGE_BANDS: readonly MeterBand[] = [
  { upTo: QUIET_PAGES, tone: 'ok', label: 'quiet', tick: { label: `${QUIET_PAGES}`, tone: 'ok' } },
  { upTo: NOISY_PAGES, tone: 'orange', label: 'noisy', tick: { label: `${NOISY_PAGES}`, tone: 'bad' } },
  { upTo: PAGE_METER_MAX, tone: 'bad', label: 'fatigue risk' },
];
