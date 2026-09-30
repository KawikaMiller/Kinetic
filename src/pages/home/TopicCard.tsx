import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { TRACKS } from '../../core/curriculum';
import { isBuilt } from '../../core/lessons';
import type { Topic } from '../../core/types';

const MAX_STAGGER_STEPS = 8;
const STAGGER_S = 0.04;

export function TopicCard({ topic, done, index }: { topic: Topic; done: boolean; index: number }) {
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
    transition: { delay: Math.min(index, MAX_STAGGER_STEPS) * STAGGER_S },
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
