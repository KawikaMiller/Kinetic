import { motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { HeroGraphic } from '../components/HeroGraphic';
import { TIERS, TOPICS, TRACKS } from '../core/curriculum';
import { BUILT_TOPICS, isBuilt } from '../core/lessons';
import { useProgress } from '../core/progress';
import type { Topic, TrackId } from '../core/types';

export function Home() {
  const [track, setTrack] = useState<TrackId | 'all'>('all');
  const { isDone } = useProgress();
  const next = BUILT_TOPICS.find((t) => !isDone(t.id));
  const doneCount = BUILT_TOPICS.filter((t) => isDone(t.id)).length;

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            Software engineering, animated
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
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

      <div className="track-filter" role="radiogroup" aria-label="Filter by track">
        <button type="button" className={track === 'all' ? 'on' : ''} onClick={() => setTrack('all')}>
          All tracks
        </button>
        {Object.values(TRACKS).map((t) => (
          <button
            key={t.id}
            type="button"
            className={track === t.id ? 'on' : ''}
            style={{ '--c': t.color } as CSSProperties}
            onClick={() => setTrack(t.id)}
          >
            <i>{t.glyph}</i> {t.short}
          </button>
        ))}
      </div>

      <div className="tiers">
        {TIERS.map((tier) => {
          const topics = TOPICS.filter((t) => t.tier === tier.n && (track === 'all' || t.track === track))
            // playable first, then planned
            .sort((a, b) => Number(isBuilt(b.id)) - Number(isBuilt(a.id)));
          const built = TOPICS.filter((t) => t.tier === tier.n && isBuilt(t.id));
          const learned = built.filter((t) => isDone(t.id)).length;
          return (
            <section key={tier.n} className="tier" style={{ '--tier': tier.color } as CSSProperties}>
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
                  <div className="tier-progress" title={`${learned} of ${built.length} built lessons learned`}>
                    <div className="bar">
                      <motion.i
                        initial={{ width: 0 }}
                        animate={{ width: built.length ? `${(learned / built.length) * 100}%` : 0 }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                    <span>
                      {learned}/{built.length}
                    </span>
                  </div>
                </header>
                {topics.length ? (
                  <div className="cards">
                    {topics.map((t, i) => (
                      <TopicCard key={t.id} topic={t} done={isDone(t.id)} index={i} />
                    ))}
                  </div>
                ) : (
                  <p className="muted">Nothing in this track at this tier yet.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TopicCard({ topic, done, index }: { topic: Topic; done: boolean; index: number }) {
  const track = TRACKS[topic.track];
  const built = isBuilt(topic.id);
  const body = (
    <>
      <span className="card-track">
        <i>{track.glyph}</i> {track.short}
      </span>
      <h3>{topic.title}</h3>
      <p>{topic.tagline}</p>
      <span className="card-meta">
        {!built ? 'Planned' : done ? '✓ Learned' : topic.minutes ? `${topic.minutes} min · interactive` : 'Interactive'}
      </span>
    </>
  );
  const common = {
    className: `card ${built ? '' : 'planned'} ${done ? 'done' : ''}`,
    style: { '--c': track.color } as CSSProperties,
    initial: { opacity: 0, y: 14 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-40px' },
    transition: { delay: Math.min(index, 8) * 0.04 },
  };
  return built ? (
    <motion.div {...common} whileHover={{ y: -4 }}>
      <Link to={`/lesson/${topic.id}`} className="card-link">
        {body}
      </Link>
    </motion.div>
  ) : (
    <motion.div {...common}>{body}</motion.div>
  );
}
