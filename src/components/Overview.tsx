import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { createPersistedStore, usePersistedStore } from '../core/storage';
import type { LessonSummary } from '../core/types';

/** Per-lesson open/closed choice. Absent = follow the default. */
const openStore = createPersistedStore<Record<string, boolean>>('overview-open', {});

/**
 * The lesson's executive summary: what it is, where it's used, why it matters.
 * Open by default on new lessons, collapsed on ones already learned, and the
 * learner's own toggle wins per lesson.
 */
export function Overview({ summary, lessonId, learned }: { summary: LessonSummary; lessonId: string; learned: boolean }) {
  const choices = usePersistedStore(openStore);
  // Read "learned" once on arrival so marking a lesson learned doesn't yank the layout.
  const [defaultOpen] = useState(!learned);
  const collapsed = !(choices[lessonId] ?? defaultOpen);

  const toggle = () => openStore.set({ ...openStore.get(), [lessonId]: collapsed });

  return (
    <section className="overview" aria-label="Overview">
      <div className="overview-tldr">
        <span className="overview-kicker">In one line</span>
        <p>{summary.tldr}</p>
        <button type="button" className="overview-toggle" onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? 'Show overview ▾' : 'Hide overview ▴'}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            className="overview-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="overview-cards">
              <article className="overview-card">
                <h3>
                  <span className="overview-icon">?</span>What it is
                </h3>
                <p>{summary.what}</p>
                {summary.analogy && <p className="overview-analogy">{summary.analogy}</p>}
              </article>
              <article className="overview-card">
                <h3>
                  <span className="overview-icon">⌖</span>Where you'll see it
                </h3>
                <ul>
                  {summary.useCases.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </article>
              <article className="overview-card">
                <h3>
                  <span className="overview-icon">!</span>Why it matters
                </h3>
                <p>{summary.why}</p>
              </article>
            </div>
            <p className="overview-watch">
              <span>▶ Reading the visual</span>
              {summary.watch}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
