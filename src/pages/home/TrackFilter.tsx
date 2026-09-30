import type { CSSProperties } from 'react';
import { FAMILIES, TOPICS } from '../../core/curriculum';
import { isBuilt } from '../../core/lessons';
import { ALL, sameFilter, tracksInFamily, type TopicFilter } from '../../core/topicFilter';
import type { TrackId } from '../../core/types';

/** Built / total topics per track, across every tier on the page. */
function trackCounts(): Record<TrackId, { built: number; total: number }> {
  const counts = {} as Record<TrackId, { built: number; total: number }>;
  for (const t of TOPICS) {
    const c = (counts[t.track] ??= { built: 0, total: 0 });
    c.total++;
    if (isBuilt(t.id)) c.built++;
  }
  return counts;
}

const COUNTS = trackCounts();

/**
 * Track chips grouped by family. "All", a family label, or a single track can be
 * selected. Tracks with no topics yet stay visible (dimmed) so the roadmap is honest.
 */
export function TrackFilter({ value, onChange }: { value: TopicFilter; onChange: (f: TopicFilter) => void }) {
  const chip = (filter: TopicFilter) => ({
    type: 'button' as const,
    'aria-pressed': sameFilter(value, filter),
    onClick: () => onChange(filter),
  });

  return (
    <nav className="track-filter" aria-label="Filter lessons by track">
      <div className="tf-scroll">
        <button className="tf-chip tf-all" {...chip(ALL)}>
          All tracks
        </button>
        {FAMILIES.map((family) => (
          <div key={family.id} className="tf-family" role="group" aria-label={family.name}>
            <button className="tf-family-label" {...chip({ kind: 'family', id: family.id })}>
              {family.name}
            </button>
            {tracksInFamily(family.id).map((track) => {
              const { built, total } = COUNTS[track.id] ?? { built: 0, total: 0 };
              return (
                <button
                  key={track.id}
                  className={`tf-chip ${total ? '' : 'is-empty'}`}
                  style={{ '--c': track.color } as CSSProperties}
                  title={`${track.name}: ${built} of ${total} topics built`}
                  {...chip({ kind: 'track', id: track.id })}
                >
                  <i>{track.glyph}</i> {track.short}
                  <span className="tf-count">
                    {built}/{total}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
