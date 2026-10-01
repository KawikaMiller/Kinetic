import { motion } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { HeroGraphic } from '../components/HeroGraphic';
import { usePageHeading } from '../components/usePageHeading';
import { TIERS, TOPICS } from '../core/curriculum';
import { BUILT_TOPICS, isBuilt } from '../core/lessons';
import { useProgress } from '../core/progress';
import { filterToParams, matchesFilter, parseFilter, type TopicFilter } from '../core/topicFilter';
import { TierSection } from './home/TierSection';
import { TrackFilter } from './home/TrackFilter';

export function Home() {
  // The filter lives in the URL so links and back navigation keep it.
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params);
  const setFilter = (f: TopicFilter) => setParams(filterToParams(f), { replace: true });

  const { isDone } = useProgress();
  const next = BUILT_TOPICS.find((t) => !isDone(t.id));
  const doneCount = BUILT_TOPICS.filter((t) => isDone(t.id)).length;
  const heading = usePageHeading(null);

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            Software engineering, animated
          </motion.p>
          <motion.h1 ref={heading} tabIndex={-1} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            Stop reading walls of text.
            <br />
            <span className="grad">Watch it move.</span>
          </motion.h1>
          <motion.p className="hero-sub" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            Algorithms, networks and distributed systems as interactive visuals you can play, pause, rewind and
            break. Four tiers, from intern to principal.
          </motion.p>
          <motion.div className="hero-cta" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            {next ? (
              <Link className="btn btn-primary btn-lg" to={`/lesson/${next.id}`}>
                {doneCount ? 'Continue' : 'Start'}: {next.title} →
              </Link>
            ) : (
              <span className="all-done">Every built lesson done. Absolute menace.</span>
            )}
            <span className="hero-count">
              {doneCount}/{BUILT_TOPICS.length} lessons learned · {TOPICS.length} on the roadmap
            </span>
          </motion.div>
        </div>
        <HeroGraphic />
      </section>

      <TrackFilter value={filter} onChange={setFilter} />

      <div className="tiers">
        {TIERS.map((tier) => {
          const inTier = TOPICS.filter((t) => t.tier === tier.n);
          return (
            <TierSection
              key={tier.n}
              tier={tier}
              topics={inTier.filter((t) => matchesFilter(t, filter))}
              allBuilt={inTier.filter((t) => isBuilt(t.id))}
              isDone={isDone}
            />
          );
        })}
      </div>
    </div>
  );
}
