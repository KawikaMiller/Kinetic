import { describe, expect, it } from 'vitest';
import rolloutPlan from '../../docs/rollout-plan.md?raw';
import { FAMILIES, TOPICS, TRACKS } from './curriculum';
import { BUILT_TOPICS } from './lessons';
import { ALL, filterToParams, matchesFilter, parseFilter, tracksInFamily } from './topicFilter';

/** The Tier 3 lessons that existed before the kickoff registered the planned ones (plan §5). */
const EXISTING_TIER3 = new Set([
  'load-balancing', 'consistent-hashing', 'cap-theorem', 'circuit-breakers', 'monolith-microservices', 'event-sourcing',
  'replication', 'sharding', 'isolation-levels', 'cdn-edge', 'observability', 'oauth-flows',
]);
/** Plan headline table: new Tier 3 topics per track. */
const TIER3_NEW_PER_TRACK = {
  hw: 4, os: 9, lang: 12, math: 15, dsa: 18, net: 9, arch: 16, data: 21, sec: 12, ops: 10, craft: 5, web: 5, ml: 11, lead: 7,
};
/** Present once docs/tier3-plan.md is in the tree; the row-for-row check skips without it. */
const tier3Plan = Object.values(
  import.meta.glob<string>('../../docs/tier3-plan.md', { query: '?raw', import: 'default', eager: true }),
)[0];
const byId = new Map(TOPICS.map((t) => [t.id, t]));

describe('curriculum', () => {
  it('has unique topic ids', () => {
    const ids = TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never shows two filter chips with the same label (family names vs track short names)', () => {
    const labels = [...FAMILIES.map((f) => f.name), ...Object.values(TRACKS).map((t) => t.short)];
    expect(new Set(labels).size).toBe(labels.length);
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

  it('registers the full Tier 2 roadmap exactly as docs/rollout-plan.md §3.1.2 lists it', () => {
    const plan = rolloutPlan.split('\n');
    const start = plan.findIndex((l) => l.startsWith('#### 3.1.2'));
    const end = plan.findIndex((l, i) => i > start && l.startsWith('#### '));
    const planned = plan
      .slice(start, end)
      .filter((l) => /^\| `[a-z0-9-]+` \|/.test(l))
      .map((l) => {
        const [id, track, title, tagline] = l.split('|').slice(1, 5).map((c) => c.trim());
        return { id: id.replace(/`/g, ''), track, title, tagline };
      });
    expect(planned).toHaveLength(156);
    const byId = new Map(TOPICS.map((t) => [t.id, t]));
    for (const p of planned) {
      const t = byId.get(p.id);
      expect(t, p.id).toBeDefined();
      expect({ tier: t?.tier, track: t?.track, title: t?.title, tagline: t?.tagline }, p.id).toEqual({
        tier: 2, track: p.track, title: p.title, tagline: p.tagline,
      });
    }
    // 156 new + the 16 that already existed
    expect(TOPICS.filter((t) => t.tier === 2)).toHaveLength(172);
  });

  it('leaves out the topics the Tier 2 plan merged or moved up', () => {
    const ids = new Set(TOPICS.map((t) => t.id));
    expect(ids.has('comparison-sort-lower-bound'), 'merged into linear-time-sorting').toBe(false);
    expect(byId.get('wifi-shared-medium')?.tier, 'moved up to Tier 3 and registered there').toBe(3);
  });

  describe('Tier 3 roadmap (docs/tier3-plan.md §2)', () => {
    const tier3 = TOPICS.filter((t) => t.tier === 3);
    const newTier3 = tier3.filter((t) => !EXISTING_TIER3.has(t.id));

    it('registers the 12 existing lessons plus the 154 planned topics', () => {
      expect(tier3.filter((t) => EXISTING_TIER3.has(t.id))).toHaveLength(12);
      expect(newTier3).toHaveLength(154);
      expect(tier3).toHaveLength(166);
    });

    it('counts the new topics per track as the plan does', () => {
      const counts: Record<string, number> = {};
      for (const t of newTier3) counts[t.track] = (counts[t.track] ?? 0) + 1;
      expect(counts).toEqual(TIER3_NEW_PER_TRACK);
    });

    it('registers the merged and moved-up topics, and leaves out the dropped and merged-away ones', () => {
      expect(byId.get('segment-trees')?.title).toBe('Segment Trees & Fenwick Trees');
      expect(byId.get('leases-fencing')?.tier, 'moved up from Tier 4').toBe(3);
      expect(byId.has('fenwick-trees'), 'merged into segment-trees').toBe(false);
      expect(byId.has('namespaces-cgroups'), 'dropped: containers covers it').toBe(false);
      expect(byId.has('two-generals'), 'merged into exactly-once-myth').toBe(false);
    });

    it.skipIf(!tier3Plan)('matches the plan table row for row (id, track, title)', () => {
      const lines = (tier3Plan ?? '').split('\n');
      const start = lines.findIndex((l) => l.startsWith('## 2.'));
      const end = lines.findIndex((l, i) => i > start && l.startsWith('## 3.'));
      const planned = lines
        .slice(start, end)
        .filter((l) => /^\| `[a-z0-9-]+` \|/.test(l))
        .map((l) => {
          const [id, title, track] = l.split('|').slice(1, 4).map((c) => c.trim());
          return { id: id.replace(/`/g, ''), title, track };
        });
      expect(planned).toHaveLength(154);
      for (const p of planned) {
        const t = byId.get(p.id);
        expect({ tier: t?.tier, track: t?.track, title: t?.title }, p.id).toEqual({ tier: 3, track: p.track, title: p.title });
      }
    });
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
