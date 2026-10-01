import { motion, MotionConfig } from 'motion/react';
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorBoundary, StageCrashed } from '../components/ErrorBoundary';
import { InlineText } from '../components/InlineText';
import { Overview } from '../components/Overview';
import { Quiz } from '../components/Quiz';
import { usePageHeading } from '../components/usePageHeading';
import { CaptionContext, SetCaptionContext, type CaptionState, type SetCaption } from '../core/caption';
import { findTopic, tierOf, trackOf } from '../core/curriculum';
import { BUILT_TOPICS, loadLesson } from '../core/lessons';
import { PlayerRegistryContext, type RegisterPlayer } from '../core/playerRegistry';
import { useProgress } from '../core/progress';
import type { LessonModule, Topic } from '../core/types';

export function LessonPage() {
  const { id = '' } = useParams();
  const topic = findTopic(id);
  if (!topic) return <NotFound />;
  // key: fresh state (caption, quiz, player) for every lesson
  return <LessonLoader key={id} topic={topic} />;
}

function LessonLoader({ topic }: { topic: Topic }) {
  const [mod, setMod] = useState<LessonModule | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadLesson(topic.id).then((m) => alive && setMod(m));
    return () => {
      alive = false;
    };
  }, [topic.id]);

  if (mod === undefined) return <div className="lesson-loading">Loading…</div>;
  if (mod === null) return <Planned topic={topic} />;
  return <LessonView topic={topic} mod={mod} />;
}

function LessonView({ topic, mod }: { topic: Topic; mod: LessonModule }) {
  const tier = tierOf(topic);
  const track = trackOf(topic);
  const { isDone, setDone } = useProgress();
  const done = isDone(topic.id);

  const [caption, setCaptionState] = useState<CaptionState>({ node: null, version: 0 });
  // A quiet set swaps the text without bumping `version`, so the caption doesn't re-fade.
  const setCaption = useCallback<SetCaption>(
    (node, opts) => setCaptionState((c) => ({ node, version: opts?.quiet ? c.version : c.version + 1 })),
    [],
  );

  // Keyboard-bound players register here, so the shortcut hint only shows when the keys work.
  const [players, setPlayers] = useState(0);
  const registerPlayer = useCallback<RegisterPlayer>(() => {
    setPlayers((n) => n + 1);
    return () => setPlayers((n) => n - 1);
  }, []);

  const pos = BUILT_TOPICS.findIndex((t) => t.id === topic.id);
  const prev = BUILT_TOPICS[pos - 1];
  const next = BUILT_TOPICS[pos + 1];
  const { Stage } = mod;
  const heading = usePageHeading(topic.title);

  return (
    <SetCaptionContext.Provider value={setCaption}>
      <CaptionContext.Provider value={caption}>
        <div className="lesson" style={{ '--tier': tier.color, '--track': track.color } as CSSProperties}>
          <nav className="crumbs">
            <Link to="/">All tiers</Link>
            <span>/</span>
            <span className="crumb-tier">
              Tier {tier.n} · {tier.name}
            </span>
            <span>/</span>
            <span className="crumb-track">{track.name}</span>
          </nav>

          <motion.header className="lesson-head" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <h1 ref={heading} tabIndex={-1}>
              {topic.title}
            </h1>
            <p>{topic.tagline}</p>
            {done && <span className="done-badge">✓ Learned</span>}
          </motion.header>

          <Overview summary={mod.summary} lessonId={topic.id} learned={done} />

          <div className="lesson-grid">
            <main className="lesson-main">
              <PlayerRegistryContext.Provider value={registerPlayer}>
                <ErrorBoundary fallback={(error, retry) => <StageCrashed error={error} onRetry={retry} />}>
                  {/* The stage's motion is the lesson itself, so it keeps playing under reduced motion. */}
                  <MotionConfig reducedMotion="never">
                    <Stage />
                  </MotionConfig>
                </ErrorBoundary>
              </PlayerRegistryContext.Provider>
            </main>
            <aside className="lesson-side">
              <Panel title="Try this" icon="☞">
                <ul className="try-list">
                  {mod.tryThis.map((t, i) => (
                    <li key={i}>
                      <InlineText text={t} />
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="Remember" icon="✦">
                <ul className="idea-list">
                  {mod.keyIdeas.map((t, i) => (
                    <motion.li key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08 }}>
                      <InlineText text={t} />
                    </motion.li>
                  ))}
                </ul>
              </Panel>
              {players > 0 && (
                <p className="kbd-hint">
                  <kbd>Space</kbd> play/pause · <kbd>←</kbd>
                  <kbd>→</kbd> step · <kbd>R</kbd> restart
                </p>
              )}
            </aside>
          </div>

          <Quiz questions={mod.quiz} onComplete={() => setDone(topic.id)} />

          <footer className="lesson-foot">
            {prev ? (
              <Link className="foot-link" to={`/lesson/${prev.id}`}>
                ← {prev.title}
              </Link>
            ) : (
              <span />
            )}
            <button type="button" className={`btn ${done ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setDone(topic.id, !done)}>
              {done ? 'Mark as not learned' : 'Mark as learned'}
            </button>
            {next ? (
              <Link className="foot-link" to={`/lesson/${next.id}`}>
                {next.title} →
              </Link>
            ) : (
              <span />
            )}
          </footer>
        </div>
      </CaptionContext.Provider>
    </SetCaptionContext.Provider>
  );
}

function Panel({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3>
        <span className="panel-icon">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Planned({ topic }: { topic: Topic }) {
  const tier = tierOf(topic);
  const heading = usePageHeading(topic.title);
  return (
    <div className="lesson-empty">
      <p className="eyebrow">
        Tier {tier.n} · {tier.name}
      </p>
      <h1 ref={heading} tabIndex={-1}>
        {topic.title}
      </h1>
      <p>This one's on the roadmap but not built yet.</p>
      <Link className="btn btn-primary" to="/">
        Back to all tiers
      </Link>
    </div>
  );
}

function NotFound() {
  const heading = usePageHeading('No such lesson');
  return (
    <div className="lesson-empty">
      <h1 ref={heading} tabIndex={-1}>
        No such lesson
      </h1>
      <Link className="btn btn-primary" to="/">
        Back to all tiers
      </Link>
    </div>
  );
}
