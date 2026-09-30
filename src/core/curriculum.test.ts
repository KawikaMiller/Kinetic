import { describe, expect, it } from 'vitest';
import { FAMILIES, TOPICS, TRACKS } from './curriculum';
import { BUILT_TOPICS } from './lessons';
import { ALL, filterToParams, matchesFilter, parseFilter, tracksInFamily } from './topicFilter';

describe('curriculum', () => {
  it('has unique topic ids', () => {
    const ids = TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only known tracks, and every track is in a known family', () => {
    for (const t of TOPICS) expect(TRACKS[t.track], t.id).toBeDefined();
    const families = new Set(FAMILIES.map((f) => f.id));
    for (const track of Object.values(TRACKS)) expect(families.has(track.family), track.id).toBe(true);
  });

  it('keys each track by its own id and colours it with its token', () => {
    for (const [key, track] of Object.entries(TRACKS)) {
      expect(track.id).toBe(key);
      expect(track.color).toBe(`var(--trk-${key})`);
    }
  });

  it('registers the full Tier 1 roadmap (docs/rollout-plan.md §1.3)', () => {
    expect(TOPICS.filter((t) => t.tier === 1)).toHaveLength(62);
  });

  it('has a curriculum entry for every built lesson folder', () => {
    // BUILT_TOPICS comes from the lesson folders that match a TOPICS id; count the folders directly.
    const folders = Object.keys(import.meta.glob('../lessons/*/index.tsx')).length;
    expect(BUILT_TOPICS).toHaveLength(folders);
  });
});

describe('topic filter', () => {
  const params = (q: string) => new URLSearchParams(q);

  it('round-trips through the URL', () => {
    for (const f of [ALL, { kind: 'track', id: 'hw' } as const, { kind: 'family', id: 'systems' } as const]) {
      expect(parseFilter(params(new URLSearchParams(filterToParams(f)).toString()))).toEqual(f);
    }
  });

  it('treats unknown or empty values as "all"', () => {
    expect(parseFilter(params('track=nope'))).toEqual(ALL);
    expect(parseFilter(params('family=nope'))).toEqual(ALL);
    expect(parseFilter(params(''))).toEqual(ALL);
  });

  it('matches a family by its tracks', () => {
    const systems = new Set(tracksInFamily('systems').map((t) => t.id));
    for (const topic of TOPICS) {
      expect(matchesFilter(topic, { kind: 'family', id: 'systems' })).toBe(systems.has(topic.track));
    }
  });

  it('puts every track in exactly one family', () => {
    const seen = FAMILIES.flatMap((f) => tracksInFamily(f.id).map((t) => t.id));
    expect(seen.sort()).toEqual(Object.keys(TRACKS).sort());
  });
});
