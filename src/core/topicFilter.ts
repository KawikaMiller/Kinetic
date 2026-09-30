import { FAMILIES, TRACKS } from './curriculum';
import type { Topic, Track, TrackFamily, TrackId } from './types';

/** What the home page is showing: everything, one track, or one family of tracks. */
export type TopicFilter =
  | { kind: 'all' }
  | { kind: 'track'; id: TrackId }
  | { kind: 'family'; id: TrackFamily };

export const ALL: TopicFilter = { kind: 'all' };

const isTrackId = (v: string | null): v is TrackId => v !== null && v in TRACKS;
const isFamily = (v: string | null): v is TrackFamily => FAMILIES.some((f) => f.id === v);

/** Read the filter from the URL (?track=hw or ?family=computing). Unknown values mean "all". */
export function parseFilter(params: URLSearchParams): TopicFilter {
  const track = params.get('track');
  if (isTrackId(track)) return { kind: 'track', id: track };
  const family = params.get('family');
  if (isFamily(family)) return { kind: 'family', id: family };
  return ALL;
}

/** The URL search params that encode a filter ("all" is no params at all). */
export function filterToParams(filter: TopicFilter): Record<string, string> {
  return filter.kind === 'all' ? {} : { [filter.kind]: filter.id };
}

export function matchesFilter(topic: Topic, filter: TopicFilter): boolean {
  if (filter.kind === 'all') return true;
  if (filter.kind === 'track') return topic.track === filter.id;
  return TRACKS[topic.track].family === filter.id;
}

export function sameFilter(a: TopicFilter, b: TopicFilter): boolean {
  return a.kind === b.kind && (a.kind === 'all' || a.id === (b as typeof a).id);
}

/** Tracks in a family, in display order. */
export function tracksInFamily(family: TrackFamily): Track[] {
  return Object.values(TRACKS).filter((t) => t.family === family);
}
