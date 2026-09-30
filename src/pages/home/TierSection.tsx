import { motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';
import { isBuilt } from '../../core/lessons';
import type { Tier, Topic } from '../../core/types';
import { TopicCard } from './TopicCard';

/** Above this many planned cards, a tier hides them behind a "Show N planned" toggle. */
export const PLANNED_COLLAPSE_AT = 12;

/** One tier: header with progress, built lessons first, then planned ones. */
export function TierSection({
  tier, topics, allBuilt, isDone,
}: {
  tier: Tier;
  /** Topics in this tier that match the current filter. */
  topics: Topic[];
  /** Every built topic in this tier, regardless of filter (drives the progress bar). */
  allBuilt: Topic[];
  isDone: (id: string) => boolean;
}) {
  const [showPlanned, setShowPlanned] = useState(false);
  const built = topics.filter((t) => isBuilt(t.id));
  const planned = topics.filter((t) => !isBuilt(t.id));
  const collapsible = planned.length > PLANNED_COLLAPSE_AT;
  const visible = collapsible && !showPlanned ? built : [...built, ...planned];
  const learned = allBuilt.filter((t) => isDone(t.id)).length;

  return (
    <section className="tier" style={{ '--tier': tier.color } as CSSProperties}>
      <div className="tier-rail">
        <span className="tier-num">{tier.n}</span>
      </div>
      <div className="tier-body">
        <header className="tier-head">
          <div>
            <h2>
              {tier.name} <span className="tier-role">{tier.role}</span>
            </h2>
            <p>{tier.blurb}</p>
          </div>
          <div className="tier-progress" title={`${learned} of ${allBuilt.length} built lessons learned`}>
            <div className="bar">
              <motion.i
                initial={{ width: 0 }}
                animate={{ width: allBuilt.length ? `${(learned / allBuilt.length) * 100}%` : 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <span>
              {learned}/{allBuilt.length}
            </span>
          </div>
        </header>

        {topics.length ? (
          <div className="cards">
            {visible.map((t, i) => (
              <TopicCard key={t.id} topic={t} done={isDone(t.id)} index={i} />
            ))}
          </div>
        ) : (
          <p className="muted">Nothing in this track at this tier yet.</p>
        )}

        {collapsible && (
          <button type="button" className="tier-planned-toggle" aria-expanded={showPlanned} onClick={() => setShowPlanned((v) => !v)}>
            {showPlanned ? 'Hide planned topics' : `Show ${planned.length} planned topics`}
          </button>
        )}
      </div>
    </section>
  );
}
